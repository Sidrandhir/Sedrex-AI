# SEDREX — Task Backlog
# Usage: Start each Claude Code session with "Read TASKS.md and CLAUDE.md, then work on the next unchecked task"
# Format: [ ] = todo | [x] = done | [~] = in progress | [!] = blocked

---

## 🔴 CRITICAL — Pre-Launch (Before April 17)

### BUG-001: Mermaid Empty Shapes Fix
- [ ] In `ArtifactPanel.tsx`, find Mermaid init/render config
- [ ] Add `htmlLabels: false` to Mermaid config object
- [ ] Test with: flowchart, sequence diagram, ER diagram
- [ ] Verify text appears inside all shape types
- **SPEC:** No spec needed — surgical one-line fix
- **Files:** `src/components/ArtifactPanel.tsx`

### BUG-002: Safe Mode False Positives — Phase 1 Quick Fix
- [ ] Read `SPECS/safe-mode-fix.md` fully before starting
- [ ] In `vite.config.ts` — update circuit breaker defaults (threshold 10→25, open_ms 20000→10000)
- [ ] In `usageLimitService.ts` — add graceful queue message instead of hard safe mode
- [ ] In `App.tsx` — replace safe mode UI with "High demand, queuing your request..." toast
- [ ] Test: simulate 15 rapid requests and verify no safe mode trigger
- **SPEC:** `SPECS/safe-mode-fix.md`
- **Files:** `vite.config.ts`, `src/services/usageLimitService.ts`, `src/App.tsx`

### FEAT-001: Claude-style Thinking + Execution Animation
- [ ] Read `SPECS/thinking-animation.md` fully before starting
- [ ] Step 1: Create `src/components/ThinkingPanel.tsx` (collapsible, animated)
- [ ] Step 2: Enhance `src/hooks/useThinkingSteps.ts` — add step types + timing
- [ ] Step 3: Fix code blocks in `ChatArea.tsx` — contained box, not full-width
- [ ] Step 4: Wire `agentEventBus` events → ThinkingPanel props
- [ ] Step 5: Wire ThinkingPanel into `ChatArea.tsx` above each assistant message
- [ ] Step 6: Test with slow model (Gemini) — verify steps appear + collapse on complete
- **SPEC:** `SPECS/thinking-animation.md`
- **Files:** New `ThinkingPanel.tsx`, `useThinkingSteps.ts`, `ChatArea.tsx`, `agentEventBus.ts`

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

### FEAT-004: Stripe Setup
- [ ] Pro plan: $12/month product in Stripe dashboard
- [ ] Team plan: $49/month product in Stripe dashboard
- [ ] Update `billingService.ts` with real price IDs
- [ ] Test checkout flow end-to-end in test mode
- [ ] Test billing portal redirect
- **Files:** `src/services/billingService.ts`, `.env`

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
