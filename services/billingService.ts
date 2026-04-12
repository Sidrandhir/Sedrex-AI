// services/billingService.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Billing Service (Razorpay)
//
// Razorpay modal-based checkout — no server redirect needed.
// Razorpay script is loaded dynamically on first checkout call.
// API key (VITE_RAZORPAY_KEY_ID) is the public key_id — safe in browser.
// ══════════════════════════════════════════════════════════════════

import { TIER_CONFIG, TierId } from './tierConfig';

// ── Razorpay type shim ────────────────────────────────────────────

interface RazorpayOptions {
  key:          string;
  amount:       number;
  currency:     string;
  name:         string;
  description:  string;
  plan_id:      string;
  prefill:      { name: string; email: string };
  theme:        { color: string };
  handler:      (response: RazorpayPaymentResponse) => void;
  modal:        { ondismiss: () => void };
}

interface RazorpayPaymentResponse {
  razorpay_payment_id:    string;
  razorpay_subscription_id?: string;
  razorpay_signature?:    string;
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open: () => void };
  }
}

// ── Load Razorpay script on demand ────────────────────────────────

function loadRazorpayScript(): Promise<void> {
  if (typeof window.Razorpay !== 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload  = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay. Check your internet connection.'));
    document.head.appendChild(script);
  });
}

// ── Create Razorpay Checkout ──────────────────────────────────────
/**
 * Opens the Razorpay payment modal for a subscription plan.
 * @param userId    Supabase user UUID (for future webhook correlation)
 * @param email     User's email — pre-fills the Razorpay form
 * @param name      User's display name — pre-fills the Razorpay form
 * @param tier      'pro' | 'team'
 * @param onSuccess Called with the tier after successful payment
 * @param onFailure Called with an error message if payment fails
 */
export async function startCheckout(
  _userId:         string,
  email:           string,
  name:            string,
  tier:            TierId = 'pro',
  onSuccess:       (tier: TierId) => void,
  onFailure:       (message: string) => void,
  planIdOverride?: string,
  amountOverride?: number,
): Promise<void> {
  const cfg    = TIER_CONFIG[tier];
  const planId = planIdOverride || cfg.planId;

  if (!planId) {
    throw new Error(`Razorpay plan ID for "${tier}" tier is not configured.`);
  }

  const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined;
  if (!keyId || keyId.startsWith('rzp_test_FILL')) {
    throw new Error('Razorpay key ID is not configured. Set VITE_RAZORPAY_KEY_ID in your .env file.');
  }

  await loadRazorpayScript();

  const options: RazorpayOptions = {
    key:         keyId,
    amount:      amountOverride ?? (cfg.pricePaisa ?? 0),
    currency:    'INR',
    name:        'Sedrex AI',
    description: cfg.name,
    plan_id:     planId,
    prefill:     { name: name || email, email },
    theme:       { color: '#10B981' },
    handler: (_response: RazorpayPaymentResponse) => {
      onSuccess(tier);
    },
    modal: {
      ondismiss: () => { /* user closed modal — no action needed */ },
    },
  };

  new window.Razorpay(options).open();
}

// ── Billing portal (no Razorpay equivalent) ───────────────────────
/**
 * Razorpay has no self-service billing portal.
 * Rejects with a support contact message — caller should show as toast.
 */
export function openBillingPortal(_userId: string): Promise<void> {
  return Promise.reject(
    new Error('To manage or cancel your subscription, email support@sedrex.ai'),
  );
}
