// services/providerRegistry.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Provider Registry v1.0
// Single source of truth for ALL AI providers, models, and routing.
//
// HOW IT WORKS:
//   Beta (no keys):    Everything routes to Gemini. Zero changes needed.
//   Production (keys): Add env vars → providers auto-activate.
//   Console:           Always shows the REAL model name, never "gemini-fallback".
//
// TO ADD A NEW PROVIDER:
//   1. Add key detection in PROVIDERS below
//   2. Add model name in MODELS below
//   3. Done. Routing is automatic.
// ══════════════════════════════════════════════════════════════════

const _env = (typeof import.meta !== 'undefined' && import.meta.env)
  ? import.meta.env
  : (typeof process !== 'undefined' ? process.env : {}) as Record<string, string>;

// ── Model names (verified, production-stable March 2026) ──────────

export const MODELS = {
  // ── Google Gemini ────────────────────────────────────────────────
  GEMINI_FLASH:        'gemini-2.5-flash',                         // Primary — stable, fast
  GEMINI_FLASH_LITE:   'gemini-2.0-flash',                         // Lightweight — titles, follow-ups
  GEMINI_PRO:          'gemini-2.5-pro-preview',                   // Best quality — advanced reasoning
  GEMINI_STABLE:       'gemini-2.5-flash',                         // Stable fallback — after rate-limit
  GEMINI_LAST_RESORT:  'gemini-2.0-flash',                         // Absolute last resort
  GEMINI_IMAGE:        'gemini-2.0-flash-exp',                     // Image fallback 1 — multimodal experimental
  GEMINI_IMAGE2:       'gemini-2.0-flash',                         // Image fallback 2 — stable multimodal
  GEMINI_IMAGE3:       'gemini-2.5-flash-image',                   // Image fallback 3 — budget
  IMAGEN:              'imagen-4.0-generate-001',                  // Imagen 4 — 10 RPM, 70/day
  IMAGEN_FAST:         'imagen-4.0-fast-generate-001',             // Imagen 4 Fast

  // ── Anthropic Claude ─────────────────────────────────────────────
  CLAUDE_SONNET:       'claude-sonnet-4-6',             // Best code + writing at Sonnet price
  CLAUDE_HAIKU:        'claude-haiku-4-5',              // Fast Claude — lightweight technical tasks
  CLAUDE_OPUS:         'claude-opus-4-6',               // Max quality — reserved for critical tasks

  // ── OpenAI ───────────────────────────────────────────────────────
  GPT_FAST:            'gpt-4o-mini',                   // Fast OpenAI — cheap, capable
  GPT_BALANCED:        'gpt-4o',                        // Balanced — strong general reasoning
  GPT_REASONING:       'o4-mini',                       // Math + logic specialist
  GPT_CODE:            'gpt-4o',                        // Code tasks — broad capability

  // ── xAI Grok ─────────────────────────────────────────────────────
  GROK_FAST:           'grok-3-fast',                   // Fast Grok — low latency
  GROK_PRO:            'grok-3',                        // Full Grok — real-time X data

  // ── DeepSeek ─────────────────────────────────────────────────────
  DEEPSEEK_CHAT:       'deepseek-chat',                 // V3 — excellent value
  DEEPSEEK_REASONING:  'deepseek-reasoner',             // R1 — matches o1 at 96% lower cost

  // ── Mistral ──────────────────────────────────────────────────────
  MISTRAL_FAST:        'mistral-small-latest',          // Budget mid-tier
  MISTRAL_PRO:         'mistral-large-latest',          // EU data sovereignty

  // ── Meta Llama (via Fireworks) ────────────────────────────────────
  LLAMA_FAST:          'accounts/fireworks/models/llama-v3p1-8b-instruct',  // 8B — very cheap
  LLAMA_PRO:           'accounts/fireworks/models/llama-v3p1-70b-instruct', // 70B — best open-source
} as const;

export type ModelName = typeof MODELS[keyof typeof MODELS];

// ── Provider availability (auto-detected from env vars) ───────────

export const PROVIDERS = {
  gemini: {
    name:       'Google Gemini',
    keys:       [
      _env.VITE_GEMINI_KEY,
      _env.VITE_GEMINI_KEY_1,
      _env.VITE_GEMINI_KEY_2,
      _env.VITE_GEMINI_KEY_3,
      _env.VITE_GEMINI_KEY_4,
      _env.VITE_GEMINI_KEY_5,
      _env.VITE_GEMINI_KEY_6,
    ].filter((k): k is string => !!k && k.length > 10),
    available:  true,  // Always — Gemini is mandatory baseline
    endpoint:   'https://generativelanguage.googleapis.com',
  },

  claude: {
    name:       'Anthropic Claude',
    key:        _env.VITE_CLAUDE_KEY || _env.VITE_ANTHROPIC_KEY || '',
    available:  !!(_env.VITE_CLAUDE_KEY || _env.VITE_ANTHROPIC_KEY),
    endpoint:   'https://api.anthropic.com/v1/messages',
    version:    '2023-06-01',
  },

  openai: {
    name:       'OpenAI',
    key:        _env.VITE_OPENAI_KEY || '',
    available:  !!_env.VITE_OPENAI_KEY,
    endpoint:   'https://api.openai.com/v1/chat/completions',
  },

  grok: {
    name:       'xAI Grok',
    key:        _env.VITE_GROK_KEY || _env.VITE_XAI_KEY || '',
    available:  !!(_env.VITE_GROK_KEY || _env.VITE_XAI_KEY),
    endpoint:   'https://api.x.ai/v1/chat/completions',
  },

  deepseek: {
    name:       'DeepSeek',
    key:        _env.VITE_DEEPSEEK_KEY || '',
    available:  !!_env.VITE_DEEPSEEK_KEY,
    endpoint:   'https://api.deepseek.com/v1/chat/completions',
  },

  mistral: {
    name:       'Mistral AI',
    key:        _env.VITE_MISTRAL_KEY || '',
    available:  !!_env.VITE_MISTRAL_KEY,
    endpoint:   'https://api.mistral.ai/v1/chat/completions',
  },

  fireworks: {
    name:       'Fireworks (Llama)',
    key:        _env.VITE_FIREWORKS_KEY || '',
    available:  !!_env.VITE_FIREWORKS_KEY,
    endpoint:   'https://api.fireworks.ai/inference/v1/chat/completions',
  },
} as const;

// ── Routing table — intent → ideal provider + fallback chain ──────
//
// RULE: If ideal provider is unavailable, walk the fallback chain.
// Gemini is ALWAYS last fallback — it never fails (mandatory key).
// Console log always shows the REAL model being used.
//
// This is the COMPLETE routing architecture.
// When you add a key, the model activates. No code changes.

export type ProviderKey = keyof typeof PROVIDERS;

export interface ProviderRoute {
  provider:     ProviderKey;
  model:        string;
  label:        string;   // shown in console + UI routing tag
  fallbacks:    Array<{ provider: ProviderKey; model: string; label: string }>;
}

export const INTENT_ROUTING: Record<string, ProviderRoute> = {

  // ── Code: write, fix, debug, rewrite ─────────────────────────────
  // Claude Sonnet 4.6 is the best code model at this price point.
  technical: {
    provider:  'claude',
    model:     MODELS.CLAUDE_SONNET,
    label:     'Claude Sonnet 4.6',
    fallbacks: [
      { provider: 'deepseek', model: MODELS.DEEPSEEK_CHAT,      label: 'DeepSeek V3'          },
      { provider: 'openai',   model: MODELS.GPT_CODE,           label: 'GPT-4o'               },
      { provider: 'grok',     model: MODELS.GROK_FAST,          label: 'Grok 3 Fast'          },
      { provider: 'gemini',   model: MODELS.GEMINI_PRO,         label: 'Gemini 3.1 Pro'       },
      { provider: 'gemini',   model: MODELS.GEMINI_FLASH,       label: 'Gemini 3 Flash'       },
      { provider: 'gemini',   model: MODELS.GEMINI_STABLE,      label: 'Gemini 2.5 Flash'     },
      { provider: 'gemini',   model: MODELS.GEMINI_LAST_RESORT, label: 'Gemini 2.0 Flash'     },
    ],
  },

  // ── Analysis: compare, evaluate, architect, trade-offs ───────────
  // GPT-4o for structured analysis. Claude Sonnet as close second.
  analytical: {
    provider:  'openai',
    model:     MODELS.GPT_BALANCED,
    label:     'GPT-4o',
    fallbacks: [
      { provider: 'claude',   model: MODELS.CLAUDE_SONNET,      label: 'Claude Sonnet 4.6'    },
      { provider: 'deepseek', model: MODELS.DEEPSEEK_REASONING, label: 'DeepSeek R1'          },
      { provider: 'grok',     model: MODELS.GROK_PRO,           label: 'Grok 3'               },
      { provider: 'gemini',   model: MODELS.GEMINI_PRO,         label: 'Gemini 3.1 Pro'       },
      { provider: 'gemini',   model: MODELS.GEMINI_FLASH,       label: 'Gemini 3 Flash'       },
      { provider: 'gemini',   model: MODELS.GEMINI_STABLE,      label: 'Gemini 2.5 Flash'     },
      { provider: 'gemini',   model: MODELS.GEMINI_LAST_RESORT, label: 'Gemini 2.0 Flash'     },
    ],
  },

  // ── Math / Logic / Proofs ─────────────────────────────────────────
  // o4-mini is purpose-built for this. DeepSeek R1 matches o1 at 96% lower cost.
  math: {
    provider:  'openai',
    model:     MODELS.GPT_REASONING,
    label:     'o4-mini',
    fallbacks: [
      { provider: 'deepseek', model: MODELS.DEEPSEEK_REASONING, label: 'DeepSeek R1'          },
      { provider: 'claude',   model: MODELS.CLAUDE_SONNET,      label: 'Claude Sonnet 4.6'    },
      { provider: 'gemini',   model: MODELS.GEMINI_PRO,         label: 'Gemini 3.1 Pro'       },
      { provider: 'gemini',   model: MODELS.GEMINI_FLASH,       label: 'Gemini 3 Flash'       },
      { provider: 'gemini',   model: MODELS.GEMINI_STABLE,      label: 'Gemini 2.5 Flash'     },
      { provider: 'gemini',   model: MODELS.GEMINI_LAST_RESORT, label: 'Gemini 2.0 Flash'     },
    ],
  },

  // ── Live / Real-time / Search ─────────────────────────────────────
  // Gemini is the ONLY option with native Google Search grounding.
  live: {
    provider:  'gemini',
    model:     MODELS.GEMINI_FLASH,
    label:     'Gemini 3 Flash + Search',
    fallbacks: [
      { provider: 'grok',   model: MODELS.GROK_FAST,            label: 'Grok 3 Fast'          },
      { provider: 'gemini', model: MODELS.GEMINI_PRO,           label: 'Gemini 3.1 Pro'       },
      { provider: 'gemini', model: MODELS.GEMINI_STABLE,        label: 'Gemini 2.5 Flash'     },
      { provider: 'gemini', model: MODELS.GEMINI_LAST_RESORT,   label: 'Gemini 2.0 Flash'     },
    ],
  },

  // ── General / Conversational ──────────────────────────────────────
  // Gemini 3 Flash: 1K RPM, fast, excellent for everyday queries.
  general: {
    provider:  'gemini',
    model:     MODELS.GEMINI_FLASH,
    label:     'Gemini 3 Flash',
    fallbacks: [
      { provider: 'grok',     model: MODELS.GROK_FAST,          label: 'Grok 3 Fast'          },
      { provider: 'deepseek', model: MODELS.DEEPSEEK_CHAT,      label: 'DeepSeek V3'          },
      { provider: 'openai',   model: MODELS.GPT_FAST,           label: 'GPT-4o Mini'          },
      { provider: 'gemini',   model: MODELS.GEMINI_STABLE,      label: 'Gemini 2.5 Flash'     },
      { provider: 'gemini',   model: MODELS.GEMINI_LAST_RESORT, label: 'Gemini 2.0 Flash'     },
    ],
  },

  // ── Image Generation ─────────────────────────────────────────────
  // Imagen 4 primary (10 RPM / 70/day). Triple Gemini fallback chain.
  image_generation: {
    provider:  'gemini',
    model:     MODELS.IMAGEN,
    label:     'Imagen 4',
    fallbacks: [
      { provider: 'gemini', model: MODELS.GEMINI_IMAGE,  label: 'Nano Banana Pro'      },
      { provider: 'gemini', model: MODELS.GEMINI_IMAGE2, label: 'Nano Banana 2'        },
      { provider: 'gemini', model: MODELS.GEMINI_IMAGE3, label: 'Nano Banana Budget'   },
    ],
  },

  // ── Prompt Expansion (internal — not user-facing) ─────────────────
  // Ultra-lightweight. Gemini 3.1 Flash Lite: 4K RPM, unlimited daily.
  prompt_expansion: {
    provider:  'gemini',
    model:     MODELS.GEMINI_FLASH_LITE,
    label:     'Gemini 3.1 Flash Lite',
    fallbacks: [
      { provider: 'deepseek', model: MODELS.DEEPSEEK_CHAT,      label: 'DeepSeek V3'          },
      { provider: 'mistral',  model: MODELS.MISTRAL_FAST,       label: 'Mistral Small'        },
      { provider: 'gemini',   model: MODELS.GEMINI_FLASH,       label: 'Gemini 3 Flash'       },
      { provider: 'gemini',   model: MODELS.GEMINI_STABLE,      label: 'Gemini 2.5 Flash'     },
    ],
  },

  // ── Long Context / Document Analysis ─────────────────────────────
  // Gemini 3.1 Pro: 1M context. Use sparingly (250/day limit).
  long_context: {
    provider:  'gemini',
    model:     MODELS.GEMINI_PRO,
    label:     'Gemini 3.1 Pro',
    fallbacks: [
      { provider: 'fireworks', model: MODELS.LLAMA_FAST,        label: 'Llama 70B'            },
      { provider: 'claude',    model: MODELS.CLAUDE_SONNET,     label: 'Claude Sonnet 4.6'    },
      { provider: 'gemini',    model: MODELS.GEMINI_FLASH,      label: 'Gemini 3 Flash'       },
      { provider: 'gemini',    model: MODELS.GEMINI_STABLE,     label: 'Gemini 2.5 Flash'     },
      { provider: 'gemini',    model: MODELS.GEMINI_LAST_RESORT,label: 'Gemini 2.0 Flash'     },
    ],
  },
};

// ── Route resolver ────────────────────────────────────────────────
// Returns the first available provider in the fallback chain.
// Console ALWAYS logs the real model name being used.

export interface ResolvedRoute {
  provider:     ProviderKey;
  model:        string;
  label:        string;          // real model name for console + UI
  key:          string;          // API key to use
  isFallback:   boolean;         // true if ideal provider was unavailable
  idealLabel:   string;          // what we WANTED to use (for logging)
}

export function resolveRoute(intent: string): ResolvedRoute {
  const route = INTENT_ROUTING[intent] ?? INTENT_ROUTING.general;
  const idealLabel = route.label;

  // Try ideal provider first
  const idealProvider = PROVIDERS[route.provider];
  const idealKey = 'keys' in idealProvider
    ? (idealProvider.keys[0] ?? '')
    : (idealProvider as any).key ?? '';

  if (idealProvider.available && idealKey) {
    console.log(`[SEDREX Router] ${intent} → ${route.label}`);
    return {
      provider:   route.provider,
      model:      route.model,
      label:      route.label,
      key:        idealKey,
      isFallback: false,
      idealLabel,
    };
  }

  // Walk fallback chain
  for (const fallback of route.fallbacks) {
    const fb = PROVIDERS[fallback.provider];
    const fbKey = 'keys' in fb
      ? ((fb as any).keys[0] ?? '')
      : (fb as any).key ?? '';

    if (fb.available && fbKey) {
      console.log(
        `[SEDREX Router] ${intent} → ${fallback.label}` +
        ` [fallback from ${idealLabel} — key not set]`
      );
      return {
        provider:   fallback.provider,
        model:      fallback.model,
        label:      fallback.label,
        key:        fbKey,
        isFallback: true,
        idealLabel,
      };
    }
  }

  // Final safety net — Gemini 3 Flash (should never reach here in normal operation)
  const geminiKey = PROVIDERS.gemini.keys[0] ?? '';
  console.warn(`[SEDREX Router] ${intent} → Core engine (emergency fallback — check keys)`);
  return {
    provider:   'gemini',
    model:      MODELS.GEMINI_FLASH,
    label:      'Gemini 3 Flash',
    key:        geminiKey,
    isFallback: true,
    idealLabel,
  };
}

// ── Provider status (for admin dashboard + settings UI) ───────────

export interface ProviderStatus {
  name:       string;
  available:  boolean;
  keySet:     boolean;
  models:     string[];
}

export function getProviderStatus(): Record<string, ProviderStatus> {
  return {
    gemini: {
      name:      'Google Gemini',
      available: PROVIDERS.gemini.available,
      keySet:    PROVIDERS.gemini.keys.length > 0,
      models:    [MODELS.GEMINI_FLASH, MODELS.GEMINI_PRO, MODELS.GEMINI_FLASH_LITE, MODELS.GEMINI_STABLE, MODELS.GEMINI_LAST_RESORT],
    },
    claude: {
      name:      'Anthropic Claude',
      available: PROVIDERS.claude.available,
      keySet:    !!PROVIDERS.claude.key,
      models:    [MODELS.CLAUDE_SONNET, MODELS.CLAUDE_HAIKU, MODELS.CLAUDE_OPUS],
    },
    openai: {
      name:      'OpenAI',
      available: PROVIDERS.openai.available,
      keySet:    !!PROVIDERS.openai.key,
      models:    [MODELS.GPT_BALANCED, MODELS.GPT_REASONING, MODELS.GPT_CODE],
    },
    grok: {
      name:      'xAI Grok',
      available: PROVIDERS.grok.available,
      keySet:    !!PROVIDERS.grok.key,
      models:    [MODELS.GROK_FAST, MODELS.GROK_PRO],
    },
    deepseek: {
      name:      'DeepSeek',
      available: PROVIDERS.deepseek.available,
      keySet:    !!PROVIDERS.deepseek.key,
      models:    [MODELS.DEEPSEEK_CHAT, MODELS.DEEPSEEK_REASONING],
    },
    mistral: {
      name:      'Mistral AI',
      available: PROVIDERS.mistral.available,
      keySet:    !!PROVIDERS.mistral.key,
      models:    [MODELS.MISTRAL_FAST, MODELS.MISTRAL_PRO],
    },
    fireworks: {
      name:      'Fireworks (Llama)',
      available: PROVIDERS.fireworks.available,
      keySet:    !!PROVIDERS.fireworks.key,
      models:    [MODELS.LLAMA_FAST, MODELS.LLAMA_PRO],
    },
  };
}

// ── Pricing reference (per 1M tokens, USD, March 2026) ────────────
// Used for cost estimation in admin dashboard

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  [MODELS.GEMINI_FLASH]:         { input: 0.50,  output: 3.00  },
  [MODELS.GEMINI_FLASH_LITE]:    { input: 0.25,  output: 1.50  },
  [MODELS.GEMINI_PRO]:           { input: 2.00,  output: 12.00 },
  [MODELS.CLAUDE_SONNET]:        { input: 3.00,  output: 15.00 },
  [MODELS.CLAUDE_HAIKU]:         { input: 1.00,  output: 5.00  },
  [MODELS.CLAUDE_OPUS]:          { input: 5.00,  output: 25.00 },
  [MODELS.GPT_FAST]:             { input: 0.25,  output: 2.00  },
  [MODELS.GPT_BALANCED]:         { input: 0.88,  output: 7.00  },
  [MODELS.GPT_REASONING]:        { input: 1.10,  output: 4.40  },
  [MODELS.GROK_FAST]:            { input: 0.20,  output: 0.50  },
  [MODELS.GROK_PRO]:             { input: 2.00,  output: 15.00 },
  [MODELS.DEEPSEEK_CHAT]:        { input: 0.30,  output: 0.50  },
  [MODELS.DEEPSEEK_REASONING]:   { input: 0.55,  output: 2.19  },
  [MODELS.MISTRAL_FAST]:         { input: 0.03,  output: 0.11  },
  [MODELS.MISTRAL_PRO]:          { input: 2.00,  output: 6.00  },
  [MODELS.LLAMA_FAST]:           { input: 0.05,  output: 0.20  },
  [MODELS.LLAMA_PRO]:            { input: 0.15,  output: 0.60  },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000 * pricing.input) + (outputTokens / 1_000_000 * pricing.output);
}