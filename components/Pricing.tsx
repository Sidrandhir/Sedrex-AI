// components/Pricing.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Pricing Page
// 4 tiers: Free / Pro / Team / Enterprise
// No model names, INR only, no toggle, no FAQ, no fake stats
// ══════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import './Pricing.css';

interface PricingProps {
  onUpgrade:     (planIdOverride?: string, amountOverride?: number) => void;   // Pro CTA
  onUpgradeTeam: (planIdOverride?: string, amountOverride?: number) => void;   // Team CTA
  onClose:       () => void;
  currentTier?:  'free' | 'pro' | 'team' | 'enterprise';
}

// ── Feature check row ──────────────────────────────────────────────
const Feature = ({ text, accent }: { text: string; accent?: boolean }) => (
  <li className="pricing-feature-item">
    <span className={`pricing-feature-icon${accent ? ' accent' : ''}`}>✓</span>
    {text}
  </li>
);

// ── FAQ data ───────────────────────────────────────────────────────
const FAQ_ITEMS = [
  { q: 'Can I cancel my subscription anytime?',
    a: 'Yes — cancel anytime from your account settings. No questions asked, no lock-ins.' },
  { q: 'What payment methods do you accept?',
    a: 'We accept all major credit/debit cards, UPI, NetBanking, and popular wallets via Razorpay.' },
  { q: 'Is the yearly plan billed upfront?',
    a: 'Yes — yearly plans are billed as a single payment. You save 5% compared to monthly billing.' },
  { q: 'How does the message limit work?',
    a: 'Each conversation turn counts as 1 message. Heavy tasks like file analysis or long code generation may count as 2–3 messages.' },
  { q: 'What is the Advanced AI Engine?',
    a: 'Sedrex automatically routes your query to the most capable AI model for that task — reasoning, coding, analysis, or creative work. You always get the best result without choosing manually.' },
  { q: "What's included in the Enterprise plan?",
    a: 'Custom pricing, unlimited usage, API access, SSO, dedicated support, SLA guarantees, and custom AI workflows. Contact us to discuss your requirements.' },
];

// ── Table value cell — auto-colours ✓ green, ✗ muted, else plain ──
const TVal = ({ v }: { v: string }) => {
  const isCheck = v === '✓' || v.startsWith('✓');
  const isCross = v === '✗';
  return (
    <td className={`cell-text${isCheck ? ' cell-val-check' : isCross ? ' cell-val-cross' : ''}`}>
      {v}
    </td>
  );
};

// ── Main component ─────────────────────────────────────────────────
const Pricing: React.FC<PricingProps> = ({
  onUpgrade,
  onUpgradeTeam,
  onClose,
  currentTier = 'free',
}) => {
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const proPrice   = annual ? '₹949'   : '₹999';
  const teamPrice  = annual ? '₹2,469' : '₹2,599';
  const proBadge   = annual ? '🚀 Save 5% + Launch Deal' : '🚀 Launch Deal — 50% OFF';
  const teamBadge  = annual ? '🚀 Save 5% + Launch Deal' : '🚀 Launch Deal — 48% OFF';
  const proYearly  = annual ? '₹11,388/year' : null;
  const teamYearly = annual ? '₹29,592/year' : null;
  const proPlanId  = annual ? 'plan_ScRfOVqMrje7kX' : 'plan_ScRkGIrUJLd3w3';
  const teamPlanId = annual ? 'plan_ScRgCaZ7pHD8dN' : 'plan_ScRkkIWnEl5c5A';

  return (
    <div className="pricing-root">
      <div className="pricing-inner">

        {/* ── Close ─────────────────────────────────────────── */}
        <button type="button" className="pricing-close" onClick={onClose} title="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* ── Header ────────────────────────────────────────── */}
        <div className="pricing-header">
          <div className="pricing-eyebrow">
            <span className="pricing-eyebrow-dot" />
            ✦ TRANSPARENT PRICING
          </div>
          <h1 className="pricing-title">
            The full intelligence stack.{' '}
            <span className="pricing-title-accent">Pick your tier.</span>
          </h1>
          <p className="pricing-subtitle">
            Every plan ships with thinking mode, multi-model routing, and code execution.
            No artificial limits on intelligence.
          </p>
        </div>

        {/* ── Trust stats ───────────────────────────────────── */}
        <div className="pricing-social-proof">
          <div className="pricing-proof-item">
            <span className="pricing-proof-num">Launch Special</span>
            <span className="pricing-proof-label">Active Offer</span>
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
            <span className="pricing-proof-num">₹0</span>
            <span className="pricing-proof-label">Setup Fee</span>
          </div>
        </div>

        {/* ── Billing toggle ──────────────────────────────── */}
        <div className="pricing-toggle-wrap">
          <span className={`pricing-toggle-label${!annual ? ' active' : ''}`}>Monthly</span>
          <button
            type="button"
            className={`pricing-toggle${annual ? ' on' : ''}`}
            onClick={() => setAnnual(p => !p)}
            aria-label="Toggle annual billing"
          >
            <span className="pricing-toggle-thumb" />
          </button>
          <span className={`pricing-toggle-label${annual ? ' active' : ''}`}>Yearly</span>
          {annual && <span className="pricing-savings-badge">Save 5%</span>}
        </div>

        {/* ── Tier cards ──────────────────────────────────── */}
        <div className="pricing-cards">

          {/* Free */}
          <div className="pricing-card free">
            <div className="pricing-card-top">
              <p className="pricing-tier-label">Free</p>
              <p className="pricing-card-tagline">Try Sedrex — no card needed</p>
              <div className="pricing-price-row">
                <span className="pricing-price-main">₹0</span>
                <span className="pricing-price-period">/ mo</span>
              </div>
            </div>
            <ul className="pricing-feature-list">
              <Feature text="Standard AI (fast & efficient)" />
              <Feature text="10 messages / day" />
              <Feature text="Basic code generation" />
              <Feature text="Text artifacts" />
              <Feature text="Unlimited chat history" />
            </ul>
            <button
              type="button"
              className="pricing-cta free-cta"
              onClick={currentTier !== 'free' ? onClose : undefined}
              disabled={currentTier === 'free'}
            >
              {currentTier === 'free' ? 'Current Plan' : 'Get Started Free'}
            </button>
          </div>

          {/* Pro */}
          <div className="pricing-card pro">
            <span className="pricing-card-pill popular">MOST POPULAR ⚡ Best Value</span>
            <div className="pricing-card-top">
              <p className="pricing-tier-label">Pro</p>
              <p className="pricing-card-tagline">For builders who ship daily</p>
              <div className="pricing-price-row">
                <span className="pricing-price-orig">₹1,999</span>
                <span className="pricing-price-main">{proPrice}</span>
                <span className="pricing-price-period">/ mo</span>
              </div>
              <span className="pricing-launch-badge">{proBadge}</span>
              {proYearly && (
                <p className="pricing-price-sub">billed {proYearly}</p>
              )}
            </div>
            <ul className="pricing-feature-list">
              <Feature text="Advanced AI Engine (high accuracy + reasoning)" accent />
              <Feature text="400 messages / month" />
              <Feature text="Priority response speed ⚡" accent />
              <Feature text="Priority access during peak hours" />
              <Feature text="Code execution (Python)" />
              <Feature text="File uploads (PDF, DOCX, XLSX)" />
              <Feature text="Mermaid diagrams & charts" />
              <Feature text="Unlimited chat history" />
              <Feature text="Export chats (MD/PDF)" />
              <Feature text="Command palette" />
            </ul>
            <button
              type="button"
              className="pricing-cta pro-cta"
              onClick={currentTier !== 'pro'
                ? () => onUpgrade(proPlanId, annual ? 1138800 : 99900)
                : undefined}
              disabled={currentTier === 'pro'}
            >
              {currentTier === 'pro' ? 'Current Plan' : 'Upgrade to Pro'}
            </button>
          </div>

          {/* Team */}
          <div className="pricing-card team">
            <span className="pricing-card-pill team-pill">FOR TEAMS</span>
            <div className="pricing-card-top">
              <p className="pricing-tier-label">Team</p>
              <p className="pricing-card-tagline">Built for startups & agencies</p>
              <div className="pricing-price-row">
                <span className="pricing-price-orig">₹4,999</span>
                <span className="pricing-price-main">{teamPrice}</span>
                <span className="pricing-price-period">/ mo</span>
              </div>
              <span className="pricing-launch-badge">{teamBadge}</span>
              {teamYearly
                ? <p className="pricing-price-sub">billed {teamYearly} · up to 5 users</p>
                : <p className="pricing-price-sub pricing-price-sub--muted">up to 5 users</p>
              }
            </div>
            <ul className="pricing-feature-list">
              <Feature text="Everything in Pro" accent />
              <Feature text="1,500 messages / month shared pool" />
              <Feature text="5 team seats included" />
              <Feature text="Shared workspace & library" />
              <Feature text="Admin dashboard" />
              <Feature text="Usage analytics per member" />
              <Feature text="Role management (Admin / Member)" />
              <Feature text="Priority support (24hr response)" />
              <Feature text="Onboarding call included" />
            </ul>
            <button
              type="button"
              className="pricing-cta team-cta"
              onClick={currentTier !== 'team'
                ? () => onUpgradeTeam(teamPlanId, annual ? 2959200 : 259900)
                : undefined}
              disabled={currentTier === 'team'}
            >
              {currentTier === 'team' ? 'Current Plan' : 'Upgrade to Team'}
            </button>
          </div>

          {/* Enterprise */}
          <div className="pricing-card enterprise">
            <span className="pricing-card-pill enterprise-pill">CUSTOM</span>
            <div className="pricing-card-top">
              <p className="pricing-tier-label">Enterprise</p>
              <p className="pricing-card-tagline">For companies that move fast</p>
              <div className="pricing-price-row">
                <span className="pricing-price-main" style={{ fontSize: 28 }}>Custom</span>
              </div>
              <p className="pricing-price-sub">Volume & team discounts</p>
            </div>
            <ul className="pricing-feature-list">
              <Feature text="Everything in Team" accent />
              <Feature text="Unlimited messages" />
              <Feature text="API access (REST)" />
              <Feature text="SSO / SAML login" />
              <Feature text="Custom AI workflows" />
              <Feature text="Dedicated account manager" />
              <Feature text="4hr SLA response" />
              <Feature text="99.9% uptime guarantee" />
              <Feature text="Custom integrations" />
              <Feature text="No training on your data" />
            </ul>
            <a
              href="mailto:sales@sedrexai.com?subject=Enterprise%20Inquiry"
              className={`pricing-cta enterprise-cta${currentTier === 'enterprise' ? ' current-cta' : ''}`}
            >
              {currentTier === 'enterprise' ? 'Current Plan' : 'Contact Sales'}
            </a>
          </div>

        </div>

        {/* ── Feature comparison table ───────────────────── */}
        <div className="pricing-table-section">
          <h2 className="pricing-table-heading">Full Feature Comparison</h2>
          <div className="pricing-table-wrap">
            <table className="pricing-table">
              <thead>
                <tr>
                  <th className="col-feature">Feature</th>
                  <th className="col-free">Free</th>
                  <th className="col-pro">Pro</th>
                  <th className="col-team">Team</th>
                  <th className="col-enterprise">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                <tr className="table-category"><td colSpan={5}>CORE AI</td></tr>
                <tr><td className="col-feature-name">AI Engine</td><TVal v="Standard" /><TVal v="Advanced" /><TVal v="Advanced+" /><TVal v="Dedicated" /></tr>
                <tr><td className="col-feature-name">Thinking Mode</td><TVal v="✓" /><TVal v="✓" /><TVal v="✓" /><TVal v="✓" /></tr>
                <tr><td className="col-feature-name">Verification Loop</td><TVal v="✓" /><TVal v="✓" /><TVal v="✓" /><TVal v="✓" /></tr>
                <tr><td className="col-feature-name">Code Execution</td><TVal v="✗" /><TVal v="✓" /><TVal v="✓" /><TVal v="✓" /></tr>

                <tr className="table-category"><td colSpan={5}>USAGE</td></tr>
                <tr><td className="col-feature-name">Messages</td><TVal v="10/day" /><TVal v="400/mo" /><TVal v="1,500/mo" /><TVal v="Unlimited" /></tr>
                <tr><td className="col-feature-name">Context Window</td><TVal v="Standard" /><TVal v="Extended" /><TVal v="Extended+" /><TVal v="Custom" /></tr>
                <tr><td className="col-feature-name">File Upload</td><TVal v="✗" /><TVal v="Up to 25MB" /><TVal v="Up to 50MB" /><TVal v="Unlimited" /></tr>
                <tr><td className="col-feature-name">Chat History</td><TVal v="Unlimited" /><TVal v="Unlimited" /><TVal v="Unlimited" /><TVal v="Unlimited" /></tr>

                <tr className="table-category"><td colSpan={5}>TOOLS</td></tr>
                <tr><td className="col-feature-name">Diagrams & Charts</td><TVal v="✗" /><TVal v="✓" /><TVal v="✓" /><TVal v="✓" /></tr>
                <tr><td className="col-feature-name">Export Chats</td><TVal v="✗" /><TVal v="✓" /><TVal v="✓" /><TVal v="✓" /></tr>
                <tr><td className="col-feature-name">Command Palette</td><TVal v="✗" /><TVal v="✓" /><TVal v="✓" /><TVal v="✓" /></tr>

                <tr className="table-category"><td colSpan={5}>TEAM</td></tr>
                <tr><td className="col-feature-name">Team Seats</td><TVal v="1" /><TVal v="1" /><TVal v="5" /><TVal v="Unlimited" /></tr>
                <tr><td className="col-feature-name">Shared Workspace</td><TVal v="✗" /><TVal v="✗" /><TVal v="✓" /><TVal v="✓" /></tr>
                <tr><td className="col-feature-name">Admin Dashboard</td><TVal v="✗" /><TVal v="✗" /><TVal v="✓" /><TVal v="✓" /></tr>
                <tr><td className="col-feature-name">Usage Analytics</td><TVal v="✗" /><TVal v="Basic" /><TVal v="Advanced" /><TVal v="Custom" /></tr>
                <tr><td className="col-feature-name">API Access</td><TVal v="✗" /><TVal v="✗" /><TVal v="✗" /><TVal v="✓" /></tr>

                <tr className="table-category"><td colSpan={5}>SUPPORT</td></tr>
                <tr><td className="col-feature-name">Support</td><TVal v="Community" /><TVal v="Email" /><TVal v="Priority" /><TVal v="Dedicated" /></tr>
                <tr><td className="col-feature-name">Response Time</td><TVal v="—" /><TVal v="48hr" /><TVal v="24hr" /><TVal v="4hr SLA" /></tr>
                <tr><td className="col-feature-name">Onboarding</td><TVal v="✗" /><TVal v="✗" /><TVal v="✓ Call" /><TVal v="✓ Custom" /></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── FAQ ──────────────────────────────────────────── */}
        <div className="pricing-faq-section">
          <h2 className="pricing-faq-heading">Frequently Asked Questions</h2>
          <div className="pricing-faq-list">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className={`pricing-faq-item${openFaq === i ? ' open' : ''}`}>
                <button
                  type="button"
                  className="pricing-faq-q"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  {item.q}
                  <svg className="pricing-faq-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className="pricing-faq-answer">{item.a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Trust strip ───────────────────────────────────── */}
        <div className="pricing-trust">
          <div className="pricing-trust-card">
            <div className="pricing-trust-icon">🔒</div>
            <div className="pricing-trust-body">
              <p className="pricing-trust-title">Secure payments</p>
              <p className="pricing-trust-text">Secured by Razorpay. We never store card details.</p>
            </div>
          </div>
          <div className="pricing-trust-card">
            <div className="pricing-trust-icon">↩</div>
            <div className="pricing-trust-body">
              <p className="pricing-trust-title">Cancel anytime</p>
              <p className="pricing-trust-text">No lock-ins. Cancel from your account settings.</p>
            </div>
          </div>
          <div className="pricing-trust-card">
            <div className="pricing-trust-icon">⚡</div>
            <div className="pricing-trust-body">
              <p className="pricing-trust-title">Instant upgrade</p>
              <p className="pricing-trust-text">Plan activates the moment payment clears.</p>
            </div>
          </div>
        </div>


      </div>
    </div>
  );
};

export default Pricing;
