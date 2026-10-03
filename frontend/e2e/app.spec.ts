import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: { status: 'ok', configured: true, agent: 'olist-agent', max_conversation_chars: 24000 },
    }),
  );
});

test('home page renders with no browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Talk to your data.' })).toBeVisible();
  await expect(page.getByText('olist-agent')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('markdown answers, follow-up history and reset', async ({ page }) => {
  const requests: { messages: { role: string; content: string }[] }[] = [];
  await page.route('**/api/chat', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        request_id: 'browser-fixture',
        answer: 'Revenue by month:\n\n| Month | Revenue |\n| --- | --- |\n| 2018-01 | R$ 100.25 |',
      },
    });
  });
  await page.goto('/');
  await page.getByRole('textbox').fill('Show monthly revenue for 2018.');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('cell', { name: 'R$ 100.25' })).toBeVisible();
  await page.getByRole('textbox').fill('Only delivered orders');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.turn')).toHaveCount(2);
  await expect(page.locator('.thinking')).toHaveCount(0);
  expect(requests[1].messages.map((message) => message.role)).toEqual([
    'user',
    'assistant',
    'user',
  ]);
  expect(requests[1].messages[2].content).toBe('Only delivered orders');
  await page.getByRole('button', { name: 'New conversation' }).click();
  await expect(page.locator('.turn')).toHaveCount(0);
});

test('a very long answer does not break the next follow-up', async ({ page }) => {
  const sizes: number[] = [];
  await page.route('**/api/chat', async (route) => {
    const { messages } = route.request().postDataJSON();
    sizes.push(
      messages.reduce((total: number, m: { content: string }) => total + m.content.length, 0),
    );
    await route.fulfill({ json: { request_id: 'fixture', answer: 'x'.repeat(32001) } });
  });
  await page.goto('/');
  for (const question of ['First question', 'Second question', 'Third question']) {
    await page.getByRole('textbox').fill(question);
    await page.getByRole('button', { name: 'Send question' }).click();
    await expect(page.locator('.thinking')).toHaveCount(0);
  }
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(sizes).toHaveLength(3);
  expect(Math.max(...sizes)).toBeLessThanOrEqual(24000);
});

test('API errors are displayed and submission can be retried', async ({ page }) => {
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'The backend could not authenticate to Microsoft Foundry.' },
    }),
  );
  await page.goto('/');
  await page.getByRole('textbox').fill('Total revenue?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('alert')).toContainText('could not authenticate');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
});

test('unconfigured backend shows a setup message', async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', configured: false, agent: null } }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('FOUNDRY_PROJECT_ENDPOINT');
});

test('mobile layout fits the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
});

test('numeric tables render as a chart with a table view', async ({ page }) => {
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      json: {
        request_id: 'fixture',
        answer:
          '| State | Orders | Revenue |\n| --- | --- | --- |\n| SP | 41,746 | R$ 5,998,226.96 |\n| RJ | 12,852 | R$ 2,144,379.69 |\n| MG | 11,635 | R$ 1,872,257.26 |',
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: /Which states have the most orders/ }).click();
  const chart = page.getByRole('list', { name: 'Orders by State' });
  await expect(chart.getByRole('listitem')).toHaveCount(3);
  await page.getByRole('button', { name: 'Revenue' }).click();
  await expect(page.getByRole('list', { name: 'Revenue by State' })).toContainText(
    'R$ 5,998,226.96',
  );
  await page.getByRole('button', { name: 'Table' }).click();
  await expect(page.getByRole('cell', { name: 'R$ 2,144,379.69' })).toBeVisible();
});

test('a pending question can be stopped and asked again', async ({ page }) => {
  await page.route('**/api/chat', () => new Promise(() => {}));
  await page.goto('/');
  await page.getByRole('textbox').fill('Total revenue?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.thinking')).toBeVisible();
  await page.getByRole('button', { name: 'Stop waiting for the answer' }).click();
  await expect(page.getByText('Stopped before the agent answered.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask again' })).toBeEnabled();
});

test('theme can be pinned and persists across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Dark theme' })).toBeChecked();
});
