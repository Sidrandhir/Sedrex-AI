// supabase/functions/stripe-webhook/index.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Stripe Webhook Handler
//
// Receives events from Stripe and updates the DB accordingly.
// Register this URL in Stripe dashboard:
//   https://<your-project>.supabase.co/functions/v1/stripe-webhook
//
// ENV VARS required:
//   STRIPE_SECRET_KEY        — sk_live_...
//   STRIPE_WEBHOOK_SECRET    — whsec_... (from Stripe dashboard > Webhooks)
//   SUPABASE_URL             — auto-set by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-set by Supabase
//
// Events handled:
//   checkout.session.completed    → upgrade user to paid tier
//   customer.subscription.updated → reflect plan change / renewal
//   customer.subscription.deleted → downgrade user to free
//   invoice.paid                  → record in billing_history
//   invoice.payment_failed        → flag payment issue
// ══════════════════════════════════════════════════════════════════

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Helper: get Supabase user ID from Stripe metadata ─────────────
function getUserId(obj: { metadata?: Record<string, string> | null }): string | null {
  return obj.metadata?.supabase_user_id ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const stripeKey     = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!stripeKey || !webhookSecret) {
    return new Response('Stripe not configured', { status: 500 });
  }

  const stripe   = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Verify Stripe signature
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }

  console.log(`[stripe-webhook] Received: ${event.type}`);

  try {
    switch (event.type) {

      // ── User completes checkout → upgrade tier ─────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId  = getUserId(session);
        if (!userId) break;

        const tier = session.metadata?.tier ?? 'pro';
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id ?? null;

        // Retrieve subscription to get period end
        let periodEnd: string | null = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        }

        await supabase.from('profiles').update({ tier }).eq('id', userId);
        await supabase.from('user_stats').update({
          tier,
          subscription_status:  'active',
          current_period_end:   periodEnd,
          stripe_subscription_id: subscriptionId,
        }).eq('user_id', userId);

        console.log(`[stripe-webhook] Upgraded user ${userId} → ${tier}`);
        break;
      }

      // ── Subscription renewed or plan changed ──────────────────
      case 'customer.subscription.updated': {
        const sub    = event.data.object as Stripe.Subscription;
        const userId = getUserId(sub);
        if (!userId) break;

        const tier    = sub.metadata?.tier ?? 'pro';
        const status  = sub.status;  // active | past_due | canceled | etc.
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

        const effectiveTier = status === 'active' || status === 'trialing' ? tier : 'free';

        await supabase.from('profiles').update({ tier: effectiveTier }).eq('id', userId);
        await supabase.from('user_stats').update({
          tier:                effectiveTier,
          subscription_status: status,
          current_period_end:  periodEnd,
        }).eq('user_id', userId);
        break;
      }

      // ── Subscription cancelled → downgrade to free ────────────
      case 'customer.subscription.deleted': {
        const sub    = event.data.object as Stripe.Subscription;
        const userId = getUserId(sub);
        if (!userId) break;

        await supabase.from('profiles').update({ tier: 'free' }).eq('id', userId);
        await supabase.from('user_stats').update({
          tier:                 'free',
          subscription_status:  'cancelled',
          current_period_end:   null,
          stripe_subscription_id: null,
        }).eq('user_id', userId);

        console.log(`[stripe-webhook] Downgraded user ${userId} → free`);
        break;
      }

      // ── Payment success → record in billing_history ───────────
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const userId  = getUserId(
          typeof invoice.subscription === 'string'
            ? await stripe.subscriptions.retrieve(invoice.subscription)
            : (invoice.subscription ?? { metadata: null }),
        );
        if (!userId || !invoice.amount_paid) break;

        // Append to billing_history array in user_stats
        const { data: statsRow } = await supabase
          .from('user_stats')
          .select('billing_history')
          .eq('user_id', userId)
          .single();

        const history = Array.isArray(statsRow?.billing_history) ? statsRow.billing_history : [];
        history.unshift({
          id:     invoice.id,
          date:   new Date(invoice.created * 1000).toISOString(),
          amount: invoice.amount_paid,   // in cents
          status: 'paid',
          pdf:    invoice.invoice_pdf,
        });

        await supabase.from('user_stats')
          .update({ billing_history: history.slice(0, 50) }) // keep last 50
          .eq('user_id', userId);
        break;
      }

      // ── Payment failed ─────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn(`[stripe-webhook] Payment failed for invoice ${invoice.id}`);
        // Optionally: update subscription_status to 'past_due' in user_stats
        break;
      }

      default:
        // Unhandled event type — log and ignore
        console.log(`[stripe-webhook] Unhandled event: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[stripe-webhook] Handler error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
