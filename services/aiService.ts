import { GoogleGenAI } from "@google/genai";
import {
  AIModel,
  Message,
  RouterResult,
  MessageImage,
  GroundingChunk,
  AttachedDocument,
  QueryIntent,
} from "../types";
import { logError } from "./analyticsService";
import { buildSedrexSystemPrompt, sanitizeConversationHistory, ARTIFACT_PROTOCOL } from "./SedrexsystemPrompt";
import { dispatch as agentDispatch, AgentDispatchResult } from "./agents/agentOrchestrator";
import { getCodebaseContextForQuery } from "./codebaseContext";

// ═══════════════════════════════════════════════════════════════════
// SEDREX AI — MULTI-PROVIDER ENGINE v7.1
// Verification-First Intelligence
//
// CHANGES from v7.0:
//   ✅ Code output max tokens raised to 32k (Gemini 3 Flash limit)
//   ✅ ARTIFACT_PROTOCOL injected for ALL intents (not just technical/analytical)
//   ✅ isCodeRequest detection broadened — catches more code requests
//   ✅ 401 enrich-session suppressed cleanly (no browser console spam)
// ═══════════════════════════════════════════════════════════════════

const MODELS = {
  FLASH:      "gemini-3-flash-preview",
  FLASH_LITE: "gemini-3.1-flash-lite-preview",
  PRO:        "gemini-3.1-pro-preview",
} as const;

const MAX_RETRIES  = 4;
const MAX_MSG_LEN  = 4_000;
const MAX_HISTORY: Record<string, number> = {
  technical: 8, analytical: 10, live: 4, general: 6,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Concurrency scheduler ─────────────────────────────────────────

interface QueueTask<T> {
  key: string;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

class KeyedConcurrentQueue {
  private queue: QueueTask<any>[] = [];
  private runningKeys = new Set<string>();
  private activeCount = 0;

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueueSize: number,
  ) {}

  add<T>(task: () => Promise<T>, key = "global"): Promise<T> {
    if (this.queue.length >= this.maxQueueSize) {
      return Promise.reject(new Error("System busy. Please retry in a few seconds."));
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ key, run: task, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    while (this.activeCount < this.maxConcurrent) {
      const idx = this.queue.findIndex((t) => !this.runningKeys.has(t.key));
      if (idx === -1) return;
      const next = this.queue.splice(idx, 1)[0];
      this.runningKeys.add(next.key);
      this.activeCount += 1;
      next.run()
        .then(next.resolve)
        .catch(next.reject)
        .finally(() => {
          this.runningKeys.delete(next.key);
          this.activeCount -= 1;
          this.pump();
        });
    }
  }
}

const MAX_CONCURRENT_REQUESTS = Number(
  (typeof import.meta !== "undefined" ? import.meta.env?.VITE_NEXUS_MAX_CONCURRENT ?? undefined : undefined)
  ?? (typeof process !== "undefined" ? process.env?.NEXUS_MAX_CONCURRENT_REQUESTS : undefined)
  ?? 16
);
const MAX_QUEUED_REQUESTS = Number(
  (typeof import.meta !== "undefined" ? import.meta.env?.VITE_NEXUS_MAX_QUEUED ?? undefined : undefined)
  ?? (typeof process !== "undefined" ? process.env?.NEXUS_MAX_QUEUED_REQUESTS : undefined)
  ?? 1000
);
const requestQueue = new KeyedConcurrentQueue(MAX_CONCURRENT_REQUESTS, MAX_QUEUED_REQUESTS);

const REQUEST_RATE_WINDOW_MS = 60_000;
const REQUEST_RATE_MAX       = 30;
const API_KEY_COOLDOWN_MS    = 30_000;

// ── Gemini API key pool ───────────────────────────────────────────
const _vite = typeof import.meta !== "undefined" ? import.meta.env : {} as any;
const _proc = typeof process !== "undefined" ? process.env : {} as any;

const apiKeyPool = [
  _vite.VITE_GEMINI_KEY,
  _vite.VITE_GEMINI_KEY_1,
  _vite.VITE_GEMINI_KEY_2,
  _vite.VITE_GEMINI_KEY_3,
  _vite.VITE_GEMINI_KEY_4,
  _vite.VITE_GEMINI_KEY_5,
  _vite.VITE_GEMINI_KEY_6,
  _proc.GEMINI_API_KEY,
  _proc.GEMINI_KEY_1,
  _proc.GEMINI_KEY_2,
  _proc.GEMINI_KEY_3,
  _proc.GEMINI_KEY_4,
  _proc.GEMINI_KEY_5,
  _proc.GEMINI_KEY_6,
].filter((k): k is string => {
  if (!k || k.trim().length === 0) return false;
  if (k.includes("your_") || k.includes("_here") || k.includes("Example")) return false;
  if (!k.startsWith("AIza")) return false;
  return true;
});

console.log("[SEDREX] Gemini key pool size:", apiKeyPool.length);
if (apiKeyPool.length === 0) {
  console.error("[SEDREX] ❌ No valid Gemini keys! Add VITE_GEMINI_KEY to .env.local");
}

// ── Multi-provider config ─────────────────────────────────────────
const PROVIDER_OPENAI = {
  key:       _vite.VITE_OPENAI_KEY || _proc.OPENAI_API_KEY || "",
  model:     "gpt-4-turbo-preview",
  available: !!(_vite.VITE_OPENAI_KEY || _proc.OPENAI_API_KEY),
};
const PROVIDER_CLAUDE = {
  key:       _vite.VITE_CLAUDE_KEY || _proc.ANTHROPIC_API_KEY || "",
  model:     "claude-3-5-sonnet-20241022",
  available: !!(_vite.VITE_CLAUDE_KEY || _proc.ANTHROPIC_API_KEY),
};
console.log("[SEDREX] OpenAI:", PROVIDER_OPENAI.available ? "✅ configured" : "⏳ using Gemini fallback");
console.log("[SEDREX] Claude:", PROVIDER_CLAUDE.available ? "✅ configured" : "⏳ using Gemini fallback");

// ── Gemini key rotation ───────────────────────────────────────────
let apiKeyIndex = 0;
const apiKeyCooling = new Map<string, number>();

function getApiKey(): string {
  if (apiKeyPool.length === 0) return "";
  const now = Date.now();
  for (let i = 0; i < apiKeyPool.length; i++) {
    const idx = (apiKeyIndex + i) % apiKeyPool.length;
    const key = apiKeyPool[idx];
    const cooldownUntil = apiKeyCooling.get(key) ?? 0;
    if (cooldownUntil <= now) {
      apiKeyIndex = (idx + 1) % apiKeyPool.length;
      return key;
    }
  }
  const fallback = apiKeyPool[apiKeyIndex % apiKeyPool.length];
  apiKeyIndex = (apiKeyIndex + 1) % apiKeyPool.length;
  return fallback;
}

function markApiKeyFailure(key: string): void {
  if (!key) return;
  apiKeyCooling.set(key, Date.now() + API_KEY_COOLDOWN_MS);
}

function markApiKeySuccess(key: string): void {
  if (!key) return;
  apiKeyCooling.delete(key);
}

// ── Response cache + circuit breaker ─────────────────────────────
const RESPONSE_CACHE_TTL_MS  = 0;
const CIRCUIT_FAIL_THRESHOLD = 6;
const CIRCUIT_FAIL_WINDOW_MS = 30_000;
const CIRCUIT_OPEN_MS        = 20_000;

type CacheEntry = { value: NexusResponse; expiresAt: number };
const responseCache = new Map<string, CacheEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of responseCache) {
    if (v.expiresAt < now) responseCache.delete(k);
  }
}, 30_000);

const inFlightByFingerprint = new Map<string, Promise<NexusResponse>>();
const clientRequestWindows  = new Map<string, number[]>();

function isClientRateLimited(clientId: string): boolean {
  const now  = Date.now();
  const list = clientRequestWindows.get(clientId) ?? [];
  const kept = list.filter((ts) => now - ts <= REQUEST_RATE_WINDOW_MS);
  if (kept.length >= REQUEST_RATE_MAX) {
    clientRequestWindows.set(clientId, kept);
    return true;
  }
  kept.push(now);
  clientRequestWindows.set(clientId, kept);
  return false;
}

const circuitState = { openUntil: 0, failures: [] as number[] };

function isCircuitOpen(): boolean { return Date.now() < circuitState.openUntil; }

function markRetryableFailure(): void {
  const now = Date.now();
  circuitState.failures.push(now);
  circuitState.failures = circuitState.failures.filter((ts) => now - ts <= CIRCUIT_FAIL_WINDOW_MS);
  if (circuitState.failures.length >= CIRCUIT_FAIL_THRESHOLD) {
    circuitState.openUntil = now + CIRCUIT_OPEN_MS;
  }
}

function markSuccess(): void { circuitState.failures = []; circuitState.openUntil = 0; }

function isRetryableMessage(message: string): boolean {
  return /429|quota|resource exhausted|rate limit|503|unavailable|overloaded|failed to fetch|network|timeout/.test(message.toLowerCase());
}

function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(36);
}

function buildFingerprint(
  prompt: string,
  history: Message[],
  manualModel?: AIModel | "auto",
  docs: AttachedDocument[] = [],
): string {
  const h = history.slice(-4).map((m) => `${m.role}:${m.content.slice(0, 240)}`).join("|");
  const d = docs.map((x) => `${x.title}:${x.content.length}`).join("|");
  return hashString(`${manualModel ?? "auto"}::${prompt.slice(0, 1500)}::${h}::${d}`);
}

function buildSafeModeContent(intent: QueryIntent, prompt: string, reason: string): string {
  const clipped = prompt.trim().replace(/\s+/g, " ").slice(0, 220);
  if (intent === "coding") {
    return [
      "SEDREX is in safe mode due to high traffic.",
      "", `**Your request:** ${clipped}`, "",
      "**Immediate Steps**",
      "1. Reproduce once with the smallest input that still fails.",
      "2. Capture exact error text and stack trace.",
      "3. Isolate one likely fault area and test it with a minimal case.",
      "4. Apply one fix at a time, then re-run tests.",
      "", `**System note:** ${reason}`,
    ].join("\n");
  }
  return [
    "SEDREX is in safe mode due to high traffic.",
    "", `**Your request:** ${clipped}`, "",
    "**Best Next Action**",
    "1. Break the request into one specific objective.",
    "2. Ask for one decision/output at a time for highest accuracy.",
    "3. Regenerate once traffic settles for a full long-form answer.",
    "", `**System note:** ${reason}`,
  ].join("\n");
}

function buildSafeModeResponse(
  prompt: string,
  routing: RouterResult,
  reason: string,
): NexusResponse {
  return {
    content: buildSafeModeContent(routing.intent, prompt, reason),
    model: routing.model,
    tokens: 0, inputTokens: 0, outputTokens: 0,
    confidence: {
      level: "low", label: "Safe Mode",
      reason: "Traffic protection mode prevented a hard error and returned a deterministic fallback.",
    },
    routingContext: { ...routing, engine: "safe-mode", thinking: false },
  };
}

// ── Observability ─────────────────────────────────────────────────

export interface NexusEvent {
  event:         "query_processed" | "query_error" | "query_routed";
  intent:        string;
  model:         string;
  engine:        string;
  complexity:    number;
  latency_ms:    number;
  input_tokens:  number;
  output_tokens: number;
  total_tokens:  number;
  confidence:    ConfidenceLevel;
  error?:        string;
  timestamp:     string;
}

let _analyticsHandler: ((event: NexusEvent) => void) | null = null;

export function setAnalyticsHandler(fn: (event: NexusEvent) => void): void {
  _analyticsHandler = fn;
}

function emit(event: NexusEvent): void {
  if (_analyticsHandler) { try { _analyticsHandler(event); } catch { /* never crash */ } }
  if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
    console.log(`[SEDREX] ${event.event}`, {
      intent: event.intent, engine: event.engine,
      latency: `${event.latency_ms}ms`, tokens: event.total_tokens, confidence: event.confidence,
    });
  }
}

// ── Confidence signaling ──────────────────────────────────────────

export type ConfidenceLevel = "high" | "moderate" | "low" | "live";

export interface ConfidenceSignal {
  level:  ConfidenceLevel;
  label:  string;
  reason: string;
}

function computeConfidence(
  intent: string,
  complexity: number,
  usedSearch: boolean,
): ConfidenceSignal {
  if (usedSearch) {
    return { level: "live", label: "Live Data", reason: "Answer sourced from real-time web grounding. Verify critical figures independently." };
  }
  if (intent === "technical" || intent === "math" || intent === "physics") {
    return { level: "high", label: "Verified Reasoning", reason: "Derived from established principles. Each step is traceable." };
  }
  if (intent === "analytical") {
    return complexity > 0.7
      ? { level: "moderate", label: "Analytical Inference", reason: "Based on logical reasoning. Complex queries carry inherent uncertainty." }
      : { level: "high",     label: "Structured Analysis",  reason: "Reasoning is direct and well-bounded." };
  }
  return { level: "moderate", label: "Model Inference", reason: "General knowledge response. Verify important claims against primary sources." };
}

// ── Intent routing ────────────────────────────────────────────────

type NexusIntent = "live" | "technical" | "analytical" | "general";

function mapNexusIntentToQueryIntent(intent: NexusIntent): QueryIntent {
  switch (intent) {
    case "live":       return "live";
    case "technical":  return "coding";
    case "analytical": return "reasoning";
    case "general":    return "general";
    default:           return "general";
  }
}

function mapQueryIntentToNexusIntent(qi: QueryIntent): NexusIntent {
  switch (qi) {
    case "live":      return "live";
    case "coding":    return "technical";
    case "reasoning": return "analytical";
    case "general":   return "general";
    default:          return "general";
  }
}

const LIVE_SIGNALS = new Set([
  "weather", "stock price", "stock market", "news today", "latest news",
  "breaking news", "who won", "live score", "exchange rate",
  "crypto price", "bitcoin price", "market cap", "happening now",
  "right now", "today's", "current price",
]);

const PRODUCT_SIGNALS = new Set([
  "buy now", "add to cart", "where to buy", "cheapest price", "worth buying",
  "deals on", "discount on", "best offer", "order online", "cash on delivery",
]);

const TECHNICAL_STRONG = new Set([
  "function", "debug", "error", "exception", "stack trace", "compile",
  "runtime", "api", "endpoint", "sql", "regex", "algorithm", "refactor",
  "optimize", "deploy", "dockerfile", "kubernetes", "typescript",
  "javascript", "python", "rust", "java", "golang", "react", "vue",
  "angular", "node", "express", "django", "flask", "graphql", "jwt",
  "oauth", "cors", "webpack", "vite", "unit test", "ci/cd", "docker",
  "nginx", "calculus", "derivative", "integral", "matrix", "determinant",
  "equation", "theorem", "proof", "newton", "ohm", "circuit", "resistor",
  "velocity", "acceleration", "wavelength", "quantum",
]);

const MATH_PATTERNS = /\b(solve|calculate|how far|how long|how much|how many|what is \d|percentage|ratio|average|probability|km\/h|mph|m\/s|km\s|miles?\s)\b/i;

const TABLE_PATTERNS = /\b(build.{0,12}table|create.{0,12}table|make.{0,12}table|comparison table|compare .{0,60}|side[- ]by[- ]side|breakdown of|rank(?:ing)? of|tabular|matrix|grid|\bvs\b|\bversus\b|difference between|pros.{0,6}cons|features of)\b/i;

const ANALYTICAL_SIGNALS = new Set([
  "analyze", "analyse", "explain why", "implications", "trade-offs",
  "tradeoffs", "pros and cons", "should i", "critique", "evaluate",
  "assess", "what are the risks", "strategy", "compare", "comparison",
  "vs", "versus", "research", "study", "history of", "evolution of",
  "what causes", "difference between", "relationship between", "impact of",
  "evidence", "argument", "philosophy", "theory", "concept", "understand",
  "explain", "break down", "deep dive", "in depth", "overview",
  "summary of", "what is", "who is", "how does", "why does",
]);

export function classifyIntent(
  prompt: string,
  hasImage: boolean,
  hasDocs: boolean,
): NexusIntent {
  const p = prompt.toLowerCase().trim();
  if (hasImage) return "live";
  if ([...LIVE_SIGNALS].some((k) => p.includes(k))) return "live";
  if ([...PRODUCT_SIGNALS].some((k) => p.includes(k))) return "live";
  if (TABLE_PATTERNS.test(prompt)) return "analytical";
  if (p.includes("```") || MATH_PATTERNS.test(p)) return "technical";
  if ([...TECHNICAL_STRONG].some((k) => p.includes(k))) return "technical";
  if ([...ANALYTICAL_SIGNALS].some((k) => p.includes(k))) return "analytical";
  if (prompt.split(/\s+/).length > 50 && hasDocs) return "analytical";
  return "general";
}

export function routePrompt(
  prompt: string,
  hasImage = false,
  hasDocs = false,
): RouterResult {
  const intent     = classifyIntent(prompt, hasImage, hasDocs);
  const complexity = estimateComplexity(prompt, intent, hasDocs);
  const routes: Record<NexusIntent, { model: AIModel; reason: string; explanation: string }> = {
    live:       { model: AIModel.GEMINI, reason: "Live Intelligence",   explanation: "Real-time web grounding active." },
    technical:  { model: AIModel.CLAUDE, reason: "Technical Precision", explanation: "Code, math & engineering core." },
    analytical: { model: AIModel.GPT4,   reason: "Deep Analysis",       explanation: "Structured reasoning engine." },
    general:    { model: AIModel.GPT4,   reason: "Balanced Intelligence",explanation: "Precision synthesis engine." },
  };
  const route = routes[intent];
  return { ...route, confidence: 0.95, complexity, intent: mapNexusIntentToQueryIntent(intent) };
}

function estimateComplexity(
  prompt: string,
  intent: string,
  hasDocs: boolean,
): number {
  const words = prompt.split(/\s+/).length;
  let c = 0.3;
  if      (words > 120) c += 0.35;
  else if (words > 60)  c += 0.2;
  else if (words > 25)  c += 0.1;
  const weight: Record<string, number> = { analytical: 0.3, technical: 0.25, live: 0.1, general: 0 };
  c += weight[intent] ?? 0;
  if (hasDocs) c += 0.15;
  c += 0.05 * Math.min((prompt.match(/\?/g) ?? []).length, 4);
  return Math.min(c, 1.0);
}

// ═══════════════════════════════════════════════════════════════════
// SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════════

const CORE_PROMPT = `
You are SEDREX — a verification-first intelligence engine trusted by analysts,
researchers, consultants, engineers, founders, teachers, and anyone who needs
answers they can act on without re-validating elsewhere.

IDENTITY
When asked who you are:
I am SEDREX — the AI that verifies before it speaks. Built for professionals
who need answers that are correct the first time. Every response I give is
evidence-backed and confidence-scored.

Three principles:
1. Verification over speed — I check before I answer.
2. Zero hallucination — If uncertain, I say so. I never fabricate.
3. Actionable outputs — Every answer is structured for immediate use.

━━ CRITICAL COMPLETION RULES — NEVER BREAK THESE ━━━━━━━━━━━━━━━━

RULE 1 — TABLES: Always complete every table fully. No truncation.
RULE 2 — CODE: ALWAYS write the COMPLETE code file from first to last line.
  NEVER write "// rest of the code", "// existing code stays the same",
  "// implement this", "// add your logic here", "// ...", or any truncation.
  PARTIAL CODE IS WORSE THAN NO CODE. Write it completely or explain why not.
RULE 3 — DIRECT ANSWERS: Answer immediately. Never ask for clarification when intent is clear.
RULE 4 — NO FALSE CONTINUATIONS: If you start something, finish it in the same response.
RULE 5 — NO META-COMMENTARY ABOUT CODE: Never say "I will create a Claude-style artifact",
  "Here is an ArtifactSystem component", "This component handles X".
  Just write the actual code. OUTPUT > DESCRIPTION. Always.

TONE
Clear, direct, authoritative. No hollow openers or closers.

HONESTY
State uncertainty explicitly. Never invent facts or citations.
`.trim();

const FORMAT_RULES = `
FORMATTING INTELLIGENCE — MATCH FORMAT TO CONTENT TYPE

Short questions → short answers. Long questions → thorough answers.

RESPONSE TYPES:
TYPE 1 — SIMPLE FACTUAL: 2-4 sentences, no headers.
TYPE 2 — EXPLANATION: short paragraphs, bold key terms.
TYPE 3 — HOW-TO: numbered steps + code if needed.
TYPE 4 — COMPARISON: verdict first, full table, prose analysis, ## 🎯 Verdict.
TYPE 5 — ANALYSIS: ## 🔍 Finding → ## 📊 Evidence → ## ⚠️ Risks → ## 🎯 Conclusion.
TYPE 6 — TEST RESULTS: table with ✅ ❌, ## 🎯 What This Means.
TYPE 7 — DEBUGGING: ## 🔴 Root Cause → ## 🔧 Fix → ## ✅ Why This Works.
TYPE 8 — CASUAL: 1-2 natural sentences, no formatting.

TABLES: Always use | Col | Col | separator |:---|:---| Never double colons.
CODE: Always tag language. Always write complete runnable code.
EMOJI HEADINGS: Use on ## and ### when response has 3+ sections.
`.trim();

const MODE_TECHNICAL = `
TECHNICAL MODE — Code, Math, Physics, Engineering

FOR CODE:
  → Write the COMPLETE file from first to last line. No exceptions.
  → NEVER truncate. NEVER write "// rest of code...", "// existing code", or "// implement this"
  → Include ALL imports, ALL exports, ALL error handlers
  → Declare the file path as a comment on line 1 (e.g. // src/services/authService.ts)
  → If the file is large, say "Writing the complete X-line file:" before starting
  → One complete file at a time — finish it before moving to the next
  → If multiple files are needed, write each one fully before the next

FOR DEBUGGING: ## 🔴 Root Cause → ## 🔧 Fix → ## ✅ Why This Works → ## ⚡ Prevention
FOR MATH: Problem → Given → Solution (step by step) → Answer → Check ✓
Write ALL formulas as plain text only. NEVER use LaTeX dollar signs.
`.trim();

const MODE_ANALYTICAL = `
ANALYTICAL MODE — Research, Reasoning, Strategy, Comparison

Lead with the answer. Use tables for comparisons — table FIRST, then prose.
Quantify everything: numbers, %, dates. Every section heading gets an emoji.
End with ## 🎯 Verdict — clear, decisive, no hedging.
`.trim();

const MODE_LIVE = `
LIVE / RESEARCH MODE — Real-time and web-grounded answers

## 🔍 [Topic] — [Key Finding]
Lead with the single most important current fact.
Use specific numbers, dates — never "recently" or "approximately".
Cite sources inline when grounding provides them.
`.trim();

const MODE_GENERAL = `
GENERAL MODE — Adapt format to the question type every time.

→ Simple fact → 2-4 sentences, no headers
→ Explanation → short paragraphs, bold key terms
→ How-to → numbered list + code if needed
→ Comparison → table + verdict
→ Casual ("thanks", "ok", "got it") → ONE natural sentence, no formatting
`.trim();

const FAIL_FORWARD = `
FAIL-FORWARD RULE — Never silently refuse.
When you cannot answer fully, explain what is missing and give whatever partial value you can.
BAD: "I cannot access current stock prices."
GOOD: "Live prices require real-time data. Check Yahoo Finance. Here is what I know: [value]"
`.trim();

const ARTIFACT_MODE = `
FILE AND CODE GENERATION — ABSOLUTE RULES

RULE: When generating code or files, OUTPUT THE ACTUAL CODE DIRECTLY.
NEVER say "here is a Claude-style artifact" or "I will create an artifact".
NEVER describe what you are going to write — just write it.
NEVER say "This component handles X logic" as a replacement for the code.

OUTPUT FORMAT FOR CODE:
  Start the code block immediately with the file path comment.
  Write the COMPLETE file from first line to last.
  Use the correct language tag on every fenced block.

CORRECT: Start with the fenced block, file path on line 1, full code inside.
WRONG:   "Here is a TypeScript file that handles authentication..."
WRONG:   "I'll create an ArtifactSystem.tsx component for you."
WRONG:   "This uses Claude-style artifact detection..."

For spreadsheets: complete CSV in a fenced csv block.
For documents: complete self-contained HTML in a fenced html block.
For data: complete JSON in a fenced json block.
For code: complete file in the correct language fenced block.
ALWAYS include ALL data — never truncate, never use placeholders.
`.trim();

function buildSystemInstruction(
  intent: NexusIntent,
  personification: string,
  isProductQuery: boolean,
): string {
  const modeMap: Record<NexusIntent, string> = {
    technical:  MODE_TECHNICAL,
    analytical: MODE_ANALYTICAL,
    live:       MODE_LIVE,
    general:    MODE_GENERAL,
  };

  const tablePrompt = `
DIRECT TABLE RULE: When user says "build table", "create table", or asks to compare
two things — DO NOT ask for clarification. Build the most relevant table immediately.
NEVER respond with "What headers do you want?" — just build it.
`.trim();

  const shoppingPrompt = `
SHOPPING/E-COMMERCE RULES: For product queries always include direct product links
and prefer Indian retailers if user mentions INR, Flipkart, Croma, etc.
`.trim();

  const identityPrompt = buildSedrexSystemPrompt({
    sessionContext: personification?.trim() || undefined,
  });

  // ── FIX 2: ARTIFACT_PROTOCOL injected for ALL intents ────────────
  // Previously only injected for technical/analytical — this meant
  // general and live intents would still truncate code blocks.
  // Now every response type gets the no-truncation rule.
  const parts = [
    identityPrompt,
    CORE_PROMPT,
    FORMAT_RULES,
    modeMap[intent],
    FAIL_FORWARD,
    ARTIFACT_MODE,
    ARTIFACT_PROTOCOL,  // ← injected always, not conditionally
    tablePrompt,
    ...(isProductQuery ? [shoppingPrompt] : []),
    `IMPORTANT: Answer ONLY the current question. Never repeat previous answers.`,
    `CONTEXT\nCurrent date/time: ${new Date().toUTCString()}`,
  ];

  return parts.join("\n\n");
}

// ── Generation config ─────────────────────────────────────────────

interface GenConfig {
  temperature: number;
  maxTokens:   number;
  useThinking: boolean;
}

function getGenerationConfig(
  intent: NexusIntent,
  complexity: number,
  prompt: string,
): GenConfig {
  const isTablePrompt =
    TABLE_PATTERNS.test(prompt) ||
    /\b(table|comparison|vs|versus|matrix|grid|breakdown)\b/i.test(prompt) ||
    /^\s*(build|create|make|write)\s*(a\s+)?table\s*$/i.test(prompt.trim());

  const temp: Record<NexusIntent, number> = {
    technical:  0.1,
    analytical: 0.35,
    live:       0.5,
    general:    0.55,
  };

  // ── FIX 2: All intents can now produce large code outputs ────────
  // technical/analytical: up to 32k (full large files)
  // live/general: up to 16k (can still produce medium code blocks)
  const budget: Record<NexusIntent, [number, number]> = {
    technical:  [8192, 32000],
    analytical: [8192, 32000],
    live:       [2048, 16000],
    general:    [2048, 16000],
  };

  const [min, max] = budget[intent];
  const complexityFloor = isTablePrompt
    ? Math.max(complexity, 0.75)
    : Math.max(complexity, 0.3);

  return {
    temperature: temp[intent],
    maxTokens:   Math.max(Math.round(min + (max - min) * complexityFloor), 8192),
    useThinking: (intent === "analytical" || intent === "technical") && complexity > 0.65,
  };
}

// ── Context builder ───────────────────────────────────────────────

function buildHistory(history: Message[], intent: NexusIntent): any[] {
  const max = MAX_HISTORY[intent] ?? 6;
  const safeHistory = sanitizeConversationHistory(history);
  return safeHistory.slice(-max).map((msg) => ({
    role:  msg.role === "assistant" ? "model" : "user",
    parts: [{
      text: msg.content.length > MAX_MSG_LEN
        ? msg.content.slice(0, MAX_MSG_LEN) + "\n\n[...truncated for context efficiency]"
        : msg.content,
    }],
  }));
}

// ── Post-processing ───────────────────────────────────────────────

function postProcess(raw: string): string {
  let t = raw.trim();

  t = t.replace(/\bincomplete\s+json\s+segment\s+at\s+the\s+end\b\s*[:\-]?\s*/gi, "");

  t = t.replace(/^(\|[:\-\s|]+\|)$/gm, (row) => {
    return row
      .replace(/::/g, ":")
      .replace(/\|-+\|/g, "|---|")
      .replace(/\|:(-+)\|/g, "|:$1|")
      .replace(/\|(-+):\|/g, "|$1:|");
  });

  t = t.replace(/\|:{2,}/g, "|:");
  t = t.replace(/:{2,}\|/g, ":|");

  const hollowOpeners = [
    /^(Sure!?|Absolutely!?|Certainly!?|Of course!?|Great question!?|Good question!?|No problem!?)\s*\n?/i,
    /^(Happy to help!?|Glad you asked!?|Thanks for asking!?)\s*\n?/i,
  ];
  for (const re of hollowOpeners) t = t.replace(re, "");

  const hollowClosings = [
    /\n+\s*(Hope this helps!?|Hope that helps!?)\s*\.?\s*$/i,
    /\n+\s*(Feel free to (?:ask|reach out|let me know)[^.]*\.?)\s*$/i,
    /\n+\s*(Let me know if you (?:need|have) (?:anything else|more|any questions)[^.]*\.?)\s*$/i,
    /\n+\s*(Don't hesitate to (?:ask|reach)[^.]*\.?)\s*$/i,
  ];
  for (const re of hollowClosings) t = t.replace(re, "");

  t = t.replace(
    /\n{2,}(?:[-*•]?\s*(?:Would you like|Do you want|Shall I|Should I|Is there anything)[^\n]+\?\s*\n?){1,3}\s*$/i,
    "",
  );

  t = (() => {
    const lines  = t.split("\n");
    const out: string[] = [];
    let inBlock  = false;
    for (const line of lines) {
      const isBare   = /^```[ \t]*$/.test(line);
      const isTagged = /^```\w/.test(line);
      if      (!inBlock && isBare)   { out.push("```text"); inBlock = true; }
      else if (!inBlock && isTagged) { out.push(line);      inBlock = true; }
      else if  (inBlock && isBare)   { out.push("```");     inBlock = false; }
      else                           { out.push(line); }
    }
    return out.join("\n");
  })();

  t = t.replace(/\n{4,}/g, "\n\n\n");

  if (t.length > 0 && /[a-z]/.test(t[0])) {
    t = t[0].toUpperCase() + t.slice(1);
  }

  t = t.replace(/\n---\s*$/, "");

  const blocks = t.split(/\n{2,}/);
  if (blocks.length > 3) {
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const b of blocks) {
      const key = b.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 150);
      if (key.length < 20 || !seen.has(key)) { seen.add(key); deduped.push(b); }
    }
    if (deduped.length < blocks.length) t = deduped.join("\n\n");
  }

  const cleaned = t.trim();
  if (!cleaned) return "I could not complete that response cleanly. Please try again.";
  return cleaned;
}

function parseEmbeddedJson(raw: string): any | null {
  const direct = raw.trim();
  if (!direct) return null;
  try { return JSON.parse(direct); } catch { /* continue */ }
  const objStart = direct.indexOf("{");
  const objEnd   = direct.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    try { return JSON.parse(direct.slice(objStart, objEnd + 1)); } catch { /* continue */ }
  }
  const arrStart = direct.indexOf("[");
  const arrEnd   = direct.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) {
    try { return JSON.parse(direct.slice(arrStart, arrEnd + 1)); } catch { return null; }
  }
  return null;
}

function normalizeErrorMessage(err: unknown): string {
  const anyErr      = err as any;
  const raw         = String(anyErr?.message ?? anyErr?.error?.message ?? anyErr?.response?.data?.error?.message ?? anyErr?.response?.data?.message ?? "");
  const parsed      = parseEmbeddedJson(raw);
  const parsedError = parsed?.error ?? parsed;
  const status      = Number(anyErr?.status ?? anyErr?.code ?? anyErr?.response?.status ?? parsedError?.code ?? 0);
  const statusText  = String(anyErr?.statusText ?? parsedError?.status ?? "").toLowerCase();
  const providerMsg = String(parsedError?.message ?? raw ?? "");
  const probe       = `${providerMsg} ${statusText}`.toLowerCase();

  if (status === 429 || /\b429\b|resource exhausted|rate limit|quota/.test(probe)) {
    return "SEDREX is receiving high traffic right now. Please retry in 20-30 seconds.";
  }
  if (/incomplete\s+json\s+segment|unexpected end of json|unterminated string in json/.test(probe)) {
    return "The response was cut off before completion. Please press Regenerate.";
  }
  if (/failed to fetch|network|load failed|timeout|unavailable|overloaded/.test(probe)) {
    return "Temporary network issue. Please try again.";
  }
  const compact = providerMsg.replace(/\s+/g, " ").trim();
  return compact || "Something went wrong while generating the response. Please try again.";
}

// ═══════════════════════════════════════════════════════════════════
// PROVIDER CALLERS
// ═══════════════════════════════════════════════════════════════════

async function callOpenAIProvider(
  prompt: string,
  history: Message[],
  systemInstruction: string,
  maxTokens: number,
  temperature: number,
  onStreamChunk?: (text: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const cleanHistory = sanitizeConversationHistory(history);
  const messages = [
    { role: "system" as const, content: systemInstruction },
    ...cleanHistory.slice(-8).map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    })),
    { role: "user" as const, content: prompt },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", signal,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${PROVIDER_OPENAI.key}`,
    },
    body: JSON.stringify({
      model: PROVIDER_OPENAI.model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: !!onStreamChunk,
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `OpenAI API error ${res.status}`);
  }

  if (onStreamChunk && res.body) {
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText  = ""; let inputTokens = 0; let outputTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split("\n")
        .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]");
      for (const line of lines) {
        try {
          const json  = JSON.parse(line.slice(6));
          const chunk = json.choices?.[0]?.delta?.content || "";
          if (chunk) { fullText += chunk; onStreamChunk(chunk); }
          if (json.usage) {
            inputTokens  = json.usage.prompt_tokens;
            outputTokens = json.usage.completion_tokens;
          }
        } catch { /* skip malformed SSE lines */ }
      }
    }
    return { text: fullText, inputTokens, outputTokens };
  }

  const data = await res.json();
  return {
    text:         data.choices[0]?.message?.content || "",
    inputTokens:  data.usage?.prompt_tokens        || 0,
    outputTokens: data.usage?.completion_tokens     || 0,
  };
}

async function callClaudeProvider(
  prompt: string,
  history: Message[],
  systemInstruction: string,
  maxTokens: number,
  temperature: number,
  onStreamChunk?: (text: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const cleanHistory = sanitizeConversationHistory(history);
  const messages = [
    ...cleanHistory.slice(-8).map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    })),
    { role: "user" as const, content: prompt },
  ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": PROVIDER_CLAUDE.key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: PROVIDER_CLAUDE.model,
      max_tokens: maxTokens,
      system: systemInstruction,
      messages,
      stream: !!onStreamChunk,
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `Anthropic API error ${res.status}`);
  }

  if (onStreamChunk && res.body) {
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText  = ""; let inputTokens = 0; let outputTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split("\n").filter((l) => l.startsWith("data: "));
      for (const line of lines) {
        try {
          const json = JSON.parse(line.slice(6));
          if (json.type === "content_block_delta") {
            const chunk = json.delta?.text || "";
            if (chunk) { fullText += chunk; onStreamChunk(chunk); }
          }
          if (json.type === "message_start" && json.message?.usage) {
            inputTokens = json.message.usage.input_tokens;
          }
          if (json.type === "message_delta" && json.usage) {
            outputTokens = json.usage.output_tokens;
          }
        } catch { /* skip malformed SSE lines */ }
      }
    }
    return { text: fullText, inputTokens, outputTokens };
  }

  const data = await res.json();
  return {
    text:         data.content[0]?.text              || "",
    inputTokens:  data.usage?.input_tokens           || 0,
    outputTokens: data.usage?.output_tokens          || 0,
  };
}

// ═══════════════════════════════════════════════════════════════════
// RESPONSE TYPE
// ═══════════════════════════════════════════════════════════════════

export interface NexusResponse {
  content:          string;
  model:            AIModel;
  tokens:           number;
  inputTokens:      number;
  outputTokens:     number;
  confidence:       ConfidenceSignal;
  groundingChunks?: GroundingChunk[];
  routingContext:   RouterResult & {
    engine:          string;
    thinking:        boolean;
    agentType?:      string;
    agentProvider?:  string;
  };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

export const getAIResponse = async (
  prompt:           string,
  history:          Message[],
  manualModel?:     AIModel | "auto",
  onRouting?:       (result: RouterResult) => void,
  image?:           MessageImage,
  documents:        AttachedDocument[] = [],
  personification = "",
  onStreamChunk?:   (text: string) => void,
  signal?:          AbortSignal,
  queueKey = "global",
): Promise<NexusResponse> => {
  const clientId = (queueKey?.split(":")[0] || "global").trim() || "global";

  const isTablePrompt =
    TABLE_PATTERNS.test(prompt) ||
    /^\s*(build|create|make|write)\s*(a\s+)?table\s*$/i.test(prompt.trim());

  if (isClientRateLimited(clientId)) {
    const limitedRoute = routePrompt(prompt, !!image, documents.length > 0);
    onRouting?.(limitedRoute);
    return buildSafeModeResponse(prompt, limitedRoute, "You sent too many requests. Please wait a few seconds.");
  }

  const fingerprint = buildFingerprint(prompt, history, manualModel, documents);
  const now         = Date.now();
  const cached      = responseCache.get(fingerprint);
  if (!isTablePrompt && cached && cached.expiresAt > now) {
    onRouting?.(cached.value.routingContext);
    return cached.value;
  }

  const inFlight = inFlightByFingerprint.get(fingerprint);
  if (inFlight && !isTablePrompt) return inFlight;

  const effectiveQueueKey = isTablePrompt
    ? `${queueKey}:tbl:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`
    : queueKey;

  const work = requestQueue
    .add(
      () => processRequest(
        prompt, history, manualModel, onRouting, image, documents,
        personification, onStreamChunk, signal,
      ),
      effectiveQueueKey,
    )
    .then((res) => {
      if (res.routingContext.intent !== "live" && !isTablePrompt) {
        responseCache.set(fingerprint, {
          value:     res,
          expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
        });
      }
      return res;
    })
    .catch((err) => {
      const fallbackRoute = routePrompt(prompt, !!image, documents.length > 0);
      return buildSafeModeResponse(prompt, fallbackRoute, normalizeErrorMessage(err));
    })
    .finally(() => { inFlightByFingerprint.delete(fingerprint); });

  inFlightByFingerprint.set(fingerprint, work);
  return work;
};

async function processRequest(
  prompt:           string,
  history:          Message[],
  manualModel?:     AIModel | "auto",
  onRouting?:       (result: RouterResult) => void,
  image?:           MessageImage,
  documents:        AttachedDocument[] = [],
  personification = "",
  onStreamChunk?:   (text: string) => void,
  signal?:          AbortSignal,
): Promise<NexusResponse> {
  if (signal?.aborted) throw new DOMException("Request aborted before processing", "AbortError");

  const startTime = Date.now();
  const hasImage  = !!image;
  const hasDocs   = documents.length > 0;

  const routing: RouterResult =
    manualModel && manualModel !== "auto"
      ? {
          model:       manualModel as AIModel,
          reason:      "Manual Override",
          explanation: `Direct routing to ${manualModel}.`,
          confidence:  1.0,
          complexity:  estimateComplexity(
            prompt,
            classifyIntent(prompt, hasImage, hasDocs),
            hasDocs,
          ),
          intent: mapNexusIntentToQueryIntent(classifyIntent(prompt, hasImage, hasDocs)),
        }
      : (() => {
          const r = routePrompt(prompt, hasImage, hasDocs);
          return { ...r, intent: mapNexusIntentToQueryIntent(r.intent as NexusIntent) };
        })();

  onRouting?.(routing);

  const intent      = routing.intent as QueryIntent;
  const nexusIntent = mapQueryIntentToNexusIntent(intent);

  const isProductQuery    = /\b(buy now|add to cart|where to buy|cheapest price|order online|cod|cash on delivery)\b/i.test(prompt);
  const freshnessSignals  = /(latest|today|current|right now|this week|this month|breaking|newly|updated)/i;
  const isTablePrompt     = TABLE_PATTERNS.test(prompt) ||
    /^\s*(build|create|make|write)\s*(a\s+)?table\s*$/i.test(prompt.trim());
  const isGenuinelyLive   = intent === "live" && !TABLE_PATTERNS.test(prompt) && !isTablePrompt;
  const useSearch         = isGenuinelyLive || freshnessSignals.test(prompt);
  const useProModel       = (nexusIntent === "technical" || nexusIntent === "analytical") && routing.complexity > 0.65;
  const engine            = useProModel ? MODELS.PRO : MODELS.FLASH;

  if (isCircuitOpen()) {
    return buildSafeModeResponse(prompt, routing, "High load protection is active. Please retry in a few seconds.");
  }

  const systemInstruction = buildSystemInstruction(nexusIntent, personification, isProductQuery);
  const genConfig         = getGenerationConfig(nexusIntent, routing.complexity, prompt);

  const geminiContents = buildHistory(history, nexusIntent);
  const parts: any[]   = [];
  for (const doc of documents) {
    parts.push({ text: `[DOCUMENT: ${doc.title}]\n\`\`\`\n${doc.content}\n\`\`\`\n` });
  }
  if (image) parts.push({ inlineData: { data: image.inlineData.data, mimeType: image.mimeType } });
  parts.push({ text: prompt });
  geminiContents.push({ role: "user", parts });

  const codebaseContext = getCodebaseContextForQuery(prompt);

  let flatPrompt = prompt;
  if (documents.length > 0 || codebaseContext) {
    const docContext = documents
      .map((d) => `[DOCUMENT: ${d.title}]\n\`\`\`\n${d.content}\n\`\`\`\n`)
      .join("\n");
    const ctxParts = [
      codebaseContext,
      docContext,
      `User question: ${prompt}`,
    ].filter(Boolean);
    flatPrompt = ctxParts.join("\n\n");
  }

  if (codebaseContext) {
    geminiContents[geminiContents.length - 1].parts.unshift({
      text: codebaseContext + "\n\n",
    });
  }

  const baseModelConfig: any = {
    systemInstruction,
    temperature: genConfig.temperature,
    ...(useSearch && { tools: [{ googleSearch: {} }] }),
    ...(genConfig.useThinking && engine === MODELS.PRO && {
      thinkingConfig: {
        thinkingBudget: Math.min(Math.round(genConfig.maxTokens * 0.35), 4096),
      },
    }),
  };

  if (apiKeyPool.length === 0 && !PROVIDER_OPENAI.available && !PROVIDER_CLAUDE.available) {
    throw new Error("No AI provider keys configured. Add VITE_GEMINI_KEY to .env.local");
  }

  let lastError: unknown;

  // ── FIX 2: Broadened code detection + raised ceiling to 32k ─────
  // Now catches: explicit code keywords, file extensions, build/create/write patterns
  const isCodeRequest =
    nexusIntent === 'technical' ||
    /```|\.tsx?|\.jsx?|\.py|\.rs|\.go|\.java|\.kt|\.css|\.html|\.sql/i.test(prompt) ||
    /\b(function|class|component|service|module|hook|util|helper|controller|route|model|schema|interface|type|enum)\b/i.test(prompt) ||
    /\b(write|build|create|generate|implement|code|refactor|fix|debug|update)\b.{0,30}\b(file|code|script|app|page|component|api|endpoint|function|class)\b/i.test(prompt) ||
    /\b(give me|show me|write me|build me|create me)\b.{0,20}\b(full|complete|entire|whole|working)\b/i.test(prompt);

  // For code requests: always use 32k max to avoid ANY truncation
  // For tables: ensure minimum 8k
  // For everything else: use computed config
  let dynamicMaxTokens = isCodeRequest
    ? 32000  // ← FIX 2: raised from 16000 to 32000 (Gemini 3 Flash full output limit)
    : isTablePrompt
    ? Math.max(genConfig.maxTokens, 8192)
    : Math.max(genConfig.maxTokens, 4096);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      let fullText       = "";
      let inputTokens    = 0;
      let outputTokens   = 0;
      let finishReason   = "";
      let usage          = { totalTokenCount: 0, promptTokenCount: 0, candidatesTokenCount: 0 };
      const groundingChunks: GroundingChunk[] = [];

      const agentResult: AgentDispatchResult = await agentDispatch(
        flatPrompt,
        history,
        routing,
        documents,
        personification,
        dynamicMaxTokens,
        genConfig.temperature,
        undefined,
        signal,
      );

      if (agentResult.text) {
        if (onStreamChunk) {
          const words = agentResult.text.split(" ");
          for (const word of words) {
            if (signal?.aborted) throw new DOMException("Stream aborted by user", "AbortError");
            onStreamChunk(word + " ");
          }
        }
        fullText     = agentResult.text;
        inputTokens  = agentResult.inputTokens;
        outputTokens = agentResult.outputTokens;

      } else {
        const geminiSystemInstruction = agentResult.overrideSystemPrompt
          ?? systemInstruction;

        const geminiModelConfig = {
          ...baseModelConfig,
          systemInstruction: geminiSystemInstruction,
          maxOutputTokens:   dynamicMaxTokens,
        };

        const currentApiKey = getApiKey();
        if (!currentApiKey) throw new Error("Gemini API key not configured.");
        const ai = new GoogleGenAI({ apiKey: currentApiKey });

        if (onStreamChunk) {
          const stream = await ai.models.generateContentStream({
            model: engine, contents: geminiContents, config: geminiModelConfig,
          });
          for await (const chunk of stream) {
            if (signal?.aborted) throw new DOMException("Stream aborted by user", "AbortError");
            const text = chunk.text ?? "";
            fullText += text;
            onStreamChunk(text);
            if (chunk.usageMetadata) usage = chunk.usageMetadata as typeof usage;
            const fr = String(chunk.candidates?.[0]?.finishReason ?? "");
            if (fr) finishReason = fr;
            const gc = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
            if (gc) groundingChunks.push(...(gc as GroundingChunk[]));
          }
        } else {
          const response = await ai.models.generateContent({
            model: engine, contents: geminiContents, config: geminiModelConfig,
          });
          fullText     = response.text ?? "";
          usage        = (response.usageMetadata as typeof usage) ?? usage;
          finishReason = String(response.candidates?.[0]?.finishReason ?? "");
          const gc = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (gc) groundingChunks.push(...(gc as GroundingChunk[]));
        }

        // Dynamic token expansion for incomplete table or code responses
        if ((isTablePrompt || isCodeRequest) && /max/i.test(finishReason) && attempt < MAX_RETRIES - 1) {
          // Already at 32k for code — can't go higher, just retry
          if (!isCodeRequest) {
            dynamicMaxTokens = Math.min(Math.round(dynamicMaxTokens * 2.0), 20000);
          }
          await sleep(Math.min(600 * (attempt + 1), 2500));
          continue;
        }

        inputTokens  = usage.promptTokenCount;
        outputTokens = usage.candidatesTokenCount;
        markApiKeySuccess(currentApiKey);
      }

      const content    = postProcess(fullText);
      const confidence = computeConfidence(intent, routing.complexity, useSearch);
      const latency    = Date.now() - startTime;
      markSuccess();

      emit({
        event:         "query_processed",
        intent,
        model:         routing.model,
        engine:        agentResult.text ? agentResult.provider : engine,
        complexity:    routing.complexity,
        latency_ms:    latency,
        input_tokens:  inputTokens,
        output_tokens: outputTokens,
        total_tokens:  inputTokens + outputTokens,
        confidence:    confidence.level,
        timestamp:     new Date().toISOString(),
      });

      return {
        content,
        model:         routing.model,
        tokens:        inputTokens + outputTokens,
        inputTokens,
        outputTokens,
        confidence,
        groundingChunks: groundingChunks.length > 0 ? groundingChunks : undefined,
        routingContext: {
          ...routing,
          engine:        agentResult.text ? agentResult.provider : engine,
          thinking:      genConfig.useThinking,
          agentType:     agentResult.agentType,
          agentProvider: agentResult.provider,
        },
      };

    } catch (err: unknown) {
      lastError = err;
      const msgRaw     = ((err as Error).message ?? "");
      const msg        = msgRaw.toLowerCase();
      const isRetryable = isRetryableMessage(msg);

      if (isRetryable) {
        const currentKey = getApiKey();
        if (currentKey) markApiKeyFailure(currentKey);
      }

      if (isRetryable && attempt < MAX_RETRIES - 1) {
        if ((err as any)?.name !== "AbortError") markRetryableFailure();
        const backoff = Math.min(1500 * 2 ** attempt, 20_000);
        console.warn(`[SEDREX] Retryable error (attempt ${attempt + 1}/${MAX_RETRIES}). Retry in ${backoff}ms…`);
        await sleep(backoff);
        continue;
      }

      emit({
        event:         "query_error",
        intent,
        model:         routing.model,
        engine,
        complexity:    routing.complexity,
        latency_ms:    Date.now() - startTime,
        input_tokens:  0, output_tokens: 0, total_tokens: 0,
        confidence:    "low",
        error:         msg,
        timestamp:     new Date().toISOString(),
      });

      logError(msg, true, routing.model);
      if ((err as any)?.name === "AbortError") throw err;
      if (isRetryable && (err as any)?.name !== "AbortError") markRetryableFailure();
      return buildSafeModeResponse(prompt, routing, normalizeErrorMessage(err));
    }
  }

  return buildSafeModeResponse(
    prompt, routing,
    normalizeErrorMessage(lastError ?? new Error("Request failed after all retries")),
  );
}

// ═══════════════════════════════════════════════════════════════════
// UTILITIES — PRESERVED EXACTLY FROM ORIGINAL
// ═══════════════════════════════════════════════════════════════════

export const generateFollowUpSuggestions = async (
  lastMsg: string,
  intent: string,
): Promise<string[]> => {
  if (apiKeyPool.length === 0) return [];
  let apiKey = "";
  try {
    apiKey = getApiKey();
    const ai      = new GoogleGenAI({ apiKey });
    const trimmed = lastMsg.slice(0, 800);
    const isShopping = /shop|shopping|ecommerce|buy|purchase|order|cart|checkout|product|deal|discount|price|amazon|flipkart|ebay|walmart/i.test(intent + " " + lastMsg);
    const extra = isShopping ? "\nIf relevant, suggest images, videos, or links for the product." : "";
    const response = await ai.models.generateContent({
      model:    MODELS.FLASH,
      contents: `Given this AI response about "${intent}", suggest 3 very short follow-up questions (6 words or less each). Return a JSON array of strings only — no markdown, no preamble.${extra}\n\n"${trimmed}"`,
      config:   { maxOutputTokens: 128 },
    });
    const raw = (response.text ?? "").replace(/```json|```/g, "").trim();
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) { markApiKeySuccess(apiKey); return parsed.slice(0, 3); }
    } catch {
      const repaired = parseEmbeddedJson(raw);
      if (Array.isArray(repaired)) { markApiKeySuccess(apiKey); return repaired.slice(0, 3); }
    }
    markApiKeySuccess(apiKey);
    return [];
  } catch { markApiKeyFailure(apiKey); return []; }
};

export const generateChatTitle = async (firstMessage: string): Promise<string> => {
  if (apiKeyPool.length === 0) return "New Session";
  let apiKey = "";
  try {
    apiKey = getApiKey();
    const ai      = new GoogleGenAI({ apiKey });
    const trimmed = firstMessage.slice(0, 1_000);
    const response = await ai.models.generateContent({
      model:    MODELS.FLASH,
      contents: `Summarize this message as a professional 3–5 word chat title. Return ONLY the title text. No quotes. No period.\n\n"${trimmed}"`,
      config:   { maxOutputTokens: 32 },
    });
    const title = (response.text ?? "").trim().replace(/['"]/g, "").replace(/\.$/, "") || "New Session";
    markApiKeySuccess(apiKey);
    return title;
  } catch { markApiKeyFailure(apiKey); return "New Session"; }
};

export function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const int16      = new Int16Array(data.buffer);
  const frameCount = int16.length / numChannels;
  const buffer     = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = int16[i * numChannels + ch] / 32_768;
    }
  }
  return buffer;
}