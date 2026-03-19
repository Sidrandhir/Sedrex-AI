// services/agents/agentOrchestrator.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Agent Orchestrator v2.0
// Gemini-Optimised Dispatch
//
// TODAY : All agents use Gemini with specialist prompts + capability
//         unlocks. Gemini 2.5 Pro is the primary intelligence engine.
// FUTURE: Claude/OpenAI activate automatically when keys are added.
//         Zero code changes needed.
// ══════════════════════════════════════════════════════════════════

import { Message, AttachedDocument, QueryIntent, RouterResult } from "../../types";
import { buildAgentSystemPrompt } from "../SedrexsystemPrompt";
import { callReasoningAgent } from "./reasoningAgent";
import { callCodingAgent    } from "./codingAgent";
import { callRAGAgent       } from "./ragAgent";

// ── Dispatch result ───────────────────────────────────────────────
export interface AgentDispatchResult {
  // Non-empty → real provider responded, use this text directly
  // Empty ""  → fall through to Gemini path in aiService.ts
  text:             string;
  inputTokens:      number;
  outputTokens:     number;
  agentType:        "reasoning" | "coding" | "rag" | "general";
  provider:         "claude" | "openai" | "gemini-search" | "gemini-fallback" | "perplexity";
  // Agent-specific system prompt for Gemini fallback injection.
  // null → use aiService's existing buildSystemInstruction() unchanged.
  overrideSystemPrompt: string | null;
  groundingChunks?: any[];
}

// ── Intent → agent mapping ────────────────────────────────────────
function intentToAgentType(
  intent: QueryIntent,
): "reasoning" | "coding" | "rag" | "general" {
  switch (intent) {
    case "reasoning": return "reasoning";
    case "math":      return "reasoning";
    case "coding":    return "coding";
    case "live":      return "rag";
    case "research":  return "rag";
    case "general":   return "general";
    default:          return "general";
  }
}

// ── Main dispatch ─────────────────────────────────────────────────
export async function dispatch(
  prompt:         string,
  history:        Message[],
  routing:        RouterResult,
  documents:      AttachedDocument[],
  sessionContext: string,
  maxTokens:      number,
  temperature:    number,
  onStreamChunk:  ((text: string) => void) | undefined,
  signal:         AbortSignal | undefined,
): Promise<AgentDispatchResult> {

  const agentType       = intentToAgentType(routing.intent);
  const hasLongContext  = documents.length > 0 || history.length > 6;
  const hasImage        = false; // images handled upstream in aiService

  console.log(
    `[SEDREX Orchestrator] intent=${routing.intent} → agent=${agentType} → model=${routing.model}`,
  );

  // ── Reasoning Agent ───────────────────────────────────────────────
  if (agentType === "reasoning") {
    const systemPrompt = buildAgentSystemPrompt("reasoning", {
      sessionContext: sessionContext || undefined,
      hasLongContext,
    });

    const result = await callReasoningAgent(
      prompt, history, documents, sessionContext,
      maxTokens, temperature, onStreamChunk, signal,
    );

    if (result.provider === "claude" && result.text) {
      return {
        text: result.text, inputTokens: result.inputTokens,
        outputTokens: result.outputTokens, agentType: "reasoning",
        provider: "claude", overrideSystemPrompt: null,
      };
    }

    return {
      text: "", inputTokens: 0, outputTokens: 0,
      agentType: "reasoning", provider: "gemini-fallback",
      overrideSystemPrompt: systemPrompt,
    };
  }

  // ── Coding Agent ──────────────────────────────────────────────────
  if (agentType === "coding") {
    const systemPrompt = buildAgentSystemPrompt("coding", {
      sessionContext: sessionContext || undefined,
      hasLongContext,
    });

    const result = await callCodingAgent(
      prompt, history, documents, sessionContext,
      Math.max(maxTokens, 16000), 0.1, onStreamChunk, signal,
    );

    if (result.provider === "claude" && result.text) {
      return {
        text: result.text, inputTokens: result.inputTokens,
        outputTokens: result.outputTokens, agentType: "coding",
        provider: "claude", overrideSystemPrompt: null,
      };
    }

    return {
      text: "", inputTokens: 0, outputTokens: 0,
      agentType: "coding", provider: "gemini-fallback",
      overrideSystemPrompt: systemPrompt,
    };
  }

  // ── RAG / Search Agent ────────────────────────────────────────────
  if (agentType === "rag") {
    const systemPrompt = buildAgentSystemPrompt("live", {
      sessionContext: sessionContext || undefined,
    });

    const result = await callRAGAgent(
      prompt, history, documents, sessionContext,
      maxTokens, onStreamChunk, signal,
    );

    return {
      text: "", inputTokens: 0, outputTokens: 0,
      agentType: "rag", provider: result.provider,
      overrideSystemPrompt: systemPrompt,
      groundingChunks: result.groundingChunks,
    };
  }

  // ── General Agent ─────────────────────────────────────────────────
  const systemPrompt = buildAgentSystemPrompt("general", {
    sessionContext: sessionContext || undefined,
    hasLongContext,
  });

  return {
    text: "", inputTokens: 0, outputTokens: 0,
    agentType: "general", provider: "gemini-fallback",
    overrideSystemPrompt: systemPrompt,
  };
}

// ── UI label helper ───────────────────────────────────────────────
export function getAgentLabel(agentType: string, provider: string): string {
  const providerLabel: Record<string, string> = {
    "claude":          "Claude Sonnet",
    "openai":          "GPT-4",
    "gemini-search":   "Gemini + Search",
    "gemini-fallback": "Gemini",
    "perplexity":      "Perplexity",
  };
  const agentLabel: Record<string, string> = {
    "reasoning": "Reasoning Agent",
    "coding":    "Coding Agent",
    "rag":       "Search Agent",
    "general":   "General Agent",
  };
  return `${agentLabel[agentType] ?? agentType} · ${providerLabel[provider] ?? provider}`;
}