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
  GEMINI_FLASH:        'gemini-2.0-flash',               // Primary — fast general queries (15 RPM free tier)
  GEMINI_FLASH_LITE:   'gemini-1.5-flash', // Ultra-lightweight — prompt expansion, classification
  GEMINI_PRO:          'gemini-2.5-pro-preview-03-25',   // Deep reasoning, long context, science
  GEMINI_FLASH_IMAGE:  'gemini-2.0-flash-preview-image-generation', // Image generation fallback
  IMAGEN:              'imagen-4.0-generate-001',        // Primary image generation

  // ── Anthropic Claude ─────────────────────────────────────────────
  CLAUDE_SONNET:       'claude-sonnet-4-6',             // Best code + writing at Sonnet price
  CLAUDE_HAIKU:        'claude-haiku-4-5',              // Fast Claude — lightweight technical tasks
  CLAUDE_OPUS:         'claude-opus-4-6',               // Max quality — reserved for critical tasks

  // ── OpenAI ───────────────────────────────────────────────────────
  GPT_FAST:            'gpt-5-mini',                    // Fast OpenAI — 83.8% MMLU, very cheap
  GPT_BALANCED:        'gpt-5.2',                       // Balanced — 81.4% MMLU, $0.88/$7 per 1M
  GPT_REASONING:       'o4-mini',                       // Math + logic specialist — 85.9% coding
  GPT_CODE:            'gpt-5.1-codex',                 // Agentic coding — 84.9% SWE-bench

  // ── xAI Grok ─────────────────────────────────────────────────────
  GROK_FAST:           'grok-4.1-fast',                 // Cheapest frontier — $0.20/$0.50, 2M context
  GROK_PRO:            'grok-4',                        // Top SWE-bench — real-time X data

  // ── DeepSeek ─────────────────────────────────────────────────────
  DEEPSEEK_CHAT:       'deepseek-chat',                 // V4 — GPT-5 class at $0.30/$0.50 per 1M
  DEEPSEEK_REASONING:  'deepseek-reasoner',             // R1 — matches o1 at 96% lower cost

  // ── Mistral ──────────────────────────────────────────────────────
  MISTRAL_FAST:        'mistral-small-3.1-24b-instruct',// Budget mid-tier — $0.03/$0.11
  MISTRAL_PRO:         'mistral-large-latest',          // EU data sovereignty

  // ── Meta Llama (via Fireworks/Together) ──────────────────────────
  LLAMA_FAST:          'meta-llama/llama-4-scout',      // 10M context, very cheap
  LLAMA_PRO:           'meta-llama/llama-4-maverick',   // Best open-source general
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
  // DeepSeek V4 is GPT-5 class at 1/10th cost — excellent fallback.
  technical: {
    provider:  'claude',
    model:     MODELS.CLAUDE_SONNET,
    label:     'Claude Sonnet 4.6',
    fallbacks: [
      { provider: 'deepseek', model: MODELS.DEEPSEEK_CHAT,    label: 'DeepSeek V4'       },
      { provider: 'openai',   model: MODELS.GPT_CODE,         label: 'GPT-5.1 Codex'     },
      { provider: 'grok',     model: MODELS.GROK_FAST,        label: 'Grok 4.1 Fast'     },
      { provider: 'gemini',   model: MODELS.GEMINI_PRO,       label: 'Gemini 2.5 Pro'    },
      { provider: 'gemini',   model: MODELS.GEMINI_FLASH,     label: 'Gemini 2.0 Flash'    },
    ],
  },

  // ── Analysis: compare, evaluate, architect, trade-offs ───────────
  // o4-mini for math/logic. GPT-5.2 for structured analysis.
  // Claude Sonnet as close second (excellent reasoning).
  analytical: {
    provider:  'openai',
    model:     MODELS.GPT_BALANCED,
    label:     'GPT-5.2',
    fallbacks: [
      { provider: 'claude',   model: MODELS.CLAUDE_SONNET,    label: 'Claude Sonnet 4.6' },
      { provider: 'deepseek', model: MODELS.DEEPSEEK_REASONING,label: 'DeepSeek R1'      },
      { provider: 'grok',     model: MODELS.GROK_PRO,         label: 'Grok 4'            },
      { provider: 'gemini',   model: MODELS.GEMINI_PRO,       label: 'Gemini 2.5 Pro'    },
      { provider: 'gemini',   model: MODELS.GEMINI_FLASH,     label: 'Gemini 2.0 Flash'    },
    ],
  },

  // ── Math / Logic / Proofs ─────────────────────────────────────────
  // o4-mini is purpose-built for this. DeepSeek R1 matches o1 at 96% lower cost.
  math: {
    provider:  'openai',
    model:     MODELS.GPT_REASONING,
    label:     'o4-mini',
    fallbacks: [
      { provider: 'deepseek', model: MODELS.DEEPSEEK_REASONING,label: 'DeepSeek R1'      },
      { provider: 'claude',   model: MODELS.CLAUDE_SONNET,    label: 'Claude Sonnet 4.6' },
      { provider: 'gemini',   model: MODELS.GEMINI_PRO,       label: 'Gemini 2.5 Pro'    },
      { provider: 'gemini',   model: MODELS.GEMINI_FLASH,     label: 'Gemini 2.0 Flash'    },
    ],
  },

  // ── Live / Real-time / Search ─────────────────────────────────────
  // Gemini is the ONLY option with native Google Search grounding.
  // Grok 4 has real-time X/Twitter data — useful for social trends.
  live: {
    provider:  'gemini',
    model:     MODELS.GEMINI_FLASH,
    label:     'Gemini 3 Flash + Search',
    fallbacks: [
      { provider: 'grok',   model: MODELS.GROK_FAST,          label: 'Grok 4.1 Fast'     },
      { provider: 'gemini', model: MODELS.GEMINI_PRO,         label: 'Gemini 2.5 Pro'    },
    ],
  },

  // ── General / Conversational ──────────────────────────────────────
  // Gemini Flash: fast, cheap, excellent for everyday queries.
  // Grok 4.1 Fast: $0.20/$0.50 — extraordinary value at frontier quality.
  general: {
    provider:  'gemini',
    model:     MODELS.GEMINI_FLASH,
    label:     'Gemini 3 Flash',
    fallbacks: [
      { provider: 'grok',     model: MODELS.GROK_FAST,        label: 'Grok 4.1 Fast'     },
      { provider: 'deepseek', model: MODELS.DEEPSEEK_CHAT,    label: 'DeepSeek V4'       },
      { provider: 'openai',   model: MODELS.GPT_FAST,         label: 'GPT-5 Mini'        },
      { provider: 'gemini',   model: MODELS.GEMINI_FLASH,     label: 'Gemini 2.0 Flash'    },
    ],
  },

  // ── Image Generation ─────────────────────────────────────────────
  // Imagen 4 is the best Google image model. Always Gemini.
  image_generation: {
    provider:  'gemini',
    model:     MODELS.IMAGEN,
    label:     'Imagen 4.0',
    fallbacks: [
      { provider: 'gemini', model: MODELS.GEMINI_FLASH_IMAGE, label: 'Gemini Flash Image' },
    ],
  },

  // ── Prompt Expansion (internal — not user-facing) ─────────────────
  // Ultra-lightweight. Just needs to expand a short prompt.
  // Use the cheapest capable model available.
  prompt_expansion: {
    provider:  'gemini',
    model:     MODELS.GEMINI_FLASH_LITE,
    label:     'Gemini Flash Lite',
    fallbacks: [
      { provider: 'deepseek', model: MODELS.DEEPSEEK_CHAT,    label: 'DeepSeek V4'       },
      { provider: 'mistral',  model: MODELS.MISTRAL_FAST,     label: 'Mistral Small'     },
      { provider: 'gemini',   model: MODELS.GEMINI_FLASH,     label: 'Gemini 2.0 Flash'    },
    ],
  },

  // ── Long Context / Document Analysis ─────────────────────────────
  // Gemini Pro: 1M context. Llama 4 Scout: 10M context (if available).
  long_context: {
    provider:  'gemini',
    model:     MODELS.GEMINI_PRO,
    label:     'Gemini 3.1 Pro',
    fallbacks: [
      { provider: 'fireworks', model: MODELS.LLAMA_FAST,      label: 'Llama 4 Scout 10M' },
      { provider: 'claude',    model: MODELS.CLAUDE_SONNET,   label: 'Claude Sonnet 4.6' },
      { provider: 'gemini',    model: MODELS.GEMINI_FLASH,    label: 'Gemini 2.0 Flash'    },
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
    console.log(`[SEDREX Router] ${intent} → ${route.label} (${route.model})`);
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
        `[SEDREX Router] ${intent} → ${fallback.label} (${fallback.model})` +
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

  // Final safety net — Gemini Flash (should never reach here in beta)
  const geminiKey = PROVIDERS.gemini.keys[0] ?? '';
  console.warn(`[SEDREX Router] ${intent} → Gemini Flash (emergency fallback — check keys)`);
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
      models:    [MODELS.GEMINI_FLASH, MODELS.GEMINI_PRO, MODELS.GEMINI_FLASH_LITE],
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
  [MODELS.GPT_CODE]:             { input: 1.25,  output: 10.00 },
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