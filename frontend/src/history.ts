import type { ConversationDetail, Turn } from './types';

// Pairs each stored question with the answer that follows it. A question without an
// answer (stopped or failed) stays as a turn of its own.
export function toTurns(messages: ConversationDetail['messages']): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    const last = turns.at(-1);
    if (message.role === 'user') turns.push({ id: message.id, question: message.content });
    else if (last && last.answer === undefined) last.answer = message.content;
    else if (last) last.answer += `\n\n${message.content}`;
  }
  return turns;
}

export function conversationFromUrl(): string | null {
  return new URLSearchParams(location.search).get('c');
}
