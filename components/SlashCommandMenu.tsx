import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './SlashCommandMenu.css';

export interface SlashCommand {
  icon: string;
  name: string;
  desc: string;
  shortcut?: string;
  template: string; // text that replaces the /command in the input
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // ── Existing commands — unchanged ─────────────────────────────
  {
    icon: '📊',
    name: 'compare',
    desc: 'Side-by-side comparison table',
    shortcut: '/compare',
    template: 'Compare [A] vs [B] — build a full comparison table with verdict',
  },
  {
    icon: '🔧',
    name: 'debug',
    desc: 'Debug code — root cause + fix',
    shortcut: '/debug',
    template: 'Debug this code, explain the root cause, and show the fixed version:\n\n```\n[paste code here]\n```',
  },
  {
    icon: '📋',
    name: 'plan',
    desc: 'Step-by-step action plan',
    shortcut: '/plan',
    template: 'Build a detailed step-by-step plan for: ',
  },
  {
    icon: '🔍',
    name: 'research',
    desc: 'Deep research with evidence',
    shortcut: '/research',
    template: 'Research and analyse: ',
  },
  {
    icon: '📝',
    name: 'summarise',
    desc: 'Summarise a document or text',
    shortcut: '/summarise',
    template: 'Summarise the following — key points, takeaways, and any action items:\n\n',
  },
  {
    icon: '✍️',
    name: 'write',
    desc: 'Write a document or email',
    shortcut: '/write',
    template: 'Write a professional ',
  },
  {
    icon: '💡',
    name: 'explain',
    desc: 'Clear explanation, no fluff',
    shortcut: '/explain',
    template: 'Explain clearly and concisely: ',
  },
  {
    icon: '📐',
    name: 'table',
    desc: 'Build a structured table',
    shortcut: '/table',
    template: 'Build a structured table for: ',
  },
  {
    icon: '🧪',
    name: 'review',
    desc: 'Review and critique anything',
    shortcut: '/review',
    template: 'Review the following and give honest, structured feedback:\n\n',
  },
  {
    icon: '⚡',
    name: 'code',
    desc: 'Write production-ready code',
    shortcut: '/code',
    template: 'Write complete, production-ready code for: ',
  },

  // ── New artifact commands ──────────────────────────────────────
  {
    icon: '🏗️',
    name: 'artifact',
    desc: 'Build a complete file — opens in artifact panel',
    shortcut: '/artifact',
    template: 'Write a complete, production-ready file for: ',
  },
  {
    icon: '👁️',
    name: 'preview',
    desc: 'Build a live-preview HTML/React component',
    shortcut: '/preview',
    template: 'Build a complete, self-contained HTML page or React component for: ',
  },
  {
    icon: '🛡️',
    name: 'audit',
    desc: 'Security & performance audit',
    shortcut: '/audit',
    template: 'Perform a deep technical audit of this code. Check for: 1. Security vulnerabilities 2. Memory leaks 3. Performance bottlenecks. Provide a complete fixed version.\n\n```\n[paste code here]\n```',
  },
  {
    icon: '♻️',
    name: 'refactor',
    desc: 'Refactor for readability, types, performance',
    shortcut: '/refactor',
    template: 'Refactor the following code for production. Improve readability, type safety, and performance. Return the complete refactored file.\n\n```\n[paste code here]\n```',
  },
  {
    icon: '🧬',
    name: 'test',
    desc: 'Generate complete unit tests',
    shortcut: '/test',
    template: 'Write comprehensive unit tests (Vitest/Jest) for the following code, covering all edge cases and error paths. Return a complete test file.\n\n```\n[paste code here]\n```',
  },
  {
    icon: '📖',
    name: 'docs',
    desc: 'Generate JSDoc + README',
    shortcut: '/docs',
    template: 'Generate complete JSDoc comments and a technical README for this module:\n\n```\n[paste code here]\n```',
  },
];

interface SlashCommandMenuProps {
  anchorEl: HTMLElement | null;
  query: string; // text after the /
  onSelect: (template: string) => void;
  onClose: () => void;
}

const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  anchorEl,
  query,
  onSelect,
  onClose,
}) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Filter commands by query
  const filtered = query
    ? SLASH_COMMANDS.filter(
        c =>
          c.name.startsWith(query.toLowerCase()) ||
          c.desc.toLowerCase().includes(query.toLowerCase())
      )
    : SLASH_COMMANDS;

  // Reset active index when filter changes
  useEffect(() => { setActiveIdx(0); }, [query]);

  // Compute position — always opens UPWARD above the input box
  const computePos = useCallback(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    // Use bottom positioning so menu always opens upward above the input bar
    const bottom = window.innerHeight - rect.top + 8;
    setPos({ top: bottom, left: Math.max(8, rect.left) });
  }, [anchorEl]);

  useEffect(() => {
    computePos();
    window.addEventListener('resize', computePos);
    window.addEventListener('scroll', computePos, true);
    return () => {
      window.removeEventListener('resize', computePos);
      window.removeEventListener('scroll', computePos, true);
    };
  }, [computePos]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!filtered.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        onSelect(filtered[activeIdx].template);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    // Use capture:true so this fires BEFORE React synthetic events on the textarea
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [filtered, activeIdx, onSelect, onClose]);

  // Scroll active item into view
  useEffect(() => {
    const el = menuRef.current?.querySelector('.slash-item--active') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // Click outside closes
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (!pos || !filtered.length) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="slash-menu"
      style={{
        bottom: pos.top,
        left: Math.min(pos.left, Math.max(8, window.innerWidth - 356)),
      }}
      role="listbox"
      aria-label="Slash commands"
    >
      <div className="slash-menu-header">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M7 8l-4 4 4 4M17 8l4 4-4 4M14 4l-4 16" />
        </svg>
        Commands
      </div>

      <div className="slash-menu-list">
        {filtered.map((cmd, i) => (
          <button
            key={cmd.name}
            className={`slash-item${i === activeIdx ? ' slash-item--active' : ''}`}
            role="option"
            aria-selected={i === activeIdx}
            onMouseEnter={() => setActiveIdx(i)}
            onClick={() => onSelect(cmd.template)}
            type="button"
          >
            <div className="slash-item-icon">{cmd.icon}</div>
            <div className="slash-item-text">
              <p className="slash-item-name">{cmd.name}</p>
              <p className="slash-item-desc">{cmd.desc}</p>
            </div>
            {cmd.shortcut && (
              <span className="slash-item-shortcut">{cmd.shortcut}</span>
            )}
          </button>
        ))}
      </div>

      <div className="slash-menu-footer">
        <span className="slash-hint">
          <kbd>↑↓</kbd> navigate
        </span>
        <span className="slash-hint">
          <kbd>↵</kbd> select
        </span>
        <span className="slash-hint">
          <kbd>Esc</kbd> close
        </span>
      </div>
    </div>,
    document.body
  );
};

export default SlashCommandMenu;