import { describe, expect, it } from 'vitest';
import { numericSeries, parseNumber } from './table';
import { buildMessages } from './history';

describe('parseNumber', () => {
  it.each([
    ['R$ 1,234.56', 1234.56],
    ['1.234.567,89', 1234567.89],
    ['12,5', 12.5],
    ['42%', 42],
    ['3.2K', 3200],
    ['1,024', 1024],
    ['R$ 2.5 M', 2500000],
  ])('%s → %d', (raw, expected) => expect(parseNumber(raw)).toBeCloseTo(expected));

  it.each(['', '-', 'n/a', 'SP', '2018-01', '-5'])('rejects %s', (raw) =>
    expect(parseNumber(raw)).toBeNull(),
  );
});

describe('numericSeries', () => {
  it('finds numeric columns after the label column', () => {
    const data = {
      headers: ['State', 'Orders', 'Region', 'Revenue'],
      rows: [
        ['SP', '41,746', 'Southeast', 'R$ 5,998,226.96'],
        ['RJ', '12,852', 'Southeast', 'R$ 2,144,379.69'],
      ],
    };
    expect(numericSeries(data).map((series) => series.label)).toEqual(['Orders', 'Revenue']);
  });

  it('needs at least two rows', () => {
    expect(numericSeries({ headers: ['Month', 'Revenue'], rows: [['2018-01', '100']] })).toEqual(
      [],
    );
  });
});

describe('buildMessages', () => {
  it('keeps history within the character budget', () => {
    const turns = [1, 2, 3].map((n) => ({
      id: `${n}`,
      question: `q${n}`,
      answer: 'x'.repeat(9000),
    }));
    const messages = buildMessages(turns, 'next', 24000);
    const size = messages.reduce((total, message) => total + message.content.length, 0);
    expect(size).toBeLessThanOrEqual(24000);
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'next' });
  });
});
