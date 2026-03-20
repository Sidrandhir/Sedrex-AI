/**
 * Tier Configuration — Single Source of Truth
 * All monthly message limits and tier-based settings live here.
 */

/** Default monthly message limits per tier */
export const TIER_LIMITS: Record<string, number> = {
  free: 50,
  pro:  500,
};

/**
 * Get the monthly message limit for a given tier.
 * Defaults to the 'free' tier if tier is unknown.
 */
export function getMonthlyLimit(tier?: string): number {
  if (tier && tier in TIER_LIMITS) {
    return TIER_LIMITS[tier];
  }
  return TIER_LIMITS.free;
}

