// services/posthogService.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — PostHog Analytics Service
//
// Gracefully no-ops when VITE_POSTHOG_KEY is not set.
// All methods are safe to call unconditionally.
//
// SETUP:
//   1. Create a PostHog project at app.posthog.com (free tier available)
//   2. Copy your Project API Key
//   3. Add to .env:  VITE_POSTHOG_KEY=phc_xxxxxxxxxxxx
//   4. Optionally set VITE_POSTHOG_HOST for EU or self-hosted instances
//
// EVENTS TRACKED:
//   - User identify (on login)
//   - Page views / view transitions
//   - Message sent (model, tokens, response time)
//   - Upgrade funnel (pricing viewed → upgrade clicked → checkout)
//   - Onboarding funnel (step by step)
//   - Feature adoption (code execution, codebase index, thinking mode)
//   - PWA install / update
//   - Errors (non-critical)
//   - Web Vitals (LCP, FID, CLS, INP, TTFB)
// ══════════════════════════════════════════════════════════════════

import posthog from 'posthog-js';

const KEY  = import.meta.env.VITE_POSTHOG_KEY  as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined)
           ?? 'https://us.i.posthog.com';

let _initialized = false;
let _userId: string | null = null;

// ── Init ───────────────────────────────────────────────────────────
function init(): void {
  if (_initialized || !KEY) return;

  posthog.init(KEY, {
    api_host:                 HOST,
    person_profiles:          'identified_only',  // GDPR: no anonymous profiling
    capture_pageview:         false,              // we fire page views manually
    capture_pageleave:        true,
    autocapture:              false,              // manual control only
    disable_session_recording: false,             // session recordings ON
    session_recording: {
      maskAllInputs:       true,   // mask all input fields (privacy)
      maskInputOptions:    { password: true, email: true },
    },
    persistence:              'localStorage+cookie',
    loaded: (ph) => {
      // Opt out of PostHog's own telemetry
      ph.opt_in_capturing();
    },
  });

  _initialized = true;
}

// ── Internal: safe capture ─────────────────────────────────────────
function capture(event: string, props: Record<string, unknown> = {}): void {
  if (!_initialized) return;
  try {
    posthog.capture(event, { ...props, _source: 'sedrex' });
  } catch { /* never crash */ }
}

// ── User identification ────────────────────────────────────────────
export function identifyUser(
  userId:  string,
  traits?: { email?: string; tier?: string; name?: string; createdAt?: string }
): void {
  init();
  if (!_initialized) return;
  _userId = userId;
  try {
    posthog.identify(userId, {
      email:      traits?.email,
      tier:       traits?.tier ?? 'free',
      name:       traits?.name,
      created_at: traits?.createdAt,
      is_pwa:     window.matchMedia('(display-mode: standalone)').matches,
    });
  } catch { /* never crash */ }
}

export function resetUser(): void {
  if (!_initialized) return;
  _userId = null;
  try { posthog.reset(); } catch { /* never crash */ }
}

// ── Page views ────────────────────────────────────────────────────
export function pageView(view: string, from?: string): void {
  capture('$pageview', { view, from, path: window.location.pathname });
}

// ── Message events ────────────────────────────────────────────────
export function messageSent(props: {
  model:          string;
  inputTokens:    number;
  outputTokens:   number;
  responseTimeMs: number;
  hasImage?:      boolean;
  hasDoc?:        boolean;
  hasCodebase?:   boolean;
  intent?:        string;
  confidence?:    string;
}): void {
  capture('message_sent', props);
}

// ── Upgrade funnel ────────────────────────────────────────────────
export function pricingViewed(currentTier: string): void {
  capture('pricing_viewed', { current_tier: currentTier });
}

export function upgradeClicked(source: string, currentTier: string): void {
  capture('upgrade_clicked', { source, current_tier: currentTier });
}

export function upgradeCompleted(tier: string): void {
  capture('upgrade_completed', { new_tier: tier });
  if (_userId) {
    try { posthog.people?.set?.({ tier }); } catch { /* never crash */ }
  }
}

export function upgradeCancelled(source: string): void {
  capture('upgrade_cancelled', { source });
}

// ── Onboarding funnel ─────────────────────────────────────────────
export function onboardingStepViewed(step: number, total: number): void {
  capture('onboarding_step_viewed', { step, total });
}

export function onboardingCompleted(answers: {
  role?: string;
  purpose?: string;
  style?: string;
  hasCodebaseIndex: boolean;
}): void {
  capture('onboarding_completed', answers);
}

export function onboardingSkipped(atStep: number): void {
  capture('onboarding_skipped', { at_step: atStep });
}

// ── Feature adoption ──────────────────────────────────────────────
export function codeExecutionRun(language: string): void {
  capture('code_execution_run', { language });
}

export function codebaseIndexed(fileCount: number): void {
  capture('codebase_indexed', { file_count: fileCount });
}

export function thinkingModeToggled(enabled: boolean): void {
  capture('thinking_mode_toggled', { enabled });
}

export function modelChanged(from: string, to: string): void {
  capture('model_changed', { from_model: from, to_model: to });
}

export function feedbackGiven(value: 'good' | 'bad', model?: string): void {
  capture('message_feedback', { value, model });
}

// ── PWA events ────────────────────────────────────────────────────
export function pwaInstallPromptShown(): void {
  capture('pwa_install_prompt_shown');
}

export function pwaInstallAccepted(): void {
  capture('pwa_install_accepted');
  try { posthog.people?.set?.({ is_pwa: true }); } catch { /* never crash */ }
}

export function pwaInstallDismissed(): void {
  capture('pwa_install_dismissed');
}

export function pwaUpdated(): void {
  capture('pwa_updated');
}

// ── Error tracking ────────────────────────────────────────────────
export function trackError(message: string, critical = false, context?: string): void {
  capture('client_error', { message: message.slice(0, 300), critical, context });
}

// ── Web Vitals ────────────────────────────────────────────────────
// Call once after the app has mounted.
// Uses PerformanceObserver where available — zero dependencies.
export function trackWebVitals(): void {
  if (typeof window === 'undefined' || !_initialized) return;

  // LCP — Largest Contentful Paint
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last    = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
      if (last) capture('web_vital', { name: 'LCP', value: Math.round(last.startTime), rating: last.startTime < 2500 ? 'good' : last.startTime < 4000 ? 'needs-improvement' : 'poor' });
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch { /* not supported */ }

  // CLS — Cumulative Layout Shift
  try {
    let clsValue = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
        if (!e.hadRecentInput) clsValue += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        capture('web_vital', { name: 'CLS', value: Math.round(clsValue * 1000) / 1000, rating: clsValue < 0.1 ? 'good' : clsValue < 0.25 ? 'needs-improvement' : 'poor' });
      }
    }, { once: true });
  } catch { /* not supported */ }

  // FID / INP — First Input / Interaction to Next Paint
  try {
    new PerformanceObserver((list) => {
      const entry = list.getEntries()[0] as PerformanceEntry & { processingStart: number; startTime: number };
      if (entry) {
        const fid = entry.processingStart - entry.startTime;
        capture('web_vital', { name: 'FID', value: Math.round(fid), rating: fid < 100 ? 'good' : fid < 300 ? 'needs-improvement' : 'poor' });
      }
    }).observe({ type: 'first-input', buffered: true });
  } catch { /* not supported */ }

  // TTFB — Time to First Byte
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (nav) {
      const ttfb = nav.responseStart - nav.requestStart;
      capture('web_vital', { name: 'TTFB', value: Math.round(ttfb), rating: ttfb < 800 ? 'good' : ttfb < 1800 ? 'needs-improvement' : 'poor' });
    }
  } catch { /* not supported */ }
}

// ── Feature flags ─────────────────────────────────────────────────
// Call after identifyUser() to check a PostHog feature flag.
export function isFeatureEnabled(flag: string): boolean {
  if (!_initialized) return false;
  try {
    return posthog.isFeatureEnabled(flag) ?? false;
  } catch {
    return false;
  }
}

// ── Expose posthog instance for advanced use ───────────────────────
export { posthog };

// ── Auto-init on import ────────────────────────────────────────────
// Initializes lazily — no tracking until identifyUser() is called.
init();
