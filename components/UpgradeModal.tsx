// components/UpgradeModal.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Upgrade Modal
// Shown when a user hits a usage limit.
// Connects to the Stripe checkout flow (P5.1).
// ══════════════════════════════════════════════════════════════════

import React, { memo, useEffect } from 'react';
import { TIER_CONFIG } from '../services/tierConfig';

interface UpgradeModalProps {
  reason:         string;           // why the modal appeared
  currentTier:    string;
  onUpgrade:      () => void;       // triggers Stripe checkout
  onClose:        () => void;
  onViewPricing?: () => void;
}

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const PRO_HIGHLIGHTS = [
  'Unlimited messages & tokens',
  'Priority AI routing — fastest responses',
  'Advanced models: Gemini Pro, Claude Opus, o4-mini',
  'Full artifact panel & code execution',
  'Unlimited conversation history',
  'API access key',
];

export const UpgradeModal = memo(({
  reason, currentTier, onUpgrade, onClose, onViewPricing,
}: UpgradeModalProps) => {
  const pro = TIER_CONFIG.pro;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="upgrade-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="upgrade-modal">

        {/* Close */}
        <button type="button" className="upgrade-modal-close" onClick={onClose} aria-label="Close">
          <XIcon />
        </button>

        {/* Header */}
        <div className="upgrade-modal-header">
          <div className="upgrade-modal-badge">Limit reached</div>
          <h2 className="upgrade-modal-title">Upgrade to Pro</h2>
          <p className="upgrade-modal-reason">{reason}</p>
        </div>

        {/* Price */}
        <div className="upgrade-modal-price-row">
          <span className="upgrade-modal-price">{pro.displayPrice}</span>
          <span className="upgrade-modal-price-note">billed monthly · cancel anytime</span>
        </div>

        {/* Feature list */}
        <ul className="upgrade-modal-features">
          {PRO_HIGHLIGHTS.map(f => (
            <li key={f} className="upgrade-modal-feature-item">
              <CheckIcon />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <button
          type="button"
          className="upgrade-modal-cta"
          onClick={onUpgrade}
        >
          Upgrade to Pro — {pro.displayPrice}
        </button>

        {onViewPricing && (
          <button
            type="button"
            className="upgrade-modal-pricing-link"
            onClick={onViewPricing}
          >
            Compare all plans
          </button>
        )}
      </div>
    </div>
  );
});

UpgradeModal.displayName = 'UpgradeModal';
export default UpgradeModal;
