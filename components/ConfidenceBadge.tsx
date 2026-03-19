import React, { memo } from "react";
import type { ConfidenceSignal } from "../services/aiService";

// ══════════════════════════════════════════════════════════════════
// SEDREX — CONFIDENCE BADGE
// Key differentiator: users see certainty level, not just answers.
// Gold = high, Amber = moderate, Red = low, Blue = live
// ══════════════════════════════════════════════════════════════════

interface Props {
  confidence: ConfidenceSignal;
  mobile?: boolean;
}

const CONFIG = {
  high: {
    dot:    "#3de87a",
    text:   "#3de87a",
    bg:     "rgba(61,232,122,0.08)",
    border: "rgba(61,232,122,0.2)",
    icon:   "✓",
    label:  "Verified",
  },
  moderate: {
    dot:    "#f59e0b",
    text:   "#f59e0b",
    bg:     "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.2)",
    icon:   "◎",
    label:  "Moderate",
  },
  low: {
    dot:    "#f87171",
    text:   "#f87171",
    bg:     "rgba(248,113,113,0.08)",
    border: "rgba(248,113,113,0.2)",
    icon:   "⚠",
    label:  "Low",
  },
  live: {
    dot:    "#60a5fa",
    text:   "#60a5fa",
    bg:     "rgba(96,165,250,0.08)",
    border: "rgba(96,165,250,0.2)",
    icon:   "◉",
    label:  "Live",
  },
} as const;

export const ConfidenceBadge = memo(({ confidence, mobile = false }: Props) => {
  const [showTip, setShowTip] = React.useState(false);
  const cfg = CONFIG[confidence.level];

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setShowTip(v => !v)}
        onMouseEnter={() => !mobile && setShowTip(true)}
        onMouseLeave={() => !mobile && setShowTip(false)}
        aria-label={`Confidence: ${confidence.label}. ${confidence.reason}`}
        style={{
          display:        "inline-flex",
          alignItems:     "center",
          gap:            6,
          padding:        "3px 10px 3px 8px",
          borderRadius:   100,
          border:         `1px solid ${cfg.border}`,
          background:     cfg.bg,
          cursor:         "pointer",
          outline:        "none",
          userSelect:     "none",
          transition:     "all 0.15s",
        }}
      >
        {/* Dot */}
        <span style={{
          width:        6,
          height:       6,
          borderRadius: "50%",
          background:   cfg.dot,
          flexShrink:   0,
          boxShadow:    confidence.level === "live" ? `0 0 6px ${cfg.dot}` : "none",
          animation:    confidence.level === "live" ? "confidencePulse 1.8s ease-in-out infinite" : "none",
        }} />
        {/* Label */}
        <span style={{
          fontFamily:    "'IBM Plex Mono', monospace",
          fontSize:      10,
          fontWeight:    700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color:         cfg.text,
          lineHeight:    1,
        }}>
          {confidence.label}
        </span>
      </button>

      {/* Tooltip */}
      {showTip && (
        <div
          role="tooltip"
          style={{
            position:     "absolute",
            bottom:       "calc(100% + 8px)",
            left:         0,
            zIndex:       100,
            minWidth:     220,
            maxWidth:     280,
            padding:      "12px 14px",
            borderRadius: 10,
            background:   "var(--bg-tertiary, #0a1220)",
            border:       `1px solid ${cfg.border}`,
            boxShadow:    "0 4px 20px rgba(0,0,0,0.4)",
            pointerEvents:"none",
          }}
        >
          {/* Arrow */}
          <div style={{
            position:   "absolute",
            bottom:     -5,
            left:       16,
            width:      8,
            height:     8,
            background: "var(--bg-tertiary, #0a1220)",
            border:     `1px solid ${cfg.border}`,
            borderTop:  "none",
            borderLeft: "none",
            transform:  "rotate(45deg)",
          }} />
          <p style={{
            margin:        0,
            marginBottom:  5,
            fontFamily:    "'IBM Plex Mono', monospace",
            fontSize:      11,
            fontWeight:    700,
            letterSpacing: "0.04em",
            color:         cfg.text,
          }}>
            {cfg.icon} {confidence.label}
          </p>
          <p style={{
            margin:     0,
            fontSize:   12,
            lineHeight: 1.55,
            color:      "var(--text-secondary, #4a5270)",
          }}>
            {confidence.reason}
          </p>
        </div>
      )}

      <style>{`
        @keyframes confidencePulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
});

ConfidenceBadge.displayName = "ConfidenceBadge";
export default ConfidenceBadge;