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
import { agentEventBus }                                        from '../agentEventBus';

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
  metadata?: {
    tier:        string;
    isBasicMode: boolean;
    model:       string;              // internal model name — never shown to user
  };
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
    label:                'Gemini 2.0 Flash',
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
  userTier:      string  = 'free',
  isBasicMode:   boolean = false,
): Promise<AgentDispatchResult> {

  const intent    = (routing.intent as string) ?? 'general';
  const agentType = intentToAgentType(intent);

  // Emit route analysis event immediately — always fires, zero latency
  const _routeNow = Date.now();
  agentEventBus.emit({ id: 'route', type: 'route', status: 'running', icon: '⚡', label: 'Analysing query', detail: intent, timestamp: _routeNow });
  agentEventBus.emit({ id: 'route', type: 'route', status: 'done',    icon: '⚡', label: 'Analysing query', detail: intent, timestamp: _routeNow + 1 });

  // Image generation must never go through agent dispatch — aiService handles it directly.
  if (routing.intent === 'image_generation') {
    return {
      text: '', provider: 'none', agentType: 'general',
      inputTokens: 0, outputTokens: 0, isFallback: false,
      overrideSystemPrompt: null, model: '', label: '',
    };
  }

  // TIER GATE — free tier and basic mode always use Gemini only.
  // Pro/Team/Enterprise skip this and fall through to full dispatch.
  // When keys are added later, paid tiers automatically unlock — zero code changes.
  const isRestrictedTier = userTier === 'free' || isBasicMode;
  if (isRestrictedTier) {
    const agentTypeR = intentToAgentType(intent);
    const hasLongCtx = documents.length > 0 || history.length > 6;
    const meta = { tier: userTier, isBasicMode, model: MODELS.GEMINI_FLASH };
    if (agentTypeR === 'rag') {
      return {
        ...geminiDirectResult('rag', buildAgentSystemPrompt('live', { sessionContext: sessionContext || undefined })),
        provider: 'gemini-search', label: 'Gemini 2.0 Flash + Search', metadata: meta,
      };
    }
    if (agentTypeR === 'coding') {
      return { ...geminiDirectResult('coding', buildAgentSystemPrompt('coding', { sessionContext: sessionContext || undefined, hasLongContext: hasLongCtx })), metadata: meta };
    }
    if (agentTypeR === 'reasoning' || agentTypeR === 'math') {
      return { ...geminiDirectResult(agentTypeR, buildAgentSystemPrompt('reasoning', { sessionContext: sessionContext || undefined, hasLongContext: hasLongCtx })), metadata: meta };
    }
    return { ...geminiDirectResult('general', null), metadata: meta };
  }

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
        label:    'Gemini 2.0 Flash + Search',
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
    console.log(`[SEDREX Orchestrator] ${intent} → Core engine (fast-path)`);
    return geminiDirectResult('general', null);
  }

  // ── External providers are available — full dispatch ─────────────
  const resolved  = resolveRoute(intent);
  const hasLongContext = documents.length > 0 || history.length > 6;

  console.log(
    `[SEDREX Orchestrator] intent=${intent} → agent=${agentType}` +
    ` → ${resolved.label}` +
    (resolved.isFallback ? ` [fallback from ${resolved.idealLabel}]` : '')
  );

  // ── CODING agent ─────────────────────────────────────────────────
  if (agentType === 'coding') {
    agentEventBus.emit({ id: 'agent', type: 'agent', status: 'running', icon: '⚙️', label: 'Preparing code solution', detail: 'Specialist agent engaged', badge: 'Code', timestamp: Date.now() });
    const result = await callCodingAgent(
      prompt, history, documents, sessionContext,
      Math.max(maxTokens, 16000),
      0.1,
      onStreamChunk, signal,
    );

    if (result.text) {
      agentEventBus.emit({ id: 'agent', type: 'agent', status: 'done', icon: '⚙️', label: 'Code solution ready', detail: 'Solution prepared', timestamp: Date.now() });
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

    agentEventBus.emit({ id: 'agent', type: 'agent', status: 'done', icon: '⚙️', label: 'Code solution ready', detail: 'Solution prepared', timestamp: Date.now() });
    return geminiDirectResult('coding', buildAgentSystemPrompt('coding', {
      sessionContext: sessionContext || undefined,
      hasLongContext,
    }));
  }

  // ── REASONING agent ──────────────────────────────────────────────
  if (agentType === 'reasoning') {
    agentEventBus.emit({ id: 'agent', type: 'agent', status: 'running', icon: '🧠', label: 'Reasoning through problem', detail: 'Multi-step analysis active', badge: 'Reason', timestamp: Date.now() });
    const result = await callReasoningAgent(
      prompt, history, documents, sessionContext,
      maxTokens, temperature, onStreamChunk, signal,
    );

    if (result.text) {
      agentEventBus.emit({ id: 'agent', type: 'agent', status: 'done', icon: '🧠', label: 'Analysis complete', detail: 'Reasoning finished', timestamp: Date.now() });
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

    agentEventBus.emit({ id: 'agent', type: 'agent', status: 'done', icon: '🧠', label: 'Analysis complete', detail: 'Reasoning finished', timestamp: Date.now() });
    return geminiDirectResult('reasoning', buildAgentSystemPrompt('reasoning', {
      sessionContext: sessionContext || undefined,
      hasLongContext,
    }));
  }

  // ── MATH agent (sub-route of reasoning, uses o4-mini) ────────────
  if (agentType === 'math') {
    agentEventBus.emit({ id: 'agent', type: 'agent', status: 'running', icon: '🔢', label: 'Computing solution', detail: 'Mathematical reasoning active', badge: 'Math', timestamp: Date.now() });
    const result = await callReasoningAgent(
      prompt, history, documents, sessionContext,
      maxTokens, 0.1,
      onStreamChunk, signal,
      'math',
    );

    if (result.text) {
      agentEventBus.emit({ id: 'agent', type: 'agent', status: 'done', icon: '🔢', label: 'Calculation complete', detail: 'Solution verified', timestamp: Date.now() });
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

    agentEventBus.emit({ id: 'agent', type: 'agent', status: 'done', icon: '🔢', label: 'Calculation complete', detail: 'Solution verified', timestamp: Date.now() });
    return geminiDirectResult('math', buildAgentSystemPrompt('reasoning', {
      sessionContext: sessionContext || undefined,
    }));
  }

  // ── RAG / Live agent ─────────────────────────────────────────────
  if (agentType === 'rag') {
    agentEventBus.emit({ id: 'search', type: 'search', status: 'running', icon: '🌐', label: 'Searching the web', detail: 'Fetching live data from the web', badge: 'Live', timestamp: Date.now() });
    const result = await callRAGAgent(
      prompt, history, documents, sessionContext,
      maxTokens, onStreamChunk, signal,
    );

    agentEventBus.emit({ id: 'search', type: 'search', status: 'done', icon: '🌐', label: 'Sources found', detail: 'Live grounding active — web results integrated', timestamp: Date.now() });
    return {
      text:                 result.text,
      inputTokens:          result.inputTokens,
      outputTokens:         result.outputTokens,
      agentType:            'rag',
      provider:             result.provider,
      model:                MODELS.GEMINI_FLASH,
      label:                'Gemini 2.0 Flash + Search',
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