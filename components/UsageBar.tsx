// components/UsageBar.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Usage Bar (sidebar)
// Always visible — shows tier + usage or "Unlimited" when uncapped.
// When limits ARE enforced, shows a color-coded progress bar.
// ══════════════════════════════════════════════════════════════════

import React, { memo, useRef, useEffect } from 'react';
import { UserStats } from '../types';
import { getUsageSummary, formatUsage, getUsageColor } from '../services/usageLimitService';
import { getTierConfig } from '../services/tierConfig';

interface UsageBarProps {
  stats:          UserStats | null;
  onUpgradeClick: () => void;
}

export const UsageBar = memo(({ stats, onUpgradeClick }: UsageBarProps) => {
  // ALL hooks must be declared before any early returns (React Rules of Hooks)
  const fillRef = useRef<HTMLDivElement>(null);

  const summary  = stats ? getUsageSummary(stats) : null;
  const cfg      = stats ? getTierConfig(stats.tier) : null;
  const isFree   = stats?.tier === 'free';

  const check     = summary?.messages.isEnforced ? summary.messages
                  : summary?.tokens.isEnforced    ? summary.tokens
                  : null;
  const color     = check ? getUsageColor(check.status) : '#10b981';
  const pct       = check ? Math.min(check.percentUsed, 100) : 0;
  const isBlocked = check?.status === 'blocked';
  const isWarning = check?.status === 'warning';
  const unit      = summary?.messages.isEnforced ? 'messages' : 'tokens';

  const upgradeLinkClass = `usage-bar-upgrade-link ${
    isBlocked ? 'status-blocked' : isWarning ? 'status-warning' : 'status-ok'
  }`;

  // Set CSS custom properties imperatively to avoid JSX inline style warnings
  useEffect(() => {
    const el = fillRef.current;
    if (!el || !check) return;
    el.style.setProperty('--usage-bar-pct', `${pct}%`);
    el.style.setProperty('--usage-bar-color', color);
  }, [pct, color, check]);

  if (!stats || !cfg) return null;

  return (
    <div className="usage-bar-wrap">
      {/* Label row */}
      <div className="usage-bar-header">
        <span className="usage-bar-label">
          {check ? formatUsage(check, unit) : cfg.name}
        </span>
        {(isFree || isBlocked || isWarning) && cfg.id !== 'enterprise' && (
          <button
            type="button"
            className={upgradeLinkClass}
            onClick={onUpgradeClick}
          >
            {isBlocked ? 'Upgrade now' : 'Upgrade'}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="usage-bar-track">
        {check ? (
          <div ref={fillRef} className="usage-bar-fill" />
        ) : (
          <div className="usage-bar-fill uncapped" />
        )}
      </div>

      {/* Status messages */}
      {isBlocked && (
        <p className="usage-bar-blocked-msg">
          Monthly limit reached — upgrade to continue.
        </p>
      )}
      {!check && isFree && (
        <p className="usage-bar-free-note">Free plan · unlimited right now</p>
      )}
    </div>
  );
});

UsageBar.displayName = 'UsageBar';
export default UsageBar;
