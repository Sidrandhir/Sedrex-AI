import React from 'react';
import { UserStats } from '../types';

interface BillingProps {
  stats: UserStats;
  onCancel: () => void;
  onUpgrade: () => void;
  onClose: () => void;
}

const Billing: React.FC<BillingProps> = ({ stats, onCancel, onUpgrade, onClose }) => {
  const isPro = stats.tier === 'pro';

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-[var(--bg-primary)] font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tighter text-[var(--text-primary)]">Billing & Subscription</h2>

          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-all hover:scale-105 active:scale-95"
            title="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Plan Overview */}
        <div className="bg-[var(--bg-tertiary)] p-4 sm:p-6 md:p-8 rounded-3xl border border-[var(--border)]">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
            <div>
              <p className="text-[12px] text-[var(--text-secondary)] font-black uppercase tracking-widest mb-1">Current Plan</p>
              <h3 className="text-2xl font-black text-[var(--text-primary)] flex items-center gap-3">
                {isPro ? 'SEDREX Pro' : 'SEDREX Free'}
                <span className={`text-[12px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${stats.subscriptionStatus === 'active' ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[var(--text-secondary)]/10 text-[var(--text-secondary)]'}`}>
                  {stats.subscriptionStatus?.toUpperCase() || 'NONE'}
                </span>
              </h3>
            </div>
            {!isPro && (
              <button 
                onClick={onUpgrade}
                className="bg-[var(--accent)] hover:brightness-110 px-6 py-2 rounded-xl font-black text-[12px] uppercase tracking-widest text-white transition-all shadow-lg shadow-[var(--accent)]/20"
              >
                Upgrade to Pro
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
            <div>
              <p className="text-[12px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">Price</p>
              <p className="font-bold text-[var(--text-primary)]">{isPro ? '$29 / month' : '$0 / month'}</p>
            </div>
            {isPro && stats.currentPeriodEnd && (
              <div>
                <p className="text-[12px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">Renews On</p>
                <p className="font-bold text-[var(--text-primary)]">{new Date(stats.currentPeriodEnd).toLocaleDateString()}</p>
              </div>
            )}
          </div>

          {isPro && stats.subscriptionStatus === 'active' && (
            <div className="mt-8 pt-8 border-t border-[var(--border)]">
              <button 
                onClick={onCancel}
                className="text-red-500 text-[12px] font-black uppercase tracking-widest hover:underline"
              >
                Cancel Subscription
              </button>
            </div>
          )}
        </div>

        {/* Billing History */}
        <div className="space-y-4">
          <h3 className="text-[12px] font-black uppercase tracking-widest text-[var(--text-secondary)] px-2">Billing History</h3>
          <div className="bg-[var(--bg-tertiary)] rounded-3xl border border-[var(--border)] overflow-hidden overflow-x-auto">
            {stats.billingHistory && stats.billingHistory.length > 0 ? (
              <table className="w-full text-left min-w-[480px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
                    <th className="px-6 py-3 text-[12px] font-black uppercase tracking-wider text-[var(--text-secondary)]">Invoice ID</th>
                    <th className="px-6 py-3 text-[12px] font-black uppercase tracking-wider text-[var(--text-secondary)]">Date</th>
                    <th className="px-6 py-3 text-[12px] font-black uppercase tracking-wider text-[var(--text-secondary)]">Amount</th>
                    <th className="px-6 py-3 text-[12px] font-black uppercase tracking-wider text-[var(--text-secondary)]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {stats.billingHistory.map((item) => (
                    <tr key={item.id} className="text-sm hover:bg-[var(--bg-primary)] transition-colors">
                      <td className="px-6 py-4 font-mono text-[12px] text-[var(--text-primary)]">{item.id}</td>
                      <td className="px-6 py-4 text-[var(--text-primary)]">{new Date(item.date).toLocaleDateString()}</td>
                      <td className="px-6 py-4 font-bold text-[var(--text-primary)]">${(item.amount / 100).toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <span className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded text-[12px] font-black uppercase tracking-widest">
                          {item.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 sm:p-12 text-center text-[var(--text-secondary)] italic text-sm">No billing history yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Billing;