import { useEffect, useState } from 'react';
import { AlertCircle, Check, Copy, LoaderCircle, RotateCcw, Sparkles, Square } from 'lucide-react';
import Answer from '../Answer';
import type { Turn } from '../types';

interface Props {
  turn: Turn;
  pending: boolean;
  canRetry: boolean;
  agent: string;
  onRetry: () => void;
}

export default function TurnView({ turn, pending, canRetry, agent, onRetry }: Props) {
  return (
    <article
      id={`turn-${turn.id}`}
      className="turn animate-rise scroll-mt-20 space-y-5 lg:scroll-mt-6"
    >
      <div className="flex justify-end">
        <p className="max-w-[90%] whitespace-pre-wrap sm:max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-[0.9375rem] leading-relaxed text-ink [overflow-wrap:anywhere]">
          <span className="sr-only">You asked: </span>
          {turn.question}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-strong text-on-accent shadow-sm"
        >
          <Sparkles size={14} />
        </span>
        <div className="min-w-0 flex-1">
          {pending && <Thinking agent={agent} />}
          {turn.answer && (
            <>
              <span className="sr-only">{agent} answered: </span>
              <Answer text={turn.answer} />
              <Actions text={turn.answer} />
            </>
          )}
          {turn.stopped && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-ink-3">
              <Square aria-hidden="true" size={13} /> Stopped waiting for the answer.
              {canRetry && <RetryButton onRetry={onRetry} label="Ask again" />}
            </div>
          )}
          {turn.error && (
            <div
              className="flex flex-wrap items-start gap-3 rounded-xl border border-danger-ink/20 bg-danger-bg px-4 py-3 text-sm text-danger-ink"
              role="alert"
            >
              <AlertCircle aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
              <p className="m-0 min-w-0 flex-1">{turn.error}</p>
              {canRetry && <RetryButton onRetry={onRetry} label="Try again" />}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function Thinking({ agent }: { agent: string }) {
  return (
    <div className="thinking flex items-center gap-2 pt-1 text-sm text-ink-3" role="status">
      <LoaderCircle aria-hidden="true" size={16} className="animate-spin" />
      Asking {agent}
    </div>
  );
}

// Answers are kept in the Foundry conversation, so there is no regenerate: asking again
// would add a second copy of the question to the stored history.
function Actions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  const button =
    'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink pointer-coarse:py-2';
  return (
    <div className="mt-3 flex items-center gap-1">
      <button
        type="button"
        className={button}
        onClick={() =>
          navigator.clipboard?.writeText(text).then(
            () => setCopied(true),
            () => undefined,
          )
        }
      >
        {copied ? <Check aria-hidden="true" size={13} /> : <Copy aria-hidden="true" size={13} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Answer copied to clipboard' : ''}
      </span>
    </div>
  );
}

function RetryButton({ onRetry, label }: { onRetry: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1 text-xs font-semibold text-ink shadow-sm ring-1 ring-line transition-colors hover:ring-line-strong"
    >
      <RotateCcw aria-hidden="true" size={12} /> {label}
    </button>
  );
}
