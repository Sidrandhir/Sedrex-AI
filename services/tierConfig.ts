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

export type TierId = 'free' | 'pro' | 'team' | 'enterprise';

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
  planId:           string;        // default plan at checkout (launch monthly)
  planIdMonthly?:      string;     // regular (non-launch) monthly plan
  planIdYearlyLaunch?: string;     // launch yearly plan
  launchPricePaisa?:   number;     // launch price in paisa
  launchPriceDisplay?: string;     // e.g. '₹999'
  regularPricePaisa?:  number;     // regular price in paisa
  regularPriceDisplay?:string;     // e.g. '₹1,999'
  displayPriceINR:  string;        // e.g. "₹1,999/mo"
  pricePaisa:       number | null; // paisa (100 paisa = ₹1), null = contact sales
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
    id:             'free',
    name:           'Sedrex Free',
    displayPrice:   '₹0 / mo',
    displayPriceINR:'₹0 / mo',
    pricePaisa:     0,
    planId:         '',

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
    id:             'pro',
    name:           'Sedrex Pro',
    displayPrice:   '₹999 / mo',
    displayPriceINR:'₹999 / mo',
    pricePaisa:     99900,
    planId:              'plan_ScRkGIrUJLd3w3',
    planIdMonthly:       'plan_ScHyEEXa8uICDo',
    planIdYearlyLaunch:  'plan_ScRfOVqMrje7kX',
    launchPricePaisa:    99900,
    launchPriceDisplay:  '₹999',
    regularPricePaisa:   199900,
    regularPriceDisplay: '₹1,999',

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

  team: {
    id:             'team',
    name:           'Sedrex Team',
    displayPrice:   '₹2,599 / mo',
    displayPriceINR:'₹2,599 / mo',
    pricePaisa:     259900,
    planId:              'plan_ScRkkIWnEl5c5A',
    planIdMonthly:       'plan_ScI1NOvr0NH9iP',
    planIdYearlyLaunch:  'plan_ScRgCaZ7pHD8dN',
    launchPricePaisa:    259900,
    launchPriceDisplay:  '₹2,599',
    regularPricePaisa:   499900,
    regularPriceDisplay: '₹4,999',

    monthlyMessages:   5_000,
    dailyMessages:     500,
    monthlyTokens:     5_000_000,
    maxFileSizeMB:     50,
    maxFilesPerMsg:    10,
    maxConversations:  Infinity,
    contextWindowMsgs: 30,

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
      slaGuarantee:        false,
      dedicatedSupport:    false,
    },
  },

  enterprise: {
    id:             'enterprise',
    name:           'Sedrex Enterprise',
    displayPrice:   'Custom',
    displayPriceINR:'Custom',
    pricePaisa:     null,
    planId:         '',

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
  team: TIER_CONFIG.team.monthlyMessages,
};

export function getMonthlyLimit(tier?: string): number {
  return getTierConfig(tier).monthlyMessages;
}

/** True when a limit is actually being enforced (not Infinity / zero) */
export function isLimitEnforced(limit: number): boolean {
  return isFinite(limit) && limit > 0;
}

/** Ordered list for the pricing page */
export const PRICING_TIERS: TierId[] = ['free', 'pro', 'team', 'enterprise'];
