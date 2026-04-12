# SEDREX — Task Backlog
# Usage: Start each Claude Code session with "Read TASKS.md and CLAUDE.md, then work on the next unchecked task"
# Format: [ ] = todo | [x] = done | [~] = in progress | [!] = blocked

---

## 🔴 CRITICAL — Pre-Launch (Before April 17)

### BUG-001: Mermaid Empty Shapes Fix ✅ DONE
- [x] In `ArtifactPanel.tsx`, find Mermaid init/render config
- [x] Add `htmlLabels: false` to Mermaid config object
- [x] Fix `#` filter stripping label lines — changed to `%%` comment filter only
- [x] Add `ADD_TAGS: ['style']` to DOMPurify to preserve Mermaid theme CSS
- [x] Add top-level `htmlLabels: false` to `ChatArea.tsx` mermaid.initialize (was missing — only had it inside `flowchart`, leaving sequence/class/state diagrams broken)
- **Files:** `components/ArtifactPanel.tsx`, `components/ChatArea.tsx`

### BUG-002: Safe Mode False Positives — Phase 1 Quick Fix ✅ DONE
- [x] In `vite.config.ts` — updated circuit breaker defaults (threshold 10→25, open_ms 20000→10000)
- [x] In `aiService.ts` — circuit breaker now reads from `process.env` (was hardcoded)
- [x] In `App.tsx` — replaced safe mode UI with toast + message removal (no hard block)
- **Files:** `vite.config.ts`, `services/aiService.ts`, `App.tsx`

### FEAT-001: Claude-style Thinking + Execution Animation ✅ DONE
- [x] `ThinkingSteps.tsx` created — collapsible, animated step rows
- [x] `useThinkingSteps.ts` — async generator, planning + fallback steps, timing
- [x] Code blocks fixed in `ChatArea.tsx` — contained box, `streaming-raw` pre element
- [x] `AgentActivityLog` removed — `ThinkingSteps` is now primary UI (no suppression)
- [x] `ThinkingSteps` wired into `ChatArea.tsx` above each assistant message
- [x] `totalTimeMs` added — compact row shows "N steps · X.Xs" on completion
- [ ] Step 6: Test with slow model (Gemini) — verify steps appear + collapse on complete
- [ ] FEAT-001 Step 5: Verify mobile (375px) — check tsx-step-label ellipsis + code overflow
- **Files:** `components/ThinkingSteps.tsx`, `hooks/useThinkingSteps.ts`, `components/ChatArea.tsx`, `types.ts`

---

## 🟡 POST-LAUNCH — Week 1

### FEAT-002: Python Interpreter Output in Artifacts
- [ ] Read current `pyodideService.ts` — understand warmup flow
- [ ] Create `PythonOutputArtifact` type in `types/index.ts`
- [ ] In `ArtifactPanel.tsx` — add Python output render tab
- [ ] Show stdout, stderr separately with copy button
- [ ] Add run button re-execution from artifact panel
- **Files:** `pyodideService.ts`, `ArtifactPanel.tsx`, `types/index.ts`

### FEAT-003: React/JS Live Preview in Artifacts
- [ ] Sandboxed iframe renderer for JSX artifacts
- [ ] Add "Preview" tab alongside "Code" tab in ArtifactPanel
- [ ] Handle import stripping for sandbox compatibility
- [ ] Error boundary per preview — no full panel crash
- **Files:** `ArtifactPanel.tsx`, new `SandboxPreview.tsx`

### FEAT-004: Razorpay Billing ✅ DONE (replaces Stripe)
- [x] `billingService.ts` — full rewrite with Razorpay modal checkout (dynamic script load)
- [x] `tierConfig.ts` — Pro (plan_ScHyEEXa8uICDo, ₹1,999/mo) + Team (plan_ScI1NOvr0NH9iP, ₹4,999/mo)
- [x] `App.tsx` — `handleUpgrade()` + `handleUpgradeTeam()` wired with Razorpay callbacks
- [x] `types.ts` + `Pricing.tsx` — `UserTier` updated with `'team'`
- [ ] Add `VITE_RAZORPAY_KEY_ID=rzp_live_...` to `.env` and Vercel dashboard (manual — secret)
- [ ] Create yearly plan IDs in Razorpay dashboard and wire into `billingService.ts`
- **Files:** `services/billingService.ts`, `services/tierConfig.ts`, `App.tsx`

### FEAT-004b: Tier Enforcement Audit [x] DONE
<!-- COMPLETED:
  1. Built complete tier gating system across tierConfig.ts, aiService.ts, agentOrchestrator.ts, usageLimitService.ts, ChatArea.tsx
  2. Added DeepSeek provider, isProviderAvailable() helper, tier-aware routing, basic mode fallback, usage UI states
  3. Next: wire canSend + userStats props from App.tsx to ChatArea, and pass userTier to agentOrchestrator.dispatch()
-->
- [x] Full diagnosis complete — model routing, key pool, usage checks, tier config all mapped
- [x] Set real monthly/daily limits in `tierConfig.ts` — free: 10/day 100/mo, pro: 400/mo, team: 1500/mo, enterprise: unlimited
- [x] Added `allowedModels` per tier in `tierConfig.ts`
- [x] Added `PROVIDER_DEEPSEEK`, `isProviderAvailable()`, `callDeepSeekProvider()` in `aiService.ts`
- [x] Added Gemini search grounding signal expansion in `aiService.ts`
- [x] Added `userTier` + `isBasicMode` params to `agentOrchestrator.dispatch()` — free/basic → Gemini fast-path
- [x] Added `checkCanSendMessage()`, `getRemainingRequests()`, `isInBasicMode()` to `usageLimitService.ts`
- [x] Added all 5 usage UI states to `ChatArea.tsx` (hard stop, nudge, basic mode banner, basic mode modal, footer)
- [ ] Wire `canSend` + `userStats` + `remainingRequests` props from `App.tsx` → `ChatArea`
- [ ] Pass `userTier` + `isBasicMode` to `agentOrchestrator.dispatch()` call in `aiService.ts`
- [ ] Add server-side enforcement via Supabase RLS or Edge Function (FEAT-007)
- **Files:** `services/tierConfig.ts`, `services/aiService.ts`, `services/agents/agentOrchestrator.ts`, `services/usageLimitService.ts`, `components/ChatArea.tsx`, `.env`

### FEAT-004c: App.tsx Wiring [x] DONE
- [x] Imported `checkCanSendMessage`, `getRemainingRequests` in `App.tsx`
- [x] Derived `canSend` + `remaining` above return statement from existing `userStats` state
- [x] Passed `userStats`, `canSend`, `remainingRequests`, `onUpgrade` to `<ChatArea>`
- [x] Added `userTier` + `isBasicMode` optional params to `getAIResponse` + `processRequest` in `aiService.ts`
- [x] Threaded `userTier` + `isBasicMode` through to `agentDispatch()` call
- [x] Bug fix: `admin` tier → maps to `enterprise` in `getTierConfig()` (`tierConfig.ts`)
- [x] Bug fix: free tier usage footer shows `monthlyMessagesSent` (trigger-populated) instead of broken `dailyHistory` (`ChatArea.tsx`)
- [x] Fix 1: `checkCanSendMessage()` — free tier checks `monthlyMessagesSent >= 100`, not daily count (`usageLimitService.ts`)
- [x] Fix 2: `getRemainingRequests()` — free tier returns monthly used/limit/reset, not daily (`usageLimitService.ts`)
- [x] Fix 3: ChatArea footer — unified line using `remainingRequests.used` for all tiers (`ChatArea.tsx`)
- [x] Fix 4: `handleSendMessage()` — hard early return if `canSend.allowed === false` (`App.tsx`)
- [x] Fix 5: Hard stop banner copy — "100 free requests this month" + "Resets on [date]" using `remainingRequests.resetsAt` (`ChatArea.tsx`)
- [x] UI cleanup: removed STATE 1 usage footer (`ChatArea.tsx`)
- [x] UI cleanup: nudge banner copy → "You're on the free plan — upgrade for ₹999/mo" (`ChatArea.tsx`)
- [x] UI cleanup: hard stop banner → "You've reached your daily limit. Come back after 12 AM or upgrade to Pro." — reset date line removed (`ChatArea.tsx`)
- [x] UI cleanup: UsageBar sidebar — removed "X/100 messages" numbers, shows only progress bar + upgrade button + blocked msg (`UsageBar.tsx`)
- **Free tier enforcement + UI fully complete.**
- **Files:** `App.tsx`, `services/aiService.ts`, `services/tierConfig.ts`, `components/ChatArea.tsx`

### FEAT-005: RLS Verification on All Supabase Tables
- [ ] Run verification script against production Supabase
- [ ] Check: `messages`, `conversations`, `artifacts`, `user_stats`, `usage_logs`
- [ ] Fix any table missing RLS policy
- [ ] Document verified tables in `docs/supabase-rls.md`

---

## 🟢 POST-LAUNCH — Week 2-4

### FEAT-006: OG Image + Favicon Pack
- [ ] Create OG image (1200×630) — matches landing page aesthetic
- [ ] Generate favicon pack (16, 32, 180, 192, 512px)
- [ ] Update `index.html` with all sizes
- [ ] Test OG image with Twitter Card Validator + LinkedIn Post Inspector

### FEAT-007: Safe Mode Fix — Phase 2 (Backend Architecture)
- [ ] Create Supabase Edge Function: `ai-proxy`
- [ ] Move all AI API calls (Gemini/Claude/GPT) through edge function
- [ ] Per-user rate limiting in edge function (not client-side)
- [ ] Client-side becomes dumb caller — no circuit breaker needed
- [ ] Load test: 100 concurrent users
- **SPEC:** `SPECS/safe-mode-fix.md` (Phase 2 section)

### FEAT-008: Follow-up Suggestions UI Polish
- [ ] `generateFollowUpSuggestions` exists in aiService — hook it up in UI
- [ ] Show 3 suggestion chips below each assistant response
- [ ] Fade in after response completes (300ms delay)
- [ ] Click chip → prefill MessageInput and auto-send

### FEAT-009: Chat Export (PDF/Markdown)
- [ ] Export button in chat header
- [ ] Markdown export: full chat with code blocks
- [ ] PDF export: use existing pdf skill pattern

### FEAT-010: DPIIT / LLP Registration
- [ ] Register LLP on MCA portal (mca.gov.in)
- [ ] Apply for DPIIT Startup Recognition post-LLP
- [ ] Required for: Startup India Seed Fund, SAMRIDH eligibility
- **Not a code task — manual action**

---

## 📊 Metrics to Track Post-Launch
- Daily Active Users
- Messages per session (target: >5)
- Model distribution (are users hitting Claude or Gemini more?)
- Safe mode trigger rate (target: <0.1%)
- Conversion rate Free → Pro (target: >3%)
