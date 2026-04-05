// src/hooks/useThinkingSteps.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — THINKING STEPS HOOK v1.0
//
// Drives the pre-answer reasoning animation pipeline:
//   PLANNING → THINKING (animated steps) → ANSWERING (stream) → DONE
//
// Integration rules:
//   - Called from App.tsx BEFORE getAIResponse fires
//   - Step planning uses Claude Haiku via VITE_CLAUDE_KEY (existing env)
//   - Falls back to deterministic per-intent steps on any API failure
//   - Works with ALL Sedrex providers: Gemini, Claude, OpenAI
//   - Touches NOTHING in getAIResponse, routing, agents, verification,
//     artifact extraction, caching, or circuit breaker
// ══════════════════════════════════════════════════════════════════

import { useRef, useCallback } from 'react';
import { QueryIntent } from '../types';

// ── Public types (imported by ChatArea + types.ts extension) ───────

export type ThinkingStepStatus = 'pending' | 'active' | 'done';

export interface ThinkingStep {
  id:     string;
  label:  string;
  icon:   string;
  detail: string;
  status: ThinkingStepStatus;
}

export type ThinkingPhase = 'idle' | 'planning' | 'thinking' | 'answering' | 'done';

export interface ThinkingState {
  phase:           ThinkingPhase;
  steps:           ThinkingStep[];
  activeStepIndex: number;
}

// ── Config ─────────────────────────────────────────────────────────

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// claude-haiku-4-5: cheapest + fastest — step planning only, ~150ms
// Uses existing VITE_CLAUDE_KEY. No new keys required.
const PLANNING_MODEL = 'claude-haiku-4-5-20251001';

// Step display duration per intent (ms). Tuned to match real latency feel.
const STEP_DURATION: Record<string, number> = {
  coding:           850,
  reasoning:        950,
  math:             900,
  live:             550,
  research:         750,
  general:          650,
  image_generation: 650,
};

// Deterministic fallback steps per intent.
// Used when planning call fails or no Claude key is configured.
// These are always correct — never generic enough to be wrong.
const FALLBACK_STEPS: Record<string, Array<{ label: string; icon: string; detail: string }>> = {
  coding: [
    { label: 'Parsing requirements',   icon: '🔍', detail: 'Understanding the ask'     },
    { label: 'Designing structure',    icon: '🏗️', detail: 'Architecting solution'      },
    { label: 'Writing code',           icon: '⚙️', detail: 'Implementing logic'        },
    { label: 'Verifying correctness',  icon: '✅', detail: 'Checking output'            },
  ],
  reasoning: [
    { label: 'Decomposing problem',    icon: '🔍', detail: 'Breaking it down'           },
    { label: 'Gathering evidence',     icon: '📚', detail: 'Pulling relevant context'   },
    { label: 'Reasoning step by step', icon: '🧠', detail: 'Building the argument'      },
    { label: 'Verifying conclusion',   icon: '✅', detail: 'Cross-checking logic'       },
  ],
  math: [
    { label: 'Parsing the problem',    icon: '🔢', detail: 'Identifying variables'      },
    { label: 'Selecting method',       icon: '📐', detail: 'Choosing the approach'      },
    { label: 'Computing step by step', icon: '⚡', detail: 'Executing the math'         },
    { label: 'Verifying result',       icon: '✅', detail: 'Checking the answer'        },
  ],
  live: [
    { label: 'Searching the web',      icon: '🌐', detail: 'Fetching live data'         },
    { label: 'Evaluating sources',     icon: '🔍', detail: 'Ranking by reliability'     },
    { label: 'Synthesising findings',  icon: '📋', detail: 'Building the answer'        },
  ],
  research: [
    { label: 'Identifying topic',      icon: '🔍', detail: 'Understanding the subject'  },
    { label: 'Retrieving knowledge',   icon: '📚', detail: 'Accessing context'          },
    { label: 'Cross-checking facts',   icon: '🔗', detail: 'Verifying accuracy'         },
    { label: 'Structuring answer',     icon: '📋', detail: 'Organising the response'    },
  ],
  image_generation: [
    { label: 'Understanding intent',   icon: '🎨', detail: 'Reading the visual ask'     },
    { label: 'Expanding prompt',       icon: '✨', detail: 'Enriching description'       },
    { label: 'Generating image',       icon: '🖼️', detail: 'Running visual engine'      },
  ],
  general: [
    { label: 'Analysing query',        icon: '🔍', detail: 'Understanding intent'       },
    { label: 'Building answer',        icon: '🧠', detail: 'Composing response'         },
    { label: 'Reviewing output',       icon: '✅', detail: 'Checking quality'           },
  ],
};

// ── Planning call (AI-decided steps) ──────────────────────────────

/**
 * Calls Claude Haiku to decide contextual thinking steps for this query.
 * Silent failure — always returns a valid step array (AI or fallback).
 */
async function planSteps(
  query:   string,
  intent:  QueryIntent,
  apiKey:  string,
  signal?: AbortSignal,
): Promise<Array<{ label: string; icon: string; detail: string }>> {

  const domainLabel: Record<QueryIntent, string> = {
    coding:           'code / technical programming',
    reasoning:        'analysis / reasoning / comparison',
    math:             'mathematics / calculation',
    live:             'live search / real-time data',
    research:         'research / factual lookup',
    general:          'general knowledge / conversation',
    image_generation: 'image generation',
  };

  const systemPrompt =
`You are a thinking-step planner for an AI assistant called Sedrex.
Return ONLY a JSON array of 3-5 thinking steps the AI will perform for this query.

Each step: { "label": string, "icon": string (ONE emoji), "detail": string (3-6 words max) }

Rules:
- 3 to 5 steps ONLY — no more, no less
- Steps must be SPECIFIC to the query content, not generic
- Labels: active voice, under 5 words (e.g. "Parsing JWT claims")
- Detail: ultra-brief annotation (e.g. "Checking token expiry")
- Order must match actual reasoning sequence
- Return ONLY the JSON array. No markdown. No explanation.`;

  const userMessage =
`Domain: ${domainLabel[intent] ?? 'general'}
Query: "${query.slice(0, 280)}"

JSON array:`;

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type':                              'application/json',
        'x-api-key':                                 apiKey,
        'anthropic-version':                         '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      PLANNING_MODEL,
        max_tokens: 256,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userMessage }],
      }),
    });

    if (!res.ok) throw new Error(`Planning ${res.status}`);

    const data    = await res.json();
    const raw     = (data.content?.[0]?.text ?? '[]').replace(/```json|```/g, '').trim();
    const parsed: Array<{ label: string; icon: string; detail: string }> = JSON.parse(raw);

    if (Array.isArray(parsed) && parsed.length >= 2 && parsed.length <= 6) {
      return parsed.slice(0, 5);
    }
    throw new Error('Bad shape');
  } catch {
    return FALLBACK_STEPS[intent] ?? FALLBACK_STEPS.general;
  }
}

// ── Hook ───────────────────────────────────────────────────────────

/**
 * useThinkingSteps
 *
 * Returns startThinking() — an async generator that yields ThinkingState
 * snapshots driving the pre-answer animation in ChatArea.
 *
 * USAGE (in App.tsx handleSendMessage):
 *
 *   const { startThinking } = useThinkingSteps();
 *
 *   const gen = startThinking(prompt, routing.intent, claudeApiKey, abortSignal);
 *   for await (const snap of gen) {
 *     setMessages(msgs => msgs.map(m =>
 *       m.id === assistantMsgId ? { ...m, thinkingState: snap } : m
 *     ));
 *   }
 *   // Generator done → answer stream begins via getAIResponse
 */
export function useThinkingSteps() {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  async function* startThinking(
    query:   string,
    intent:  QueryIntent,
    apiKey:  string,
    signal?: AbortSignal,
  ): AsyncGenerator<ThinkingState> {

    clearTimers();

    // ── 1. Planning ────────────────────────────────────────────────
    yield { phase: 'planning', steps: [], activeStepIndex: -1 };

    const hasValidKey = Boolean(
      apiKey &&
      apiKey.length > 20 &&
      !apiKey.startsWith('sk-ant-...') &&
      apiKey !== 'YOUR_KEY_HERE'
    );

    const rawSteps = hasValidKey
      ? await planSteps(query, intent, apiKey, signal)
      : (FALLBACK_STEPS[intent] ?? FALLBACK_STEPS.general);

    if (signal?.aborted) return;

    const steps: ThinkingStep[] = rawSteps.map((s, i) => ({
      id:     `step-${i}`,
      label:  s.label,
      icon:   s.icon,
      detail: s.detail,
      status: 'pending' as const,
    }));

    const baseDuration = STEP_DURATION[intent] ?? 750;

    // ── 2. Thinking — animate each step ───────────────────────────
    yield {
      phase:           'thinking',
      steps:           steps.map(s => ({ ...s, status: 'pending' })),
      activeStepIndex: 0,
    };

    for (let i = 0; i < steps.length; i++) {
      if (signal?.aborted) return;

      // Activate step i
      yield {
        phase: 'thinking',
        steps: steps.map((s, idx) => ({
          ...s,
          status: idx < i ? 'done' : idx === i ? 'active' : 'pending',
        })),
        activeStepIndex: i,
      };

      // Wait (with jitter so it feels natural, not robotic)
      const duration = baseDuration + (i % 2 === 0 ? 75 : -75);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, duration);
        timersRef.current.push(t);
        if (signal) {
          signal.addEventListener(
            'abort',
            () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); },
            { once: true }
          );
        }
      }).catch(() => null);

      if (signal?.aborted) return;

      // Complete step i
      yield {
        phase: 'thinking',
        steps: steps.map((s, idx) => ({
          ...s,
          status: idx <= i ? 'done' : 'pending',
        })),
        activeStepIndex: i,
      };
    }

    // ── 3. Transition to answering ─────────────────────────────────
    if (!signal?.aborted) {
      yield {
        phase:           'answering',
        steps:           steps.map(s => ({ ...s, status: 'done' })),
        activeStepIndex: steps.length,
      };
    }
  }

  return { startThinking, clearTimers };
}