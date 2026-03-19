// components/AgentRoutingTag.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Agent Routing Tag
//
// Replaces the plain routing tag in ChatArea.tsx with a rich label
// showing which agent + provider handled the request.
//
// DROP-IN: Find the routing tag JSX in ChatArea.tsx and replace with
// <AgentRoutingTag routingContext={msg.routingContext} confidence={msg.confidence} />
//
// TODAY   : shows "Reasoning Agent · Gemini" etc.
// FUTURE  : shows "Coding Agent · Claude Sonnet" when key is added.
// ══════════════════════════════════════════════════════════════════

import React from 'react';
import { RoutingContext } from '../types';
import { ConfidenceSignal } from '../services/aiService';

interface AgentRoutingTagProps {
  routingContext?: RoutingContext;
  confidence?:     ConfidenceSignal;
}

// ── Agent display config ──────────────────────────────────────────
const AGENT_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  reasoning: { label: "Reasoning Agent", icon: "⚡", color: "rgba(201,169,110,0.15)" },
  coding:    { label: "Coding Agent",    icon: "💻", color: "rgba(96,165,250,0.12)"  },
  rag:       { label: "Search Agent",   icon: "🔍", color: "rgba(74,222,128,0.10)"  },
  general:   { label: "General Agent",  icon: "✦",  color: "rgba(148,163,184,0.10)" },
};

const PROVIDER_CONFIG: Record<string, { label: string; color: string }> = {
  "claude":          { label: "Claude Sonnet",   color: "#e8c98a" },
  "openai":          { label: "GPT-4",            color: "#74d7a8" },
  "gemini-search":   { label: "Gemini + Search",  color: "#60a5fa" },
  "gemini-fallback": { label: "Gemini",            color: "#94a3b8" },
  "perplexity":      { label: "Perplexity",        color: "#a78bfa" },
};

// ── Confidence → border color ─────────────────────────────────────
const CONFIDENCE_BORDER: Record<string, string> = {
  high:     "rgba(74,222,128,0.35)",
  moderate: "rgba(251,191,36,0.35)",
  low:      "rgba(248,113,113,0.35)",
  live:     "rgba(96,165,250,0.35)",
};

export const AgentRoutingTag: React.FC<AgentRoutingTagProps> = ({
  routingContext,
  confidence,
}) => {
  if (!routingContext) return null;

  const agentType    = routingContext.agentType    ?? "general";
  const agentProvider = routingContext.agentProvider ?? "gemini-fallback";

  const agent    = AGENT_CONFIG[agentType]       ?? AGENT_CONFIG.general;
  const provider = PROVIDER_CONFIG[agentProvider] ?? PROVIDER_CONFIG["gemini-fallback"];
  const border   = confidence ? CONFIDENCE_BORDER[confidence.level] ?? "var(--border)" : "var(--border)";

  return (
    <div
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        gap:            6,
        padding:        "3px 10px",
        borderRadius:   6,
        border:         `1px solid ${border}`,
        background:     agent.color,
        fontSize:       11,
        marginBottom:   8,
        userSelect:     "none",
      }}
    >
      {/* Agent type */}
      <span style={{ fontSize: 12 }}>{agent.icon}</span>
      <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
        {agent.label}
      </span>

      {/* Divider */}
      <span style={{ color: "var(--border)", fontSize: 10 }}>·</span>

      {/* Provider */}
      <span style={{ color: provider.color, fontWeight: 600, fontSize: 11 }}>
        {provider.label}
      </span>

      {/* Confidence score if available */}
      {routingContext.confidence != null && (
        <>
          <span style={{ color: "var(--border)", fontSize: 10 }}>·</span>
          <span style={{ color: "var(--text-secondary)", fontSize: 10 }}>
            {Math.round(routingContext.confidence * 100)}% conf
          </span>
        </>
      )}
    </div>
  );
};

export default AgentRoutingTag;