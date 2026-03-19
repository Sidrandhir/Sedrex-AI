import React, { useState, memo } from 'react';
import './ReasoningPanel.css';

type ConfidenceLevel = 'high' | 'moderate' | 'low' | 'live';

interface RouterContext {
  intent?: string;
  model?: string;
  engine?: string;
  complexity?: number;
  reason?: string;
  explanation?: string;
  thinking?: boolean;
}

interface ConfidenceSignal {
  level: ConfidenceLevel;
  label: string;
  reason: string;
}

interface ReasoningPanelProps {
  confidence?: ConfidenceSignal;
  routingContext?: RouterContext;
}

function buildSteps(ctx: RouterContext | undefined, conf: ConfidenceSignal | undefined): string[] {
  if (!ctx && !conf) return [];

  const steps: string[] = [];

  // Step 1: Intent classification
  const intentMap: Record<string, string> = {
    live: 'Live / real-time data detected → routed to grounded search engine',
    coding: 'Technical or code request detected → routed to precision coding engine',
    reasoning: 'Analytical or comparison request detected → routed to deep reasoning engine',
    general: 'General knowledge query → routed to balanced intelligence engine',
  };
  if (ctx?.intent) {
    steps.push(intentMap[ctx.intent] || `Query classified as "${ctx.intent}"`);
  }

  // Step 2: Complexity
  if (ctx?.complexity !== undefined) {
    const pct = Math.round(ctx.complexity * 100);
    if (pct > 65) {
      steps.push(`High complexity (${pct}%) — extended reasoning budget allocated`);
    } else if (pct > 35) {
      steps.push(`Moderate complexity (${pct}%) — standard token budget`);
    } else {
      steps.push(`Low complexity (${pct}%) — efficient short-form response mode`);
    }
  }

  // Step 3: Engine / model selection
  if (ctx?.engine) {
    const engineNames: Record<string, string> = {
      'gemini-2.5-pro': 'Gemini 2.5 Pro selected (deep analytical + thinking mode)',
      'gemini-2.5-flash': 'Gemini 2.5 Flash selected (fast, balanced)',
      'gemini-1.5-flash-8b': 'Gemini Flash Lite selected (speed-optimised)',
    };
    steps.push(engineNames[ctx.engine] || `Engine: ${ctx.engine}`);
  }

  // Step 4: Confidence reasoning
  if (conf) {
    steps.push(`Confidence scored as "${conf.label}" — ${conf.reason}`);
  }

  return steps;
}

const badgeClass: Record<ConfidenceLevel, string> = {
  high: 'rp-badge--high',
  moderate: 'rp-badge--moderate',
  low: 'rp-badge--low',
  live: 'rp-badge--live',
};

const ReasoningPanel: React.FC<ReasoningPanelProps> = memo(({ confidence, routingContext }) => {
  const [open, setOpen] = useState(false);

  const steps = buildSteps(routingContext, confidence);
  if (!steps.length && !routingContext) return null;

  const level = confidence?.level ?? 'moderate';
  const label = confidence?.label ?? 'Inference';

  return (
    <div className="rp-root">
      <button
        className="rp-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        type="button"
      >
        <span className="rp-toggle-icon">🧠</span>
        <span className="rp-toggle-label">View reasoning</span>
        <span className={`rp-toggle-badge ${badgeClass[level]}`}>{label}</span>
        <svg
          className={`rp-chevron${open ? ' rp-chevron--open' : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div className={`rp-body${open ? ' rp-body--open' : ''}`}>
        <div className="rp-inner">
          {steps.length > 0 && (
            <div className="rp-steps">
              {steps.map((step, i) => (
                <div key={i} className="rp-step">
                  <span className="rp-step-num">{i + 1}</span>
                  <span className="rp-step-text">{step}</span>
                </div>
              ))}
            </div>
          )}

          {/* Meta chips */}
          {routingContext && (
            <div className="rp-meta">
              {routingContext.intent && (
                <span className="rp-meta-chip">
                  <span className="rp-meta-chip-dot" />
                  {routingContext.intent}
                </span>
              )}
              {routingContext.model && (
                <span className="rp-meta-chip">
                  <span className="rp-meta-chip-dot" />
                  {routingContext.model}
                </span>
              )}
              {routingContext.engine && (
                <span className="rp-meta-chip">
                  <span className="rp-meta-chip-dot" />
                  {routingContext.engine}
                </span>
              )}
              {routingContext.thinking && (
                <span className="rp-meta-chip">
                  <span className="rp-meta-chip-dot" />
                  thinking mode
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default ReasoningPanel;