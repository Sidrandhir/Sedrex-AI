// supabase/functions/create-checkout-session/index.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Stripe Checkout Session Creator
//
// Called by the frontend when a user clicks "Upgrade to Pro".
// Creates a Stripe Checkout Session and returns the redirect URL.
//
// ENV VARS required in Supabase dashboard:
//   STRIPE_SECRET_KEY   — sk_live_... or sk_test_...
//   APP_URL             — https://your-sedrex-domain.com
//   SUPABASE_URL        — set automatically by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — set automatically by Supabase
// ══════════════════════════════════════════════════════════════════

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not configured');

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

    // Parse request body
    const { userId, email, priceId, tier = 'pro' } = await req.json();

    if (!userId || !email || !priceId) {
      return new Response(
        JSON.stringify({ error: 'userId, email and priceId are required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:3000';

    // Look up or create a Stripe Customer so cards are saved for future use
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Retrieve existing Stripe customer ID from profiles table (if any)
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    let customerId: string | undefined = profile?.stripe_customer_id ?? undefined;

    if (!customerId) {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;

      // Save the Stripe customer ID to the profiles table
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    // Create the Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode:            'subscription',
      customer:        customerId,
      line_items:      [{ price: priceId, quantity: 1 }],
      success_url:     `${appUrl}/?billing=success`,
      cancel_url:      `${appUrl}/?billing=cancelled`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { supabase_user_id: userId, tier },
      },
      metadata: { supabase_user_id: userId, tier },
    });

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );

  } catch (err: any) {
    console.error('[create-checkout-session] Error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message ?? 'Internal server error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
