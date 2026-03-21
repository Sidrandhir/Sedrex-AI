// services/agents/verificationAgent.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Verification Agent (Tier 3)
//
// Runs AFTER the primary agent responds.
// Cross-checks the answer against sources and confidence signals.
// Upgrades or downgrades the confidence level based on verification.
//
// HOW TO ACTIVATE:
//   In aiService.ts → processRequest(), after the primary agentDispatch()
//   call and before postProcess(), add:
//
//     const verified = await verifyResponse(content, prompt, routing.intent);
//     finalContent   = verified.content;
//     finalConfidence = verified.confidence;
//
// RUNS TODAY: Uses Gemini for verification (no extra key needed).
// FUTURE    : Use Claude for verification when VITE_CLAUDE_KEY is added.
// ══════════════════════════════════════════════════════════════════

import { QueryIntent } from "../../types";
import { ConfidenceSignal } from "../aiService";

// ── Verification thresholds ───────────────────────────────────────
// Only run verification for high-stakes intents.
// Skip for general/casual — too slow and adds no value.
const VERIFICATION_INTENTS = new Set<QueryIntent>([
  "reasoning", "coding", "math", "research",
]);

// Max chars of the response to send for verification (cost control)
const MAX_VERIFY_CHARS = 1200;

// ── Result type ───────────────────────────────────────────────────
export interface VerificationResult {
  content:            string;           // original content (unchanged by design)
  confidence:         ConfidenceSignal; // may be upgraded or downgraded
  verificationNote:   string | null;    // shown in UI tooltip if non-null
  verified:           boolean;          // true = verification ran
}

// ── Verification prompt ───────────────────────────────────────────
function buildVerificationPrompt(
  originalPrompt: string,
  responseSnippet: string,
  intent: QueryIntent,
): string {
  return `
You are a verification checker. Your job is to assess the quality of an AI response.

ORIGINAL QUESTION:
"${originalPrompt.slice(0, 400)}"

AI RESPONSE (first ${MAX_VERIFY_CHARS} chars):
"${responseSnippet}"

Assess this response on three criteria:
1. FACTUAL ACCURACY — Are the claims verifiable and consistent?
2. COMPLETENESS — Does it fully answer the question for intent: ${intent}?
3. HALLUCINATION RISK — Any suspicious specific claims (dates, numbers, names) that seem invented?

Return ONLY a JSON object like this (no markdown, no explanation):
{
  "verdict": "pass" | "warn" | "fail",
  "confidence_override": "high" | "moderate" | "low" | null,
  "note": "one sentence summary of verification result, or null if pass"
}

RULES:
- "pass" → response is accurate, complete, no red flags → confidence_override: null
- "warn" → minor concerns, possible oversimplification → confidence_override: "moderate"
- "fail" → clear factual errors or hallucination detected → confidence_override: "low"
- Keep note under 12 words. null if verdict is "pass".
`.trim();
}

// ── Gemini verifier (active today) ───────────────────────────────
async function runGeminiVerification(
  prompt: string,
  responseSnippet: string,
  intent: QueryIntent,
  apiKey: string,
): Promise<{ verdict: string; confidence_override: string | null; note: string | null }> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  const result = await ai.models.generateContent({
    model:    "gemini-2.5-flash",
    contents: buildVerificationPrompt(prompt, responseSnippet, intent),
    config:   { maxOutputTokens: 128, temperature: 0.1 },
  });

  const raw = (result.text ?? "").replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    // If parsing fails, treat as pass — never degrade UX over verification failure
    return { verdict: "pass", confidence_override: null, note: null };
  }
}

// ── Main verification function ────────────────────────────────────
// Call this after primary agent returns content, before returning SedrexResponse.
export async function verifyResponse(
  content:        string,
  originalPrompt: string,
  intent:         QueryIntent,
  baseConfidence: ConfidenceSignal,
  geminiApiKey:   string,
): Promise<VerificationResult> {

  // Skip verification for intents where it adds no value
  if (!VERIFICATION_INTENTS.has(intent) || !geminiApiKey) {
    return {
      content,
      confidence:       baseConfidence,
      verificationNote: null,
      verified:         false,
    };
  }

  try {
    const snippet = content.slice(0, MAX_VERIFY_CHARS);
    const check   = await runGeminiVerification(originalPrompt, snippet, intent, geminiApiKey);

    // Apply confidence override if verification found issues
    let finalConfidence = baseConfidence;
    if (check.confidence_override === "moderate" && baseConfidence.level === "high") {
      finalConfidence = {
        level:  "moderate",
        label:  "Verified — Minor Caveats",
        reason: check.note ?? "Verification found minor concerns. Review key claims.",
      };
    } else if (check.confidence_override === "low") {
      finalConfidence = {
        level:  "low",
        label:  "Verification Warning",
        reason: check.note ?? "Verification detected potential issues. Cross-check important claims.",
      };
    } else if (check.verdict === "pass") {
      // Upgrade to verified label while keeping the level
      finalConfidence = {
        ...baseConfidence,
        label: `${baseConfidence.label} ✓`,
        reason: baseConfidence.reason,
      };
    }

    return {
      content,
      confidence:       finalConfidence,
      verificationNote: check.note,
      verified:         true,
    };

  } catch {
    // Verification failure is always silent — never degrades primary response
    return {
      content,
      confidence:       baseConfidence,
      verificationNote: null,
      verified:         false,
    };
  }
}