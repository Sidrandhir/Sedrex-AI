// src/services/aiService.ts
// ═══════════════════════════════════════════════════════════════════
// SEDREX AI — MULTI-PROVIDER ENGINE v8.1
// Verification-First Intelligence
//
// SESSION 8 CHANGES:
//   ✅ 'math' added to SedrexIntent — classifyIntent() now returns it
//   ✅ Math detection in classifyIntent() BEFORE technical check
//      Keywords: solve, calculate, equation, derivative, integral,
//      probability, matrix, proof, theorem, formula, how many,
//      how far, what is [number], percentage, ratio
//   ✅ isDiffContent() — content-based diff detector:
//      Fires when response contains ```diff block AND is <50 lines
//      AND has no file path comment on the first line
//   ✅ isDiff now set from EITHER isEditIntent OR isDiffContent(content)
//   ✅ SedrexResponse interface moved to types.ts — imported here
//   ✅ All Session 7 fixes preserved exactly
// ═══════════════════════════════════════════════════════════════════

import { GoogleGenAI } from "@google/genai";
import {
  AIModel,
  Message,
  SedrexRoute,
  MessageImage,
  GroundingChunk,
  AttachedDocument,
  QueryIntent,
  SedrexResponse,
} from "../types";
import { logError } from "./analyticsService";
import {
  buildSedrexSystemPrompt,
  buildAgentSystemPrompt,
  sanitizeConversationHistory,
  ARTIFACT_PROTOCOL,
  TASK_ENGINE_PROTOCOL,
  IMAGE_GENERATION_PROTOCOL,
  buildImagePromptExpansionPrompt,
} from "./SedrexsystemPrompt";
import { dispatch as agentDispatch, AgentDispatchResult } from "./agents/agentOrchestrator";
import { verifyResponse } from "./agents/verificationAgent";
import { getCodebaseContextForQuery } from "./codebaseContext";

const MODELS = {
  FLASH:         "gemini-3-flash-preview",             // Primary — fastest general queries
  FLASH_LITE:    "gemini-3.1-flash-lite-preview",      // Lightweight — titles, follow-ups, expansion
  PRO:           "gemini-3.1-pro-preview",             // Heavy tasks — most advanced reasoning (250/day limit)
  IMAGEN:        "imagen-4.0-generate-001",            // Image — Imagen 4 photorealistic
  IMAGEN_FAST:   "imagen-4.0-fast-generate-001",       // Image — Imagen 4 Fast
  GEMINI_IMAGE:  "nano-banana-pro-preview",            // Image fallback 1 — Nano Banana Pro
  GEMINI_IMAGE2: "gemini-3.1-flash-image-preview",     // Image fallback 2 — Nano Banana 2
  STABLE_FLASH:  "gemini-2.5-flash",                  // Stable fallback — after rate-limit/429
  LAST_RESORT:   "gemini-2.0-flash",                  // Circuit breaker — absolute last resort
} as const;

const MAX_RETRIES  = 4;
const MAX_MSG_LEN  = 8_000;
const MAX_HISTORY: Record<string, number> = {
  technical:  12,
  analytical: 16,
  live:        6,
  general:    10,
  math:       10,
};

// ── SESSION 7 FIX: Cache is now 30s for non-live intents ──────────
const RESPONSE_CACHE_TTL_MS = 30_000;

const CIRCUIT_FAIL_THRESHOLD = 6;
const CIRCUIT_FAIL_WINDOW_MS = 30_000;
const CIRCUIT_OPEN_MS        = 20_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════════
// SESSION 7: EDIT INTENT DETECTION
// ═══════════════════════════════════════════════════════════════════

const EDIT_PATTERNS = [
  /\b(fix|change|update|modify|edit|adjust|tweak|alter|correct|patch)\b.{0,60}\b(code|function|component|file|script|class|hook|service|line|this|it|that)\b/i,
  /\b(line|lines)\s+\d+/i,
  /on\s+line\s+\d+/i,
  /\b(in this|in that|in the)\s+(component|function|file|class|hook|code|service)\b/i,
  /\b(refactor|rename|extract|move|reorganize|restructure)\b/i,
  /\bmake\s+(it|this|that|the\s+\w+)\s+(more|less|faster|smaller|cleaner|readable|efficient|work)\b/i,
  /\badd\s+.{3,60}\s+to\s+(the|this|that|existing)\b/i,
  /\bremove\s+.{3,60}\s+from\s+(the|this|that)\b/i,
  /```[\s\S]{20,}```[\s\S]{0,200}\b(fix|change|update|make|add|remove|refactor)\b/i,
];

/**
 * Returns true when the prompt is an edit/fix request targeting existing code.
 */
export function detectEditIntent(
  prompt: string,
  history: Message[],
): boolean {
  const hasPastedCode = /```[\s\S]{20,}```/.test(prompt);
  const hasCodeInHistory = history.some(
    m => m.role === 'assistant' && /```[\s\S]{20,}```/.test(m.content ?? '')
  );

  if (!hasPastedCode && !hasCodeInHistory) return false;

  return EDIT_PATTERNS.some(re => re.test(prompt));
}

// ═══════════════════════════════════════════════════════════════════
// SESSION 8: CONTENT-BASED DIFF DETECTION
//
// detectEditIntent() fires at request time (before AI responds),
// based on the user prompt. isDiffContent() fires at response time,
// based on what the AI actually returned.
//
// A response is classified as a diff when ALL of these are true:
//   1. Contains a ```diff fenced block
//   2. Total content is under 50 lines (diffs are surgical, not full files)
//   3. First non-empty line does NOT look like a file path comment
//      (// src/... or # src/... = full file, not a diff)
//
// This catches cases where the AI returned a diff without isEditIntent
// being set (e.g. user said "just show me the change" in plain English
// without code history in context).
// ═══════════════════════════════════════════════════════════════════

export function isDiffContent(content: string): boolean {
  if (!content) return false;

  // Must contain a diff fence
  if (!/```diff/i.test(content)) return false;

  const lines = content.split('\n');

  // Total content must be under 50 lines — full file rewrites are always longer
  if (lines.length >= 50) return false;

  // First non-empty line must NOT be a file path comment
  // File path comments look like: // src/services/foo.ts  or  # path/to/file.py
  const firstNonEmpty = lines.find(l => l.trim().length > 0) ?? '';
  const FILE_PATH_COMMENT_RE = /^(?:\/\/|#)\s*[\w./\-]+\.\w{1,10}\s*$/;
  if (FILE_PATH_COMMENT_RE.test(firstNonEmpty.trim())) return false;

  return true;
}

// ── DIFF protocol — injected when editIntent=true ─────────────────
const DIFF_PROTOCOL = `
## SURGICAL DIFF MODE — ACTIVE

The user is asking to MODIFY existing code. DO NOT rewrite the full file.

OUTPUT FORMAT — follow exactly:

\`\`\`diff
- [exact line(s) being removed, with enough context to locate them]
+ [exact replacement line(s)]
\`\`\`

THEN write:

**Changed:** [1-3 bullets — what you changed and why]
**Location:** [function name / line range where the change lives]
**Impact:** [what this change affects — one sentence]

RULES:
1. Show ONLY the changed lines + 2 lines of context above and below.
2. Never output the full file unless the user explicitly asks for it.
3. Use --- a/filename and +++ b/filename headers if filename is known.
4. If multiple separate locations need changes, show each as its own diff block.
5. If the change is so large (>30% of file) that a diff is harder to read than the full file,
   write: "This change touches most of the file. Showing complete rewrite:" then output full file.

NEVER say "here is the complete file" when a diff would suffice.
`.trim();

/**
 * Wraps the user's prompt with diff-mode context when edit intent is detected.
 */
function buildDiffPrompt(
  prompt: string,
  history: Message[],
): string {
  const lastCodeMsg = [...history].reverse().find(
    m => m.role === 'assistant' && /```[\s\S]{20,}```/.test(m.content ?? '')
  );

  const codeContext = lastCodeMsg
    ? `\nEXISTING CODE (most recent version from this conversation):\n${lastCodeMsg.content}\n`
    : '';

  return `${codeContext}\nUSER REQUEST: ${prompt}\n\nRespond with a surgical diff. Show only what changes.`;
}

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
  (typeof import.meta !== "undefined" ? import.meta.env?.VITE_SEDREX_MAX_CONCURRENT ?? undefined : undefined)
  ?? (typeof process !== "undefined" ? process.env?.SEDREX_MAX_CONCURRENT_REQUESTS : undefined)
  ?? 16
);
const MAX_QUEUED_REQUESTS = Number(
  (typeof import.meta !== "undefined" ? import.meta.env?.VITE_SEDREX_MAX_QUEUED ?? undefined : undefined)
  ?? (typeof process !== "undefined" ? process.env?.SEDREX_MAX_QUEUED_REQUESTS : undefined)
  ?? 1000
);
const requestQueue = new KeyedConcurrentQueue(MAX_CONCURRENT_REQUESTS, MAX_QUEUED_REQUESTS);

const REQUEST_RATE_WINDOW_MS = 60_000;
const REQUEST_RATE_MAX       = 30;
const API_KEY_COOLDOWN_MS    = 65_000; // Gemini rate limits reset every 60s; 65s ensures the window has cleared

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

console.log("[SEDREX] Neural key pool size:", apiKeyPool.length);
if (apiKeyPool.length === 0) {
  console.error("[SEDREX] ❌ No neural keys configured. Add VITE_GEMINI_KEY to .env.local");
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
console.log("[SEDREX] Precision Engine:", PROVIDER_OPENAI.available ? "✅ configured" : "⏳ using core fallback");
console.log("[SEDREX] Code Engine:", PROVIDER_CLAUDE.available ? "✅ configured" : "⏳ using core fallback");

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
type CacheEntry = { value: SedrexResponse; expiresAt: number };
const responseCache = new Map<string, CacheEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of responseCache) {
    if (v.expiresAt < now) responseCache.delete(k);
  }
}, 30_000);

const inFlightByFingerprint = new Map<string, Promise<SedrexResponse>>();
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
  // Only retry transient errors (rate limits, server errors, network failures).
  // 400 "INVALID_ARGUMENT" errors are malformed requests — never retryable.
  // Key errors are handled separately by markApiKeyInvalid, not by retrying.
  return /429|quota|resource exhausted|rate limit|503|unavailable|overloaded|failed to fetch|network error|timeout/.test(message.toLowerCase());
}

function isBadRequest(message: string): boolean {
  // 400-class: malformed payload — retrying is pointless, fail fast.
  return /invalid.argument|bad request|\b400\b/.test(message.toLowerCase());
}

function isKeyError(message: string): boolean {
  return /api.?key|api_key_invalid|key expired|permission.?denied|invalid.?api|unauthorized/.test(message.toLowerCase());
}

function isModelNotFound(message: string): boolean {
  return /not.?found|\b404\b|not supported for generate|call listmodels|no longer available/i.test(message);
}

function markApiKeyInvalid(key: string): void {
  if (!key) return;
  // 24h cooldown for expired/invalid keys — effectively removes them from rotation
  apiKeyCooling.set(key, Date.now() + 24 * 60 * 60 * 1000);
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
  const h = history.slice(-4).map((m) => `${m.role}:${(m.content ?? '').slice(0, 240)}`).join("|");
  const d = docs.map((x) => `${x.title}:${(x.content ?? '').length}`).join("|");
  return hashString(`${manualModel ?? "auto"}::${prompt.slice(0, 1500)}::${h}::${d}`);
}

function buildSafeModeContent(intent: QueryIntent, prompt: string, reason: string): string {
  const clipped = prompt.trim().replace(/\s+/g, " ").slice(0, 220);

  const humanReason = (() => {
    if (/api.?key|expired|invalid|api_key/i.test(reason))
      return "API key issue — renew at aistudio.google.com/apikey";
    if (/not.?found|404|listmodels|no longer available/i.test(reason))
      return "Model temporarily unavailable — will retry with fallback on next request";
    if (/quota|429|rate.?limit/i.test(reason))
      return "Rate limit reached — please wait 30 seconds and retry";
    try {
      const p = JSON.parse(reason);
      return (p?.error?.message ?? p?.message ?? reason).slice(0, 150);
    } catch { /* not JSON */ }
    return reason.replace(/[{}"[\]]/g, "").trim().slice(0, 150) || reason;
  })();

  if (intent === "coding") {
    return [
      "SEDREX is in safe mode due to high traffic.",
      "", `**Your request:** ${clipped}`, "",
      "**Immediate Steps**",
      "1. Reproduce once with the smallest input that still fails.",
      "2. Capture exact error text and stack trace.",
      "3. Isolate one likely fault area and test it with a minimal case.",
      "4. Apply one fix at a time, then re-run tests.",
      "", `**System note:** ${humanReason}`,
    ].join("\n");
  }
  return [
    "SEDREX is in safe mode due to high traffic.",
    "", `**Your request:** ${clipped}`, "",
    "**Best Next Action**",
    "1. Break the request into one specific objective.",
    "2. Ask for one decision/output at a time for highest accuracy.",
    "3. Regenerate once traffic settles for a full long-form answer.",
    "", `**System note:** ${humanReason}`,
  ].join("\n");
}

function buildSafeModeResponse(
  prompt: string,
  routing: SedrexRoute,
  reason: string,
): SedrexResponse {
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

export interface SedrexEvent {
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

let _analyticsHandler: ((event: SedrexEvent) => void) | null = null;

export function setAnalyticsHandler(fn: (event: SedrexEvent) => void): void {
  _analyticsHandler = fn;
}

function emit(event: SedrexEvent): void {
  if (_analyticsHandler) { try { _analyticsHandler(event); } catch { /* never crash */ } }
  if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
    console.log(`[SEDREX Analytics] ${event.event}`, {
      intent: event.intent,
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

// SESSION 8: 'math' added to SedrexIntent — routes to o4-mini via reasoningAgent
type SedrexIntent = "live" | "technical" | "analytical" | "general" | "image_generation" | "math";

function mapSedrexIntentToQueryIntent(intent: SedrexIntent): QueryIntent {
  switch (intent) {
    case "live":             return "live";
    case "technical":        return "coding";
    case "analytical":       return "reasoning";
    case "general":          return "general";
    case "image_generation": return "image_generation";
    case "math":             return "math";
    default:                 return "general";
  }
}

function mapQueryIntentToSedrexIntent(qi: QueryIntent): SedrexIntent {
  switch (qi) {
    case "live":             return "live";
    case "coding":           return "technical";
    case "reasoning":        return "analytical";
    case "general":          return "general";
    case "image_generation": return "image_generation";
    case "math":             return "math";
    default:                 return "general";
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
  "nginx",
]);

// ── SESSION 8: MATH SIGNALS ───────────────────────────────────────
// Detected BEFORE the technical check in classifyIntent().
// These are primary math indicators — they override technical routing
// because o4-mini dramatically outperforms code models on math tasks.
//
// Deliberately excludes: "matrix" (too common in ML code contexts),
// "algorithm" (code task), "calculus" (ambiguous — keep in TECHNICAL_STRONG).
// Conservative: false negatives (goes to technical) are less harmful than
// false positives (math prompt gets o4-mini when user wants code).

const MATH_KEYWORDS = new Set([
  "solve", "calculate", "equation", "derivative", "integral",
  "probability", "proof", "theorem", "formula",
  "differentiate", "integrate", "limit", "series", "summation",
  "eigenvalue", "eigenvector", "determinant", "factorial",
  "combinatorics", "permutation", "combination", "binomial",
  "quadratic", "polynomial", "trigonometry", "sine", "cosine",
  "logarithm", "exponent", "modulo", "gcd", "lcm",
]);

// Pattern-based math detection — catches "how far", "what is 3+5", etc.
const MATH_EXPRESSION_PATTERNS = /\b(how\s+(?:many|far|long|much)\s+(?:is|are|does|will|would)|what\s+is\s+\d|percentage\s+of|ratio\s+of|average\s+of|how\s+much\s+(?:is|are|does)|probability\s+(?:of|that)|calculate\s+the|solve\s+for|find\s+the\s+(?:value|area|volume|length|distance|angle|sum|product|derivative|integral)|simplify|expand\s+the|factor(?:ise|ize)?\s+the|\d+\s*[+\-×÷*\/^]\s*\d|\bx\s*=\s*\d|\ba\s*=\s*\d)\b/i;

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
): SedrexIntent {
  const p = prompt.toLowerCase().trim();
  if (hasImage) return "live";
  if ([...LIVE_SIGNALS].some((k) => p.includes(k))) return "live";
  if ([...PRODUCT_SIGNALS].some((k) => p.includes(k))) return "live";
  if (TABLE_PATTERNS.test(prompt)) return "analytical";

  // SESSION 8: MATH CHECK — runs BEFORE technical check.
  // Math intent routes to o4-mini (reasoningAgent with intentHint='math').
  // Guard: must NOT also contain strong code signals (user could ask
  // "calculate the time complexity of this algorithm" — that's technical).
  const hasStrongCodeSignal =
    p.includes("```") ||
    /\b(function|component|hook|service|dockerfile|kubernetes|webpack|oauth|cors|jwt)\b/i.test(p);

  if (!hasStrongCodeSignal) {
    const hasMathKeyword = [...MATH_KEYWORDS].some((k) => p.includes(k));
    const hasMathExpression = MATH_EXPRESSION_PATTERNS.test(prompt);
    if (hasMathKeyword || hasMathExpression) return "math";
  }

  // Technical check (code, calculus, physics, regex etc.)
  if (p.includes("```")) return "technical";
  if ([...TECHNICAL_STRONG].some((k) => p.includes(k))) return "technical";
  // Legacy MATH_PATTERNS that were previously in TECHNICAL block
  // These still route to technical (they're code-adjacent math)
  const LEGACY_MATH_PATTERNS = /\b(calculus|derivative|integral|matrix|determinant|newton|ohm|circuit|resistor|velocity|acceleration|wavelength|quantum)\b/i;
  if (LEGACY_MATH_PATTERNS.test(p)) return "technical";

  if ([...ANALYTICAL_SIGNALS].some((k) => p.includes(k))) return "analytical";
  if (prompt.split(/\s+/).length > 50 && hasDocs) return "analytical";

  const imageTriggers = /\b(generate|create|draw|make|render|depict|paint|illustrate|design|show me|visualize|produce)\b.{0,80}\b(image|picture|photo|graphic|visual|portrait|landscape|illustration|drawing|artwork|logo|icon|avatar|asset|diagram|scene|concept|mockup|ui|interface|banner|poster|thumbnail|wireframe|sketch|render|3d|animation|wallpaper)\b/i;
  const strongGenerate = /^(generate|draw|paint|illustrate|create|make|design|show) +(a|an|the|some|me|us)? +([a-z0-9 \-]{2,80})$/i;
  const visualRequest = /^(image|picture|photo|generate image|draw|create image|make image)/i;
  if (imageTriggers.test(p) || strongGenerate.test(p.trim()) || visualRequest.test(p.trim())) return "image_generation";

  return "general";
}

export function routePrompt(
  prompt: string,
  hasImage = false,
  hasDocs = false,
): SedrexRoute {
  const intent     = classifyIntent(prompt, hasImage, hasDocs);
  const complexity = estimateComplexity(prompt, intent, hasDocs);
  const routes: Record<SedrexIntent, { model: AIModel; reason: string; explanation: string }> = {
    live:             { model: AIModel.GEMINI, reason: "Live Intelligence",   explanation: "Real-time web grounding active." },
    technical:        { model: AIModel.CLAUDE, reason: "Technical Precision", explanation: "Code, math & engineering core." },
    analytical:       { model: AIModel.GPT4,   reason: "Deep Analysis",       explanation: "Structured reasoning engine." },
    general:          { model: AIModel.GPT4,   reason: "Balanced Intelligence",explanation: "Precision synthesis engine." },
    image_generation: { model: AIModel.NANO_BANANA_PRO, reason: "Visual Synthesis", explanation: "Nano Banana image engine." },
    // SESSION 8: math routes to GPT4 (o4-mini is selected by reasoningAgent when OpenAI key present)
    math:             { model: AIModel.GPT4,   reason: "Mathematical Precision", explanation: "o4-mini reasoning engine — best-in-class for math." },
  };
  const route = routes[intent];
  return { ...route, confidence: 0.95, complexity, intent: mapSedrexIntentToQueryIntent(intent) };
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
  const weight: Record<string, number> = { analytical: 0.3, technical: 0.25, live: 0.1, general: 0, math: 0.25 };
  c += weight[intent] ?? 0;
  if (hasDocs) c += 0.15;
  c += 0.05 * Math.min((prompt.match(/\?/g) ?? []).length, 4);
  return Math.min(c, 1.0);
}

// ═══════════════════════════════════════════════════════════════════
// SYSTEM PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════

function buildSystemInstruction(
  intent: SedrexIntent,
  personification: string,
  isProductQuery: boolean,
  isEditIntent = false,
): string {
  const domainMap: Record<SedrexIntent, 'coding' | 'reasoning' | 'live' | 'general' | 'image'> = {
    technical:        'coding',
    analytical:       'reasoning',
    live:             'live',
    general:          'general',
    image_generation: 'image',
    // SESSION 8: math uses reasoning domain — deep step-by-step is correct for math
    math:             'reasoning',
  };

  const domain = domainMap[intent] ?? 'general';

  const tablePrompt = `DIRECT TABLE RULE: When user says "build table", "create table", or asks to compare
two things — DO NOT ask for clarification. Build the most relevant table immediately.
NEVER respond with "What headers do you want?" — just build it.`.trim();

  const shoppingPrompt = `SHOPPING/E-COMMERCE RULES: For product queries always include direct product links
and prefer Indian retailers if user mentions INR, Flipkart, Croma, etc.`.trim();

  const diffSection = isEditIntent
    ? `\n\n${DIFF_PROTOCOL}`
    : '';

  const agentPrompt = buildAgentSystemPrompt(domain, {
    sessionContext: personification?.trim() || undefined,
  });

  const extras = [
    tablePrompt,
    ...(isProductQuery ? [shoppingPrompt] : []),
    `IMPORTANT: Answer ONLY the current question. Never repeat previous answers.`,
    `CONTEXT\nCurrent date/time: ${new Date().toUTCString()}`,
  ];

  return [agentPrompt + diffSection, ...extras].join("\n\n");
}

// ── Generation config ─────────────────────────────────────────────

interface GenConfig {
  temperature: number;
  maxTokens:   number;
  useThinking: boolean;
}

function getGenerationConfig(
  intent: SedrexIntent,
  complexity: number,
  prompt: string,
): GenConfig {
  const isTablePrompt =
    TABLE_PATTERNS.test(prompt) ||
    /\b(table|comparison|vs|versus|matrix|grid|breakdown)\b/i.test(prompt) ||
    /^\s*(build|create|make|write)\s*(a\s+)?table\s*$/i.test(prompt.trim());

  const temp: Record<SedrexIntent, number> = {
    technical:        0.1,
    analytical:       0.35,
    live:             0.5,
    general:          0.3,
    image_generation: 0.75,
    // SESSION 8: math uses near-zero temperature — deterministic is essential
    math:             0.1,
  };

  const budget: Record<SedrexIntent, [number, number]> = {
    technical:        [8192, 32000],
    analytical:       [8192, 32000],
    live:             [2048, 16000],
    general:          [4096, 20000],
    image_generation: [256,  512],
    math:             [4096, 16000],
  };

  const [min, max] = budget[intent];
  const complexityFloor = isTablePrompt
    ? Math.max(complexity, 0.75)
    : Math.max(complexity, 0.3);

  return {
    temperature: temp[intent],
    maxTokens:   Math.max(Math.round(min + (max - min) * complexityFloor), 8192),
    useThinking: (intent === "analytical" || intent === "technical" || intent === "math") && complexity > 0.65,
  };
}

// ── Context builder ───────────────────────────────────────────────

function buildHistory(history: Message[], intent: SedrexIntent): any[] {
  const max = MAX_HISTORY[intent] ?? 6;
  const safeHistory = sanitizeConversationHistory(history)
    .filter((msg) => msg.content != null && msg.content !== '');

  const raw = safeHistory.slice(-max).map((msg) => {
    let text = msg.content ?? '';
    if (msg.role === 'assistant') {
      text = text.replace(/\[ARTIFACT:[^\]]+\]/g, '[code artifact generated]');
    }
    if (text.length > MAX_MSG_LEN) {
      text = text.slice(0, MAX_MSG_LEN) + '\n\n[...truncated for context efficiency]';
    }
    return {
      role:  msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }],
    };
  });

  // ── Gemini contents MUST: (1) start with 'user', (2) strictly alternate ──
  // Enforce this by:
  //   a) Dropping any leading 'model' turns (can't start mid-conversation)
  //   b) Merging consecutive same-role turns (append text with separator)
  const normalized: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const item of raw) {
    if (normalized.length === 0) {
      if (item.role !== 'user') continue; // skip leading model turns
      normalized.push({ role: item.role, parts: [{ text: item.parts[0].text }] });
    } else {
      const last = normalized[normalized.length - 1];
      if (last.role === item.role) {
        // Merge: append text to last turn so roles keep alternating
        last.parts[0].text += '\n\n' + item.parts[0].text;
      } else {
        normalized.push({ role: item.role, parts: [{ text: item.parts[0].text }] });
      }
    }
  }
  return normalized;
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
  const max = MAX_HISTORY.general;
  const messages = [
    { role: "system" as const, content: systemInstruction },
    ...cleanHistory.slice(-max).map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: m.role === 'assistant'
        ? (m.content ?? '').replace(/\[ARTIFACT:[^\]]+\]/g, '[code artifact generated]')
        : (m.content ?? ''),
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
  const max = MAX_HISTORY.technical;
  const messages = [
    ...cleanHistory.slice(-max).map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: m.role === 'assistant'
        ? (m.content ?? '').replace(/\[ARTIFACT:[^\]]+\]/g, '[code artifact generated]')
        : (m.content ?? ''),
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
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

export const getAIResponse = async (
  prompt:           string,
  history:          Message[],
  manualModel?:     AIModel | "auto",
  onRouting?:       (result: SedrexRoute) => void,
  images?:          MessageImage[],
  documents:        AttachedDocument[] = [],
  personification = "",
  onStreamChunk?:   (text: string) => void,
  signal?:          AbortSignal,
  queueKey = "global",
): Promise<SedrexResponse> => {
  const clientId = (queueKey?.split(":")[0] || "global").trim() || "global";

  const isTablePrompt =
    TABLE_PATTERNS.test(prompt) ||
    /^\s*(build|create|make|write)\s*(a\s+)?table\s*$/i.test(prompt.trim());

  if (isClientRateLimited(clientId)) {
    const limitedRoute = routePrompt(prompt, !!(images?.length), documents.length > 0);
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
        prompt, history, manualModel, onRouting, images, documents,
        personification, onStreamChunk, signal,
      ),
      effectiveQueueKey,
    )
    .then((res) => {
      // Don't cache diff responses — they are context-specific
      if (res.routingContext.intent !== "live" && !isTablePrompt && !res.isDiff) {
        responseCache.set(fingerprint, {
          value:     res,
          expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
        });
      }
      return res;
    })
    .catch((err) => {
      const fallbackRoute = routePrompt(prompt, !!(images?.length), documents.length > 0);
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
  onRouting?:       (result: SedrexRoute) => void,
  images?:          MessageImage[],
  documents:        AttachedDocument[] = [],
  personification = "",
  onStreamChunk?:   (text: string) => void,
  signal?:          AbortSignal,
  artifacts:        any[] = [],
): Promise<SedrexResponse> {
  if (signal?.aborted) throw new DOMException("Request aborted before processing", "AbortError");

  const startTime = Date.now();
  const hasImage  = !!(images?.length);
  const hasDocs   = documents.length > 0;

  // SESSION 7: Detect edit intent before routing
  const classifiedIntent = classifyIntent(prompt, hasImage, hasDocs);
  const isEditIntent = classifiedIntent === 'technical' && detectEditIntent(prompt, history);

  if (isEditIntent) {
    console.log("[SEDREX] Edit intent detected — injecting DIFF_PROTOCOL");
  }

  const routing: SedrexRoute =
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
          intent: mapSedrexIntentToQueryIntent(classifyIntent(prompt, hasImage, hasDocs)),
        }
      : (() => {
          const r = routePrompt(prompt, hasImage, hasDocs);
          return { ...r, intent: mapSedrexIntentToQueryIntent(r.intent as SedrexIntent) };
        })();

  onRouting?.(routing);

  const intent      = routing.intent as QueryIntent;
  const sedrexIntent = mapQueryIntentToSedrexIntent(intent);

  const isProductQuery    = /\b(buy now|add to cart|where to buy|cheapest price|order online|cod|cash on delivery)\b/i.test(prompt);
  const freshnessSignals  = /(latest|today|current|right now|this week|this month|breaking|newly|updated)/i;
  const isTablePrompt     = TABLE_PATTERNS.test(prompt) ||
    /^\s*(build|create|make|write)\s*(a\s+)?table\s*$/i.test(prompt.trim());
  const isGenuinelyLive   = intent === "live" && !TABLE_PATTERNS.test(prompt) && !isTablePrompt;
  const useSearch         = isGenuinelyLive || freshnessSignals.test(prompt);
  const useProModel       = (sedrexIntent === "technical" || sedrexIntent === "analytical" || sedrexIntent === "math") && routing.complexity > 0.45;
  let engine: string      = useProModel ? MODELS.PRO : MODELS.FLASH;

  if (isCircuitOpen()) {
    return buildSafeModeResponse(prompt, routing, "High load protection is active. Please retry in a few seconds.");
  }

  const workspaceContext = artifacts.length > 0
    ? `\n\nCURRENT WORKSPACE ARTIFACTS:\n${artifacts.map(a =>
        `- [ARTIFACT:${a.title}] (${a.language})\n${a.content.slice(0, 1500)}${a.content.length > 1500 ? '...' : ''}`
      ).join('\n')}`
    : '';

  const systemInstruction = buildSystemInstruction(
    sedrexIntent,
    personification + workspaceContext,
    isProductQuery,
    isEditIntent,
  );

  const genConfig = getGenerationConfig(sedrexIntent, routing.complexity, prompt);

  const effectivePrompt = isEditIntent
    ? buildDiffPrompt(prompt, history)
    : prompt;

  const geminiContents = buildHistory(history, sedrexIntent);
  const parts: any[]   = [];
  for (const doc of documents) {
    parts.push({ text: `[DOCUMENT: ${doc.title}]\n\`\`\`\n${doc.content}\n\`\`\`\n` });
  }
  if (images?.length) {
    images.forEach((img: MessageImage) => {
      parts.push({ inlineData: { data: img.inlineData.data, mimeType: img.mimeType } });
    });
  }
  parts.push({ text: effectivePrompt });
  geminiContents.push({ role: "user", parts });

  const codebaseContext = getCodebaseContextForQuery(prompt);

  let flatPrompt = effectivePrompt;
  if (documents.length > 0 || codebaseContext) {
    const docContext = documents
      .map((d) => `[DOCUMENT: ${d.title}]\n\`\`\`\n${d.content}\n\`\`\`\n`)
      .join("\n");
    const ctxParts = [
      codebaseContext,
      docContext,
      `User question: ${effectivePrompt}`,
    ].filter(Boolean);
    flatPrompt = ctxParts.join("\n\n");
  }

  if (codebaseContext) {
    geminiContents[geminiContents.length - 1].parts.unshift({
      text: codebaseContext + "\n\n",
    });
  }

  // NOTE: geminiModelConfig is built INSIDE the retry loop below so that
  // thinkingConfig is gated on the CURRENT value of `engine` — not the
  // outer-scope initial value.  If a 429 switches engine to STABLE_FLASH,
  // we must not send thinkingConfig to that model (it doesn't support it).
  // baseModelConfig is intentionally removed for this reason.

  if (apiKeyPool.length === 0 && !PROVIDER_OPENAI.available && !PROVIDER_CLAUDE.available) {
    throw new Error("No AI provider keys configured. Add VITE_GEMINI_KEY to .env.local");
  }

  let lastError: unknown;

  const isCodeRequest =
    sedrexIntent === 'technical' ||
    /```|\.tsx?|\.jsx?|\.py|\.rs|\.go|\.java|\.kt|\.css|\.html|\.sql/i.test(prompt) ||
    /\b(function|class|component|service|module|hook|util|helper|controller|route|model|schema|interface|type|enum)\b/i.test(prompt) ||
    /\b(write|build|create|generate|implement|code|refactor|fix|debug|update)\b.{0,30}\b(file|code|script|app|page|component|api|endpoint|function|class)\b/i.test(prompt) ||
    /\b(give me|show me|write me|build me|create me)\b.{0,20}\b(full|complete|entire|whole|working)\b/i.test(prompt);

  let dynamicMaxTokens = isEditIntent
    ? 8192
    : isCodeRequest
    ? 32000
    : isTablePrompt
    ? Math.max(genConfig.maxTokens, 8192)
    : Math.max(genConfig.maxTokens, 4096);

  const fprint = buildFingerprint(prompt, history, manualModel, documents);
  const key    = getApiKey();
  let lastAttemptedKey = key;

  // ── IMAGE GENERATION BRANCH ──────────────────────────────────────
  if (routing.intent === "image_generation") {
    try {
      const imgResult = await generateImage(flatPrompt);
      const usedEngine = imgResult.engine;
      const response: SedrexResponse = {
        content:      imgResult.text,
        model:        routing.model,
        tokens:       imgResult.tokens.total,
        inputTokens:  imgResult.tokens.input,
        outputTokens: imgResult.tokens.output,
        confidence:   computeConfidence("image_generation", routing.complexity, false),
        generatedImageUrl: imgResult.url,
        routingContext: {
          ...routing,
          engine: usedEngine,
          thinking: false,
        },
      };
      if (RESPONSE_CACHE_TTL_MS > 0) responseCache.set(fprint, { value: response, expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS });
      markSuccess();
      emit({
        event: "query_processed", intent: "image_generation", model: routing.model,
        engine: usedEngine, complexity: routing.complexity, latency_ms: Date.now() - startTime,
        input_tokens: imgResult.tokens.input, output_tokens: imgResult.tokens.output,
        total_tokens: imgResult.tokens.total, confidence: "high", timestamp: new Date().toISOString(),
      });
      return response;
    } catch (err) {
      console.error("[SEDREX] Image generation failed completely:", err);
      // Return a user-friendly response — do NOT fall through to the text retry loop
      const failResponse: SedrexResponse = {
        content: "Image generation is currently unavailable. This usually means your API key doesn't have access to image generation models in Google AI Studio. Please check that your key has Imagen and Gemini image generation enabled at aistudio.google.com.",
        model:        routing.model,
        tokens:       0,
        inputTokens:  0,
        outputTokens: 0,
        confidence:   computeConfidence("image_generation", routing.complexity, false),
        routingContext: { ...routing, engine: MODELS.IMAGEN, thinking: false },
      };
      return failResponse;
    }
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      let fullText       = "";
      let thinkingContent = "";
      let inputTokens    = 0;
      let outputTokens   = 0;
      let finishReason   = "";
      let usage          = { totalTokenCount: 0, promptTokenCount: 0, candidatesTokenCount: 0 };
      const groundingChunks: GroundingChunk[] = [];

      // ── AGENT DISPATCH ────────────────────────────────────────────────
      const agentResult: AgentDispatchResult = await agentDispatch(
        flatPrompt,
        history,
        routing,
        documents,
        personification,
        dynamicMaxTokens,
        genConfig.temperature,
        onStreamChunk,
        signal,
      );

      if (agentResult.text) {
        if (onStreamChunk && agentResult.provider !== "claude" && agentResult.provider !== "openai") {
          const chunks = agentResult.text.match(/.{1,80}/g) ?? [agentResult.text];
          for (const chunk of chunks) {
            if (signal?.aborted) throw new DOMException("Stream aborted by user", "AbortError");
            onStreamChunk(chunk);
          }
        }
        fullText     = agentResult.text;
        inputTokens  = agentResult.inputTokens;
        outputTokens = agentResult.outputTokens;

        // ── INTERCEPT GPT-4 DALL-E TOOL CALL HALLUCINATION ──
        try {
          const cleanText = fullText.replace(/```json/gi, '').replace(/```/g, '').trim();
          if (cleanText.startsWith('{') && cleanText.endsWith('}')) {
            const parsed = JSON.parse(cleanText);
            if (parsed.action === 'dalle.text2im' || parsed.action === 'image_generation' || parsed.action === 'nano_banana') {
              let dallePrompt = prompt;
              if (parsed.action_input) {
                if (typeof parsed.action_input === 'string') {
                  const inner = cleanText.includes('\\"') ? parsed.action_input : (() => { try { return JSON.parse(parsed.action_input); } catch { return parsed.action_input; } })();
                  dallePrompt = typeof inner === 'string' ? inner : (inner.prompt || prompt);
                } else if (parsed.action_input.prompt) {
                  dallePrompt = parsed.action_input.prompt;
                }
              }
              console.log('[SEDREX Visual] Image intent detected — redirecting to visual engine.');
              try {
                const imgResult = await generateImage(dallePrompt);
                const response: SedrexResponse = {
                  content:      imgResult.text,
                  model:        routing.model,
                  tokens:       imgResult.tokens.total,
                  inputTokens:  imgResult.tokens.input,
                  outputTokens: imgResult.tokens.output,
                  confidence:   computeConfidence("image_generation", routing.complexity, false),
                  generatedImageUrl: imgResult.url,
                  routingContext: { ...routing, engine: imgResult.engine, thinking: false },
                };
                if (RESPONSE_CACHE_TTL_MS > 0) responseCache.set(fprint, { value: response, expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS });
                markSuccess();
                return response;
              } catch (err) {
                console.error("[SEDREX] Redirected image generation failed:", err);
              }
            }
          }
        } catch (e) {
          // not JSON, carry on silently
        }

      } else {
        const geminiSystemInstruction = agentResult.overrideSystemPrompt
          ?? systemInstruction;

        // Build config HERE so thinkingConfig is gated on the CURRENT engine.
        // After a 429 falls back to STABLE_FLASH, we must not send thinkingConfig.
        // systemInstruction MUST be a Content object — raw strings can cause 400s
        // on some SDK versions when the string is very long or contains special chars.
        const geminiModelConfig: Record<string, unknown> = {
          systemInstruction: { parts: [{ text: geminiSystemInstruction }] },
          temperature:       genConfig.temperature,
          maxOutputTokens:   dynamicMaxTokens,
          ...(useSearch && { tools: [{ googleSearch: {} }] }),
          ...(genConfig.useThinking && engine === MODELS.PRO && {
            thinkingConfig: {
              includeThoughts: true,   // required for thinking tokens to be returned
              thinkingBudget:  Math.min(Math.round(dynamicMaxTokens * 0.35), 8192),
            },
          }),
        };

        const currentApiKey = getApiKey();
        if (!currentApiKey) throw new Error("Gemini API key not configured.");
        lastAttemptedKey = currentApiKey;
        const ai = new GoogleGenAI({ apiKey: currentApiKey });

        if (onStreamChunk) {
          const stream = await ai.models.generateContentStream({
            model: engine, contents: geminiContents, config: geminiModelConfig,
          });
          for await (const chunk of stream) {
            if (signal?.aborted) throw new DOMException("Stream aborted by user", "AbortError");
            // Capture thinking tokens (thought parts are excluded from chunk.text by the SDK)
            const chunkParts = chunk.candidates?.[0]?.content?.parts ?? [];
            for (const tp of chunkParts) {
              if ((tp as any).thought === true && (tp as any).text) {
                thinkingContent += (tp as any).text;
              }
            }
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
          // Capture thinking tokens from non-streaming response
          const resParts = response.candidates?.[0]?.content?.parts ?? [];
          for (const tp of resParts) {
            if ((tp as any).thought === true && (tp as any).text) {
              thinkingContent += (tp as any).text;
            }
          }
          usage        = (response.usageMetadata as typeof usage) ?? usage;
          finishReason = String(response.candidates?.[0]?.finishReason ?? "");
          const gc = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (gc) groundingChunks.push(...(gc as GroundingChunk[]));
        }

        if ((isTablePrompt || isCodeRequest) && /max/i.test(finishReason) && attempt < MAX_RETRIES - 1) {
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
      const rawConfidence = computeConfidence(intent, routing.complexity, useSearch);

      // ── VERIFICATION PIPELINE ────────────────────────────────────
      // Runs a second Gemini Flash call to cross-check the answer for
      // coding, reasoning, math, and research intents.
      // Upgrades confidence label to "✓ Verified" on pass,
      // or downgrades to moderate/low if issues are found.
      // Silent on failure — never degrades the primary response.
      const verKey = getApiKey();
      const verification = await verifyResponse(content, prompt, intent as QueryIntent, rawConfidence, verKey);
      const confidence = verification.confidence;

      const latency    = Date.now() - startTime;
      markSuccess();

      // ═══════════════════════════════════════════════════════════
      // SESSION 8: isDiff — dual-signal detection
      //
      // A response is marked as a diff when EITHER:
      //   (a) isEditIntent was true (prompt-time signal — user asked
      //       to modify existing code, and we injected DIFF_PROTOCOL)
      //   (b) isDiffContent(content) is true (response-time signal —
      //       the AI returned a diff block regardless of prompt intent)
      //
      // Both signals must be exhausted before setting isDiff=false.
      // This ensures diffs are caught even when edit intent detection
      // fired but the user phrased it without code context in history
      // (isEditIntent=false, but AI still returned a diff).
      // ═══════════════════════════════════════════════════════════
      const isDiff = isEditIntent || isDiffContent(content);

      if (isDiff) {
        console.log("[SEDREX] Diff response detected — skipping artifact extraction");
      }

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
        // SESSION 8: isDiff from dual-signal detection
        isDiff,
        // Thinking tokens captured from Gemini extended thinking mode
        thinkingContent: thinkingContent.trim() || undefined,
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
      const msgRaw       = ((err as Error).message ?? "");
      const msg          = msgRaw.toLowerCase();
      const isRetryable  = isRetryableMessage(msg);
      const isBadReq     = isBadRequest(msg);
      const isKeyErr     = isKeyError(msg);
      const isNotFound   = isModelNotFound(msgRaw);

      // 1. AbortError — rethrow immediately, never suppress
      if ((err as any)?.name === "AbortError") throw err;

      // 2. KEY ERROR — rotate to next key and retry (never safe mode for one bad key).
      // Checked BEFORE isBadReq: key errors carry status INVALID_ARGUMENT which
      // also matches isBadReq, causing premature safe mode if order is wrong.
      if (isKeyErr) {
        console.warn(`[SEDREX] Key error on attempt ${attempt + 1} — rotating key:`, msgRaw.slice(0, 120));
        if (lastAttemptedKey) markApiKeyInvalid(lastAttemptedKey);
        if (attempt < MAX_RETRIES - 1) continue;
        // All keys exhausted — fall through to safe mode
      }

      // 3. MODEL NOT FOUND (404) — switch to stable engine and retry
      else if (isNotFound) {
        console.warn(`[SEDREX] Model not found on attempt ${attempt + 1} — switching to stable engine:`, engine);
        engine = MODELS.STABLE_FLASH;
        if (attempt < MAX_RETRIES - 1) continue;
      }

      // 4. 400 BAD REQUEST (not a key error) — payload is malformed; fail fast
      else if (isBadReq) {
        console.error(`[SEDREX] 400 Bad Request — payload issue (not retrying):`, msgRaw);
        if (lastAttemptedKey) markApiKeySuccess(lastAttemptedKey);
        logError(msg, true, routing.model);
        return buildSafeModeResponse(prompt, routing, normalizeErrorMessage(err));
      }

      // 5. RETRYABLE (429, 503, network) — backoff then retry
      else if (isRetryable) {
        if (lastAttemptedKey) markApiKeyFailure(lastAttemptedKey);

        const is429 = /429|resource exhausted|rate limit|quota/.test(msg);
        if (is429 && attempt >= 1 && engine !== MODELS.STABLE_FLASH) {
          console.warn(`[SEDREX] Rate-limited after ${attempt + 1} attempts — switching to stable engine`);
          engine = MODELS.STABLE_FLASH;
        }
      }

      if (isRetryable && attempt < MAX_RETRIES - 1) {
        const is429ForCircuit = /429|resource exhausted|rate limit|quota/.test(msg);
        if (!is429ForCircuit) markRetryableFailure();
        const backoff = Math.min(1500 * 2 ** attempt, 20_000);
        console.warn(`[SEDREX] Retryable error (attempt ${attempt + 1}/${MAX_RETRIES}). Retry in ${backoff}ms…`);
        await sleep(backoff);
        continue;
      }

      // 6. All retries exhausted — emit, log, return safe mode
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
      const is429Final = /429|resource exhausted|rate limit|quota/.test(msg);
      if (isRetryable && !is429Final) markRetryableFailure();
      return buildSafeModeResponse(prompt, routing, normalizeErrorMessage(err));
    }
  }

  return buildSafeModeResponse(
    prompt, routing,
    normalizeErrorMessage(lastError ?? new Error("Request failed after all retries")),
  );
}

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

export const generateFollowUpSuggestions = async (
  lastMsg: string,
  intent: string,
): Promise<string[]> => {
  if (apiKeyPool.length === 0) return [];
  // Small delay so this secondary call doesn't immediately compete with the
  // main response on the same key — reduces back-to-back 429s
  await sleep(1_500);
  let apiKey = "";
  try {
    apiKey = getApiKey();
    const ai      = new GoogleGenAI({ apiKey });
    const trimmed = lastMsg.slice(0, 800);
    const isShopping = /shop|shopping|ecommerce|buy|purchase|order|cart|checkout|product|deal|discount|price|amazon|flipkart|ebay|walmart/i.test(intent + " " + lastMsg);
    const extra = isShopping ? "\nIf relevant, suggest images, videos, or links for the product." : "";
    const followUpPrompt = `Given this AI response about "${intent}", suggest 3 very short follow-up questions (6 words or less each). Return a JSON array of strings only — no markdown, no preamble.${extra}\n\n"${trimmed}"`;
    const response = await ai.models.generateContent({
      model:    MODELS.FLASH_LITE,   // lightweight model — saves quota for main responses
      contents: [{ role: 'user', parts: [{ text: followUpPrompt }] }],
      config:   { maxOutputTokens: 128, temperature: 0.4 },
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
    const titlePrompt = `Summarize this message as a professional 3–5 word chat title. Return ONLY the title text. No quotes. No period.\n\n"${trimmed}"`;
    const response = await ai.models.generateContent({
      model:    MODELS.FLASH_LITE,   // trivial task — no need to burn FLASH quota
      contents: [{ role: 'user', parts: [{ text: titlePrompt }] }],
      config:   { maxOutputTokens: 32, temperature: 0.3 },
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

/**
 * Generates an image using a triple-strategy approach:
 *  1. PRIMARY:   Imagen 4 via generateImages()
 *  2. FALLBACK1: Nano Banana Pro via generateContent() + responseModalities
 *  3. FALLBACK2: Nano Banana 2 (gemini-3.1-flash-image-preview) via generateContent()
 * Each strategy gets a fresh key. Key invalid → markApiKeyInvalid. 429 → markApiKeyFailure.
 */
async function generateImage(
  prompt: string,
  conversationContext: string = "",
): Promise<{ url: string; text: string; engine: string; tokens: { input: number; output: number; total: number }; expandedPrompt?: string }> {

  // ── Prompt expansion (best-effort, silent on failure) ─────────────
  let expandedPrompt = prompt;
  try {
    console.log("[SEDREX Visual] Expanding image prompt…");
    const expansionKey = getApiKey();
    const expansionAi  = new GoogleGenAI({ apiKey: expansionKey });
    const expansionResult = await expansionAi.models.generateContent({
      model:    MODELS.FLASH_LITE,
      contents: [{ role: 'user', parts: [{ text: buildImagePromptExpansionPrompt(prompt, conversationContext) }] }],
      config:   { maxOutputTokens: 256, temperature: 0.7 },
    });
    const expanded = expansionResult.text?.trim();
    if (expanded && expanded.length > 20 && !expanded.toLowerCase().includes("return only")) {
      expandedPrompt = expanded;
      console.log("[SEDREX Visual] Prompt expanded:", expandedPrompt.slice(0, 100) + "…");
    }
    markApiKeySuccess(expansionKey);
  } catch (expansionErr) {
    console.warn("[SEDREX Visual] Prompt expansion failed, using original:", expansionErr);
  }

  // ── Helper: run a generateContent image strategy ──────────────────
  async function runGeminiImageStrategy(model: string, label: string) {
    const key = getApiKey();
    if (!key) throw new Error("No API key available");
    const ai = new GoogleGenAI({ apiKey: key });
    try {
      const result = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: expandedPrompt }] }],
        config:   { responseModalities: ["TEXT", "IMAGE"], temperature: 0.7, maxOutputTokens: 1024 },
      });
      const parts     = result.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
      const textPart  = parts.find((p: any) => p.text);
      if (!imagePart?.inlineData?.data) throw new Error(`${label} returned no image data`);
      markApiKeySuccess(key);
      return {
        url:    `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
        text:   textPart?.text || `Image generated from: "${expandedPrompt.slice(0, 120)}${expandedPrompt.length > 120 ? '…' : ''}"`,
        engine: model,
        expandedPrompt,
        tokens: {
          input:  (result.usageMetadata as any)?.promptTokenCount ?? 0,
          output: (result.usageMetadata as any)?.candidatesTokenCount ?? 0,
          total:  (result.usageMetadata as any)?.totalTokenCount ?? 0,
        },
      };
    } catch (e: any) {
      if (isKeyError(e?.message ?? "")) markApiKeyInvalid(key);
      else if (isRetryableMessage(e?.message ?? "")) markApiKeyFailure(key);
      throw e;
    }
  }

  // ── STRATEGY 1: Imagen 4 (predict) ───────────────────────────────
  try {
    console.log("[SEDREX Visual] Strategy 1: Imagen 4…");
    const key = getApiKey();
    if (!key) throw new Error("No API key available");
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await (ai.models as any).generateImages({
      model:  MODELS.IMAGEN,
      prompt: expandedPrompt,
      config: { numberOfImages: 1, outputMimeType: "image/png" },
    });
    const img = response?.generatedImages?.[0];
    if (!img?.image?.imageBytes) throw new Error("Imagen 4 returned no image data");
    markApiKeySuccess(key);
    console.log("[SEDREX Visual] ✅ Strategy 1 succeeded (Imagen 4)");
    return {
      url:    `data:${img.image.mimeType || "image/png"};base64,${img.image.imageBytes}`,
      text:   `Image generated from: "${expandedPrompt.slice(0, 120)}${expandedPrompt.length > 120 ? '…' : ''}"`,
      engine: MODELS.IMAGEN,
      tokens: { input: 0, output: 0, total: 0 },
      expandedPrompt,
    };
  } catch (e1: any) {
    if (isKeyError(e1?.message ?? "")) markApiKeyInvalid(getApiKey());
    console.warn("[SEDREX Visual] Strategy 1 failed:", e1?.message ?? e1);
  }

  // ── STRATEGY 2: Nano Banana Pro ───────────────────────────────────
  try {
    console.log("[SEDREX Visual] Strategy 2: Nano Banana Pro…");
    const result = await runGeminiImageStrategy(MODELS.GEMINI_IMAGE, "Nano Banana Pro");
    console.log("[SEDREX Visual] ✅ Strategy 2 succeeded (Nano Banana Pro)");
    return result;
  } catch (e2: any) {
    console.warn("[SEDREX Visual] Strategy 2 failed:", e2?.message ?? e2);
  }

  // ── STRATEGY 3: Nano Banana 2 ─────────────────────────────────────
  try {
    console.log("[SEDREX Visual] Strategy 3: Nano Banana 2…");
    const result = await runGeminiImageStrategy(MODELS.GEMINI_IMAGE2, "Nano Banana 2");
    console.log("[SEDREX Visual] ✅ Strategy 3 succeeded (Nano Banana 2)");
    return result;
  } catch (e3: any) {
    console.error("[SEDREX Visual] ❌ All 3 image strategies failed:", e3?.message ?? e3);
    throw new Error(
      "Image generation failed on all 3 engines. " +
      "Verify your API key has access to Imagen 4 and Nano Banana models in Google AI Studio. " +
      `Last error: ${e3?.message ?? "unknown"}`
    );
  }
}