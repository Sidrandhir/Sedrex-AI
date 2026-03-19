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
        // In production, set all NEXUS_* vars in your .env / hosting dashboard.
        //
        'process.env.NEXUS_MAX_CONCURRENT_REQUESTS': JSON.stringify(
          env.NEXUS_MAX_CONCURRENT_REQUESTS || '8'
        ),
        'process.env.NEXUS_MAX_QUEUED_REQUESTS': JSON.stringify(
          env.NEXUS_MAX_QUEUED_REQUESTS || '1000'
        ),
        'process.env.NEXUS_RATE_WINDOW_MS': JSON.stringify(
          env.NEXUS_RATE_WINDOW_MS || '60000'
        ),
        'process.env.NEXUS_RATE_MAX_PER_WINDOW': JSON.stringify(
          env.NEXUS_RATE_MAX_PER_WINDOW || '60'
        ),
        'process.env.NEXUS_API_KEY_COOLDOWN_MS': JSON.stringify(
          env.NEXUS_API_KEY_COOLDOWN_MS || '30000'
        ),
        'process.env.NEXUS_CIRCUIT_FAIL_THRESHOLD': JSON.stringify(
          env.NEXUS_CIRCUIT_FAIL_THRESHOLD || '10'
        ),
        'process.env.NEXUS_CIRCUIT_FAIL_WINDOW_MS': JSON.stringify(
          env.NEXUS_CIRCUIT_FAIL_WINDOW_MS || '30000'
        ),
        'process.env.NEXUS_CIRCUIT_OPEN_MS': JSON.stringify(
          env.NEXUS_CIRCUIT_OPEN_MS || '20000'
        ),
        // ── Cache TTL ─────────────────────────────────────────────
        // Set to 0 in dev (no stale responses).
        // Set to 30000-60000 in production for performance.
        // Your .env controls this — fallback is 0 (safe for dev).
        'process.env.NEXUS_RESPONSE_CACHE_TTL_MS': JSON.stringify(
          env.NEXUS_RESPONSE_CACHE_TTL_MS || '0'
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
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react':    ['react', 'react-dom'],
              'vendor-markdown': ['react-markdown', 'remark-gfm'],
              'vendor-charts':   ['recharts'],
              'vendor-supabase': ['@supabase/supabase-js'],
            },
          },
        },
      },
    };
});