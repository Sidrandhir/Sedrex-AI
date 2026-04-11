# SPEC: Claude-style Thinking + Execution Animation
# Feature: FEAT-001
# Priority: CRITICAL — Pre-Launch
# Estimated Claude Code sessions: 2 focused sessions

---

## 🎯 What We're Building

Exact replica of Claude's thinking/execution UI — every step Sedrex takes should be visible to the user as an animated, collapsible panel that appears before the response, then collapses when done.

---

## 📸 Target UI (Reference: Claude.ai screenshots)

```
┌──────────────────────────────────────────────────────┐
│  ⟳  Thinking...                          [collapse ▲] │
│  ─────────────────────────────────────────────────── │
│  ✓  Routing your request → Claude Sonnet             │
│  ✓  Analyzing context (3 files referenced)           │
│  ⟳  Generating response...                           │
└──────────────────────────────────────────────────────┘

[After completion — collapsed state]
┌──────────────────────────────────────────────────────┐
│  ✓  Completed in 2.3s — 3 steps          [expand ▼]  │
└──────────────────────────────────────────────────────┘

[Code blocks — contained, not full-width]
┌──────────────────────────────────────────────────────┐
│  Here's the implementation:                          │
│                                                      │
│  ┌─ TypeScript ─────────────── [Copy] [Expand] ──┐  │
│  │  const router = new SedrexRouter();            │  │
│  │  await router.route(prompt);                   │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## 🏗️ Architecture

### New Files to Create

#### 1. `src/components/ThinkingPanel.tsx`
```typescript
// Props interface
interface ThinkingPanelProps {
  steps: ThinkingStep[];
  isComplete: boolean;
  totalTimeMs?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface ThinkingStep {
  id: string;
  label: string;          // "Routing to Claude Sonnet"
  status: 'pending' | 'active' | 'done' | 'error';
  startedAt?: number;
  completedAt?: number;
  detail?: string;        // Optional sub-text
}
```

**Visual Behavior:**
- Spinner (CSS only, no library) next to "Thinking..." when active
- Each step fades in with 150ms staggered delay
- Active step has subtle pulse animation on the spinner icon
- Completed step: spinner → green checkmark (smooth transition)
- Error step: spinner → red X
- Full panel fades out and collapses to summary bar on completion
- Collapse/expand toggle on click (user can inspect steps anytime)

**DO NOT use:** Framer Motion, GSAP, or any animation library — pure CSS transitions only

#### 2. Enhanced `src/hooks/useThinkingSteps.ts`
```typescript
// Add these to existing hook:
interface UseThinkingStepsReturn {
  steps: ThinkingStep[];
  isThinking: boolean;
  isComplete: boolean;
  totalTimeMs: number;
  startStep: (id: string, label: string) => void;
  completeStep: (id: string, detail?: string) => void;
  errorStep: (id: string, error: string) => void;
  clearSteps: () => void;
  startThinking: () => void;   // already exists
  clearTimers: () => void;     // already exists
}
```

### Files to Modify

#### 3. `src/components/ChatArea.tsx` — Code Block Fix

**Problem:** Code renders across full width of ChatArea
**Fix:** Wrap all code blocks in contained box with max-width

Find the code block rendering section (look for `<pre>`, `<code>`, or `SyntaxHighlighter`) and wrap with:
```tsx
<div className="code-block-container">
  {/* header: language label + Copy button */}
  <div className="code-block-header">
    <span className="code-lang">{language}</span>
    <button onClick={handleCopy} className="copy-btn">
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  </div>
  {/* the actual code */}
  <pre className="code-block-body">
    <code>{children}</code>
  </pre>
</div>
```

CSS (add to existing stylesheet):
```css
.code-block-container {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  margin: 8px 0;
  background: var(--surface-2);
  max-width: 100%;
}
.code-block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: var(--surface-3);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.code-lang { color: var(--text-muted); font-family: monospace; }
.copy-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 11px;
}
.code-block-body {
  padding: 12px;
  overflow-x: auto;
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}
```

#### 4. `src/services/agentEventBus.ts` — Add Step Events

Add these event types if not already present:
```typescript
type AgentEvent =
  | { type: 'step:start'; id: string; label: string }
  | { type: 'step:complete'; id: string; detail?: string }
  | { type: 'step:error'; id: string; error: string }
  | { type: 'thinking:start' }
  | { type: 'thinking:complete'; totalMs: number };
```

#### 5. `src/services/aiService.ts` — Emit Steps

In `getAIResponse()`, add event emissions at key points:
```typescript
agentEventBus.emit({ type: 'thinking:start' });

// After routing decision:
agentEventBus.emit({ type: 'step:start', id: 'route', label: `Routing → ${selectedModel}` });
agentEventBus.emit({ type: 'step:complete', id: 'route' });

// Before API call:
agentEventBus.emit({ type: 'step:start', id: 'generate', label: 'Generating response...' });

// After API call:
agentEventBus.emit({ type: 'step:complete', id: 'generate' });
agentEventBus.emit({ type: 'thinking:complete', totalMs: Date.now() - startTime });
```

---

## 🔌 Wiring Into ChatArea

In `ChatArea.tsx`, for each assistant message being streamed:
```tsx
{message.role === 'assistant' && message.thinkingSteps && (
  <ThinkingPanel
    steps={message.thinkingSteps}
    isComplete={!isLoading}
    totalTimeMs={message.thinkingTotalMs}
  />
)}
<MessageBubble message={message} />
```

---

## ✅ Acceptance Criteria

- [ ] Steps appear within 100ms of user sending message
- [ ] Each step label is human-readable (not "step_1", not technical IDs)
- [ ] Spinner animates smoothly — no jank on mobile
- [ ] Panel collapses automatically when response is complete
- [ ] User can expand panel to re-read steps
- [ ] Code blocks render in contained box — never overflow ChatArea
- [ ] Copy button works on all code blocks
- [ ] Works on 375px mobile width without horizontal scroll
- [ ] No new npm dependencies added

---

## ⚠️ What NOT to Do

- Do NOT rewrite ChatArea.tsx from scratch — surgical edits only
- Do NOT add Framer Motion or any animation library
- Do NOT change the message data model in Supabase
- Do NOT block on this if Mermaid fix (BUG-001) is not done first

---

## 🧪 Test Prompt to Verify

After implementation, run this prompt in Sedrex and verify UI:
> "Write a TypeScript function that fetches user data from Supabase and handles errors gracefully"

Expected: See "Routing → Claude Sonnet", "Analyzing context", "Generating response" steps appear and collapse, then code block appears in contained box with copy button.
