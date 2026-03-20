import React, { memo } from 'react';
import './EmptyState.css';

interface Suggestion {
  icon: string;
  title: string;
  sub: string;
  prompt: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: '📊',
    title: 'Compare two things',
    sub: 'Side-by-side table with verdict',
    prompt: 'Compare React vs Vue for a large-scale production app — full breakdown table',
  },
  {
    icon: '🔧',
    title: 'Debug my code',
    sub: 'Root cause + fixed version',
    prompt: 'Debug this code and explain the root cause:',
  },
  {
    icon: '🔍',
    title: 'Research a topic',
    sub: 'Deep analysis with evidence',
    prompt: 'Research and analyse the current state of AI regulation globally',
  },
  {
    icon: '📋',
    title: 'Build a plan',
    sub: 'Step-by-step structured output',
    prompt: 'Build a detailed 30-day launch plan for a SaaS product',
  },
  {
    icon: '💡',
    title: 'Explain a concept',
    sub: 'Clear, no-fluff explanation',
    prompt: 'Explain how transformers work in LLMs, from attention to inference',
  },
  {
    icon: '✍️',
    title: 'Write something',
    sub: 'Docs, emails, or long-form',
    prompt: 'Write a concise technical design doc for a URL shortener service',
  },
];

interface EmptyStateProps {
  onSuggestionClick: (prompt: string) => void;
  userName?: string;
}

const EmptyState: React.FC<EmptyStateProps> = memo(({ onSuggestionClick, userName }) => {
  const greeting = userName
    ? `Hey ${userName.split('@')[0].split('.')[0]},`
    : 'Ask anything.';

  return (
    <div className="es-root">
      {/* Heading */}
      <div className="es-heading">
        <div className="es-logo-wrap">
          <div className="es-logo-ring">
            <svg viewBox="0 0 28 28" fill="none" width="28" height="28">
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
          {greeting} What do you want to{' '}
          <span className="es-title-gold">verify?</span>
        </h1>
        <p className="es-subtitle">SEDREX · Verification-First Intelligence</p>
      </div>

      {/* Suggestion cards */}
      <div className="es-grid">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            className="es-card"
            onClick={() => onSuggestionClick(s.prompt)}
            type="button"
          >
            <div className="es-card-icon">{s.icon}</div>
            <div className="es-card-body">
              <p className="es-card-title">{s.title}</p>
              <p className="es-card-sub">{s.sub}</p>
            </div>
            <svg
              className="es-card-arrow"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
});

export default EmptyState;