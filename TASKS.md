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
- **Files:** `components/ArtifactPanel.tsx`

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
