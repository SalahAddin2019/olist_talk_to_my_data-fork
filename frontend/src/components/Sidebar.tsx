import { BarChart3, Bot, Database, MessageSquareText, Plus, ShieldCheck } from 'lucide-react';
import type { Health, Turn } from '../types';
import ThemeToggle from './ThemeToggle';

const tables = ['Orders', 'Products', 'Categories', 'Sellers', 'Customers', 'Geography', 'Dates'];

interface Props {
  health: Health | null;
  turns: Turn[];
  busy: boolean;
  onNew: () => void;
}

export function Brand() {
  return (
    <a href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="Olist home">
      <span className="grid size-8 place-items-center rounded-[10px] bg-gradient-to-br from-accent to-accent-strong text-on-accent shadow-md shadow-accent/30">
        <BarChart3 aria-hidden="true" size={17} />
      </span>
      <strong className="text-xl font-semibold tracking-tight">
        olist<span className="text-accent">.</span>
      </strong>
    </a>
  );
}

export function NewChatButton({
  busy,
  onNew,
  compact,
}: {
  busy: boolean;
  onNew: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onNew}
      aria-label={compact ? 'New conversation' : undefined}
      className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink shadow-xs transition-colors hover:border-line-strong disabled:opacity-50"
    >
      <Plus aria-hidden="true" size={16} />
      {!compact && 'New conversation'}
    </button>
  );
}

export default function Sidebar({ health, turns, busy, onNew }: Props) {
  const online = health?.configured;
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-line bg-surface/60 backdrop-blur-xl lg:flex">
      <div className="flex items-center justify-between px-5 pt-6 pb-5">
        <Brand />
        <ThemeToggle />
      </div>
      <div className="px-4">
        <NewChatButton busy={busy} onNew={onNew} />
      </div>

      <nav aria-label="This conversation" className="mt-6 min-h-0 flex-1 overflow-y-auto px-4">
        <h2 className="px-2 pb-2 text-[0.6875rem] font-semibold tracking-wider text-ink-3 uppercase">
          This conversation
        </h2>
        {turns.length ? (
          <ol className="space-y-0.5">
            {turns.map((turn) => (
              <li key={turn.id}>
                <a
                  href={`#turn-${turn.id}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <MessageSquareText aria-hidden="true" size={14} className="shrink-0 text-ink-3" />
                  <span className="truncate">{turn.question}</span>
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-2 text-sm text-ink-3">Your questions will appear here.</p>
        )}

        <h2 className="mt-7 flex items-center gap-1.5 px-2 pb-2 text-[0.6875rem] font-semibold tracking-wider text-ink-3 uppercase">
          <Database aria-hidden="true" size={12} /> Warehouse
        </h2>
        <ul className="flex flex-wrap gap-1.5 px-2" aria-label="Warehouse subject areas">
          {tables.map((table) => (
            <li key={table} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
              {table}
            </li>
          ))}
        </ul>
      </nav>

      <div className="m-4 rounded-2xl border border-line bg-surface p-3 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-surface-2 text-ink-2">
            <Bot aria-hidden="true" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-sm font-semibold">
              {health?.agent ?? 'Foundry agent'}
            </strong>
            <span className="block text-xs text-ink-3">Microsoft Foundry</span>
          </div>
          <span className="relative flex size-2.5" title={online ? 'Connected' : 'Not connected'}>
            {online && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />
            )}
            <span
              className={`relative inline-flex size-2.5 rounded-full ${online ? 'bg-good' : 'bg-ink-3'}`}
            />
            <span className="sr-only">{online ? 'Connected' : 'Not connected'}</span>
          </span>
        </div>
        <p className="mt-3 mb-0 flex items-center gap-1.5 border-t border-line pt-3 text-xs text-ink-3">
          <ShieldCheck aria-hidden="true" size={13} /> Read-only access to the warehouse
        </p>
      </div>
    </aside>
  );
}
