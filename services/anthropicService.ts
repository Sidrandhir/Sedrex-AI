// services/anthropicService.ts
import { Message } from "../types";
import { buildSedrexSystemPrompt, sanitizeConversationHistory } from "./SedrexsystemPrompt";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export const callClaude = async (
  prompt: string,
  history: Message[],
  systemInstructions?: string,
): Promise<string> => {
  if (!ANTHROPIC_API_KEY) {
    return "Error: Anthropic API Key is missing. Please set process.env.ANTHROPIC_API_KEY.";
  }

  try {
    // ── FIXED: sanitize history before sending ──────────────────────
    // Strips any leaked "I am built by Google / I am Claude" text from
    // previous assistant messages so they don't re-anchor wrong identity
    const cleanHistory = sanitizeConversationHistory(history);

    const messages = cleanHistory.map(m => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.content,
    }));

    messages.push({ role: 'user' as const, content: prompt });

    // ── FIXED: always use Sedrex identity prompt, merge with any
    //    caller-supplied systemInstructions (e.g. mode/format rules) ──
    const sedrexPrompt  = buildSedrexSystemPrompt();
    const finalSystem   = systemInstructions
      ? `${sedrexPrompt}\n\n${systemInstructions}`
      : sedrexPrompt;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4096,
        system: finalSystem,   // ← identity lock always injected here
        messages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Anthropic API request failed");
    }

    const data = await response.json();
    return data.content[0]?.text || "No response content from Claude.";
  } catch (error: any) {
    console.error("Anthropic Service Error:", error);
    return `Anthropic Error: ${error.message}`;
  }
};