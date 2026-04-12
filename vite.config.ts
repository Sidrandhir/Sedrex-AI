import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    // ── Resolve Gemini API key (supports both naming conventions) ──
    const geminiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || env.API_KEY || '';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // ── Gemini / AI Keys ────────────────────────────────────────
        'process.env.API_KEY':              JSON.stringify(geminiKey),
        'process.env.GEMINI_API_KEY':       JSON.stringify(geminiKey),
        'process.env.VITE_SUPABASE_URL':    JSON.stringify(env.VITE_SUPABASE_URL    || env.SUPABASE_URL    || ''),
        'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ''),

        // ── SEDREX Engine — reads .env first, then sensible fallback ─
        //
        // IMPORTANT: These fallback values are for LOCAL DEV ONLY.
        // In production, set all SEDREX_* vars in your .env / hosting dashboard.
        //
        'process.env.SEDREX_MAX_CONCURRENT_REQUESTS': JSON.stringify(
          env.SEDREX_MAX_CONCURRENT_REQUESTS || '25'
        ),
        'process.env.SEDREX_MAX_QUEUED_REQUESTS': JSON.stringify(
          env.SEDREX_MAX_QUEUED_REQUESTS || '1000'
        ),
        'process.env.SEDREX_RATE_WINDOW_MS': JSON.stringify(
          env.SEDREX_RATE_WINDOW_MS || '60000'
        ),
        'process.env.SEDREX_RATE_MAX_PER_WINDOW': JSON.stringify(
          env.SEDREX_RATE_MAX_PER_WINDOW || '120'
        ),
        'process.env.SEDREX_API_KEY_COOLDOWN_MS': JSON.stringify(
          env.SEDREX_API_KEY_COOLDOWN_MS || '30000'
        ),
        'process.env.SEDREX_CIRCUIT_FAIL_THRESHOLD': JSON.stringify(
          env.SEDREX_CIRCUIT_FAIL_THRESHOLD || '25'
        ),
        'process.env.SEDREX_CIRCUIT_FAIL_WINDOW_MS': JSON.stringify(
          env.SEDREX_CIRCUIT_FAIL_WINDOW_MS || '30000'
        ),
        'process.env.SEDREX_CIRCUIT_OPEN_MS': JSON.stringify(
          env.SEDREX_CIRCUIT_OPEN_MS || '10000'
        ),
        // ── Cache TTL ─────────────────────────────────────────────
        // Set to 0 in dev (no stale responses).
        // Set to 30000-60000 in production for performance.
        // Your .env controls this — fallback is 0 (safe for dev).
        'process.env.SEDREX_RESPONSE_CACHE_TTL_MS': JSON.stringify(
          env.SEDREX_RESPONSE_CACHE_TTL_MS || '0'
        ),

        // ── Razorpay (public key — safe in browser) ───────────────
        'import.meta.env.VITE_RAZORPAY_KEY_ID': JSON.stringify(
          env.VITE_RAZORPAY_KEY_ID || ''
        ),

        // ── API Key Pool (multi-key rotation) ─────────────────────
        'process.env.GEMINI_KEY_1': JSON.stringify(env.GEMINI_KEY_1 || geminiKey),
        'process.env.GEMINI_KEY_2': JSON.stringify(env.GEMINI_KEY_2 || ''),
        'process.env.GEMINI_KEY_3': JSON.stringify(env.GEMINI_KEY_3 || ''),
        'process.env.GEMINI_KEY_4': JSON.stringify(env.GEMINI_KEY_4 || ''),
        'process.env.GEMINI_KEY_5': JSON.stringify(env.GEMINI_KEY_5 || ''),
        'process.env.GEMINI_KEY_6': JSON.stringify(env.GEMINI_KEY_6 || ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
      },
      build: {
        target:               'esnext',  // modern browsers — smaller output, no legacy polyfills
        sourcemap:            false,      // no source maps in prod → smaller deploy
        cssCodeSplit:         true,       // per-route CSS chunks
        reportCompressedSize: false,      // skip gzip size reporting → faster builds
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
          output: {
            manualChunks(id) {
              // React core — always needed first
              if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
              // Supabase — auth/db, loaded early but not in the critical path
              if (id.includes('node_modules/@supabase')) return 'vendor-supabase';
              // Markdown rendering — needed for chat, but separate from react
              if (id.includes('node_modules/react-markdown') || id.includes('node_modules/remark')) return 'vendor-markdown';
              // Recharts — lazy-loaded via ChartRenderer, Rollup will auto-chunk it;
              // explicit entry here ensures it never bleeds into vendor-react
              if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'vendor-charts';
              // PostHog — analytics, non-critical
              if (id.includes('node_modules/posthog-js')) return 'vendor-posthog';
              // Stripe — only on billing/pricing pages
              if (id.includes('node_modules/@stripe')) return 'vendor-stripe';
              // highlight.js — code syntax, lazy enough as is
              if (id.includes('node_modules/highlight.js')) return 'vendor-hljs';
            },
          },
        },
      },
    };
});