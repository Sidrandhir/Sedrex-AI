// components/InstallPrompt.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — PWA Install Prompt + SW Update Banner
//
// Two exports:
//   <InstallBanner />   — "Add to Home Screen" banner (bottom)
//   <UpdateBanner />    — "New version available" banner (top)
//
// InstallBanner appears after 60 seconds of use if:
//   - beforeinstallprompt fired (Android/Chrome desktop)
//   - App is NOT already running in standalone mode
//   - User hasn't dismissed it in this session
//
// UpdateBanner appears when a new service worker is waiting.
// ══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import './InstallPrompt.css';
import { pwaInstallPromptShown, pwaInstallAccepted, pwaInstallDismissed, pwaUpdated } from '../services/posthogService';

// ── Types ──────────────────────────────────────────────────────────
interface BeforeInstallPromptEvent extends Event {
  prompt:           () => Promise<void>;
  userChoice:       Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// ── Shared state ───────────────────────────────────────────────────
let _deferredPrompt: BeforeInstallPromptEvent | null = null;

// ══════════════════════════════════════════════════════════════════
// 1. INSTALL BANNER
// ══════════════════════════════════════════════════════════════════
export const InstallBanner: React.FC = () => {
  const [show,      setShow]      = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((window.navigator as Navigator & { standalone?: boolean }).standalone) return;

    // Capture the deferred prompt
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      _deferredPrompt = e as BeforeInstallPromptEvent;
      // Show the banner after a short delay (don't interrupt first use)
      setTimeout(() => { setShow(true); pwaInstallPromptShown(); }, 60_000);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // Detect when user installs from browser menu
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setShow(false);
      _deferredPrompt = null;
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!_deferredPrompt) return;
    setInstalling(true);
    try {
      await _deferredPrompt.prompt();
      const { outcome } = await _deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        pwaInstallAccepted();
        setInstalled(true);
        setShow(false);
      } else {
        pwaInstallDismissed();
      }
    } finally {
      _deferredPrompt = null;
      setInstalling(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    pwaInstallDismissed();
    setShow(false);
    sessionStorage.setItem('pwa-install-dismissed', '1');
  }, []);

  if (!show || installed || sessionStorage.getItem('pwa-install-dismissed')) return null;

  return (
    <div className="install-banner" role="banner" aria-label="Install Sedrex app">
      <div className="install-banner-icon">
        <svg viewBox="0 0 32 32" fill="none" className="install-banner-logo">
          <path d="M21 9.5H13C11.07 9.5 9.5 11.07 9.5 13V14.2C9.5 16.13 11.07 17.7 13 17.7H19C20.93 17.7 22.5 19.27 22.5 21.2V22C22.5 23.93 20.93 25.5 19 25.5H9.5"
            stroke="#10B981" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      <div className="install-banner-text">
        <p className="install-banner-title">Add Sedrex to home screen</p>
        <p className="install-banner-sub">Instant access, works offline</p>
      </div>

      <div className="install-banner-actions">
        <button
          type="button"
          className="install-banner-btn install"
          onClick={handleInstall}
          disabled={installing}
        >
          {installing ? (
            <svg className="install-spinner" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 1.5A6.5 6.5 0 118 14.5" strokeLinecap="round"/>
            </svg>
          ) : 'Install'}
        </button>
        <button
          type="button"
          className="install-banner-btn dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// 2. UPDATE BANNER
// ══════════════════════════════════════════════════════════════════
export const UpdateBanner: React.FC = () => {
  const [show, setShow] = useState(false);
  const [reg,  setReg]  = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<ServiceWorkerRegistration>;
      setReg(customEvent.detail);
      setShow(true);
    };
    window.addEventListener('sw-update-ready', onUpdate);
    return () => window.removeEventListener('sw-update-ready', onUpdate);
  }, []);

  const handleUpdate = useCallback(() => {
    if (!reg?.waiting) return;
    pwaUpdated();
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    setShow(false);
  }, [reg]);

  if (!show) return null;

  return (
    <div className="update-banner" role="alert" aria-live="polite">
      <span className="update-banner-dot" />
      <p className="update-banner-text">New version available</p>
      <button type="button" className="update-banner-btn" onClick={handleUpdate}>
        Reload
      </button>
      <button
        type="button"
        className="update-banner-close"
        onClick={() => setShow(false)}
        aria-label="Dismiss update notification"
      >
        ✕
      </button>
    </div>
  );
};

// ── Hook: shortcut launch action ───────────────────────────────────
// Call this in App.tsx to handle PWA shortcut deep links
export function usePWALaunchAction(
  handlers: Record<string, () => void>
) {
  useEffect(() => {
    const action = sessionStorage.getItem('pwa-launch-action');
    if (action && handlers[action]) {
      sessionStorage.removeItem('pwa-launch-action');
      // Small delay so the app is fully mounted
      setTimeout(handlers[action], 300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
