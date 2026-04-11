# SEDREX AI — Claude Code Project Memory
# Keep this file under 5,000 tokens. Move non-critical details to docs/*.md

---

## 🧠 Project Identity
- **Product:** Sedrex AI — multi-model AI orchestration platform
- **URL:** sedrexai.com / sedrex.ai
- **Stack:** React 18 + TypeScript + Vite + Supabase + Vercel
- **Founder:** Solo (Sidd) — ship fast, no over-engineering
- **Launch:** April 17, 2026 (Product Hunt)

---

## 📁 Critical File Map

| File | Purpose |
|------|---------|
| `src/App.tsx` | Root — sessions, auth, routing, artifact panel orchestration |
| `src/components/ChatArea.tsx` | Message rendering, code blocks, thinking steps display |
| `src/components/MessageInput.tsx` | User input, file upload, send logic |
| `src/components/ArtifactPanel.tsx` | Right panel — code/diagram/image artifacts |
| `src/services/aiService.ts` | Core AI routing — GPT-4/Claude/Gemini selection |
| `src/services/agentEventBus.ts` | Event bus for agent step emissions |
| `src/hooks/useThinkingSteps.ts` | Thinking step state management hook |
| `src/services/artifactStore.ts` | Artifact CRUD, panel state, subscriptions |
| `src/services/analyticsService.ts` | PostHog + Supabase analytics |
| `src/services/usageLimitService.ts` | Preflight checks, safe mode trigger |
| `src/services/storageService.ts` | Supabase storage wrapper |
| `src/types/index.ts` | All TypeScript types — AgentActivity, Message, AIModel, etc. |
| `vite.config.ts` | Build config + env vars + circuit breaker defaults |

---

## 🏗️ Architecture Notes

### Model Routing
- Routes to: Claude Sonnet, GPT-4o, Gemini Pro based on query type
- `routePrompt()` in aiService.ts handles selection logic
- Circuit breaker in `usageLimitService.ts` — threshold 10 failures (TOO LOW, see TASKS)

### State Management
- No Redux — React state + context
- `agentEventBus` = custom EventEmitter for agent step events
- `artifactStore` = singleton store with subscriber pattern

### Safe Mode Root Cause
- Circuit breaker trips at 10 failures → triggers safe mode UI
- `SEDREX_MAX_CONCURRENT_REQUESTS = 8` — too low for scale
- All API calls happen client-side — no backend buffer
- Supabase direct from browser — no connection pooling layer

### Existing Thinking Steps (Partial)
- `useThinkingSteps` hook exists — emits steps but UI is basic
- `AgentActivity` type exists in types.ts
- `agentEventBus` exists — events not fully consumed by UI

---

## 🐛 Known Bugs (Fix Before Touching Anything)

1. **Mermaid empty shapes** — `htmlLabels: false` NOT set in Mermaid config in `ArtifactPanel.tsx`
2. **Safe mode false positives** — circuit breaker threshold too aggressive (10 failures)
3. **Code blocks overflow** — code renders across full ChatArea width instead of contained box

---

## ✅ Coding Rules (Always Follow)

1. **Never rewrite full files** — surgical edits only. Show only the diff.
2. **No new dependencies** without asking — bundle size matters
3. **TypeScript strict** — no `any` unless absolutely necessary
4. **Mobile-first** — every component must work on 375px width
5. **Dark mode first** — `data-theme="dark"` is default
6. **No console.logs in production code**
7. **Test in isolation** — new components get a test render before wiring to App.tsx
8. Before editing any file, read the relevant section first with Read tool

---

## 🔧 Environment Variables (Never Hardcode)

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SEDREX_MAX_CONCURRENT_REQUESTS (default: 8 → change to 25)
SEDREX_CIRCUIT_FAIL_THRESHOLD (default: 10 → change to 25)
SEDREX_CIRCUIT_OPEN_MS (default: 20000 → change to 10000)
GEMINI_KEY_1 through GEMINI_KEY_6
```

---

## 📦 Compact Instructions

When compacting, always preserve:
- The Known Bugs section
- The Critical File Map
- Active task from TASKS.md that was in progress
- Any function signatures that were modified in this session

---

## 🔗 Related Files
- Feature backlog → `TASKS.md`
- Thinking UI spec → `SPECS/thinking-animation.md`
- Safe mode fix spec → `SPECS/safe-mode-fix.md`
