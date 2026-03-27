// supabase/functions/create-portal-session/index.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Stripe Customer Portal Session
//
// Lets Pro users manage their subscription (cancel, update card, etc.)
// without ever leaving Sedrex — Stripe hosts the management UI.
//
// ENV VARS required:
//   STRIPE_SECRET_KEY        — sk_live_...
//   APP_URL                  — https://your-sedrex-domain.com
//   SUPABASE_URL / SERVICE_ROLE_KEY — auto-set by Supabase
// ══════════════════════════════════════════════════════════════════

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not configured');

    const stripe   = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { userId } = await req.json();
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // Get Stripe customer ID from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (!profile?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'No Stripe customer found for this user' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:3000';

    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   profile.stripe_customer_id,
      return_url: `${appUrl}/?billing=portal_return`,
    });

    return new Response(
      JSON.stringify({ url: portalSession.url }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );

  } catch (err: any) {
    console.error('[create-portal-session] Error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
