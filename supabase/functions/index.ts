// supabase/functions/enrich-session/index.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — IP Geolocation Edge Function
//
// Called when a session starts. Enriches the session row with
// IP address, country, city from the request headers.
//
// DEPLOY:
//   supabase functions deploy enrich-session
//
// Then call from analyticsService.ts after startSession():
//   await supabase.functions.invoke('enrich-session', {
//     body: { sessionId: _sessionId }
//   });
// ══════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { sessionId } = await req.json();
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'sessionId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Extract IP from Cloudflare/Supabase headers ──────────────
    const ip =
      req.headers.get('cf-connecting-ip')   ||
      req.headers.get('x-real-ip')          ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      null;

    // ── Geolocation from Cloudflare headers (free, no API key) ───
    // Cloudflare injects these automatically for Edge Functions.
    const country  = req.headers.get('cf-ipcountry') || null;
    const city     = req.headers.get('cf-ipcity')    || null;
    const timezone = req.headers.get('cf-timezone')  || null;
    const region   = req.headers.get('cf-region')    || null;

    // ── If Cloudflare headers missing, try ip-api.com (fallback) ─
    let finalCountry  = country;
    let finalCity     = city;
    let finalTimezone = timezone;

    if (!country && ip) {
      try {
        const geoRes = await fetch(
          `http://ip-api.com/json/${ip}?fields=country,city,timezone,regionName`,
          { signal: AbortSignal.timeout(2000) }
        );
        if (geoRes.ok) {
          const geo = await geoRes.json();
          if (geo.status === 'success') {
            finalCountry  = geo.country   || null;
            finalCity     = geo.city      || null;
            finalTimezone = geo.timezone  || null;
          }
        }
      } catch { /* geo lookup failed — non-fatal */ }
    }

    // ── Update session row ────────────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error } = await supabaseAdmin
      .from('user_sessions')
      .update({
        ip_address: ip,
        country:    finalCountry,
        city:       finalCity,
        timezone:   finalTimezone,
      })
      .eq('id', sessionId);

    if (error) throw error;

    // ── Also update profile with latest location ──────────────────
    // Get the user_id from the session
    const { data: sessionRow } = await supabaseAdmin
      .from('user_sessions')
      .select('user_id')
      .eq('id', sessionId)
      .single();

    if (sessionRow?.user_id) {
      await supabaseAdmin.from('profiles').update({
        country:  finalCountry,
        city:     finalCity,
        timezone: finalTimezone,
      }).eq('id', sessionRow.user_id);
    }

    return new Response(
      JSON.stringify({ success: true, country: finalCountry, city: finalCity }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});