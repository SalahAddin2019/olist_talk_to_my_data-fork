import { useEffect, useRef, useState } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { request } from './api';
import Composer from './components/Composer';
import EmptyState from './components/EmptyState';
import Sidebar, { Brand, NewChatButton } from './components/Sidebar';
import ThemeToggle from './components/ThemeToggle';
import TurnView from './components/TurnView';
import { buildMessages } from './history';
import type { Answer as ChatAnswer, Health, Turn } from './types';

const TIMEOUT_MS = 180000;

function failure(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return 'The Foundry agent took too long to answer. Try again.';
  if (error instanceof TypeError) return 'Could not reach the backend. Check that it is running.';
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const busy = pendingId !== null;
  const budget = health?.max_conversation_chars ?? 24000;
  const agent = health?.agent ?? 'the Foundry agent';

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
        if (!controller.signal.aborted) setConnectionError(failure(error));
      });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    if (!busy) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') controllerRef.current?.abort();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);
  useEffect(() => {
    if (pendingId)
      document
        .getElementById(`turn-${pendingId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [pendingId]);

  async function ask(text: string, history: Turn[] = turns) {
    const question = text.trim();
    if (!question || controllerRef.current) return;
    const id = crypto.randomUUID();
    const messages = buildMessages(history, question, budget);
    const controller = new AbortController();
    controllerRef.current = controller;
    const started = performance.now();
    setTurns([...history, { id, question }]);
    setInput('');
    setPendingId(id);
    const update = (patch: Partial<Turn>) =>
      setTurns((previous) =>
        previous.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)),
      );
    try {
      const { answer } = await request<ChatAnswer>('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(TIMEOUT_MS)]),
      });
      update({ answer, seconds: Math.round((performance.now() - started) / 1000) });
    } catch (error) {
      update(controller.signal.aborted ? { stopped: true } : { error: failure(error) });
    } finally {
      controllerRef.current = null;
      setPendingId(null);
      const active = document.activeElement;
      if (!active || active === document.body) inputRef.current?.focus();
    }
  }

  function retry(turn: Turn) {
    void ask(
      turn.question,
      turns.filter((other) => other.id !== turn.id),
    );
  }

  function reset() {
    setTurns([]);
    setInput('');
    inputRef.current?.focus();
  }

  const contextTurns = turns.length
    ? (buildMessages(turns, input || ' ', budget).length - 1) / 2
    : 0;

  return (
    <div className="min-h-dvh">
      <Sidebar health={health} turns={turns} busy={busy} onNew={reset} />

      <div className="flex min-h-dvh flex-col lg:pl-72">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-xl lg:hidden">
          <Brand />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NewChatButton busy={busy} onNew={reset} compact />
          </div>
        </header>

        <main className="relative flex flex-1 flex-col">
          {!turns.length && (
            <div
              className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-[480px]"
              aria-hidden="true"
            />
          )}
          <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 sm:px-6">
            {connectionError && (
              <div
                className="mt-6 flex flex-wrap items-start gap-3 rounded-xl border border-warn-ink/20 bg-warn-bg px-4 py-3 text-sm text-warn-ink"
                role="alert"
              >
                <TriangleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
                <p className="m-0 min-w-0 flex-1">{connectionError}</p>
                <button
                  type="button"
                  onClick={() => setRefresh((value) => value + 1)}
                  className="flex items-center gap-1.5 font-semibold underline-offset-2 hover:underline"
                >
                  <RefreshCw aria-hidden="true" size={13} /> Check again
                </button>
              </div>
            )}

            {turns.length ? (
              <section
                role="log"
                aria-label="Conversation"
                aria-busy={busy}
                className="flex-1 space-y-10 py-8"
              >
                {turns.map((turn, index) => (
                  <TurnView
                    key={turn.id}
                    turn={turn}
                    agent={agent}
                    pending={turn.id === pendingId}
                    canRetry={!busy && (index === turns.length - 1 || !turn.answer)}
                    onRetry={() => retry(turn)}
                  />
                ))}
              </section>
            ) : (
              <EmptyState disabled={busy} onAsk={(question) => void ask(question)} />
            )}

            <div className="sticky bottom-0 z-10 -mx-2 bg-gradient-to-t from-bg from-70% to-transparent px-2 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Composer
                inputRef={inputRef}
                value={input}
                busy={busy}
                followUp={turns.length > 0}
                contextTurns={contextTurns}
                onChange={setInput}
                onSubmit={() => void ask(input)}
                onStop={() => controllerRef.current?.abort()}
              />
              <p className="mt-2.5 mb-0 text-center text-[0.6875rem] text-ink-3">
                Answers are generated by an AI agent from read-only warehouse queries. Review them
                before making decisions.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
