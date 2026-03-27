// services/billingService.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Billing Service (Frontend)
//
// Calls the Supabase Edge Functions for Stripe operations.
// All API keys stay server-side — this file never touches them.
// ══════════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient';
import { TIER_CONFIG, TierId } from './tierConfig';

// ── Base URL for Edge Functions ───────────────────────────────────
function edgeFunctionUrl(name: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL ?? '';
  return `${base}/functions/v1/${name}`;
}

// ── Auth header from current session ─────────────────────────────
async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase!.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

// ── Create Stripe Checkout Session ────────────────────────────────
/**
 * Redirects the user to Stripe Checkout to subscribe.
 * @param userId  Supabase user UUID
 * @param email   User's email (pre-fills Stripe form)
 * @param tier    'pro' | 'enterprise'
 */
export async function startCheckout(
  userId: string,
  email:  string,
  tier:   TierId = 'pro',
): Promise<void> {
  const cfg = TIER_CONFIG[tier];
  if (!cfg.stripePriceId || cfg.stripePriceId.startsWith('price_FILL')) {
    throw new Error(
      `Stripe price ID for "${tier}" tier is not configured yet. ` +
      'Set stripePriceId in services/tierConfig.ts.',
    );
  }

  const headers = await getAuthHeader();
  const res = await fetch(edgeFunctionUrl('create-checkout-session'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body:    JSON.stringify({ userId, email, priceId: cfg.stripePriceId, tier }),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error ?? 'Failed to create checkout session');
  }

  // Hard redirect to Stripe Checkout
  if (json.url) {
    window.location.href = json.url;
  }
}

// ── Open Stripe Customer Portal (manage / cancel) ─────────────────
/**
 * Redirects the user to Stripe's self-service billing portal.
 * They can cancel, update payment method, download invoices.
 */
export async function openBillingPortal(userId: string): Promise<void> {
  const headers = await getAuthHeader();
  const res = await fetch(edgeFunctionUrl('create-portal-session'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body:    JSON.stringify({ userId }),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error ?? 'Failed to open billing portal');
  }

  if (json.url) {
    window.location.href = json.url;
  }
}

// ── Handle post-checkout URL params ──────────────────────────────
/**
 * Call this on app mount to detect Stripe redirect return.
 * Returns: 'success' | 'cancelled' | 'portal_return' | null
 */
export function detectCheckoutReturn(): 'success' | 'cancelled' | 'portal_return' | null {
  const params = new URLSearchParams(window.location.search);
  const billing = params.get('billing');
  if (billing === 'success' || billing === 'cancelled' || billing === 'portal_return') {
    // Clean the URL so the param doesn't persist on refresh
    const clean = window.location.pathname;
    window.history.replaceState({}, '', clean);
    return billing as 'success' | 'cancelled' | 'portal_return';
  }
  return null;
}
