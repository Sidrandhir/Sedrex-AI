import { createClient } from '@supabase/supabase-js';

/**
 * SEDREX - Production-Hardened Cloud Configuration
 * Relies strictly on process.env for security and professional deployment.
 */
export const getSupabaseConfig = () => {
  const url = process.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
  const key = process.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  
  return { 
    url: url.trim(), 
    key: key.trim() 
  };
};

const config = getSupabaseConfig();

export const isSupabaseConfigured = config.url.length > 10 && config.key.length > 10;

/**
 * iOS-resilient fetch wrapper.
 * iOS WebKit throws "TypeError: Load failed" instead of "Failed to fetch".
 * This custom fetch retries on transient network errors.
 */
const resilientFetch: typeof globalThis.fetch = async (input, init) => {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await globalThis.fetch(input, init);
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      const isTransient = msg.includes('load failed') || msg.includes('failed to fetch') || msg.includes('network') || msg.includes('aborted');
      if (isTransient && attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  return globalThis.fetch(input, init); // fallback
};

/**
 * The Supabase client singleton.
 * Uses resilient fetch for iOS WebKit compatibility.
 */
export const supabase = isSupabaseConfigured 
  ? createClient(config.url, config.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      global: {
        fetch: resilientFetch
      }
    }) 
  : null;