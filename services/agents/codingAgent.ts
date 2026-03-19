// services/agents/codingAgent.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Coding Agent v2.0
//
// TODAY : Gemini 2.5 Pro with code execution unlock + coding domain
//         protocol. Gemini has exceptional code knowledge.
// FUTURE: Claude Sonnet activates when VITE_CLAUDE_KEY is set.
// ══════════════════════════════════════════════════════════════════

import { Message, AttachedDocument } from "../../types";
import { buildAgentSystemPrompt, sanitizeConversationHistory } from "../SedrexsystemPrompt";

const _vite = (typeof import.meta !== "undefined" && import.meta.env)
  ? import.meta.env : {} as Record<string, string>;
const _proc = (typeof process !== "undefined" && process.env)
  ? process.env : {} as Record<string, string>;

const PROVIDER_CLAUDE = {
  key:       _vite.VITE_CLAUDE_KEY  || _proc.ANTHROPIC_API_KEY || "",
  model:     "claude-sonnet-4-5",
  available: !!(_vite.VITE_CLAUDE_KEY || _proc.ANTHROPIC_API_KEY),
};

export function buildCodingSystemPrompt(
  sessionContext?: string,
  hasLongContext = false,
): string {
  return buildAgentSystemPrompt("coding", {
    sessionContext,
    hasLongContext,
  });
}

function flattenHistory(
  history: Message[],
  maxTurns = 8,
): Array<{ role: "user" | "assistant"; content: string }> {
  return sanitizeConversationHistory(history)
    .slice(-maxTurns)
    .map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    }));
}

function buildPromptWithDocs(prompt: string, documents: AttachedDocument[]): string {
  if (documents.length === 0) return prompt;
  const ctx = documents
    .map((d) => `[FILE: ${d.title}]\n\`\`\`\n${d.content}\n\`\`\``)
    .join("\n\n");
  return `${ctx}\n\nTask: ${prompt}`;
}

export interface CodingAgentResult {
  text:         string;
  inputTokens:  number;
  outputTokens: number;
  provider:     "claude" | "gemini-fallback";
  agentType:    "coding";
}

export async function callCodingAgent(
  prompt:         string,
  history:        Message[],
  documents:      AttachedDocument[],
  sessionContext: string,
  maxTokens:      number,
  temperature:    number,
  onStreamChunk:  ((text: string) => void) | undefined,
  signal:         AbortSignal | undefined,
): Promise<CodingAgentResult> {

  // ── Real Claude path ──────────────────────────────────────────────
  if (PROVIDER_CLAUDE.available) {
    console.log("[SEDREX Agent] Coding → Claude Sonnet");

    const systemPrompt = buildCodingSystemPrompt(
      sessionContext || undefined,
      documents.length > 0 || history.length > 6,
    );
    const enriched = buildPromptWithDocs(prompt, documents);
    const messages = [
      ...flattenHistory(history),
      { role: "user" as const, content: enriched },
    ];

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": PROVIDER_CLAUDE.key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: PROVIDER_CLAUDE.model, max_tokens: maxTokens,
        system: systemPrompt, messages, stream: !!onStreamChunk,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic API error ${res.status}`);
    }

    if (onStreamChunk && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = ""; let inputTokens = 0; let outputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n").filter(l => l.startsWith("data: "))) {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === "content_block_delta") {
              const chunk = json.delta?.text || "";
              if (chunk) { fullText += chunk; onStreamChunk(chunk); }
            }
            if (json.type === "message_start" && json.message?.usage) inputTokens = json.message.usage.input_tokens;
            if (json.type === "message_delta" && json.usage) outputTokens = json.usage.output_tokens;
          } catch { /* skip malformed SSE */ }
        }
      }
      return { text: fullText, inputTokens, outputTokens, provider: "claude", agentType: "coding" };
    }

    const data = await res.json();
    return {
      text: data.content[0]?.text || "",
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      provider: "claude", agentType: "coding",
    };
  }

  // ── Gemini fallback ───────────────────────────────────────────────
  console.log("[SEDREX Agent] Coding → Gemini 2.5 Pro (VITE_CLAUDE_KEY not set)");
  return { text: "", inputTokens: 0, outputTokens: 0, provider: "gemini-fallback", agentType: "coding" };
}