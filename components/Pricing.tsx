// components/Pricing.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Pricing Page (redesigned)
// Three tiers: Free / Pro / Enterprise
// Annual / Monthly toggle with savings badge
// Feature comparison table with category groups
// FAQ accordion + trust strip
// ══════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import './Pricing.css';

interface PricingProps {
  onUpgrade:     () => void;
  onClose:       () => void;
  currentTier?:  'free' | 'pro' | 'enterprise';
}

// ── Feature comparison data ────────────────────────────────────────
type Row =
  | { category: string }
  | { name: string; free: string; pro: string; enterprise: string };

const ROWS: Row[] = [
  { category: 'Core AI' },
  { name: 'AI Models',              free: 'Claude · Gemini · GPT-4',  pro: 'All + priority routing',       enterprise: 'All + dedicated capacity'  },
  { name: 'Verification Loop',      free: '✓',                        pro: '✓',                            enterprise: '✓'                          },
  { name: 'Thinking Mode',          free: '✓',                        pro: '✓',                            enterprise: '✓'                          },
  { name: 'Code Execution',         free: '✓',                        pro: '✓',                            enterprise: '✓'                          },

  { category: 'Files & Storage' },
  { name: 'File & Image Upload',    free: 'Up to 10 MB',              pro: 'Up to 50 MB',                  enterprise: 'Unlimited'                  },
  { name: 'Conversation History',   free: 'Last 50',                  pro: 'Unlimited',                    enterprise: 'Unlimited + export'         },
  { name: 'Codebase Indexing',      free: '—',                        pro: '✓',                            enterprise: '✓ + private hosting'        },

  { category: 'Access & Perks' },
  { name: 'Monthly Messages',       free: 'Admin-set limit',          pro: 'Admin-set limit',              enterprise: 'Custom / unlimited'         },
  { name: 'Priority Model Access',  free: '—',                        pro: '✓',                            enterprise: '✓'                          },
  { name: 'Early Beta Features',    free: '—',                        pro: '✓',                            enterprise: '✓'                          },
  { name: 'Custom System Prompt',   free: '—',                        pro: '✓',                            enterprise: '✓ + org-wide defaults'      },

  { category: 'Team & Enterprise' },
  { name: 'Team Access',            free: '—',                        pro: '—',                            enterprise: '✓'                          },
  { name: 'SLA Guarantee',          free: '—',                        pro: '—',                            enterprise: '✓ 99.9% uptime'             },
  { name: 'API Access',             free: '—',                        pro: '—',                            enterprise: '✓'                          },
  { name: 'Dedicated Support',      free: 'Community',                pro: 'Email',                        enterprise: 'Slack + dedicated CSM'      },
];

// ── FAQ data ───────────────────────────────────────────────────────
const FAQS = [
  {
    q: 'Can I cancel my Pro subscription anytime?',
    a: 'Yes. You can downgrade or cancel from your billing page at any moment. You keep Pro access until the end of your billing period — no pro-rated charges.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'Sedrex uses Stripe for all payments. We accept all major credit and debit cards (Visa, Mastercard, Amex) and most regional payment methods supported by Stripe.',
  },
  {
    q: 'Is the annual plan billed upfront?',
    a: 'Yes — annual billing is charged as a single payment upfront. You save 20% compared to monthly billing.',
  },
  {
    q: 'What does "admin-set message limit" mean?',
    a: 'Message limits on Free and Pro are configured by the account administrator to align with your plan\'s cost structure. Enterprise customers can negotiate a custom or unlimited quota.',
  },
  {
    q: 'How does codebase indexing work?',
    a: 'You upload a project folder and Sedrex indexes the files locally in your browser. The indexed context is sent alongside your messages so the AI can reference your actual code — no files are stored on our servers.',
  },
  {
    q: 'What\'s included in the Enterprise plan?',
    a: 'Enterprise includes everything in Pro plus team access, SLA guarantees, dedicated API capacity, optional private hosting, custom org-wide system prompts, API access, and a dedicated customer success manager.',
  },
];

// ── Pricing tier config ────────────────────────────────────────────
function usePrice(annual: boolean) {
  return {
    free: { monthly: 0,  annual: 0  },
    pro:  { monthly: 29, annual: 23 },
  };
}

// ── Table cell ─────────────────────────────────────────────────────
function TCell({ value, variant }: { value: string; variant: 'free' | 'pro' | 'enterprise' }) {
  if (value === '✓') {
    const cls = variant === 'pro' ? 'cell-check-pro' : variant === 'enterprise' ? 'cell-check-enterprise' : 'cell-text';
    return <td className={cls}>✓</td>;
  }
  if (value === '—') {
    return <td className="cell-cross">—</td>;
  }
  return <td className="cell-text">{value}</td>;
}

// ── Main component ─────────────────────────────────────────────────
const Pricing: React.FC<PricingProps> = ({ onUpgrade, onClose, currentTier = 'free' }) => {
  const [annual,   setAnnual]   = useState(false);
  const [openFaq,  setOpenFaq]  = useState<number | null>(null);
  const prices = usePrice(annual);

  const proPrice    = annual ? prices.pro.annual  : prices.pro.monthly;
  const proOriginal = annual ? prices.pro.monthly : null;

  return (
    <div className="pricing-root">
      <div className="pricing-inner">

        {/* ── Header ────────────────────────────────────────── */}
        <div className="pricing-header">
          <button type="button" className="pricing-close" onClick={onClose} title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          <div className="pricing-eyebrow">
            <span className="pricing-eyebrow-dot" />
            Transparent Pricing
          </div>

          <h1 className="pricing-title">
            The full intelligence stack.<br />
            <span className="pricing-title-accent">Pick your tier.</span>
          </h1>

          <p className="pricing-subtitle">
            Every plan ships with verification loops, thinking mode, multi-model routing, and code execution. No artificial limits on intelligence.
          </p>
        </div>

        {/* ── Social proof ────────────────────────────────── */}
        <div className="pricing-social-proof">
          <div className="pricing-proof-item">
            <span className="pricing-proof-num">1,200+</span>
            <span className="pricing-proof-label">Active Users</span>
          </div>
          <div className="pricing-proof-sep" />
          <div className="pricing-proof-item">
            <span className="pricing-proof-num">4.9 ★</span>
            <span className="pricing-proof-label">Avg Rating</span>
          </div>
          <div className="pricing-proof-sep" />
          <div className="pricing-proof-item">
            <span className="pricing-proof-num">99.9%</span>
            <span className="pricing-proof-label">Uptime SLA</span>
          </div>
          <div className="pricing-proof-sep" />
          <div className="pricing-proof-item">
            <span className="pricing-proof-num">$0</span>
            <span className="pricing-proof-label">Setup Fee</span>
          </div>
        </div>

        {/* ── Billing toggle ──────────────────────────────── */}
        <div className="pricing-toggle-wrap">
          <span className={`pricing-toggle-label ${!annual ? 'active' : ''}`}>Monthly</span>
          <button
            type="button"
            className={`pricing-toggle ${annual ? 'on' : ''}`}
            onClick={() => setAnnual(p => !p)}
            aria-label="Toggle annual billing"
          >
            <span className="pricing-toggle-thumb" />
          </button>
          <span className={`pricing-toggle-label ${annual ? 'active' : ''}`}>Annual</span>
          {annual && <span className="pricing-savings-badge">Save 20%</span>}
        </div>

        {/* ── Tier cards ──────────────────────────────────── */}
        <div className="pricing-cards">

          {/* Free */}
          <div className="pricing-card free">
            <p className="pricing-tier-label free">Free</p>
            <div className="pricing-price-row">
              <span className="pricing-price-main">$0</span>
              <span className="pricing-price-period">/ mo</span>
            </div>
            <p className="pricing-price-sub">&nbsp;</p>
            <p className="pricing-card-desc">
              Explore the full Sedrex intelligence stack with generous limits set by your admin.
            </p>
            <ul className="pricing-feature-list">
              {[
                'All core AI models',
                'Verification + thinking mode',
                'Code execution sandbox',
                '10 MB file uploads',
                'Last 50 conversations',
              ].map(f => (
                <li key={f} className="pricing-feature-item">
                  <span className="pricing-feature-icon free">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <button type="button" disabled className="pricing-cta free-cta">
              {currentTier === 'free' ? 'Current Plan' : 'Free Tier'}
            </button>
          </div>

          {/* Pro */}
          <div className="pricing-card pro">
            <span className="pricing-card-pill popular">Most Popular</span>
            <p className="pricing-tier-label pro">Pro</p>
            <div className="pricing-price-row">
              {proOriginal && (
                <span className="pricing-price-orig">${proOriginal}</span>
              )}
              <span className="pricing-price-main">${proPrice}</span>
              <span className="pricing-price-period">/ mo</span>
            </div>
            <p className="pricing-price-sub">
              {annual ? `$${proPrice * 12} billed annually` : 'Billed monthly'}
            </p>
            <p className="pricing-card-desc">
              Unlimited history, priority routing, codebase indexing, and early access to every new feature.
            </p>
            <ul className="pricing-feature-list">
              {[
                'Everything in Free',
                'Unlimited conversation history',
                '50 MB file uploads',
                'Codebase indexing (RAG)',
                'Priority model access',
                'Early beta features',
                'Custom system prompt',
              ].map(f => (
                <li key={f} className="pricing-feature-item">
                  <span className="pricing-feature-icon pro">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="pricing-cta pro-cta"
              onClick={currentTier !== 'pro' ? onUpgrade : undefined}
              disabled={currentTier === 'pro'}
            >
              {currentTier === 'pro'
                ? 'Current Plan'
                : currentTier === 'enterprise'
                ? 'Switch to Pro'
                : 'Upgrade to Pro'}
            </button>
          </div>

          {/* Enterprise */}
          <div className="pricing-card enterprise">
            <span className="pricing-card-pill enterprise">Custom</span>
            <p className="pricing-tier-label enterprise">Enterprise</p>
            <div className="pricing-price-row">
              <span className="pricing-price-main" style={{ fontSize: 32 }}>Custom</span>
            </div>
            <p className="pricing-price-sub">Volume + team discounts</p>
            <p className="pricing-card-desc">
              Team access, SLA guarantees, dedicated API capacity, and a dedicated customer success manager.
            </p>
            <ul className="pricing-feature-list">
              {[
                'Everything in Pro',
                'Team & org-wide access',
                '99.9% SLA uptime guarantee',
                'Dedicated API capacity',
                'Private hosting option',
                'API access',
                'Slack + dedicated CSM',
              ].map(f => (
                <li key={f} className="pricing-feature-item">
                  <span className="pricing-feature-icon enterprise">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <a
              href="mailto:hello@sedrex.ai?subject=Enterprise%20Inquiry"
              className={`pricing-cta enterprise-cta${currentTier === 'enterprise' ? ' current-cta' : ''}`}
              style={{ pointerEvents: currentTier === 'enterprise' ? 'none' : undefined } as React.CSSProperties}
            >
              {currentTier === 'enterprise' ? 'Current Plan' : 'Contact Sales'}
            </a>
          </div>
        </div>

        {/* ── Feature comparison table ─────────────────────── */}
        <div className="pricing-table-section">
          <p className="pricing-table-heading">Full Feature Comparison</p>
          <div className="pricing-table-wrap">
            <table className="pricing-table">
              <thead>
                <tr>
                  <th className="col-feature">Feature</th>
                  <th className="col-free">Free</th>
                  <th className="col-pro">Pro</th>
                  <th className="col-enterprise">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => {
                  if ('category' in row) {
                    return (
                      <tr key={i} className="table-category">
                        <td colSpan={4}>{row.category}</td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={row.name}>
                      <td className="col-feature-name">{row.name}</td>
                      <TCell value={row.free}       variant="free" />
                      <TCell value={row.pro}        variant="pro" />
                      <TCell value={row.enterprise} variant="enterprise" />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── FAQ ─────────────────────────────────────────── */}
        <div className="pricing-faq-section">
          <h2 className="pricing-faq-heading">Frequently Asked Questions</h2>
          <div className="pricing-faq-list">
            {FAQS.map((faq, i) => (
              <div key={i} className={`pricing-faq-item${openFaq === i ? ' open' : ''}`}>
                <button
                  type="button"
                  className="pricing-faq-q"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  {faq.q}
                  <svg className="pricing-faq-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>
                <div className="pricing-faq-answer">{faq.a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Trust strip ─────────────────────────────────── */}
        <div className="pricing-trust">
          {[
            { icon: '🔒', title: 'Secure payments',  body: 'Payments via Stripe. Sedrex never stores card details.' },
            { icon: '↩️', title: 'Cancel anytime',   body: 'No lock-ins. Downgrade from your billing page in seconds.' },
            { icon: '⚡', title: 'Instant upgrade',  body: 'Plan activates the moment payment clears.' },
          ].map(({ icon, title, body }) => (
            <div key={title} className="pricing-trust-card">
              <div className="pricing-trust-icon">{icon}</div>
              <div className="pricing-trust-body">
                <p className="pricing-trust-title">{title}</p>
                <p className="pricing-trust-text">{body}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

export default Pricing;
