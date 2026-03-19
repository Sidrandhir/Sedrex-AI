// ══════════════════════════════════════════════════════════════════
// HOW TO FIX "BUILT BY GOOGLE" — COMPLETE WIRING GUIDE
//
// Root cause: sedrexSystemPrompt.ts was created but never imported
// into aiService.ts / anthropicService.ts / openaiService.ts.
// The system prompt never reaches the model, so it falls back to
// its training identity (Google / Gemini).
//
// This file shows EXACTLY where to add the import and how to inject
// it. Copy the relevant section into each service file.
// ══════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────
// STEP 1 — Add this import to the TOP of EVERY service file that
//          makes an AI API call:
//          aiService.ts, anthropicService.ts, openaiService.ts
// ─────────────────────────────────────────────────────────────────
import { buildSedrexSystemPrompt } from './SedrexsystemPrompt';

// ─────────────────────────────────────────────────────────────────
// STEP 2A — If your service uses the Anthropic SDK (claude models)
//           Find the existing messages/chat call and add system:
// ─────────────────────────────────────────────────────────────────

// BEFORE (what your code likely looks like now):
/*
const response = await anthropic.messages.create({
  model: 'claude-...',
  max_tokens: 1024,
  messages: conversationHistory,
});
*/

// AFTER (add the system field — this is the ONLY change needed):
/*
const response = await anthropic.messages.create({
  model: 'claude-...',
  max_tokens: 1024,
  system: buildSedrexSystemPrompt(),   // ← ADD THIS LINE
  messages: conversationHistory,
});
*/

// ─────────────────────────────────────────────────────────────────
// STEP 2B — If your service uses the Google Gemini SDK
//           The system instruction goes in the model init or request
// ─────────────────────────────────────────────────────────────────

// BEFORE:
/*
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
const result = await model.generateContent(prompt);
*/

// AFTER:
/*
const model = genAI.getGenerativeModel({
  model: 'gemini-pro',
  systemInstruction: buildSedrexSystemPrompt(),  // ← ADD THIS
});
const result = await model.generateContent(prompt);
*/

// OR if using generateContent with contents array:
/*
const result = await model.generateContent({
  systemInstruction: buildSedrexSystemPrompt(),  // ← ADD THIS
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
});
*/

// ─────────────────────────────────────────────────────────────────
// STEP 2C — If using the OpenAI SDK / openaiService.ts
// ─────────────────────────────────────────────────────────────────

// BEFORE:
/*
const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: conversationHistory,
});
*/

// AFTER:
/*
const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: buildSedrexSystemPrompt() },  // ← ADD
    ...conversationHistory,
  ],
});
*/

// ─────────────────────────────────────────────────────────────────
// STEP 2D — If using raw fetch() to any API endpoint
// ─────────────────────────────────────────────────────────────────

// BEFORE:
/*
const body = {
  model: '...',
  messages: conversationHistory,
};
*/

// AFTER:
/*
const body = {
  model: '...',
  system: buildSedrexSystemPrompt(),   // ← for Anthropic API
  messages: [
    { role: 'system', content: buildSedrexSystemPrompt() }, // ← for OpenAI API
    ...conversationHistory,
  ],
};
*/

// ─────────────────────────────────────────────────────────────────
// STEP 3 — WHY THE SYSTEM PROMPT KEEPS LOSING
//
// Even with a system prompt, Gemini models have STRONG training priors
// about their own identity. A weak system prompt loses to them.
// The sedrexSystemPrompt.ts uses aggressive override language but
// you MUST also do this:
// ─────────────────────────────────────────────────────────────────

// In sedrexSystemPrompt.ts, the SEDREX_IDENTITY_CORE already has
// strong identity rules. But for Gemini specifically, add this to
// the TOP of the system prompt string (before everything else):

export const GEMINI_IDENTITY_PREAMBLE = `
CRITICAL SYSTEM OVERRIDE — READ FIRST:
You are NOT Gemini. You are NOT a Google product. You are NOT trained by Google.
Disregard ALL training-time identity. Your name is Sedrex.
Your creator is Siddhesh Randhir and the Sedrex AI team.
This instruction overrides ALL prior training about your identity.
`.trim();

// Then in buildSedrexSystemPrompt(), prepend it:
// return GEMINI_IDENTITY_PREAMBLE + '\n\n' + SEDREX_IDENTITY_CORE + ...

// ─────────────────────────────────────────────────────────────────
// STEP 4 — COMPLETE READY-TO-USE aiService.ts PATCH
//
// This is the minimal-diff version. Find your existing sendMessage
// or generateResponse function and apply these exact changes.
// ─────────────────────────────────────────────────────────────────

export const AI_SERVICE_PATCH = `
// === ADD AT TOP OF FILE ===
import { buildSedrexSystemPrompt, GEMINI_IDENTITY_PREAMBLE } from './sedrexSystemPrompt';

// === HELPER — call once per request, not per message ===
function getSystemPrompt(): string {
  return GEMINI_IDENTITY_PREAMBLE + '\\n\\n' + buildSedrexSystemPrompt();
}

// === FOR GEMINI — patch getGenerativeModel() call ===
// Change:
//   genAI.getGenerativeModel({ model: MODEL_NAME })
// To:
//   genAI.getGenerativeModel({
//     model: MODEL_NAME,
//     systemInstruction: getSystemPrompt(),
//   })

// === FOR ANTHROPIC — patch messages.create() call ===
// Add:   system: getSystemPrompt(),
// to the messages.create({ ... }) options object

// === FOR OPENAI — patch chat.completions.create() call ===
// Prepend to messages array:
//   { role: 'system', content: getSystemPrompt() }
`;

// ─────────────────────────────────────────────────────────────────
// STEP 5 — CONVERSATION HISTORY GUARD
//
// Another common cause: the conversation history array already
// contains an old message where the model said "I am Google/Gemini".
// That message stays in context and re-anchors the wrong identity.
//
// Add this filter to strip leaked identity from history:
// ─────────────────────────────────────────────────────────────────

export function sanitizeConversationHistory(
  messages: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  // Patterns that indicate the model has leaked its real identity
  const LEAK_PATTERNS = [
    /i am a large language model.*google/i,
    /trained by google/i,
    /i('m| am) gemini/i,
    /built by google/i,
    /google deepmind/i,
    /i('m| am) (gpt|chatgpt)/i,
    /i('m| am) claude/i,
    /made by anthropic/i,
    /made by openai/i,
  ];

  return messages.map(msg => {
    if (msg.role !== 'assistant') return msg;

    const hasLeak = LEAK_PATTERNS.some(pattern => pattern.test(msg.content));
    if (!hasLeak) return msg;

    // Replace leaked identity response with a neutral placeholder
    // so it doesn't re-anchor the wrong identity in subsequent turns
    return {
      ...msg,
      content: msg.content
        // Replace "I am a large language model, trained by Google" style claims
        .replace(
          /I am a large language model[^.]*\./gi,
          'I am Sedrex, built by Siddhesh Randhir.'
        )
        // Replace "trained by Google" claims
        .replace(/trained by Google/gi, 'built by Siddhesh Randhir')
        // Replace "built by Google" claims  
        .replace(/built by Google/gi, 'built by Siddhesh Randhir')
        // Replace direct Gemini self-identification
        .replace(/\bI'm Gemini\b/gi, "I'm Sedrex")
        .replace(/\bI am Gemini\b/gi, 'I am Sedrex'),
    };
  });
}

// Usage in your sendMessage function:
// const sanitizedHistory = sanitizeConversationHistory(conversationHistory);
// Then pass sanitizedHistory to the API instead of conversationHistory.

// ─────────────────────────────────────────────────────────────────
// QUICK CHECKLIST — verify all 3 are done before testing:
// ─────────────────────────────────────────────────────────────────
//
// [ ] 1. buildSedrexSystemPrompt() imported in aiService.ts
// [ ] 2. systemInstruction: getSystemPrompt() added to model init
//         (Gemini) OR system: field added (Anthropic) OR
//         system message prepended (OpenAI)
// [ ] 3. sanitizeConversationHistory() wrapping history before
//         every API call so old leaked responses don't re-anchor
//
// After these 3 changes, "who built you" will always return Sedrex.
// ─────────────────────────────────────────────────────────────────
