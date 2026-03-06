import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../constants';

type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  keywords: string[];
  action: () => void;
};

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onGoChat: () => void;
  onGoDashboard: () => void;
  onGoPricing: () => void;
  onGoBilling: () => void;
  onToggleTheme: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNewChat,
  onOpenSettings,
  onGoChat,
  onGoDashboard,
  onGoPricing,
  onGoBilling,
  onToggleTheme,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        id: 'new-chat',
        label: 'New Chat',
        hint: 'Create a fresh conversation',
        keywords: ['new', 'chat', 'conversation', 'start'],
        action: onNewChat,
      },
      {
        id: 'settings',
        label: 'Open Settings',
        hint: 'Preferences and account settings',
        keywords: ['settings', 'preferences', 'account', 'profile'],
        action: onOpenSettings,
      },
      {
        id: 'go-chat',
        label: 'Go to Chat',
        hint: 'Return to chat view',
        keywords: ['chat', 'home', 'main'],
        action: onGoChat,
      },
      {
        id: 'go-dashboard',
        label: 'Go to Dashboard',
        hint: 'See usage analytics',
        keywords: ['dashboard', 'analytics', 'stats', 'usage'],
        action: onGoDashboard,
      },
      {
        id: 'go-pricing',
        label: 'Go to Pricing',
        hint: 'View available plans',
        keywords: ['pricing', 'plans', 'pro', 'upgrade'],
        action: onGoPricing,
      },
      {
        id: 'go-billing',
        label: 'Go to Billing',
        hint: 'Check subscription details',
        keywords: ['billing', 'subscription', 'invoices'],
        action: onGoBilling,
      },
      {
        id: 'toggle-theme',
        label: 'Toggle Theme',
        hint: 'Switch between light and dark',
        keywords: ['theme', 'dark', 'light', 'appearance'],
        action: onToggleTheme,
      },
    ],
    [onNewChat, onOpenSettings, onGoChat, onGoDashboard, onGoPricing, onGoBilling, onToggleTheme]
  );

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const labelMatch = c.label.toLowerCase().includes(q);
      const hintMatch = c.hint?.toLowerCase().includes(q);
      const keywordMatch = c.keywords.some((k) => k.includes(q));
      return labelMatch || hintMatch || keywordMatch;
    });
  }, [commands, query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (!filteredCommands.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % filteredCommands.length);
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        filteredCommands[activeIndex]?.action();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, activeIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
      <div
        className="mx-auto mt-[10vh] w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <Icons.Search className="w-4 h-4 text-[var(--text-secondary)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]/70"
            aria-label="Command palette search"
          />
          <kbd className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)]">Esc</kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2 custom-scrollbar">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
              No command found for "{query}".
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={cmd.id}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  className={`mb-1 w-full rounded-xl border px-4 py-3 text-left transition-all ${
                    isActive
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-tertiary)]/40'
                  }`}
                >
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{cmd.label}</div>
                  {cmd.hint && <div className="text-xs text-[var(--text-secondary)] mt-0.5">{cmd.hint}</div>}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--text-secondary)] sm:px-5">
          <span>Use arrows to navigate</span>
          <span>Enter to run</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
