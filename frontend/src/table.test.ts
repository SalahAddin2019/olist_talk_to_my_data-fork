import { describe, expect, it } from 'vitest';
import { numericSeries, parseNumber } from './table';
import { toTurns } from './history';

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

describe('toTurns', () => {
  it('pairs questions with answers and keeps unanswered questions', () => {
    const turns = toTurns([
      { id: 'm1', role: 'user', content: 'Total revenue?' },
      { id: 'm2', role: 'assistant', content: 'R$ 13.6M' },
      { id: 'm3', role: 'user', content: 'Stopped question' },
      { id: 'm4', role: 'user', content: 'Only 2018' },
      { id: 'm5', role: 'assistant', content: 'R$ 7.4M' },
    ]);
    expect(turns).toEqual([
      { id: 'm1', question: 'Total revenue?', answer: 'R$ 13.6M' },
      { id: 'm3', question: 'Stopped question' },
      { id: 'm4', question: 'Only 2018', answer: 'R$ 7.4M' },
    ]);
  });
});
