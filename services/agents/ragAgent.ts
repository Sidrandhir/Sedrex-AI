// services/agents/ragAgent.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — RAG / Search Agent v2.0
//
// Gemini's native Google Search grounding is the best real-time
// search available in any AI system today. This agent uses it fully.
//
// TODAY : Gemini + googleSearch + live research unlock
// FUTURE: Add VITE_PERPLEXITY_KEY for deeper web search (optional)
// ══════════════════════════════════════════════════════════════════

import { Message, AttachedDocument, GroundingChunk } from "../../types";
import { buildAgentSystemPrompt } from "../SedrexsystemPrompt";

export function buildRAGSystemPrompt(sessionContext?: string): string {
  return buildAgentSystemPrompt("live", { sessionContext });
}

export interface RAGAgentResult {
  text:            string;
  inputTokens:     number;
  outputTokens:    number;
  groundingChunks: GroundingChunk[];
  provider:        "gemini-search" | "perplexity" | "gemini-fallback";
  agentType:       "rag";
}

export async function callRAGAgent(
  _prompt:         string,
  _history:        Message[],
  _documents:      AttachedDocument[],
  _sessionContext: string,
  _maxTokens:      number,
  _onStreamChunk:  ((text: string) => void) | undefined,
  _signal:         AbortSignal | undefined,
): Promise<RAGAgentResult> {
  // Gemini + Google Search grounding is active today — no extra key needed.
  // Returns empty text → orchestrator injects RAG system prompt into
  // Gemini call in aiService.ts, which has tools: [{ googleSearch: {} }]
  console.log("[SEDREX Agent] RAG → Gemini 2.5 + Google Search grounding");
  return {
    text: "", inputTokens: 0, outputTokens: 0,
    groundingChunks: [], provider: "gemini-search", agentType: "rag",
  };
}