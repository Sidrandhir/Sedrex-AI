// ══════════════════════════════════════════════════════════════════
// SEDREX — Service Worker v1
//
// Strategy:
//   Navigation requests  → Network-first, fallback to shell cache, then /offline.html
//   /assets/**           → Cache-first (Vite hashed filenames = immutable)
//   Fonts (Google)       → Stale-while-revalidate
//   API / Supabase / AI  → Network-only (never cache auth/AI responses)
//   Everything else      → Network-first with cache fallback
// ══════════════════════════════════════════════════════════════════

const SHELL_CACHE   = 'sedrex-shell-v1';
const DYNAMIC_CACHE = 'sedrex-dynamic-v1';
const FONT_CACHE    = 'sedrex-fonts-v1';

// Files to precache on install (the app shell)
const SHELL_URLS = [
  '/',
  '/offline.html',
  '/sedrex-logo.svg',
  '/manifest.json',
];

// Hosts that should NEVER be cached (AI APIs, auth, billing)
const NETWORK_ONLY_HOSTS = [
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'supabase.co',
  'stripe.com',
  'stripe-js.com',
  'js.stripe.com',
];

const isNetworkOnly = (url) => {
  try {
    const { hostname, pathname } = new URL(url);
    if (NETWORK_ONLY_HOSTS.some(h => hostname.includes(h))) return true;
    // Supabase project URLs (*.supabase.co)
    if (hostname.endsWith('.supabase.co')) return true;
    // Supabase Edge Functions
    if (pathname.startsWith('/functions/')) return true;
    return false;
  } catch {
    return false;
  }
};

const isFont = (url) => {
  try {
    const { hostname } = new URL(url);
    return hostname.includes('fonts.googleapis.com') ||
           hostname.includes('fonts.gstatic.com');
  } catch {
    return false;
  }
};

const isImmutableAsset = (url) => {
  try {
    const { pathname } = new URL(url);
    // Vite hashed assets: /assets/index-[hash].js etc.
    return pathname.startsWith('/assets/');
  } catch {
    return false;
  }
};

// ── Install: precache app shell ────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_URLS).catch((err) => {
        console.warn('[SW] Shell precache partial failure:', err);
      })
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ─────────────────────────────────
self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, DYNAMIC_CACHE, FONT_CACHE]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !keep.has(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: routing ─────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Only intercept GET requests
  if (request.method !== 'GET') return;

  // 1. Network-only: AI/auth/billing APIs — never cache
  if (isNetworkOnly(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // 2. Fonts — stale-while-revalidate
  if (isFont(url)) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // 3. Immutable Vite assets — cache-first forever
  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  // 4. Navigation (HTML pages) — network-first, offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  // 5. Everything else — network-first, cache fallback
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

// ── Strategy: cache-first ──────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

// ── Strategy: network-first ────────────────────────────────────────
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response('Offline', { status: 503 });
  }
}

// ── Strategy: stale-while-revalidate ──────────────────────────────
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);

  return cached ?? fetchPromise;
}

// ── Strategy: navigation handler ──────────────────────────────────
async function navigationHandler(request) {
  try {
    // Always try network first for navigation
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Try shell cache (cached version of /)
    const shellUrl = new URL('/', self.location.origin).href;
    const cached   = await caches.match(shellUrl) ?? await caches.match('/');
    if (cached) return cached;
    // Final fallback: offline page
    const offline = await caches.match('/offline.html');
    return offline ?? new Response('<h1>Offline</h1>', {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

// ── Message: force update ──────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
