import { describe, expect, it } from 'vitest';
import { toTurns } from './history';

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
