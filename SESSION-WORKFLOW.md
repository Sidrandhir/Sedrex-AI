# SEDREX — Claude Code Session Workflow
# Read this once. Then follow it every session.

---

## 🚀 Starting Every Session

Paste this EXACTLY as your first message in Claude Code:

```
Read CLAUDE.md and TASKS.md. 
Then read the SPEC file for the next unchecked task.
Do NOT start coding until you tell me:
1. Which task you're working on
2. Which files you'll touch
3. Your implementation plan in 3-5 bullet points
Wait for my confirmation before writing any code.
```

---

## ⚡ During a Session

### When context gets long (>50% used):
```
/compact focusing on: [current task name], files modified so far, and any open decisions
```

### When switching to a completely different task:
```
/clear
```
Then paste the session starter above again.

### Quick questions that don't need to stay in context:
```
/btw [your question]
```

---

## 🛑 Ending a Session

Before closing Claude Code, always run:
```
Update TASKS.md — mark completed tasks as [x], in-progress as [~].
List any new bugs discovered. Do not edit anything else.
```

---

## 📋 Task Execution Rules for Claude Code

Tell Claude Code these rules per task:

### For BUG-001 (Mermaid fix):
```
Read ArtifactPanel.tsx. Find the Mermaid initialization code.
Show me the current config object. 
Then make ONLY this change: add htmlLabels: false to the config.
Show me the diff. Do not touch anything else.
```

### For BUG-002 (Safe mode):
```
Read SPECS/safe-mode-fix.md Phase 1 section.
Read vite.config.ts circuit breaker section only.
Read usageLimitService.ts safe mode trigger section only.
Implement Phase 1 changes only. Show diffs, not full files.
```

### For FEAT-001 (Thinking animation):
```
Read SPECS/thinking-animation.md completely.
Read useThinkingSteps.ts completely.
Read agentEventBus.ts completely.
Read ChatArea.tsx — ONLY the message rendering section (skip unrelated parts).
Step 1 only: Create ThinkingPanel.tsx as specified. Show me the file.
Wait for my approval before Step 2.
```

---

## 🔑 Token-Saving Prompts to Use

Instead of "fix the bug" → 
```
In [filename], at [function/line area], change [specific thing] to [specific thing]. Show only the diff.
```

Instead of "add this feature" →
```
Read SPECS/[feature].md. Implement Step [N] only. Show only changed sections.
```

Instead of "what's wrong" →
```
Read [specific file], [specific function]. Tell me what [specific behavior] is caused by. 
No code yet — diagnosis only.
```

---

## 🌡️ Environment Var to Set Before Claude Code Sessions

```bash
export MAX_THINKING_TOKENS=8000
```

Add this to your `~/.bashrc` or `~/.zshrc` so it's always set.

---

## 📦 File Placement Guide

```
sedrex/                    ← project root
├── CLAUDE.md              ← copy here (Claude auto-loads)
├── TASKS.md               ← copy here
├── .claudeignore          ← copy here
└── SPECS/
    ├── thinking-animation.md
    └── safe-mode-fix.md
```

All 4 files go in your project root alongside `package.json`.
