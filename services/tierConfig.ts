// services/tierConfig.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Tier Configuration (Single Source of Truth)
//
// ⚠ HOW TO SET LIMITS:
//   Every limit that shows Infinity is deliberately uncapped.
//   When you are ready to enforce a cap, replace Infinity with
//   the desired number. The usageLimitService reads ONLY this file.
//
// Tiers: free | pro | enterprise
// ══════════════════════════════════════════════════════════════════

export type TierId = 'free' | 'pro' | 'enterprise';

export interface TierFeatures {
  codeExecution:        boolean;
  imageGeneration:      boolean;
  voiceInput:           boolean;
  artifactPanel:        boolean;
  priorityRouting:      boolean;   // skip queue, faster responses
  advancedModels:       boolean;   // Gemini Pro, o4-mini, Claude Opus
  teamAccess:           boolean;   // shared workspaces (enterprise)
  apiAccess:            boolean;   // REST API key
  customSystemPrompt:   boolean;
  exportConversations:  boolean;
  slaGuarantee:         boolean;
  dedicatedSupport:     boolean;
}

export interface TierConfig {
  id:               TierId;
  name:             string;
  displayPrice:     string;        // human-readable e.g. "$29/mo"
  priceCents:       number | null; // null = contact sales
  stripePriceId:    string;        // fill in after creating Stripe product
  // ── Usage caps ─────────────────────────────────────────────────
  // Set to Infinity to leave uncapped. Replace with a number to enforce.
  monthlyMessages:   number;  // total messages allowed per calendar month
  dailyMessages:     number;  // per-day message cap (optional burst control)
  monthlyTokens:     number;  // total input+output tokens per month
  maxFileSizeMB:     number;  // max file upload size in MB
  maxFilesPerMsg:    number;  // max simultaneous file attachments
  maxConversations:  number;  // total conversations stored
  contextWindowMsgs: number;  // how many prior messages sent to AI
  // ── Features ───────────────────────────────────────────────────
  features: TierFeatures;
}

// ════════════════════════════════════════════════════════════════
// ✏  EDIT THESE VALUES TO ENFORCE LIMITS
//    Replace Infinity with the number you want to cap at.
// ════════════════════════════════════════════════════════════════
export const TIER_CONFIG: Record<TierId, TierConfig> = {

  free: {
    id:            'free',
    name:          'Sedrex Free',
    displayPrice:  '$0 / mo',
    priceCents:    0,
    stripePriceId: '',

    monthlyMessages:   30,
    dailyMessages:     10,
    monthlyTokens:     50_000,
    maxFileSizeMB:     5,
    maxFilesPerMsg:    1,
    maxConversations:  20,
    contextWindowMsgs: 10,

    features: {
      codeExecution:       true,
      imageGeneration:     false,
      voiceInput:          false,
      artifactPanel:       true,
      priorityRouting:     false,
      advancedModels:      false,
      teamAccess:          false,
      apiAccess:           false,
      customSystemPrompt:  false,
      exportConversations: false,
      slaGuarantee:        false,
      dedicatedSupport:    false,
    },
  },

  pro: {
    id:            'pro',
    name:          'Sedrex Pro',
    displayPrice:  '$29 / mo',
    priceCents:    2900,
    stripePriceId: 'price_FILL_IN_STRIPE_PRICE_ID', // ← paste your Stripe price ID after creating product in Stripe Dashboard

    monthlyMessages:   2_000,
    dailyMessages:     200,
    monthlyTokens:     2_000_000,
    maxFileSizeMB:     25,
    maxFilesPerMsg:    5,
    maxConversations:  500,
    contextWindowMsgs: 20,

    features: {
      codeExecution:       true,
      imageGeneration:     true,
      voiceInput:          true,
      artifactPanel:       true,
      priorityRouting:     true,
      advancedModels:      true,
      teamAccess:          false,
      apiAccess:           true,
      customSystemPrompt:  true,
      exportConversations: true,
      slaGuarantee:        false,
      dedicatedSupport:    false,
    },
  },

  enterprise: {
    id:            'enterprise',
    name:          'Sedrex Enterprise',
    displayPrice:  'Custom',
    priceCents:    null,
    stripePriceId: '', // handled via Stripe Quote / custom invoice

    monthlyMessages:   10_000,
    dailyMessages:     1_000,
    monthlyTokens:     10_000_000,
    maxFileSizeMB:     50,
    maxFilesPerMsg:    10,
    maxConversations:  Infinity,
    contextWindowMsgs: 50,

    features: {
      codeExecution:       true,
      imageGeneration:     true,
      voiceInput:          true,
      artifactPanel:       true,
      priorityRouting:     true,
      advancedModels:      true,
      teamAccess:          true,
      apiAccess:           true,
      customSystemPrompt:  true,
      exportConversations: true,
      slaGuarantee:        true,
      dedicatedSupport:    true,
    },
  },
};

// ── Helpers ───────────────────────────────────────────────────────

export function getTierConfig(tier?: string | null): TierConfig {
  const id = (tier ?? 'free') as TierId;
  return TIER_CONFIG[id] ?? TIER_CONFIG.free;
}

/** Legacy shim kept for backward compatibility */
export const TIER_LIMITS: Record<string, number> = {
  free: TIER_CONFIG.free.monthlyMessages,
  pro:  TIER_CONFIG.pro.monthlyMessages,
};

export function getMonthlyLimit(tier?: string): number {
  return getTierConfig(tier).monthlyMessages;
}

/** True when a limit is actually being enforced (not Infinity / zero) */
export function isLimitEnforced(limit: number): boolean {
  return isFinite(limit) && limit > 0;
}

/** Ordered list for the pricing page */
export const PRICING_TIERS: TierId[] = ['free', 'pro', 'enterprise'];
