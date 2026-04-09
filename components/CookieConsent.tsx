// components/CookieConsent.tsx
// GDPR/cookie consent banner — appears once, stores preference in localStorage.
// Conditionally enables PostHog analytics only on explicit accept.

import React, { useState, useEffect } from 'react';
import { posthog } from '../services/posthogService';

const CONSENT_KEY = 'sedrex_cookie_consent';

export default function CookieConsent(): React.ReactElement | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      // No preference yet — opt out by default until user explicitly accepts
      try { posthog.opt_out_capturing(); } catch { /* posthog not ready */ }
      setVisible(true);
    } else if (stored === 'rejected') {
      try { posthog.opt_out_capturing(); } catch { /* posthog not ready */ }
    }
    // 'accepted' → service already opted in at init, nothing to do
  }, []);

  function accept(): void {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    try { posthog.opt_in_capturing(); } catch { /* never crash */ }
    setVisible(false);
  }

  function reject(): void {
    localStorage.setItem(CONSENT_KEY, 'rejected');
    try { posthog.opt_out_capturing(); } catch { /* never crash */ }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-modal="false"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: '12px 16px',
        background: 'rgba(13,13,13,0.97)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap',
        boxShadow: '0 -4px 32px rgba(0,0,0,0.4)',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: '0.8125rem',
          lineHeight: 1.5,
          color: '#a1a1aa',
          flex: '1 1 260px',
          minWidth: 0,
        }}
      >
        We use analytics to improve Sedrex AI.{' '}
        <a
          href="/privacy"
          style={{ color: '#10B981', textDecoration: 'underline', textUnderlineOffset: '2px' }}
        >
          Privacy Policy
        </a>
      </p>

      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={reject}
          style={{
            padding: '7px 16px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent',
            color: '#a1a1aa',
            fontSize: '0.8125rem',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s, color 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.25)';
            (e.currentTarget as HTMLButtonElement).style.color = '#d4d4d8';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)';
            (e.currentTarget as HTMLButtonElement).style.color = '#a1a1aa';
          }}
        >
          Reject Non-Essential
        </button>

        <button
          onClick={accept}
          style={{
            padding: '7px 16px',
            borderRadius: '8px',
            border: '1px solid #10B981',
            background: '#10B981',
            color: '#000',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background 0.15s, border-color 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#0ea471';
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#0ea471';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#10B981';
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#10B981';
          }}
        >
          Accept All
        </button>
      </div>
    </div>
  );
}
