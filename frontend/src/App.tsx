import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Bot,
  ChevronRight,
  Database,
  Layers3,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { request } from './api';
import Answer from './Answer';
import { buildMessages } from './history';
import type { Answer as ChatAnswer, Health, Turn } from './types';

const suggestions = [
  { tag: 'PERFORMANCE', question: 'What is our total revenue and order count?', icon: BarChart3 },
  { tag: 'PRODUCTS', question: 'Which 5 categories generate the most revenue?', icon: Layers3 },
  { tag: 'TRENDS', question: 'Show monthly revenue for 2018.', icon: ArrowRight },
  { tag: 'CUSTOMERS', question: 'Which states have the most orders?', icon: Database },
];

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const activeRef = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setConnectionError('');
    request<Health>('/api/health', { signal: controller.signal })
      .then((result) => {
        setHealth(result);
        if (!result.configured)
          setConnectionError(
            'The backend is not connected to Microsoft Foundry. Set FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_AGENT_NAME, then restart it.',
          );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setConnectionError(error.message);
      });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, busy]);

  async function ask(question: string) {
    question = question.trim();
    if (!question || activeRef.current) return;
    activeRef.current = true;
    const id = crypto.randomUUID();
    const messages = buildMessages(turns, question, health?.max_conversation_chars ?? 24000);
    const controller = new AbortController();
    controllerRef.current = controller;
    setTurns((previous) => [...previous, { id, question }]);
    setInput('');
    setBusy(true);
    try {
      const { answer } = await request<ChatAnswer>('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]),
      });
      setTurns((previous) => previous.map((turn) => (turn.id === id ? { ...turn, answer } : turn)));
    } catch (error) {
      setTurns((previous) =>
        previous.map((turn) =>
          turn.id === id
            ? {
                ...turn,
                error:
                  error instanceof Error
                    ? error.message
                    : 'Something went wrong. Please try again.',
              }
            : turn,
        ),
      );
    } finally {
      setBusy(false);
      activeRef.current = false;
      inputRef.current?.focus();
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="/" className="brand" aria-label="Olist home">
          <span className="brand-icon">
            <BarChart3 aria-hidden="true" size={23} />
          </span>
          <strong>
            olist<span className="brand-dot">.</span>
          </strong>
          <span className="workspace-tag">LAB</span>
        </a>
        <button
          className="new-chat"
          disabled={busy}
          onClick={() => {
            setTurns([]);
            setInput('');
            inputRef.current?.focus();
          }}
        >
          <Plus aria-hidden="true" size={17} /> New conversation <span>↗</span>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <span className="nav-item active">
          <Sparkles aria-hidden="true" size={17} /> Ask your data{' '}
          <ChevronRight aria-hidden="true" size={14} />
        </span>
        <div className="sidebar-spacer" />
        <div className="source-card">
          <div className="source-icon">
            <Bot aria-hidden="true" size={18} />
          </div>
          <div>
            <strong>{health?.agent ?? 'Foundry agent'}</strong>
            <span>Microsoft Foundry</span>
          </div>
          <span className={`status-dot ${health?.configured ? '' : 'offline'}`} />
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">A</span>
          <div>
            <strong>Analytics workspace</strong>
            <span>Local development</span>
          </div>
          <ShieldCheck aria-hidden="true" size={16} />
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            Workspace <ChevronRight aria-hidden="true" size={13} />
            <strong>Ask your data</strong>
          </div>
          <span className="model-badge">
            <span className="purple-dot" /> Microsoft Foundry
          </span>
        </header>
        <div className="main-body">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR ANALYTICS, IN CONVERSATION</div>
              <h1>Talk to your data.</h1>
              <p>Ask a question. Your Microsoft Foundry agent answers from the Olist data.</p>
            </div>
          </div>
          {connectionError && (
            <div className="connection-error" role="alert">
              {connectionError}{' '}
              <button onClick={() => setRefresh((value) => value + 1)}>Check again</button>
            </div>
          )}

          <section
            className={`conversation ${turns.length ? 'has-turns' : ''}`}
            aria-label="Conversation"
          >
            {!turns.length ? (
              <div className="welcome">
                <span className="welcome-mark">
                  <Sparkles aria-hidden="true" size={25} strokeWidth={1.6} />
                </span>
                <h2>A little curiosity. A lot of insight.</h2>
                <p>
                  Explore revenue, orders, and the stories behind your sales.
                  <br />
                  Start with a question below, or ask your own.
                </p>
                <div className="suggestion-grid">
                  {suggestions.map(({ tag, question, icon: Icon }) => (
                    <button
                      key={tag}
                      className="suggestion"
                      onClick={() => void ask(question)}
                      disabled={busy}
                    >
                      <span className="suggestion-top">
                        <Icon aria-hidden="true" size={16} />
                        <span>{tag}</span>
                        <ArrowUp aria-hidden="true" className="suggestion-arrow" size={15} />
                      </span>
                      <span>{question}</span>
                    </button>
                  ))}
                </div>
                <div className="data-note">
                  <Layers3 aria-hidden="true" size={13} /> Follow-up questions keep the conversation
                  context.
                </div>
              </div>
            ) : (
              <div className="turns">
                {turns.map((turn) => (
                  <article key={turn.id} className="turn">
                    <div className="user-message">
                      <span className="you-label">YOU</span>
                      <p>{turn.question}</p>
                    </div>
                    {turn.answer && <Answer text={turn.answer} />}
                    {turn.error && (
                      <div className="turn-error" role="alert">
                        <p>{turn.error}</p>
                        <button disabled={busy} onClick={() => void ask(turn.question)}>
                          Try again
                        </button>
                      </div>
                    )}
                  </article>
                ))}
                {busy && (
                  <div className="thinking" role="status">
                    <LoaderCircle aria-hidden="true" size={17} className="spin" /> Asking your
                    Foundry agent…
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </section>
          <div className="composer-wrap">
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                void ask(input);
              }}
            >
              <label className="sr-only" htmlFor="question">
                Ask a question about your Olist data
              </label>
              <textarea
                ref={inputRef}
                id="question"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                maxLength={2000}
                placeholder={
                  turns.length
                    ? 'Ask a follow-up, e.g. “Only delivered orders”'
                    : 'Ask anything about your sales data…'
                }
                rows={2}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void ask(input);
                  }
                }}
              />
              <div className="composer-bottom">
                <span>
                  <Database aria-hidden="true" size={13} /> Olist data{' '}
                  <span className="composer-divider">/</span>{' '}
                  {turns.length
                    ? 'Follow-up questions supported'
                    : 'Answered by your Foundry agent'}
                </span>
                <button
                  className="send-button"
                  type="submit"
                  aria-label="Send question"
                  disabled={busy || !input.trim()}
                >
                  {busy ? (
                    <LoaderCircle aria-hidden="true" className="spin" size={18} />
                  ) : (
                    <ArrowUp aria-hidden="true" size={19} />
                  )}
                </button>
              </div>
            </form>
            <div className="composer-caption">
              <span>
                Answers are generated by an AI agent. Review them before making decisions.
              </span>
              <span>
                Enter to send <ArrowDown aria-hidden="true" size={11} />
              </span>
            </div>
          </div>
        </div>
        <footer className="page-footer">
          <span>
            <span className={`status-dot ${health?.configured ? '' : 'offline'}`} /> Powered by
            Microsoft Foundry
          </span>
        </footer>
      </main>
    </div>
  );
}
