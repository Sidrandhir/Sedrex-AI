// services/usageLimitService.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Usage Limit Service
//
// All limit-checking logic lives here. The actual numbers come from
// tierConfig.ts — this file only enforces them.
//
// IMPORTANT: Limits are currently set to Infinity in tierConfig.ts.
// This service will silently pass all checks until you set real numbers.
// When you're ready, edit TIER_CONFIG in tierConfig.ts — no code changes needed here.
// ══════════════════════════════════════════════════════════════════

import { UserStats } from '../types';
import { getTierConfig, isLimitEnforced, TierConfig } from './tierConfig';

// ── Result types ──────────────────────────────────────────────────

export type LimitStatus = 'ok' | 'warning' | 'blocked';

export interface LimitCheck {
  status:       LimitStatus;
  used:         number;
  limit:        number;
  percentUsed:  number;           // 0–100
  remaining:    number;           // Infinity if uncapped
  isEnforced:   boolean;          // false = limit is Infinity, no cap active
  upgradeReason?: string;         // shown in upgrade modal when blocked
}

export interface UsageSummary {
  messages:     LimitCheck;
  dailyMessages:LimitCheck;
  tokens:       LimitCheck;
  // Overall: blocked if ANY check is blocked
  overallStatus: LimitStatus;
}

// ── Internal helpers ──────────────────────────────────────────────

function buildCheck(used: number, limit: number, upgradeReason?: string): LimitCheck {
  const enforced   = isLimitEnforced(limit);
  const pct        = enforced ? Math.min((used / limit) * 100, 100) : 0;
  const remaining  = enforced ? Math.max(limit - used, 0) : Infinity;

  let status: LimitStatus = 'ok';
  if (enforced) {
    if (used >= limit)             status = 'blocked';
    else if (pct >= 85)            status = 'warning';
  }

  return { status, used, limit, percentUsed: pct, remaining, isEnforced: enforced, upgradeReason };
}

function getTodayUsage(stats: UserStats): number {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const entry = stats.dailyHistory?.find(d => d.date === today);
  return entry?.count ?? 0;
}

// ── Main exports ──────────────────────────────────────────────────

/**
 * Full usage summary for a user.
 * Call this before sending a message — if overallStatus === 'blocked', show upgrade modal.
 */
export function getUsageSummary(stats: UserStats | null): UsageSummary {
  if (!stats) {
    // No stats = new user, everything ok
    const open = buildCheck(0, Infinity);
    return { messages: open, dailyMessages: open, tokens: open, overallStatus: 'ok' };
  }

  const cfg: TierConfig = getTierConfig(stats.tier);

  const messages = buildCheck(
    stats.monthlyMessagesSent,
    cfg.monthlyMessages,
    `You've used all ${cfg.monthlyMessages} messages in your ${cfg.name} plan this month.`,
  );

  const dailyMessages = buildCheck(
    getTodayUsage(stats),
    cfg.dailyMessages,
    `Daily message limit reached. Resets at midnight.`,
  );

  const tokens = buildCheck(
    stats.tokensEstimated,
    cfg.monthlyTokens,
    `Monthly token limit reached on ${cfg.name}. Upgrade for more capacity.`,
  );

  const checks = [messages, dailyMessages, tokens];
  const overallStatus: LimitStatus =
    checks.some(c => c.status === 'blocked') ? 'blocked' :
    checks.some(c => c.status === 'warning') ? 'warning' : 'ok';

  return { messages, dailyMessages, tokens, overallStatus };
}

/**
 * Quick pre-flight check before sending a message.
 * Returns null (ok to proceed) or a string reason (show upgrade modal).
 */
export function preflightCheck(stats: UserStats | null): string | null {
  const summary = getUsageSummary(stats);
  if (summary.overallStatus !== 'blocked') return null;

  if (summary.messages.status === 'blocked')      return summary.messages.upgradeReason!;
  if (summary.dailyMessages.status === 'blocked')  return summary.dailyMessages.upgradeReason!;
  if (summary.tokens.status === 'blocked')         return summary.tokens.upgradeReason!;
  return 'Usage limit reached. Upgrade to continue.';
}

/**
 * Formatted usage text for UI display.
 * e.g. "38 / 50 messages" or "Unlimited" if uncapped.
 */
export function formatUsage(check: LimitCheck, unit = 'messages'): string {
  if (!check.isEnforced) return `Unlimited ${unit}`;
  return `${check.used.toLocaleString()} / ${check.limit.toLocaleString()} ${unit}`;
}

/**
 * Usage bar color based on status.
 */
export function getUsageColor(status: LimitStatus): string {
  if (status === 'blocked') return '#ef4444';  // red
  if (status === 'warning') return '#f59e0b';  // amber
  return '#10B981';                            // green
}

// ── Tier-aware functions ──────────────────────────────────────────

export interface CanSendResult {
  allowed:     boolean;
  isBasicMode: boolean;  // true = pro/team over monthly limit, chat continues on Gemini
  reason?:     string;   // only set when allowed=false
}

/**
 * Pre-flight check before sending a message.
 * Pass the already-fetched UserStats — avoids extra DB round-trip.
 */
export function checkCanSendMessage(stats: UserStats | null): CanSendResult {
  if (!stats) return { allowed: true, isBasicMode: false };

  const tier = stats.tier ?? 'free';
  const cfg  = getTierConfig(tier);

  // Enterprise — always allowed, never basic mode
  if (tier === 'enterprise') return { allowed: true, isBasicMode: false };

  // Free — monthly limit only (daily not tracked reliably via trigger)
  if (tier === 'free') {
    if (stats.monthlyMessagesSent >= 100) {
      return {
        allowed:     false,
        isBasicMode: false,
        reason:      `You've used your 100 free requests this month. Upgrade to Pro for more.`,
      };
    }
    return { allowed: true, isBasicMode: false };
  }

  // Pro / Team — monthly limit exceeded → basic mode (chat continues on Gemini)
  if (isLimitEnforced(cfg.monthlyMessages) && stats.monthlyMessagesSent >= cfg.monthlyMessages) {
    return { allowed: true, isBasicMode: true };
  }

  return { allowed: true, isBasicMode: false };
}

/**
 * No-op — usage is incremented automatically by Supabase trigger
 * `trg_message_increments_stats` on every message insert.
 * No manual increment needed here.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function incrementUsage(_userId: string, _tier: string): Promise<void> {
  return;
}

export interface RemainingRequests {
  used:     number;
  limit:    number | null;  // null = unlimited
  resetsAt: string;         // ISO date string
}

/**
 * Returns remaining request counts for the UI footer.
 * No DB call — derives from already-fetched stats.
 */
export function getRemainingRequests(stats: UserStats | null): RemainingRequests | null {
  if (!stats) return null;
  const tier = stats.tier ?? 'free';
  if (tier === 'enterprise') return null; // unlimited — show nothing

  const cfg = getTierConfig(tier);

  if (tier === 'free') {
    // Monthly reset — same as pro/team (trigger populates monthly_messages, not daily)
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    nextMonth.setHours(0, 0, 0, 0);
    return {
      used:     stats.monthlyMessagesSent,
      limit:    100,
      resetsAt: nextMonth.toISOString(),
    };
  }

  // Pro / Team — monthly reset (approximate: 1st of next month)
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
  nextMonth.setHours(0, 0, 0, 0);
  return {
    used:     stats.monthlyMessagesSent,
    limit:    isLimitEnforced(cfg.monthlyMessages) ? cfg.monthlyMessages : null,
    resetsAt: nextMonth.toISOString(),
  };
}

/**
 * True when a Pro/Team user has exceeded their monthly limit
 * and is now in basic mode (Gemini-only, chat still works).
 */
export function isInBasicMode(stats: UserStats | null): boolean {
  if (!stats) return false;
  const tier = stats.tier ?? 'free';
  if (tier === 'free' || tier === 'enterprise') return false;
  const cfg = getTierConfig(tier);
  return isLimitEnforced(cfg.monthlyMessages) && stats.monthlyMessagesSent >= cfg.monthlyMessages;
}
