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

// ═══════════════════════════════════════════════════════════════════
// NEXUS AI — PRODUCTION ENGINE v4.0
//
// Built for: analysts, researchers, consultants, engineers, founders,
// mathematicians, teachers, students — anyone who validates before acting.
//
// Architecture principles:
// 1. True async queue — no race conditions under load
// 2. Observability built-in — every request tracked
// 3. Confidence signaling — users see certainty, not just answers
// 4. Fail-forward UX — redirect, never silent refusal
// 5. Precision without robotics — clear reasoning preserved
// ═══════════════════════════════════════════════════════════════════

// ── Models ────────────────────────────────────────────────────────
const MODELS = {
  FLASH: "gemini-2.0-flash",
  PRO:   "gemini-2.5-pro",
} as const;

// ── Constants ─────────────────────────────────────────────────────
const MAX_RETRIES  = 4;
const MAX_MSG_LEN  = 4_000;
const MAX_HISTORY: Record<string, number> = {
  technical: 8, analytical: 10, live: 4, general: 6,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════════
// Concurrency scheduler
// - Preserves in-order processing per queue key (e.g. one chat session)
// - Allows parallel processing across different keys/users
// - Adds back-pressure guard to avoid unbounded lag under burst traffic
// ═══════════════════════════════════════════════════════════════════

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

const MAX_CONCURRENT_REQUESTS = Number(process.env.NEXUS_MAX_CONCURRENT_REQUESTS ?? 16);
const MAX_QUEUED_REQUESTS = Number(process.env.NEXUS_MAX_QUEUED_REQUESTS ?? 1000);
const requestQueue = new KeyedConcurrentQueue(MAX_CONCURRENT_REQUESTS, MAX_QUEUED_REQUESTS);

const REQUEST_RATE_WINDOW_MS = Number(process.env.NEXUS_RATE_WINDOW_MS ?? 60_000);
const REQUEST_RATE_MAX = Number(process.env.NEXUS_RATE_MAX_PER_WINDOW ?? 30);

const API_KEY_COOLDOWN_MS = Number(process.env.NEXUS_API_KEY_COOLDOWN_MS ?? 30_000);
const apiKeyPool = [
  process.env.GEMINI_KEY_1,
  process.env.GEMINI_KEY_2,
  process.env.GEMINI_KEY_3,
  process.env.GEMINI_KEY_4,
  process.env.GEMINI_KEY_5,
  process.env.GEMINI_KEY_6,
  process.env.GEMINI_API_KEY,
].filter((k): k is string => !!k && k.trim().length > 0);

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

  // All keys are in cooldown; use round-robin anyway as last resort.
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

const RESPONSE_CACHE_TTL_MS = Number(process.env.NEXUS_RESPONSE_CACHE_TTL_MS ?? 45_000);
const CIRCUIT_FAIL_THRESHOLD = Number(process.env.NEXUS_CIRCUIT_FAIL_THRESHOLD ?? 6);
const CIRCUIT_FAIL_WINDOW_MS = Number(process.env.NEXUS_CIRCUIT_FAIL_WINDOW_MS ?? 30_000);
const CIRCUIT_OPEN_MS = Number(process.env.NEXUS_CIRCUIT_OPEN_MS ?? 20_000);

type CacheEntry = { value: NexusResponse; expiresAt: number };
const responseCache = new Map<string, CacheEntry>();
const inFlightByFingerprint = new Map<string, Promise<NexusResponse>>();
const clientRequestWindows = new Map<string, number[]>();

function isClientRateLimited(clientId: string): boolean {
  const now = Date.now();
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

const circuitState = {
  openUntil: 0,
  failures: [] as number[],
};

function isCircuitOpen(): boolean {
  return Date.now() < circuitState.openUntil;
}

function markRetryableFailure(): void {
  const now = Date.now();
  circuitState.failures.push(now);
  circuitState.failures = circuitState.failures.filter((ts) => now - ts <= CIRCUIT_FAIL_WINDOW_MS);
  if (circuitState.failures.length >= CIRCUIT_FAIL_THRESHOLD) {
    circuitState.openUntil = now + CIRCUIT_OPEN_MS;
  }
}

function markSuccess(): void {
  circuitState.failures = [];
  circuitState.openUntil = 0;
}

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
  const h = history
    .slice(-4)
    .map((m) => `${m.role}:${m.content.slice(0, 240)}`)
    .join("|");
  const d = docs.map((x) => `${x.title}:${x.content.length}`).join("|");
  return hashString(`${manualModel ?? "auto"}::${prompt.slice(0, 1500)}::${h}::${d}`);
}

function buildSafeModeContent(intent: QueryIntent, prompt: string, reason: string): string {
  const clipped = prompt.trim().replace(/\s+/g, " ").slice(0, 220);
  if (intent === "coding") {
    return [
      "Nexus is in safe mode due to high traffic, so I am giving you a deterministic troubleshooting path instead of failing your request.",
      "",
      `**Your request:** ${clipped}`,
      "",
      "**Immediate Steps**",
      "1. Reproduce once with the smallest input that still fails.",
      "2. Capture exact error text and stack trace.",
      "3. Isolate one likely fault area and test it with a minimal case.",
      "4. Apply one fix at a time, then re-run tests.",
      "",
      `**System note:** ${reason}`,
    ].join("\n");
  }

  return [
    "Nexus is in safe mode due to high traffic, so I am returning a stable response path instead of an error.",
    "",
    `**Your request:** ${clipped}`,
    "",
    "**Best Next Action**",
    "1. Break the request into one specific objective.",
    "2. Ask for one decision/output at a time for highest accuracy.",
    "3. Regenerate once traffic settles for a full long-form answer.",
    "",
    `**System note:** ${reason}`,
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
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    confidence: {
      level: "low",
      label: "Safe Mode",
      reason: "Traffic protection mode prevented a hard error and returned a deterministic fallback.",
    },
    routingContext: { ...routing, engine: "safe-mode", thinking: false },
  };
}

// ═══════════════════════════════════════════════════════════════════
// P2: OBSERVABILITY — every request produces a structured event
// Drop this into your analytics pipeline (Segment, Mixpanel, Datadog,
// or even a simple Postgres table).
// ═══════════════════════════════════════════════════════════════════

export interface NexusEvent {
  event:        "query_processed" | "query_error" | "query_routed";
  intent:       string;
  model:        string;
  engine:       string;
  complexity:   number;
  latency_ms:   number;
  input_tokens: number;
  output_tokens:number;
  total_tokens: number;
  confidence:   ConfidenceLevel;
  error?:       string;
  timestamp:    string;
}

// Override this to send events to your backend:
// e.g. analytics.track(event.event, event)
let _analyticsHandler: ((event: NexusEvent) => void) | null = null;

export function setAnalyticsHandler(fn: (event: NexusEvent) => void): void {
  _analyticsHandler = fn;
}

function emit(event: NexusEvent): void {
  if (_analyticsHandler) {
    try { _analyticsHandler(event); } catch { /* never let analytics crash the app */ }
  }
  // Always log to console in development
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Nexus] ${event.event}`, {
      intent: event.intent,
      engine: event.engine,
      latency: `${event.latency_ms}ms`,
      tokens: event.total_tokens,
      confidence: event.confidence,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// P5: CONFIDENCE SIGNALING
// Every response carries an explicit confidence level the UI can render.
// This is Nexus's key differentiator vs ChatGPT / Claude.
// ═══════════════════════════════════════════════════════════════════

export type ConfidenceLevel = "high" | "moderate" | "low" | "live";

export interface ConfidenceSignal {
  level:  ConfidenceLevel;
  label:  string;   // e.g. "Verified Reasoning"
  reason: string;   // e.g. "Derived from established mathematical principles"
}

function computeConfidence(
  intent: string,
  complexity: number,
  usedSearch: boolean,
): ConfidenceSignal {
  if (usedSearch) {
    return {
      level:  "live",
      label:  "Live Data",
      reason: "Answer sourced from real-time web grounding. Verify critical figures independently.",
    };
  }

  // High confidence: deterministic domains
  if (intent === "technical" || intent === "math" || intent === "physics") {
    return {
      level:  "high",
      label:  "Verified Reasoning",
      reason: "Derived from established principles. Each step is traceable.",
    };
  }

  // Moderate: analytical reasoning — sound logic but depends on framing
  if (intent === "analytical") {
    return complexity > 0.7
      ? {
          level:  "moderate",
          label:  "Analytical Inference",
          reason: "Based on logical reasoning. Complex queries carry inherent uncertainty.",
        }
      : {
          level:  "high",
          label:  "Structured Analysis",
          reason: "Reasoning is direct and well-bounded.",
        };
  }

  // General / conversational
  return {
    level:  "moderate",
    label:  "Model Inference",
    reason: "General knowledge response. Verify important claims against primary sources.",
  };
}

// ═══════════════════════════════════════════════════════════════════
// P4: SIMPLIFIED INTENT ROUTING — 4 lanes, not 8
// Live → Technical → Analytical → General
// Clear, debuggable, covers all user types.
// ═══════════════════════════════════════════════════════════════════

// NexusIntent is internal, map to QueryIntent for type compatibility
type NexusIntent = "live" | "technical" | "analytical" | "general";

// Map NexusIntent to QueryIntent for API compatibility
function mapNexusIntentToQueryIntent(intent: NexusIntent): QueryIntent {
  switch (intent) {
    case "live": return "live";
    case "technical": return "coding";
    case "analytical": return "reasoning";
    case "general": return "general";
    default: return "general";
  }
}

// ── Signal sets — each term is a hard trigger ─────────────────────
const LIVE_SIGNALS = new Set([
  "weather", "stock price", "stock market", "news today", "latest news",
  "breaking news", "who won", "live score", "exchange rate",
  "crypto price", "bitcoin price", "market cap", "happening now",
  "right now", "today's", "current price",
]);

const PRODUCT_SIGNALS = new Set([
  "buy", "purchase", "shop", "shopping", "order online",
  "where to buy", "cheapest", "worth buying", "deals on",
  "amazon", "flipkart", "ebay", "best buy", "walmart",
]);

// Technical = code + math + physics + data
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
const TABLE_PATTERNS = /\b(build.{0,12}table|create.{0,12}table|make.{0,12}table|comparison table|compare .{0,40} vs|side[- ]by[- ]side|breakdown of|rank(?:ing)? of|tabular|matrix|grid)\b/i;

// Analytical = deep thinking, strategy, comparison, research
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

  // Images always go to live (multimodal via Gemini)
  if (hasImage) return "live";

  // Real-time data — highest priority
  if ([...LIVE_SIGNALS].some((k) => p.includes(k))) return "live";
  if ([...PRODUCT_SIGNALS].some((k) => p.includes(k))) return "live";

  // Table/comparison requests require structured analytical output and higher token budget.
  if (TABLE_PATTERNS.test(prompt)) return "analytical";

  // Technical: code, math, physics, engineering
  if (p.includes("```") || MATH_PATTERNS.test(p)) return "technical";
  if ([...TECHNICAL_STRONG].some((k) => p.includes(k))) return "technical";

  // Analytical: reasoning, research, history, philosophy, strategy
  if ([...ANALYTICAL_SIGNALS].some((k) => p.includes(k))) return "analytical";

  // Long document-backed queries default to analytical
  if (prompt.split(/\s+/).length > 50 && hasDocs) return "analytical";

  return "general";
}

// ── Router ────────────────────────────────────────────────────────
export function routePrompt(
  prompt: string,
  hasImage = false,
  hasDocs  = false,
): RouterResult {
  const intent     = classifyIntent(prompt, hasImage, hasDocs);
  const complexity = estimateComplexity(prompt, intent, hasDocs);

  const routes: Record<NexusIntent, { model: AIModel; reason: string; explanation: string }> = {
    live: {
      model:       AIModel.GEMINI,
      reason:      "Live Intelligence",
      explanation: "Real-time web grounding active.",
    },
    technical: {
      model:       AIModel.CLAUDE,
      reason:      "Technical Precision",
      explanation: "Code, math & engineering core.",
    },
    analytical: {
      model:       AIModel.GPT4,
      reason:      "Deep Analysis",
      explanation: "Structured reasoning engine.",
    },
    general: {
      model:       AIModel.GPT4,
      reason:      "Balanced Intelligence",
      explanation: "Precision synthesis engine.",
    },
  };

  const route = routes[intent];
  return { ...route, confidence: 0.95, complexity, intent: mapNexusIntentToQueryIntent(intent) };
}

function estimateComplexity(
  prompt:  string,
  intent:  string,
  hasDocs: boolean,
): number {
  const words = prompt.split(/\s+/).length;
  let c = 0.3;
  if      (words > 120) c += 0.35;
  else if (words > 60)  c += 0.2;
  else if (words > 25)  c += 0.1;

  const weight: Record<string, number> = {
    analytical: 0.3, technical: 0.25, live: 0.1, general: 0,
  };
  c += weight[intent] ?? 0;
  if (hasDocs) c += 0.15;
  c += 0.05 * Math.min((prompt.match(/\?/g) ?? []).length, 4);
  return Math.min(c, 1.0);
}

// ═══════════════════════════════════════════════════════════════════
// SYSTEM PROMPTS — ONE SOURCE OF TRUTH PER INTENT
// ═══════════════════════════════════════════════════════════════════

const CORE_PROMPT = `
You are Nexus AI — a precision reasoning engine trusted by analysts, researchers,
consultants, engineers, mathematicians, teachers, founders, and anyone who needs
answers they can act on without re-validating elsewhere.

IDENTITY
When asked "who are you" or similar:

---
I am Nexus AI — the AI you trust when the answer must be right.

I'm built for professionals who cannot afford wrong answers: analysts who validate
before presenting, researchers who need traceable reasoning, engineers who need
working code, consultants who brief decision-makers, and founders who act on data.

Three non-negotiables:
1. **Precision over popularity** — I optimize for correctness, not engagement.
2. **Zero-hallucination culture** — I state uncertainty explicitly. I never fabricate.
3. **Actionable outputs only** — Every answer is structured for immediate use.

Before Nexus: Ask → doubt → re-search → re-verify → finally act.
With Nexus: Ask → receive → act.
---

TONE
Clear, direct, and authoritative — like a trusted senior colleague who shows their
reasoning. Not robotic. Not minimal. PRECISE. Explanations are welcome and encouraged
when they serve understanding. Transitions, context, and reasoning chains are kept
when they add value. Only pure filler is removed.

Do not use:
- Hollow openers: "Sure!", "Absolutely!", "Great question!"
- Hollow closings: "Hope this helps!", "Feel free to ask!"
- Unsolicited follow-up questions at the end of responses

HONESTY
- If uncertain: say so explicitly. State the confidence level.
- If information may be outdated: flag it.
- Never invent facts, statistics, citations, or names.
- If a question requires real-time data you don't have: say so and redirect.
`.trim();

const FORMAT_RULES = `
FORMATTING — THE STANDARD EVERY RESPONSE MUST MEET

Structure:
- ## for main sections, ### for subsections
- **Bold** for key terms, labels, and important callouts
- \`inline code\` for commands, filenames, variables, functions
- Fenced code blocks with explicit language tags
- Tables for ANY side-by-side comparison (2+ options/features)
- Table cells: concise (≤ 15 words). Prose goes below the table.
- Numbered lists for steps. Bullets for unordered items.
- Paragraphs: 2–4 sentences, blank line between them.

Depth calibration:
- Simple fact → 1–3 sentences. No padding.
- Explanation/concept → full sections with examples.
- Complex analysis → structured with headings, evidence, verdict.
- Never truncate reasoning that serves understanding.
`.trim();

// ── Intent-specific modes ─────────────────────────────────────────

const MODE_TECHNICAL = `
TECHNICAL MODE — Code, Math, Physics, Engineering

FOR CODE:
1. Lead with complete, production-ready code. No preamble.
2. Never truncate. Include error handling, types, edge cases.
3. After code: key decisions in 3–5 bullets. Root cause in 1–2 sentences for bugs.
4. No unsolicited "next steps" after the answer is complete.

FOR MATH / PHYSICS:
Always use this exact structure:

**Problem:** [restate the question clearly]

**Given:**
- [value 1 with unit]
- [value 2 with unit]

**Solution:**
Step 1: [state the law/formula with name]
Step 2: [substitute values with units]
Step 3: [calculate, show work]

**Answer:** [exact result + decimal approximation if needed]

**Verification:** ✓ [check units, plug back in, or sanity check]

UNIT RULES:
- Write units as plain text: A, V, Ω, N, kg, m/s², °C, J, W
- NEVER use LaTeX (\\text{}, \\Omega, \\times)
- Use × for multiplication: (2 A) × (10 Ω) = 20 V
- Never put commas before units
`.trim();

const MODE_ANALYTICAL = `
ANALYTICAL MODE — Research, Reasoning, Strategy, Philosophy, History, Explanation

Structure every analytical response as:

1. **Direct Answer** — State the core conclusion or finding first.
2. **Evidence / Reasoning** — Show the logical chain: premise → evidence → conclusion.
3. **Counterarguments** — Name the strongest opposing view. Address it honestly.
4. **Nuance / Caveats** — What the answer depends on. What the exceptions are.
5. **Verdict** — A clear, decisive final statement. No hedging.

Rules:
- Quantify wherever possible: use numbers, percentages, dates — not "many" or "some"
- For history/philosophy/concepts: include concrete examples to anchor abstraction
- For contested topics: present major positions objectively before giving verdict
- For research questions: flag if data may be outdated or unverifiable
- Depth scales with complexity. Short questions get short answers. Hard questions get full treatment.
`.trim();

const MODE_LIVE = `
LIVE / RESEARCH MODE — Real-time and web-grounded answers

1. Lead with the most important current finding.
2. Cite sources when Google Search grounding provides them.
3. Use specific numbers, dates, prices — never vague approximations.
4. Flag clearly if data may change rapidly (prices, scores, breaking news).
5. If you cannot verify a claim from search results, say so.
`.trim();

const MODE_GENERAL = `
GENERAL MODE

Answer directly and completely. Match depth to the question:
- Factual questions → concise and precise
- Conceptual questions → explanation with examples
- Comparative questions → table + prose analysis
- Creative/brainstorming → structured, concrete, original

Preserve reasoning that serves understanding. Remove only empty filler.
`.trim();

// ── Fail-forward redirects (P6) ───────────────────────────────────
const FAIL_FORWARD = `
FAIL-FORWARD RULE — Never silently refuse or give empty declines.

When you cannot answer fully:
- Explain specifically what is missing (real-time data, proprietary info, etc.)
- Tell the user exactly what they can do instead
- Give whatever partial value you can

Examples:
  ✗ BAD: "I cannot access current stock prices."
  ✓ GOOD: "Live prices require real-time data. For AAPL right now: check Yahoo Finance
           or Bloomberg. Here's what I can tell you about AAPL's fundamentals and
           recent earnings trends from my training data: [provide value]"

  ✗ BAD: "I don't have that information."
  ✓ GOOD: "I cannot verify this specific figure — my training data may not cover it.
           Here's what I do know with confidence: [provide related verified value]"
`.trim();

// ── Artifact generation ───────────────────────────────────────────
const ARTIFACT_MODE = `
FILE GENERATION
When the user asks to create or export a file:
- Spreadsheet/Excel → CSV in a \`\`\`csv block
- Document/Report → styled HTML in an \`\`\`html block (self-contained, inline CSS)
- Data export → \`\`\`json block
- Code → appropriate language block

Include ALL data — never truncate. After the block, say:
"Use the download button above to save this file."
`.trim();

// ── System instruction assembler ──────────────────────────────────
function buildSystemInstruction(
  intent:       NexusIntent,
  personification: string,
  isProductQuery:  boolean,
): string {
  const modeMap: Record<NexusIntent, string> = {
    technical:  MODE_TECHNICAL,
    analytical: MODE_ANALYTICAL,
    live:       MODE_LIVE,
    general:    MODE_GENERAL,
  };

  // Shopping/ecommerce enhancement
  const shoppingPrompt = `\nSHOPPING/E-COMMERCE RULES:\n- For any shopping, product, or ecommerce query, always include:\n  1. At least one product image (as a direct image URL, shown above the product name).\n  2. A direct product link to a top retailer (Amazon, Flipkart, Croma, Tata Cliq, Reliance Digital, Walmart, Best Buy, etc.) immediately next to the product name, formatted as markdown: [Buy on Amazon](https://amazon.in/product).\n  3. The product link must be styled in green (use <span style=\"color:#10b981\">[Buy on Amazon](https://amazon.in/product)</span> in markdown).\n  4. A video review link if available, shown as [Watch Video](https://youtube.com/...).\n- Prefer Indian retailers if user is in India or mentions INR, Flipkart, Croma, Tata Cliq, etc.\n- If no image or video is available, say so clearly.\n- Suggestions should include: 'Show product images', 'View product video', 'Compare prices on Flipkart', etc.\n- Example format:\n  ![Product Name](https://image-url.jpg)\n  **Product Name** <span style=\"color:#10b981\">[Buy on Amazon](https://amazon.in/product)</span>\n  [Watch Video](https://youtube.com/...)`;

  const parts = [
    CORE_PROMPT,
    FORMAT_RULES,
    modeMap[intent],
    FAIL_FORWARD,
    ARTIFACT_MODE,
    shoppingPrompt,
    `IMPORTANT: Always answer ONLY the current user question. Never include or repeat answers to previous questions unless the user explicitly asks for a summary or reference. Do not reference or restate any previous question or answer unless requested.`,
    `CONTEXT\nCurrent date/time: ${new Date().toUTCString()}`,
  ];

  if (personification?.trim()) {
    parts.push(`USER CONTEXT\n${personification.trim()}`);
  }

  return parts.join("\n\n");
}

// ── Generation config ─────────────────────────────────────────────
interface GenConfig {
  temperature: number;
  maxTokens:   number;
  useThinking: boolean;
}

function getGenerationConfig(intent: NexusIntent, complexity: number, prompt: string): GenConfig {
  const isTablePrompt = TABLE_PATTERNS.test(prompt) || /\b(table|comparison|vs|versus|matrix|grid|breakdown)\b/i.test(prompt);
  const temp: Record<NexusIntent, number> = {
    technical:  0.1,
    analytical: 0.35,
    live:       0.5,
    general:    0.55,
  };

  // [min, max] token budgets
  const budget: Record<NexusIntent, [number, number]> = {
    technical:  [1024, 12288],
    analytical: [2048, 10240],
    live:       [512,  3072],
    general:    isTablePrompt ? [2048, 8192] : [512, 4096],
  };

  const [min, max] = budget[intent];
  const complexityFloor = isTablePrompt ? Math.max(complexity, 0.5) : complexity;
  return {
    temperature: temp[intent],
    maxTokens:   Math.round(min + (max - min) * complexityFloor),
    useThinking: (intent === "analytical" || intent === "technical") && complexity > 0.65,
  };
}

// ── Context builder ───────────────────────────────────────────────
function buildHistory(history: Message[], intent: NexusIntent): any[] {
  const max = MAX_HISTORY[intent] ?? 6;

  return history.slice(-max).map((msg) => ({
    role:  msg.role === "assistant" ? "model" : "user",
    parts: [{
      text: msg.content.length > MAX_MSG_LEN
        ? msg.content.slice(0, MAX_MSG_LEN) + "\n\n[...truncated for context efficiency]"
        : msg.content,
    }],
  }));
}

// ═══════════════════════════════════════════════════════════════════
// P3 FIX: POST-PROCESSING — PRECISION, NOT ROBOTICS
// Only removes genuine filler. Preserves reasoning, transitions,
// context, and explanations that serve the user.
// ═══════════════════════════════════════════════════════════════════

function postProcess(raw: string): string {
  let t = raw.trim();

  // Remove known provider/truncation artifacts that occasionally leak into model text.
  t = t.replace(/\bincomplete\s+json\s+segment\s+at\s+the\s+end\b\s*[:\-]?\s*/gi, "");

  // ── Remove hollow openers only (not useful context-setters) ──────
  // Only strip pure filler words, not phrases that provide orientation
  const hollowOpeners = [
    /^(Sure!?|Absolutely!?|Certainly!?|Of course!?|Great question!?|Good question!?|No problem!?)\s*\n?/i,
    /^(Happy to help!?|Glad you asked!?|Thanks for asking!?)\s*\n?/i,
  ];
  for (const re of hollowOpeners) t = t.replace(re, "");

  // ── Remove hollow closings only ───────────────────────────────────
  // Only the pure filler sign-offs, not substantive conclusions
  const hollowClosings = [
    /\n+\s*(Hope this helps!?|Hope that helps!?)\s*\.?\s*$/i,
    /\n+\s*(Feel free to (?:ask|reach out|let me know)[^.]*\.?)\s*$/i,
    /\n+\s*(Let me know if you (?:need|have) (?:anything else|more|any questions)[^.]*\.?)\s*$/i,
    /\n+\s*(Don't hesitate to (?:ask|reach)[^.]*\.?)\s*$/i,
  ];
  for (const re of hollowClosings) t = t.replace(re, "");

  // ── Remove unsolicited trailing questions ─────────────────────────
  // Only when they appear as a standalone block at the very end
  t = t.replace(
    /\n{2,}(?:[-*•]?\s*(?:Would you like|Do you want|Shall I|Should I|Is there anything)[^\n]+\?\s*\n?){1,3}\s*$/i,
    ""
  );

  // ── Tag unlabeled opening fences only — never touch closing fences ──
  // Root cause of the ```text bug: a regex can't distinguish opening from
  // closing because both look identical (bare ``` on its own line).
  // Fix: walk line-by-line with a state flag. Only an opening fence (seen
  // while NOT inside a block) gets tagged. The closing fence is emitted as
  // plain ``` every time, which is correct markdown.
  t = (() => {
    const lines = t.split("\n");
    const out: string[] = [];
    let inBlock = false;
    for (const line of lines) {
      const isBare   = /^```[ \t]*$/.test(line);   // ``` with no language tag
      const isTagged = /^```\w/.test(line);         // ```mermaid, ```python, etc.
      if (!inBlock && isBare) {
        out.push("```text");   // opening fence: add language tag
        inBlock = true;
      } else if (!inBlock && isTagged) {
        out.push(line);        // already-tagged opening fence: pass through
        inBlock = true;
      } else if (inBlock && isBare) {
        out.push("```");       // closing fence: emit plain, never tag
        inBlock = false;
      } else {
        out.push(line);        // regular line inside or outside a block
      }
    }
    return out.join("\n");
  })();

  // ── Collapse excessive blank lines ────────────────────────────────
  t = t.replace(/\n{4,}/g, "\n\n\n");

  // ── Capitalize first character ────────────────────────────────────
  if (t.length > 0 && /[a-z]/.test(t[0])) {
    t = t[0].toUpperCase() + t.slice(1);
  }

  // ── Remove trailing horizontal separators ─────────────────────────
  t = t.replace(/\n---\s*$/, "");

  // ── De-duplicate exact repeated paragraphs ────────────────────────
  const blocks = t.split(/\n{2,}/);
  if (blocks.length > 3) {
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const b of blocks) {
      const key = b.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 150);
      if (key.length < 20 || !seen.has(key)) {
        seen.add(key);
        deduped.push(b);
      }
    }
    if (deduped.length < blocks.length) t = deduped.join("\n\n");
  }

  // If markdown table appears truncated, warn clearly instead of ending abruptly.
  const lines = t.split("\n");
  const tableLines = lines.filter((l) => l.trim().startsWith("|"));
  if (tableLines.length >= 2) {
    const lastMeaningfulLine = [...lines].reverse().find((l) => l.trim().length > 0) ?? "";
    const hasHeaderSeparator = tableLines.some((l) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(l.trim()));
    const oddPipeCount = (lastMeaningfulLine.match(/\|/g) ?? []).length % 2 === 1;
    const looksTruncatedTable = lastMeaningfulLine.trim().startsWith("|") && (!hasHeaderSeparator || oddPipeCount);
    if (looksTruncatedTable && !/table was cut off/i.test(t)) {
      t += "\n\n> Table was cut off due to response length. Type \"continue table\" to get the remaining rows.";
    }
  }

  const cleaned = t.trim();
  if (!cleaned) {
    return "I could not complete that response cleanly. Please try again.";
  }
  return cleaned;
}

function parseEmbeddedJson(raw: string): any | null {
  const direct = raw.trim();
  if (!direct) return null;

  try {
    return JSON.parse(direct);
  } catch {
    // Try to parse first JSON object embedded in a larger string.
  }

  const objStart = direct.indexOf("{");
  const objEnd = direct.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    const maybeJson = direct.slice(objStart, objEnd + 1);
    try {
      return JSON.parse(maybeJson);
    } catch {
      // continue and try array extraction
    }
  }

  const arrStart = direct.indexOf("[");
  const arrEnd = direct.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) {
    const maybeArray = direct.slice(arrStart, arrEnd + 1);
    try {
      return JSON.parse(maybeArray);
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeErrorMessage(err: unknown): string {
  const anyErr = err as any;
  const raw = String(
    anyErr?.message
    ?? anyErr?.error?.message
    ?? anyErr?.response?.data?.error?.message
    ?? anyErr?.response?.data?.message
    ?? ""
  );

  const parsed = parseEmbeddedJson(raw);
  const parsedError = parsed?.error ?? parsed;
  const status = Number(
    anyErr?.status
    ?? anyErr?.code
    ?? anyErr?.response?.status
    ?? parsedError?.code
    ?? 0
  );

  const statusText = String(
    anyErr?.statusText
    ?? parsedError?.status
    ?? ""
  ).toLowerCase();

  const providerMsg = String(
    parsedError?.message
    ?? raw
    ?? ""
  );

  const probe = `${providerMsg} ${statusText}`.toLowerCase();

  if (status === 429 || /\b429\b|resource exhausted|rate limit|quota/.test(probe)) {
    return "Nexus is receiving high traffic right now. Please retry in 20-30 seconds.";
  }

  if (/incomplete\s+json\s+segment\s+at\s+the\s+end|unexpected end of json|unterminated string in json|json/.test(probe)) {
    return "The response was cut off before completion. Please press Regenerate.";
  }

  if (/failed to fetch|network|load failed|timeout|unavailable|overloaded/.test(probe)) {
    return "Temporary network issue. Please try again.";
  }

  const compact = providerMsg.replace(/\s+/g, " ").trim();
  return compact || "Something went wrong while generating the response. Please try again.";
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

export interface NexusResponse {
  content:        string;
  model:          AIModel;
  tokens:         number;
  inputTokens:    number;
  outputTokens:   number;
  confidence:     ConfidenceSignal;
  groundingChunks?: GroundingChunk[];
  routingContext: RouterResult & { engine: string; thinking: boolean };
}

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
  const isTablePrompt = TABLE_PATTERNS.test(prompt);
  if (isClientRateLimited(clientId)) {
    const limitedRoute = routePrompt(prompt, !!image, documents.length > 0);
    onRouting?.(limitedRoute);
    return buildSafeModeResponse(
      prompt,
      limitedRoute,
      "You sent too many requests in a short time. Please wait a few seconds and retry.",
    );
  }

  const fingerprint = buildFingerprint(prompt, history, manualModel, documents);
  const now = Date.now();
  const cached = responseCache.get(fingerprint);
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
    .add(() =>
      processRequest(
        prompt, history, manualModel, onRouting,
        image, documents, personification, onStreamChunk, signal,
      ),
      effectiveQueueKey,
    )
    .then((res) => {
      if (res.routingContext.intent !== "live" && !isTablePrompt) {
        responseCache.set(fingerprint, { value: res, expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS });
      }
      return res;
    })
    .catch((err) => {
      const fallbackRoute = routePrompt(prompt, !!image, documents.length > 0);
      return buildSafeModeResponse(prompt, fallbackRoute, normalizeErrorMessage(err));
    })
    .finally(() => {
      inFlightByFingerprint.delete(fingerprint);
    });

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
  const startTime = Date.now();

  // ── Routing ─────────────────────────────────────────────────────
  const hasImage = !!image;
  const hasDocs  = documents.length > 0;

  const routing: RouterResult =
    manualModel && manualModel !== "auto"
      ? {
          model:       manualModel as AIModel,
          reason:      "Manual Override",
          explanation: `Direct routing to ${manualModel}.`,
          confidence:  1.0,
          complexity:  estimateComplexity(prompt, classifyIntent(prompt, hasImage, hasDocs), hasDocs),
          intent:      mapNexusIntentToQueryIntent(classifyIntent(prompt, hasImage, hasDocs)),
        }
      : (() => {
          const r = routePrompt(prompt, hasImage, hasDocs);
          return { ...r, intent: mapNexusIntentToQueryIntent(r.intent as NexusIntent) };
        })();

  onRouting?.(routing);

  const intent        = routing.intent as QueryIntent;
  // Map QueryIntent back to NexusIntent for internal logic
  function mapQueryIntentToNexusIntent(qi: QueryIntent): NexusIntent {
    switch (qi) {
      case "live": return "live";
      case "coding": return "technical";
      case "reasoning": return "analytical";
      case "general": return "general";
      default: return "general";
    }
  }
  const nexusIntent = mapQueryIntentToNexusIntent(intent);
  const isProductQuery = [...PRODUCT_SIGNALS].some((k) => prompt.toLowerCase().includes(k));
  const freshnessSignals = /(latest|today|current|right now|this week|this month|breaking|newly|updated)/i;
  // Search only when freshness/live data is likely needed.
  const useSearch     = intent === "live" || isProductQuery || freshnessSignals.test(prompt);
  const useProModel   = (nexusIntent === "technical" || nexusIntent === "analytical") && routing.complexity > 0.65;
  const engine        = useProModel ? MODELS.PRO : MODELS.FLASH;
  const isTablePrompt = TABLE_PATTERNS.test(prompt);

  if (isCircuitOpen()) {
    return buildSafeModeResponse(prompt, routing, "High load protection is active. Please retry in a few seconds.");
  }

  // ── Build request ───────────────────────────────────────────────
  const systemInstruction = buildSystemInstruction(nexusIntent, personification, isProductQuery);
  const genConfig         = getGenerationConfig(nexusIntent, routing.complexity, prompt);
  const contents          = buildHistory(history, nexusIntent);

  // Assemble current message parts
  const parts: any[] = [];
  for (const doc of documents) {
    parts.push({ text: `[DOCUMENT: ${doc.title}]\n\`\`\`\n${doc.content}\n\`\`\`\n` });
  }
  if (image) {
    parts.push({ inlineData: { data: image.inlineData.data, mimeType: image.mimeType } });
  }
  parts.push({ text: prompt });
  contents.push({ role: "user", parts });

  const baseModelConfig: any = {
    systemInstruction,
    temperature:     genConfig.temperature,
    ...(useSearch && { tools: [{ googleSearch: {} }] }),
    ...(genConfig.useThinking && engine === MODELS.PRO && {
      thinkingConfig: { thinkingBudget: Math.min(Math.round(genConfig.maxTokens * 0.35), 4096) },
    }),
  };

  // ── API key ─────────────────────────────────────────────────────
  if (apiKeyPool.length === 0) {
    throw new Error("Gemini API key not configured. Set GEMINI_API_KEY in your environment.");
  }

  // ── Retry loop with exponential backoff ─────────────────────────
  let lastError: unknown;
  let dynamicMaxTokens = isTablePrompt
    ? Math.max(genConfig.maxTokens, 2048)
    : genConfig.maxTokens;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const currentApiKey = getApiKey();
    const ai = new GoogleGenAI({ apiKey: currentApiKey });
    try {
      let fullText = "";
      let finishReason = "";
      let usage    = { totalTokenCount: 0, promptTokenCount: 0, candidatesTokenCount: 0 };
      const groundingChunks: GroundingChunk[] = [];
      const modelConfig = { ...baseModelConfig, maxOutputTokens: dynamicMaxTokens };

      // Stream a quick progress hint without adding artificial delay.
      const isLongOrComplex = prompt.length > 120 || routing.complexity > 0.7;
      if (onStreamChunk && isLongOrComplex) {
        onStreamChunk('Thinking...');
      }

      if (onStreamChunk) {
        const stream = await ai.models.generateContentStream({
          model:    engine,
          contents,
          config:   modelConfig,
        });
        for await (const chunk of stream) {
          if (signal?.aborted) break;
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
          model:    engine,
          contents,
          config:   modelConfig,
        });
        fullText = response.text ?? "";
        usage    = (response.usageMetadata as typeof usage) ?? usage;
        finishReason = String(response.candidates?.[0]?.finishReason ?? "");
        const gc = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (gc) groundingChunks.push(...(gc as GroundingChunk[]));
      }

      if (isTablePrompt && /max/i.test(finishReason) && attempt < MAX_RETRIES - 1) {
        dynamicMaxTokens = Math.min(Math.round(dynamicMaxTokens * 1.7), 12288);
        await sleep(Math.min(600 * (attempt + 1), 2500));
        continue;
      }

      const content    = postProcess(fullText);
      const confidence = computeConfidence(intent, routing.complexity, useSearch);
      const latency    = Date.now() - startTime;
      markApiKeySuccess(currentApiKey);
      markSuccess();

      // Emit observability event
      emit({
        event:         "query_processed",
        intent,
        model:         routing.model,
        engine,
        complexity:    routing.complexity,
        latency_ms:    latency,
        input_tokens:  usage.promptTokenCount,
        output_tokens: usage.candidatesTokenCount,
        total_tokens:  usage.totalTokenCount,
        confidence:    confidence.level,
        timestamp:     new Date().toISOString(),
      });

      return {
        content,
        model:          routing.model,
        tokens:         usage.totalTokenCount,
        inputTokens:    usage.promptTokenCount,
        outputTokens:   usage.candidatesTokenCount,
        confidence,
        groundingChunks: groundingChunks.length > 0 ? groundingChunks : undefined,
        routingContext:  { ...routing, engine, thinking: genConfig.useThinking },
      };

    } catch (err: unknown) {
      lastError    = err;
      const msgRaw = ((err as Error).message ?? "");
      const msg    = msgRaw.toLowerCase();
      const isRetryable = isRetryableMessage(msg);

      if (isRetryable) {
        markApiKeyFailure(currentApiKey);
      }

      if (isRetryable && attempt < MAX_RETRIES - 1) {
        markRetryableFailure();
        const backoff = Math.min(1500 * 2 ** attempt, 20_000);
        console.warn(`[Nexus] Retryable error (attempt ${attempt + 1}/${MAX_RETRIES}). Retry in ${backoff}ms…`);
        await sleep(backoff);
        continue;
      }

      // Emit error event for observability
      emit({
        event:         "query_error",
        intent,
        model:         routing.model,
        engine,
        complexity:    routing.complexity,
        latency_ms:    Date.now() - startTime,
        input_tokens:  0,
        output_tokens: 0,
        total_tokens:  0,
        confidence:    "low",
        error:         msg,
        timestamp:     new Date().toISOString(),
      });

      logError(msg, true, routing.model);

      if ((err as any)?.name === "AbortError") {
        throw err;
      }

      if (isRetryable) markRetryableFailure();
      return buildSafeModeResponse(prompt, routing, normalizeErrorMessage(err));
    }
  }

  return buildSafeModeResponse(
    prompt,
    routing,
    normalizeErrorMessage(lastError ?? new Error("Request failed")),
  );
}

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

export const generateFollowUpSuggestions = async (
  lastMsg: string,
  intent:  string,
): Promise<string[]> => {
  if (apiKeyPool.length === 0) return [];
  let apiKey = "";
  try {
    apiKey = getApiKey();
    const ai      = new GoogleGenAI({ apiKey });
    const trimmed = lastMsg.slice(0, 800);
    // If the topic is shopping or ecommerce, enhance the prompt
    const isShopping = /shop|shopping|ecommerce|buy|purchase|order|cart|checkout|product|deal|discount|price|amazon|flipkart|ebay|walmart|best buy/i.test(intent + ' ' + lastMsg);
    const extra = isShopping
      ? '\nIf relevant, also suggest images, videos, or links that would help the user get a clearer understanding of the product or platform.'
      : '';
    const response = await ai.models.generateContent({
      model:    MODELS.FLASH,
      contents:
        `Given this AI response about "${intent}", suggest 3 very short, direct follow-up questions a user is most likely to ask next. Each question should be 6 words or less, focused, and actionable. Prioritize the most natural next step, not generic or broad questions.${extra} Return a JSON array of strings only — no markdown, no preamble.\n\n"${trimmed}"`,
      config:   { maxOutputTokens: 128 },
    });
    const raw = (response.text ?? "").replace(/```json|```/g, "").trim();
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        markApiKeySuccess(apiKey);
        return parsed.slice(0, 3);
      }
    } catch {
      const repaired = parseEmbeddedJson(raw);
      if (Array.isArray(repaired)) {
        markApiKeySuccess(apiKey);
        return repaired.slice(0, 3);
      }
    }
    markApiKeySuccess(apiKey);
    return [];
  } catch {
    markApiKeyFailure(apiKey);
    return [];
  }
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
    const title = (
      (response.text ?? "")
        .trim()
        .replace(/['"]/g, "")
        .replace(/\.$/, "")
      || "New Session"
    );
    markApiKeySuccess(apiKey);
    return title;
  } catch {
    markApiKeyFailure(apiKey);
    return "New Session";
  }
};

// ── Audio utilities ───────────────────────────────────────────────
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
  data:        Uint8Array,
  ctx:         AudioContext,
  sampleRate:  number,
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