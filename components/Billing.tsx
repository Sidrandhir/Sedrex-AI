// components/Billing.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Billing & Subscription Page
// Now connected to real Stripe backend via billingService.ts
// ══════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import { UserStats } from '../types';
import { getTierConfig } from '../services/tierConfig';
import { getUsageSummary, formatUsage, getUsageColor } from '../services/usageLimitService';

interface BillingProps {
  stats:     UserStats;
  userId:    string;
  onUpgrade: () => void;       // triggers Stripe checkout via App.tsx
  onCancel:  () => void;       // opens Stripe portal via App.tsx
  onClose:   () => void;
}

const Billing: React.FC<BillingProps> = ({ stats, onUpgrade, onCancel, onClose }) => {
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const isPro        = stats.tier === 'pro';
  const isEnterprise = stats.tier === 'enterprise';
  const cfg          = getTierConfig(stats.tier);
  const usage        = getUsageSummary(stats);

  const tierLabel = isEnterprise ? 'Enterprise' : isPro ? 'Pro' : 'Free';
  const tierColor = isEnterprise ? '#a855f7' : isPro ? '#10B981' : 'var(--text-secondary)';

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-[var(--bg-primary)] font-sans">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tighter text-[var(--text-primary)]">
              Billing & Subscription
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Manage your plan and payment details.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
            title="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Plan Overview */}
        <div className="bg-[var(--bg-tertiary)] p-6 md:p-8 rounded-3xl border border-[var(--border)]">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
            <div>
              <p className="text-[11px] text-[var(--text-secondary)] font-black uppercase tracking-widest mb-2">Current Plan</p>
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-2xl font-black text-[var(--text-primary)]">
                  Sedrex {tierLabel}
                </h3>
                <span
                  className="text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full"
                  style={{ background: `${tierColor}18`, color: tierColor }}
                >
                  {isPro || isEnterprise ? (stats.subscriptionStatus?.toUpperCase() ?? 'ACTIVE') : 'FREE'}
                </span>
              </div>
              <p className="text-[var(--text-secondary)] text-sm mt-2 font-semibold">
                {cfg.displayPrice}
              </p>
            </div>

            {/* Upgrade CTA — only for free users */}
            {!isPro && !isEnterprise && (
              <button
                type="button"
                onClick={onUpgrade}
                className="flex-shrink-0 bg-[var(--accent)] hover:brightness-110 active:scale-95 px-6 py-3 rounded-xl font-black text-[12px] uppercase tracking-widest text-white transition-all shadow-lg shadow-[var(--accent)]/20"
              >
                Upgrade to Pro
              </button>
            )}

            {/* Manage billing — pro/enterprise users */}
            {(isPro || isEnterprise) && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-shrink-0 px-6 py-3 rounded-xl font-black text-[12px] uppercase tracking-widest border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
              >
                Manage Subscription
              </button>
            )}
          </div>

          {/* Renewal date */}
          {(isPro || isEnterprise) && stats.currentPeriodEnd && (
            <div className="mb-6">
              <p className="text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">Next Renewal</p>
              <p className="font-bold text-[var(--text-primary)]">
                {new Date(stats.currentPeriodEnd).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </p>
            </div>
          )}

          {/* Usage summary — only shown when limits are enforced */}
          {(usage.messages.isEnforced || usage.tokens.isEnforced) && (
            <div className="border-t border-[var(--border)] pt-6 space-y-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-3">
                This Month's Usage
              </p>
              {usage.messages.isEnforced && (
                <UsageRow
                  label="Messages"
                  check={usage.messages}
                  unit="messages"
                />
              )}
              {usage.tokens.isEnforced && (
                <UsageRow
                  label="Tokens"
                  check={usage.tokens}
                  unit="tokens"
                />
              )}
            </div>
          )}

          {/* Cancel confirm */}
          {(isPro || isEnterprise) && stats.subscriptionStatus === 'active' && (
            <div className="mt-6 pt-6 border-t border-[var(--border)]">
              {cancelConfirm ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-sm text-[var(--text-secondary)]">
                    This will open Stripe to cancel. Continue?
                  </p>
                  <button
                    type="button"
                    onClick={() => { setCancelConfirm(false); onCancel(); }}
                    className="text-red-500 text-[12px] font-black uppercase tracking-widest hover:underline"
                  >
                    Yes, manage subscription
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelConfirm(false)}
                    className="text-[var(--text-secondary)] text-[12px] font-black uppercase tracking-widest hover:underline"
                  >
                    Never mind
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCancelConfirm(true)}
                  className="text-[var(--text-secondary)] text-[12px] font-black uppercase tracking-widest hover:text-red-500 transition-colors"
                >
                  Cancel Subscription
                </button>
              )}
            </div>
          )}
        </div>

        {/* Billing History */}
        <div className="space-y-4">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] px-2">
            Billing History
          </h3>
          <div className="bg-[var(--bg-tertiary)] rounded-3xl border border-[var(--border)] overflow-hidden overflow-x-auto">
            {stats.billingHistory && stats.billingHistory.length > 0 ? (
              <table className="w-full text-left min-w-[480px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
                    {['Invoice', 'Date', 'Amount', 'Status'].map(h => (
                      <th key={h} className="px-6 py-3 text-[11px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                        {h}
                      </th>
                    ))}
                    <th className="px-6 py-3 text-[11px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                      Receipt
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {stats.billingHistory.map((item) => (
                    <tr key={item.id} className="text-sm hover:bg-[var(--bg-primary)] transition-colors">
                      <td className="px-6 py-4 font-mono text-[11px] text-[var(--text-primary)]">
                        {item.id.slice(0, 14)}…
                      </td>
                      <td className="px-6 py-4 text-[var(--text-primary)]">
                        {new Date(item.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 font-bold text-[var(--text-primary)]">
                        ${(item.amount / 100).toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-widest">
                          {item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {(item as any).pdf && (
                          <a
                            href={(item as any).pdf}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--accent)] text-[12px] font-bold hover:underline"
                          >
                            Download PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 sm:p-12 text-center">
                <p className="text-[var(--text-secondary)] text-sm italic">No billing history yet</p>
                {!isPro && (
                  <button
                    type="button"
                    onClick={onUpgrade}
                    className="mt-4 text-[var(--accent)] text-sm font-bold hover:underline"
                  >
                    Upgrade to Pro to see invoices here
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

// ── Sub-component: single usage row with progress bar ─────────────
const UsageRow = ({ label, check, unit }: { label: string; check: any; unit: string }) => {
  const color = getUsageColor(check.status);
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
        <span className="text-xs text-[var(--text-secondary)] font-mono">
          {formatUsage(check, unit)}
        </span>
      </div>
      <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${check.percentUsed}%`, background: color }}
        />
      </div>
    </div>
  );
};

export default Billing;
