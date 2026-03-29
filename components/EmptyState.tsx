// components/EmptyState.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — EmptyState v2.0
//
// SESSION 9.1 REDESIGN:
//   ✅ Headline: "What are you building?" — developer-first framing
//   ✅ Tagline: "Multi-model AI for developers" — replaces
//      "Verification-First Intelligence" (contradicted system prompt)
//   ✅ Cards rewritten around Sedrex-specific capabilities with
//      monospace subtitles in "type · outcome" format
//   ✅ SVG icons replace emoji — cleaner at small sizes
//   ✅ DM Mono for subtitles and footer — technical, distinct
//   ✅ Footer: keyboard shortcut + routing hint
// ══════════════════════════════════════════════════════════════════

import React, { memo } from 'react';
import './EmptyState.css';

interface Suggestion {
  icon: React.ReactNode;
  title: string;
  sub: string;
  prompt: string;
}

const IconCode = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 18l6-6-6-6M8 6L2 12l6 6"/>
  </svg>
);

const IconBug = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
    <path d="M12 8v4M12 16h.01"/>
  </svg>
);

const IconCompare = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 20V10M12 20V4M6 20v-6"/>
  </svg>
);

const IconRefactor = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
);

const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
  </svg>
);

const IconExplain = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 16v-4M12 8h.01"/>
  </svg>
);

const SUGGESTIONS: Suggestion[] = [
  {
    icon: <IconCode />,
    title: 'Write full code',
    sub: 'complete file · no placeholders',
    prompt: 'Write a complete TypeScript Express JWT auth middleware at src/middleware/auth.ts — full file with all imports, types, and error handling',
  },
  {
    icon: <IconBug />,
    title: 'Debug my code',
    sub: 'root cause · fixed version',
    prompt: 'Debug this code and explain the exact root cause:\n\n[paste your code and error here]',
  },
  {
    icon: <IconCompare />,
    title: 'Compare & decide',
    sub: 'table · verdict · winner named',
    prompt: 'Compare React Query vs SWR for data fetching in Next.js 14 — full breakdown table, then pick a winner',
  },
  {
    icon: <IconRefactor />,
    title: 'Refactor a file',
    sub: 'full rewrite · explain changes',
    prompt: 'Refactor this file — provide the complete rewritten version with a summary of what changed:\n\n[paste your file here]',
  },
  {
    icon: <IconSearch />,
    title: 'Research a topic',
    sub: 'live web · sources cited',
    prompt: 'Research and explain with current sources: ',
  },
  {
    icon: <IconExplain />,
    title: 'Explain a concept',
    sub: 'no fluff · mental model first',
    prompt: 'Explain how this works with a clear mental model and a practical code example: ',
  },
];

interface EmptyStateProps {
  onSuggestionClick: (prompt: string) => void;
  userName?: string;
}

const EmptyState: React.FC<EmptyStateProps> = memo(({ onSuggestionClick, userName }) => {
  const name = userName
    ? userName.split('@')[0].split('.')[0]
    : null;

  return (
    <div className="es-root">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="es-heading">
        <div className="es-logo-wrap">
          <div className="es-logo-ring">
            <svg viewBox="0 0 28 28" fill="none" width="22" height="22">
              <path
                d="M19 8H11C9.3 8 8 9.3 8 11V12.5C8 14.2 9.3 15.5 11 15.5H17C18.7 15.5 20 16.8 20 18.5V20C20 21.7 18.7 23 17 23H8"
                stroke="#10B981"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
        <h1 className="es-title">
          {name ? `Hey ${name} — ` : ''}What are you{' '}
          <span className="es-title-accent">building?</span>
        </h1>
        <p className="es-subtitle">SEDREX · Multi-model AI for developers</p>
      </div>

      {/* ── Suggestion cards ───────────────────────────────── */}
      <div className="es-grid">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            className="es-card"
            onClick={() => onSuggestionClick(s.prompt)}
            type="button"
          >
            <div className="es-card-icon">
              {s.icon}
            </div>
            <div className="es-card-body">
              <p className="es-card-title">{s.title}</p>
              <p className="es-card-sub">{s.sub}</p>
            </div>
          </button>
        ))}
      </div>

      {/* ── Footer hint ────────────────────────────────────── */}
      <p className="es-footer">
        <span>Ctrl+K to search</span>
        <span className="es-footer-dot">·</span>
        <span>Auto routes to the best model</span>
      </p>

    </div>
  );
});

export default EmptyState;