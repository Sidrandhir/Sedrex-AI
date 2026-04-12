// src/components/ThinkingSteps.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — THINKING STEPS COMPONENT v1.0
//
// Renders the pre-answer reasoning animation in the assistant message
// bubble. Sits ABOVE markdown-body and BELOW the ThinkingBlock
// (Gemini extended thinking trace — different feature, no conflict).
//
// Design system: matches ChatArea.css exactly —
//   dark zinc bg · emerald (#10B981) · IBM Plex · glassmorphism
//   All styles are self-contained (no ChatArea.css modifications needed)
//
// Rendering rules:
//   phase === 'idle'      → renders nothing (null)
//   phase === 'planning'  → single pulsing "Sedrex is thinking…" row
//   phase === 'thinking'  → animated step rows (pending/active/done)
//   phase === 'answering' → compact completed steps, then answer begins
//   phase === 'done'      → compact completed steps (always visible)
// ══════════════════════════════════════════════════════════════════

import React, { memo, useState } from 'react';
import { ThinkingStep, ThinkingPhase } from '../hooks/useThinkingSteps';

// ── Props ──────────────────────────────────────────────────────────

interface ThinkingStepsProps {
  phase:           ThinkingPhase;
  steps:           ThinkingStep[];
  activeStepIndex: number;
  totalTimeMs?:    number;
}

// ── Sub-components ─────────────────────────────────────────────────

/**
 * Planning phase — single pulsing row shown while AI decides steps.
 */
const PlanningRow = memo(() => (
  <div className="tsx-planning-row">
    <span className="tsx-planning-dot" />
    <span className="tsx-planning-text">Sedrex is thinking…</span>
  </div>
));
PlanningRow.displayName = 'PlanningRow';

/**
 * Individual step row — three states: pending / active / done.
 */
const StepRow = memo(({ step, isActive, isThinking }: {
  step:       ThinkingStep;
  isActive:   boolean;
  isThinking: boolean;
}) => {
  const isDone    = step.status === 'done';
  const isPending = step.status === 'pending';

  return (
    <div
      className={[
        'tsx-step-row',
        isDone    ? 'tsx-step-done'    : '',
        isActive  ? 'tsx-step-active'  : '',
        isPending ? 'tsx-step-pending' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Icon bubble */}
      <div className={[
        'tsx-step-icon',
        isDone   ? 'tsx-step-icon-done'   : '',
        isActive ? 'tsx-step-icon-active' : '',
      ].filter(Boolean).join(' ')}>
        {isDone ? (
          <span className="tsx-step-check">✓</span>
        ) : isActive ? (
          <span className="tsx-step-emoji tsx-step-emoji-spin">{step.icon}</span>
        ) : (
          <span className="tsx-step-emoji tsx-step-emoji-muted">{step.icon}</span>
        )}
      </div>

      {/* Labels */}
      <div className="tsx-step-labels">
        <span className={[
          'tsx-step-label',
          isDone   ? 'tsx-step-label-done'   : '',
          isActive ? 'tsx-step-label-active' : '',
        ].filter(Boolean).join(' ')}>
          {step.label}
        </span>
        {step.detail && (
          <span className="tsx-step-detail">{step.detail}</span>
        )}
      </div>

      {/* Active shimmer bar */}
      {isActive && isThinking && (
        <div className="tsx-step-shimmer-track">
          <div className="tsx-step-shimmer-fill" />
        </div>
      )}
    </div>
  );
});
StepRow.displayName = 'StepRow';

// ── Main Component ─────────────────────────────────────────────────

export const ThinkingSteps = memo(({
  phase,
  steps,
  activeStepIndex,
  totalTimeMs,
}: ThinkingStepsProps) => {

  if (phase === 'idle') return null;

  const [isExpanded, setIsExpanded] = useState(false);

  const isThinking  = phase === 'thinking';
  const isAnswering = phase === 'answering';
  const isDone      = phase === 'done';
  const isPlanning  = phase === 'planning';

  // In answering/done: render a compact collapsed summary
  const showCompact = isAnswering || isDone;

  return (
    <div className="tsx-root">

      {/* ── Planning ─────────────────────────────────────────────── */}
      {isPlanning && <PlanningRow />}

      {/* ── Thinking steps ───────────────────────────────────────── */}
      {isThinking && steps.length > 0 && (
        <div className="tsx-steps-container">
          <div className="tsx-steps-header">
            <span className="tsx-steps-header-text">Reasoning</span>
            <span className="tsx-steps-header-pulse" />
          </div>
          <div className="tsx-steps-list">
            {steps.map((step, idx) => (
              <StepRow
                key={step.id}
                step={step}
                isActive={idx === activeStepIndex && isThinking}
                isThinking={isThinking}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Compact summary (answering / done) ───────────────────── */}
      {showCompact && steps.length > 0 && (
        <>
          <div className="tsx-compact-row" onClick={() => setIsExpanded(e => !e)}>
            <span className="tsx-compact-icon">✓</span>
            <span className="tsx-compact-text">
              {steps.length} reasoning step{steps.length !== 1 ? 's' : ''}
              {totalTimeMs != null && totalTimeMs > 0
                ? ` · ${(totalTimeMs / 1000).toFixed(1)}s`
                : ' completed'}
            </span>
            <div className="tsx-compact-chips">
              {steps.map(s => (
                <span key={s.id} className="tsx-compact-chip" title={s.detail}>
                  {s.icon}
                </span>
              ))}
            </div>
            <span className="tsx-toggle-btn">{isExpanded ? '▲' : '▼'}</span>
          </div>
          {isExpanded && (
            <div className="tsx-steps-container tsx-steps-expanded">
              <div className="tsx-steps-list">
                {steps.map(step => (
                  <StepRow key={step.id} step={step} isActive={false} isThinking={false} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* CSS — self-contained, zero ChatArea.css modifications needed */}
      <style>{`
        /* ── Keyframes ─────────────────────────────────────── */
        @keyframes tsx-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.25; }
        }
        @keyframes tsx-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes tsx-fade-in {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes tsx-spin {
          from { display: inline-block; transform: rotate(0deg); }
          to   { display: inline-block; transform: rotate(360deg); }
        }

        /* ── Root ──────────────────────────────────────────── */
        .tsx-root {
          width: 100%;
          margin-bottom: 10px;
          font-family: 'IBM Plex Sans', ui-sans-serif, -apple-system, sans-serif;
          animation: tsx-fade-in 0.22s ease both;
        }

        /* ── Planning row ──────────────────────────────────── */
        .tsx-planning-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0 10px;
        }
        .tsx-planning-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10B981;
          flex-shrink: 0;
          animation: tsx-pulse 1.1s ease infinite;
        }
        .tsx-planning-text {
          font-size: 12.5px;
          color: var(--text-secondary, #6b7280);
          letter-spacing: 0.01em;
        }

        /* ── Steps container ───────────────────────────────── */
        .tsx-steps-container {
          background: rgba(16, 185, 129, 0.03);
          border: 1px solid rgba(16, 185, 129, 0.12);
          border-radius: 10px;
          padding: 10px 12px 12px;
          margin-bottom: 2px;
          backdrop-filter: blur(6px);
        }
        [data-theme='light'] .tsx-steps-container {
          background: rgba(16, 185, 129, 0.03);
          border-color: rgba(16, 185, 129, 0.15);
        }

        /* ── Steps header ──────────────────────────────────── */
        .tsx-steps-header {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 10px;
        }
        .tsx-steps-header-text {
          font-size: 10px;
          font-weight: 700;
          color: rgba(16, 185, 129, 0.7);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .tsx-steps-header-pulse {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #10B981;
          animation: tsx-pulse 0.9s ease infinite;
        }

        /* ── Steps list ────────────────────────────────────── */
        .tsx-steps-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        /* ── Step row ──────────────────────────────────────── */
        .tsx-step-row {
          display: flex;
          align-items: center;
          gap: 9px;
          position: relative;
          overflow: hidden;
          transition: opacity 0.25s ease, transform 0.25s ease;
        }
        .tsx-step-pending { opacity: 0.3; }
        .tsx-step-active  { opacity: 1; transform: translateX(3px); }
        .tsx-step-done    { opacity: 1; }

        /* ── Step icon bubble ──────────────────────────────── */
        .tsx-step-icon {
          width: 28px;
          height: 28px;
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          transition: all 0.25s ease;
        }
        .tsx-step-icon-done {
          background: rgba(16, 185, 129, 0.12);
          border-color: rgba(16, 185, 129, 0.4);
        }
        .tsx-step-icon-active {
          background: rgba(16, 185, 129, 0.07);
          border-color: rgba(16, 185, 129, 0.25);
        }
        [data-theme='light'] .tsx-step-icon {
          background: rgba(0, 0, 0, 0.03);
          border-color: rgba(0, 0, 0, 0.08);
        }

        .tsx-step-check {
          font-size: 12px;
          font-weight: 700;
          color: #10B981;
          line-height: 1;
        }
        .tsx-step-emoji {
          font-size: 14px;
          line-height: 1;
          display: inline-block;
        }
        .tsx-step-emoji-muted {
          filter: grayscale(0.8);
          opacity: 0.5;
        }
        /* NOTE: emojis don't rotate cleanly with CSS transform.
           We use a subtle scale pulse instead — looks better. */
        .tsx-step-emoji-spin {
          animation: tsx-pulse 1s ease infinite;
        }

        /* ── Step labels ───────────────────────────────────── */
        .tsx-step-labels {
          display: flex;
          flex-direction: column;
          gap: 1px;
          flex: 1;
          min-width: 0;
        }
        .tsx-step-label {
          font-size: 12.5px;
          font-weight: 500;
          color: var(--text-secondary, #6b7280);
          transition: color 0.25s ease;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tsx-step-label-done   { color: #10B981; }
        .tsx-step-label-active { color: var(--text-primary, #e5e7eb); }
        [data-theme='light'] .tsx-step-label       { color: #6b7280; }
        [data-theme='light'] .tsx-step-label-active { color: #1a1a2e; }

        .tsx-step-detail {
          font-size: 10.5px;
          color: var(--text-secondary, #4b5563);
          opacity: 0.55;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ── Shimmer bar (active step) ─────────────────────── */
        .tsx-step-shimmer-track {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: rgba(16, 185, 129, 0.08);
          overflow: hidden;
        }
        .tsx-step-shimmer-fill {
          height: 100%;
          width: 35%;
          background: linear-gradient(90deg, transparent, #10B981, transparent);
          animation: tsx-shimmer 1.4s ease infinite;
        }

        /* ── Compact summary row ───────────────────────────── */
        .tsx-compact-row {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 5px 0 9px;
          animation: tsx-fade-in 0.2s ease both;
        }
        .tsx-compact-icon {
          font-size: 11px;
          color: #10B981;
          font-weight: 700;
          flex-shrink: 0;
        }
        .tsx-compact-text {
          font-size: 11.5px;
          color: var(--text-secondary, #6b7280);
          opacity: 0.7;
          white-space: nowrap;
        }
        .tsx-compact-chips {
          display: flex;
          align-items: center;
          gap: 3px;
          margin-left: 2px;
        }
        .tsx-compact-chip {
          font-size: 12px;
          opacity: 0.55;
          line-height: 1;
          cursor: default;
        }
        .tsx-compact-chip:hover { opacity: 0.85; }

        .tsx-compact-row { cursor: pointer; user-select: none; }
        .tsx-compact-row:hover { opacity: 0.85; }
        .tsx-toggle-btn {
          font-size: 9px;
          color: var(--text-secondary, #6b7280);
          opacity: 0.5;
          margin-left: auto;
          flex-shrink: 0;
        }
        .tsx-steps-expanded {
          margin-top: 4px;
          animation: tsx-fade-in 0.18s ease both;
        }
      `}</style>
    </div>
  );
});
ThinkingSteps.displayName = 'ThinkingSteps';