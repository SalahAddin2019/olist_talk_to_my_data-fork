import { useEffect, useRef } from 'react';
import { Bot, MessageSquareText, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import type { ConversationSummary, Health } from '../types';
import ThemeToggle, { type Theme } from './ThemeToggle';

interface Props {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  health: Health | null;
  conversations: ConversationSummary[] | null;
  historyError: string;
  activeId: string | null;
  busy: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onReload: () => void;
}

export function Brand() {
  return (
    <a href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="Olist home">
      <span className="grid size-8 place-items-center rounded-[10px] bg-gradient-to-br from-accent to-accent-strong text-on-accent shadow-md shadow-accent/30">
        <MessageSquareText aria-hidden="true" size={17} />
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

export default function Sidebar(props: Props) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-line bg-surface/60 backdrop-blur-xl lg:flex">
      <SidebarContent {...props} />
    </aside>
  );
}

// Below the lg breakpoint the sidebar opens as a modal drawer; the native dialog provides
// the focus trap, Escape to close and an inert page behind it.
export function MobileSidebar({
  open,
  onClose,
  ...props
}: Props & { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    const desktop = matchMedia('(min-width: 64rem)');
    const onChange = () => desktop.matches && onClose();
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      id="mobile-menu"
      aria-label="Menu"
      onClose={onClose}
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className="drawer m-0 h-dvh max-h-none w-[min(20rem,85vw)] max-w-none flex-col border-r border-line bg-surface p-0 text-ink backdrop:bg-black/40 backdrop:backdrop-blur-sm open:flex lg:hidden"
    >
      {open && <SidebarContent {...props} onClose={onClose} />}
    </dialog>
  );
}

function SidebarContent({
  theme,
  onThemeChange,
  health,
  conversations,
  historyError,
  activeId,
  busy,
  onNew,
  onOpen,
  onDelete,
  onReload,
  onClose,
}: Props & { onClose?: () => void }) {
  const online = health?.configured;
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-5">
        <Brand />
        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="grid size-9 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X aria-hidden="true" size={18} />
            </button>
          )}
        </div>
      </div>
      <div className="px-4">
        <NewChatButton busy={busy} onNew={onNew} />
      </div>

      <nav aria-label="Conversation history" className="mt-6 min-h-0 flex-1 overflow-y-auto px-4">
        <h2 className="flex items-center justify-between px-2 pb-2 text-[0.6875rem] font-semibold tracking-wider text-ink-3 uppercase">
          History
          <button
            type="button"
            onClick={onReload}
            aria-label="Refresh history"
            className="grid place-items-center rounded p-0.5 transition-colors hover:text-ink pointer-coarse:size-8 pointer-coarse:-my-2"
          >
            <RefreshCw aria-hidden="true" size={12} />
          </button>
        </h2>
        {historyError ? (
          <p className="px-2 text-sm text-ink-3">Could not load your conversations.</p>
        ) : conversations === null ? (
          <p className="px-2 text-sm text-ink-3">Loading…</p>
        ) : conversations.length ? (
          <ol className="space-y-0.5">
            {conversations.map((conversation) => {
              const active = conversation.id === activeId;
              return (
                <li key={conversation.id} className="group relative">
                  <a
                    href={`?c=${encodeURIComponent(conversation.id)}`}
                    aria-current={active ? 'page' : undefined}
                    aria-disabled={busy || undefined}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                      event.preventDefault();
                      onOpen(conversation.id);
                    }}
                    className={`flex items-center gap-2 rounded-lg py-1.5 pr-8 pl-2 text-sm pointer-coarse:py-2.5 pointer-coarse:pr-11 transition-colors hover:bg-surface-2 hover:text-ink ${active ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2'} ${busy ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <MessageSquareText
                      aria-hidden="true"
                      size={14}
                      className="shrink-0 text-ink-3"
                    />
                    <span className="truncate">{conversation.title}</span>
                  </a>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDelete(conversation.id)}
                    aria-label={`Delete conversation: ${conversation.title}`}
                    className="absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-md text-ink-3 transition-opacity hover:text-danger-ink disabled:hidden pointer-coarse:size-9 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
                  >
                    <Trash2 aria-hidden="true" size={13} />
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="px-2 text-sm text-ink-3">Your conversations will appear here.</p>
        )}
      </nav>

      <div className="m-4 mb-[max(1rem,env(safe-area-inset-bottom))] rounded-2xl border border-line bg-surface p-3 shadow-xs">
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
          <span className="relative flex size-2.5" title={online ? 'Configured' : 'Not configured'}>
            {online && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />
            )}
            <span
              className={`relative inline-flex size-2.5 rounded-full ${online ? 'bg-good' : 'bg-ink-3'}`}
            />
            <span className="sr-only">{online ? 'Configured' : 'Not configured'}</span>
          </span>
        </div>
        <p className="mt-3 mb-0 flex items-center gap-1.5 border-t border-line pt-3 text-xs text-ink-3">
          <ShieldCheck aria-hidden="true" size={13} /> Read-only access to the warehouse
        </p>
      </div>
    </>
  );
}
