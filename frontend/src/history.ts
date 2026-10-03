import type { Message, Turn } from './types';

const MAX_MESSAGES = 20;
const TRUNCATED = '\n\n[Earlier answer truncated]';

// Newest turns first, within the backend's message and character budget, so a long
// answer can never make the next question fail.
export function buildMessages(turns: Turn[], question: string, budget: number): Message[] {
  const messages: Message[] = [{ role: 'user', content: question }];
  let remaining = budget - question.length;
  for (const turn of [...turns].reverse()) {
    if (!turn.answer) continue;
    if (messages.length + 2 > MAX_MESSAGES) break;
    const room = remaining - turn.question.length;
    let answer = turn.answer;
    if (answer.length > room) {
      // Keep the start of the latest answer for context; drop anything older.
      if (messages.length > 1 || room <= TRUNCATED.length + 200) break;
      answer = answer.slice(0, room - TRUNCATED.length) + TRUNCATED;
    }
    messages.unshift(
      { role: 'user', content: turn.question },
      { role: 'assistant', content: answer },
    );
    remaining -= turn.question.length + answer.length;
  }
  return messages;
}
