export interface Message {
  role: 'user' | 'assistant';
  content: string;
}
export interface Answer {
  request_id: string;
  answer: string;
}
export interface Health {
  status: string;
  configured: boolean;
  agent: string | null;
}
export interface Turn {
  id: string;
  question: string;
  answer?: string;
  error?: string;
}
