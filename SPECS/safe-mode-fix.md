# SPEC: Safe Mode Fix — Scale to 10,000 Users
# Feature: BUG-002 (Phase 1) + FEAT-007 (Phase 2)
# Priority: CRITICAL — Pre-Launch (Phase 1) | Post-Launch Week 2 (Phase 2)

---

## 🔴 Honest Assessment

**Current architecture cannot truly handle 10,000 concurrent users** — all AI API calls happen client-side with no backend buffer. The real fix is Phase 2 (Edge Functions). Phase 1 fixes the aggressive thresholds that cause false safe mode triggers under normal load (50-500 users).

**Phase 1 (Claude Code, 1 session) — Stop false positives**
**Phase 2 (After launch) — Real scale architecture**

---

## Phase 1: Quick Fix — False Positive Prevention

### Root Cause Analysis

From `vite.config.ts`:
```
SEDREX_MAX_CONCURRENT_REQUESTS = 8   ← way too low
SEDREX_CIRCUIT_FAIL_THRESHOLD = 10   ← trips too fast
SEDREX_CIRCUIT_OPEN_MS = 20000       ← 20s recovery too slow
SEDREX_RATE_MAX_PER_WINDOW = 60      ← 60 requests/min per instance
```

These settings cause safe mode with just 10-15 simultaneous users.

### Phase 1 Changes

#### File 1: `vite.config.ts` — Update Defaults
```typescript
// BEFORE
'process.env.SEDREX_MAX_CONCURRENT_REQUESTS': '8'
'process.env.SEDREX_CIRCUIT_FAIL_THRESHOLD': '10'
'process.env.SEDREX_CIRCUIT_OPEN_MS': '20000'
'process.env.SEDREX_RATE_MAX_PER_WINDOW': '60'

// AFTER
'process.env.SEDREX_MAX_CONCURRENT_REQUESTS': '25'
'process.env.SEDREX_CIRCUIT_FAIL_THRESHOLD': '25'
'process.env.SEDREX_CIRCUIT_OPEN_MS': '10000'
'process.env.SEDREX_RATE_MAX_PER_WINDOW': '120'
```

#### File 2: `src/services/usageLimitService.ts` — Graceful Degradation

Find where safe mode is triggered. Replace hard safe mode block with:
```typescript
// BEFORE (hard block)
if (circuitOpen) {
  throw new Error('SAFE_MODE_TRIGGERED');
}

// AFTER (graceful queue)
if (circuitOpen) {
  // Don't block — queue with user-visible feedback
  agentEventBus.emit({
    type: 'step:start',
    id: 'queue',
    label: 'High demand — queuing your request...'
  });
  await waitForCircuitRecovery(); // poll every 2s, max 30s
  agentEventBus.emit({ type: 'step:complete', id: 'queue' });
}
```

Add `waitForCircuitRecovery()`:
```typescript
async function waitForCircuitRecovery(maxWaitMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 2000));
    if (!isCircuitOpen()) return;
  }
  throw new Error('Service temporarily unavailable. Please try again in a moment.');
}
```

#### File 3: `src/App.tsx` — Better Error UI

Find safe mode error handler. Replace:
```tsx
// BEFORE
if (error.message === 'SAFE_MODE_TRIGGERED') {
  // shows scary safe mode screen
}

// AFTER  
if (error.message.includes('temporarily unavailable')) {
  addToast('Sedrex is experiencing high demand. Your request will retry automatically.', 'info');
  // DO NOT show safe mode screen — just toast
}
```

### Phase 1 Acceptance Criteria
- [ ] 25 rapid simultaneous requests → no safe mode trigger
- [ ] Circuit trips → user sees "High demand" toast, not safe mode screen
- [ ] Circuit recovers → queued request completes automatically
- [ ] Error message is human-readable, not technical

---

## Phase 2: Real Architecture — Supabase Edge Functions

> **Do this after launch. Not before. Phase 1 is enough for launch.**

### Architecture Diagram

```
BEFORE (current):
Browser → [Circuit Breaker] → Gemini API
Browser → [Circuit Breaker] → Claude API  
Browser → [Circuit Breaker] → GPT-4 API

AFTER (Phase 2):
Browser → Supabase Edge Function (ai-proxy)
              ↓ per-user rate limit
              ↓ request queue
              ↓ retry logic
              → Gemini API / Claude API / GPT-4 API
```

### New File: `supabase/functions/ai-proxy/index.ts`

```typescript
import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js'

const RATE_LIMIT = 20; // requests per minute per user

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  // Auth check
  const authHeader = req.headers.get('Authorization');
  const { data: { user } } = await supabase.auth.getUser(
    authHeader?.replace('Bearer ', '') ?? ''
  );
  if (!user) return new Response('Unauthorized', { status: 401 });
  
  // Per-user rate limit check
  const withinLimit = await checkUserRateLimit(supabase, user.id, RATE_LIMIT);
  if (!withinLimit) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded', retryAfter: 60 }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // Route to correct AI provider
  const { model, prompt, systemPrompt } = await req.json();
  const response = await callAIProvider(model, prompt, systemPrompt);
  
  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

### Client Update: `src/services/aiService.ts`

```typescript
// Replace direct API calls with edge function call
async function callViaProxy(model: AIModel, prompt: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, prompt }),
    }
  );
  
  if (response.status === 429) {
    const { retryAfter } = await response.json();
    throw new RateLimitError(`Rate limited. Retry after ${retryAfter}s`);
  }
  
  return (await response.json()).content;
}
```

### Phase 2 Acceptance Criteria
- [ ] 100 concurrent users → no degradation
- [ ] API keys never exposed to browser (move from vite.config.ts)
- [ ] Per-user rate limiting works (not per-instance)
- [ ] Load test: `k6 run --vus 100 --duration 60s load-test.js`
- [ ] Circuit breaker logic fully removed from client

---

## 🚫 What NOT to Do

- Do NOT add Redis/worker queues pre-launch — overkill
- Do NOT rewrite the entire auth flow
- Do NOT touch Supabase schema for Phase 1
- Phase 2 is NOT a pre-launch requirement
