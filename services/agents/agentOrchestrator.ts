// src/services/agents/agentOrchestrator.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Agent Orchestrator v3.1
// Key-driven routing. Zero code changes when adding providers.
//
// SESSION 7 FIX: Fast-path bypass
// Before v3.1, every request attempted Claude fetch → DeepSeek fetch
// → OpenAI fetch → Gemini fallback. With no keys set, each fetch()
// fails after its default timeout (~8s each). Total: 2-8s dead time
// before Gemini even starts.
//
// Fix: check PROVIDERS.*.available (key presence) BEFORE dispatching
// to any agent. If no external keys are set, jump straight to Gemini.
// This is a pure performance fix — zero behavior change when keys exist.
//
// Beta:       All intents → Gemini instantly (no failed fetches)
// Production: Add keys → providers activate at zero latency cost
// Console:    Always shows REAL model name, never "gemini-fallback"
// ══════════════════════════════════════════════════════════════════

import { Message, AttachedDocument, QueryIntent, SedrexRoute } from '../../types';
import { buildAgentSystemPrompt }                               from '../SedrexsystemPrompt';
import { resolveRoute, PROVIDERS, MODELS }                      from '../providerRegistry';
import { callCodingAgent    }                                   from './codingAgent';
import { callReasoningAgent }                                   from './reasoningAgent';
import { callRAGAgent       }                                   from './ragAgent';

// ── Dispatch result ───────────────────────────────────────────────

export interface AgentDispatchResult {
  text:                 string;        // non-empty = use this directly; empty = Gemini fallback
  inputTokens:          number;
  outputTokens:         number;
  agentType:            'reasoning' | 'coding' | 'rag' | 'general' | 'math';
  provider:             string;        // real provider name
  model:                string;        // real model name
  label:                string;        // display label
  isFallback:           boolean;
  overrideSystemPrompt: string | null;
  groundingChunks?:     any[];
}

// ── Gemini-direct fast-path result ───────────────────────────────
// Returned immediately when no external keys are configured.
// Eliminates all failed fetch() calls — Gemini handles in aiService.
function geminiDirectResult(
  agentType: 'reasoning' | 'coding' | 'rag' | 'general' | 'math',
  overrideSystemPrompt: string | null = null,
): AgentDispatchResult {
  return {
    text:                 '',
    inputTokens:          0,
    outputTokens:         0,
    agentType,
    provider:             'gemini-fallback',
    model:                MODELS.GEMINI_FLASH,
    label:                'Gemini 3 Flash',
    isFallback:           false,   // not a fallback — this IS the intended provider in beta
    overrideSystemPrompt,
  };
}

// ── SESSION 7: Key presence check ─────────────────────────────────
// Returns true only when AT LEAST ONE external provider has a key set.
// Used to skip the entire agent dispatch loop when running Gemini-only.
function hasAnyExternalProvider(): boolean {
  return (
    (PROVIDERS.claude.available    && !!PROVIDERS.claude.key)    ||
    (PROVIDERS.openai.available    && !!PROVIDERS.openai.key)    ||
    (PROVIDERS.deepseek.available  && !!PROVIDERS.deepseek.key)  ||
    (PROVIDERS.grok.available      && !!PROVIDERS.grok.key)      ||
    (PROVIDERS.mistral.available   && !!PROVIDERS.mistral.key)   ||
    (PROVIDERS.fireworks.available && !!PROVIDERS.fireworks.key)
  );
}

// ── Intent → agent type ───────────────────────────────────────────

function intentToAgentType(
  intent: QueryIntent | string,
): 'reasoning' | 'coding' | 'rag' | 'general' | 'math' {
  switch (intent) {
    case 'coding':    return 'coding';
    case 'technical': return 'coding';
    case 'reasoning': return 'reasoning';
    case 'analytical':return 'reasoning';
    case 'math':      return 'math';
    case 'live':      return 'rag';
    case 'research':  return 'rag';
    case 'general':   return 'general';
    default:          return 'general';
  }
}

// ── Main dispatch ─────────────────────────────────────────────────

export async function dispatch(
  prompt:        string,
  history:       Message[],
  routing:       SedrexRoute,
  documents:     AttachedDocument[],
  sessionContext:string,
  maxTokens:     number,
  temperature:   number,
  onStreamChunk: ((text: string) => void) | undefined,
  signal:        AbortSignal | undefined,
): Promise<AgentDispatchResult> {

  const intent    = (routing.intent as string) ?? 'general';
  const agentType = intentToAgentType(intent);

  // SESSION 7: Fast-path — if no external provider keys exist, skip ALL
  // agent dispatch and let aiService handle with Gemini directly.
  // This eliminates the 2-8s latency from sequential failed fetch() calls.
  if (!hasAnyExternalProvider()) {
    // RAG still needs grounded search system prompt even on Gemini-direct
    if (agentType === 'rag') {
      return {
        ...geminiDirectResult('rag', buildAgentSystemPrompt('live', {
          sessionContext: sessionContext || undefined,
        })),
        provider: 'gemini-search',
        label:    'Gemini 3 Flash + Search',
      };
    }

    // For coding intent — inject rich coding system prompt so Gemini
    // behaves like the coding agent even without Claude
    if (agentType === 'coding') {
      const hasLongContext = documents.length > 0 || history.length > 6;
      return geminiDirectResult('coding', buildAgentSystemPrompt('coding', {
        sessionContext: sessionContext || undefined,
        hasLongContext,
      }));
    }

    // For reasoning intent — inject reasoning system prompt
    if (agentType === 'reasoning' || agentType === 'math') {
      const hasLongContext = documents.length > 0 || history.length > 6;
      return geminiDirectResult(agentType, buildAgentSystemPrompt('reasoning', {
        sessionContext: sessionContext || undefined,
        hasLongContext,
      }));
    }

    // General — let aiService use its own system prompt
    console.log(`[SEDREX Orchestrator] No external keys — ${intent} → Gemini direct (fast-path)`);
    return geminiDirectResult('general', null);
  }

  // ── External providers are available — full dispatch ─────────────
  const resolved  = resolveRoute(intent);
  const hasLongContext = documents.length > 0 || history.length > 6;

  console.log(
    `[SEDREX Orchestrator] intent=${intent} → agent=${agentType}` +
    ` → ${resolved.label} (${resolved.model})` +
    (resolved.isFallback ? ` [fallback from ${resolved.idealLabel}]` : '')
  );

  // ── CODING agent ─────────────────────────────────────────────────
  if (agentType === 'coding') {
    const result = await callCodingAgent(
      prompt, history, documents, sessionContext,
      Math.max(maxTokens, 16000),
      0.1,
      onStreamChunk, signal,
    );

    if (result.text) {
      return {
        text:                 result.text,
        inputTokens:          result.inputTokens,
        outputTokens:         result.outputTokens,
        agentType:            'coding',
        provider:             result.provider,
        model:                result.model,
        label:                result.label,
        isFallback:           result.isFallback,
        overrideSystemPrompt: null,
      };
    }

    return geminiDirectResult('coding', buildAgentSystemPrompt('coding', {
      sessionContext: sessionContext || undefined,
      hasLongContext,
    }));
  }

  // ── REASONING agent ──────────────────────────────────────────────
  if (agentType === 'reasoning') {
    const result = await callReasoningAgent(
      prompt, history, documents, sessionContext,
      maxTokens, temperature, onStreamChunk, signal,
    );

    if (result.text) {
      return {
        text:                 result.text,
        inputTokens:          result.inputTokens,
        outputTokens:         result.outputTokens,
        agentType:            'reasoning',
        provider:             result.provider,
        model:                result.model,
        label:                result.label,
        isFallback:           result.isFallback,
        overrideSystemPrompt: null,
      };
    }

    return geminiDirectResult('reasoning', buildAgentSystemPrompt('reasoning', {
      sessionContext: sessionContext || undefined,
      hasLongContext,
    }));
  }

  // ── MATH agent (sub-route of reasoning, uses o4-mini) ────────────
  if (agentType === 'math') {
    const result = await callReasoningAgent(
      prompt, history, documents, sessionContext,
      maxTokens, 0.1,
      onStreamChunk, signal,
      'math',
    );

    if (result.text) {
      return {
        text:                 result.text,
        inputTokens:          result.inputTokens,
        outputTokens:         result.outputTokens,
        agentType:            'math',
        provider:             result.provider,
        model:                result.model,
        label:                result.label,
        isFallback:           result.isFallback,
        overrideSystemPrompt: null,
      };
    }

    return geminiDirectResult('math', buildAgentSystemPrompt('reasoning', {
      sessionContext: sessionContext || undefined,
    }));
  }

  // ── RAG / Live agent ─────────────────────────────────────────────
  if (agentType === 'rag') {
    const result = await callRAGAgent(
      prompt, history, documents, sessionContext,
      maxTokens, onStreamChunk, signal,
    );

    return {
      text:                 result.text,
      inputTokens:          result.inputTokens,
      outputTokens:         result.outputTokens,
      agentType:            'rag',
      provider:             result.provider,
      model:                MODELS.GEMINI_FLASH,
      label:                'Gemini 3 Flash + Search',
      isFallback:           false,
      overrideSystemPrompt: buildAgentSystemPrompt('live', {
        sessionContext: sessionContext || undefined,
      }),
      groundingChunks:      result.groundingChunks,
    };
  }

  // ── GENERAL — Gemini direct ───────────────────────────────────────
  return geminiDirectResult('general', null);
}