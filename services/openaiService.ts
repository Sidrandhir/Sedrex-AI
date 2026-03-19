// services/openaiService.ts
import { Message } from "../types";
import { buildSedrexSystemPrompt, sanitizeConversationHistory } from "./SedrexsystemPrompt";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export const callOpenAI = async (
  prompt: string,
  history: Message[],
  systemInstructions?: string,
): Promise<string> => {
  if (!OPENAI_API_KEY) {
    return "Error: OpenAI API Key is missing. Please set process.env.OPENAI_API_KEY.";
  }

  try {
    // ── FIXED: sanitize history before sending ──────────────────────
    // Strips any leaked "I am built by Google / I am GPT" text from
    // previous assistant messages so they don't re-anchor wrong identity
    const cleanHistory = sanitizeConversationHistory(history);

    // ── FIXED: always lead with Sedrex identity as system message ───
    // Merge with any caller-supplied systemInstructions
    const sedrexPrompt = buildSedrexSystemPrompt();
    const finalSystem  = systemInstructions
      ? `${sedrexPrompt}\n\n${systemInstructions}`
      : sedrexPrompt;

    const messages = [
      { role: 'system' as const, content: finalSystem },   // ← identity lock first
      ...cleanHistory.map(m => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content,
      })),
      { role: 'user' as const, content: prompt },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4-turbo-preview",
        messages,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "OpenAI API request failed");
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || "No response content from OpenAI.";
  } catch (error: any) {
    console.error("OpenAI Service Error:", error);
    return `OpenAI Error: ${error.message}`;
  }
};