// services/agents/codingAgent.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Coding Agent v3.0
// Key-driven: Claude → DeepSeek → GPT Codex → Gemini Pro
// Beta (no keys): Gemini Pro with coding system prompt
// Production: Add VITE_CLAUDE_KEY → Claude Sonnet 4.6 activates
// ══════════════════════════════════════════════════════════════════

import { Message, AttachedDocument }                            from '../../types';
import { buildAgentSystemPrompt, sanitizeConversationHistory }  from '../SedrexsystemPrompt';
import { resolveRoute, PROVIDERS, MODELS }                      from '../providerRegistry';

// ── Result type ───────────────────────────────────────────────────

export interface CodingAgentResult {
  text:         string;
  inputTokens:  number;
  outputTokens: number;
  provider:     string;
  model:        string;
  label:        string;
  isFallback:   boolean;
  agentType:    'coding';
}

// ── Helpers ───────────────────────────────────────────────────────

function flattenHistory(
  history: Message[],
  maxTurns = 8,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return sanitizeConversationHistory(history)
    .slice(-maxTurns)
    .map(m => ({
      role:    (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content.slice(0, 8000),  // cap per message
    }));
}

function buildPromptWithDocs(prompt: string, documents: AttachedDocument[]): string {
  if (documents.length === 0) return prompt;
  const ctx = documents
    .map(d => `[FILE: ${d.title}]\n\`\`\`\n${d.content}\n\`\`\``)
    .join('\n\n');
  return `${ctx}\n\nTask: ${prompt}`;
}

function buildSystemPrompt(sessionContext?: string, hasLongContext = false): string {
  return buildAgentSystemPrompt('coding', { sessionContext, hasLongContext });
}

// ── Claude call ───────────────────────────────────────────────────

async function callClaude(
  prompt:        string,
  history:       Message[],
  documents:     AttachedDocument[],
  sessionContext:string,
  maxTokens:     number,
  temperature:   number,
  onStreamChunk: ((text: string) => void) | undefined,
  signal:        AbortSignal | undefined,
): Promise<CodingAgentResult> {
  const { key, model } = { key: PROVIDERS.claude.key, model: MODELS.CLAUDE_SONNET };
  const systemPrompt   = buildSystemPrompt(sessionContext, documents.length > 0);
  const enrichedPrompt = buildPromptWithDocs(prompt, documents);
  const messages       = [
    ...flattenHistory(history),
    { role: 'user' as const, content: enrichedPrompt },
  ];

  let fullText = '';

  if (onStreamChunk) {
    // Streaming
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: {
        'Content-Type':              'application/json',
        'x-api-key':                 key,
        'anthropic-version':         '2023-06-01',
        'dangerously-allow-browser': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(maxTokens, 64000),
        temperature,
        system:   systemPrompt,
        messages,
        stream:   true,
      }),
    });

    if (!res.ok) throw new Error(`Claude API ${res.status}`);

    const reader = res.body!.getReader();
    const dec    = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = dec.decode(value).split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const ev = JSON.parse(data);
          if (ev.type === 'content_block_delta' && ev.delta?.text) {
            fullText += ev.delta.text;
            onStreamChunk(ev.delta.text);
          }
        } catch { /* skip malformed SSE */ }
      }
    }

    return {
      text: fullText, inputTokens: 0, outputTokens: 0,
      provider: 'claude', model, label: 'Claude Sonnet 4.6',
      isFallback: false, agentType: 'coding',
    };
  }

  // Non-streaming
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: {
      'Content-Type':              'application/json',
      'x-api-key':                 key,
      'anthropic-version':         '2023-06-01',
      'dangerously-allow-browser': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(maxTokens, 64000),
      temperature,
      system:   systemPrompt,
      messages,
    }),
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  fullText   = data.content?.[0]?.text ?? '';

  return {
    text: fullText,
    inputTokens:  data.usage?.input_tokens  ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    provider: 'claude', model, label: 'Claude Sonnet 4.6',
    isFallback: false, agentType: 'coding',
  };
}

// ── DeepSeek call (fallback 1) ────────────────────────────────────

async function callDeepSeek(
  prompt:        string,
  history:       Message[],
  documents:     AttachedDocument[],
  sessionContext:string,
  maxTokens:     number,
  temperature:   number,
  onStreamChunk: ((text: string) => void) | undefined,
  signal:        AbortSignal | undefined,
): Promise<CodingAgentResult> {
  const { key }    = PROVIDERS.deepseek;
  const model      = MODELS.DEEPSEEK_CHAT;
  const systemText = buildSystemPrompt(sessionContext, documents.length > 0);
  const enriched   = buildPromptWithDocs(prompt, documents);

  const messages = [
    { role: 'system'    as const, content: systemText },
    ...flattenHistory(history),
    { role: 'user'      as const, content: enriched   },
  ];

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model, messages,
      max_tokens: Math.min(maxTokens, 32000),
      temperature,
      stream: !!onStreamChunk,
    }),
  });

  if (!res.ok) throw new Error(`DeepSeek API ${res.status}`);

  let fullText = '';

  if (onStreamChunk) {
    const reader = res.body!.getReader();
    const dec    = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const d = line.slice(6).trim();
        if (d === '[DONE]') break;
        try {
          const chunk = JSON.parse(d).choices?.[0]?.delta?.content ?? '';
          if (chunk) { fullText += chunk; onStreamChunk(chunk); }
        } catch { /* skip */ }
      }
    }
  } else {
    const data = await res.json();
    fullText   = data.choices?.[0]?.message?.content ?? '';
  }

  return {
    text: fullText, inputTokens: 0, outputTokens: 0,
    provider: 'deepseek', model, label: 'DeepSeek V4',
    isFallback: true, agentType: 'coding',
  };
}

// ── OpenAI GPT Codex call (fallback 2) ───────────────────────────

async function callGPTCode(
  prompt:        string,
  history:       Message[],
  documents:     AttachedDocument[],
  sessionContext:string,
  maxTokens:     number,
  temperature:   number,
  onStreamChunk: ((text: string) => void) | undefined,
  signal:        AbortSignal | undefined,
): Promise<CodingAgentResult> {
  const { key }    = PROVIDERS.openai;
  const model      = MODELS.GPT_CODE;
  const systemText = buildSystemPrompt(sessionContext, documents.length > 0);
  const enriched   = buildPromptWithDocs(prompt, documents);

  const messages = [
    { role: 'system' as const, content: systemText },
    ...flattenHistory(history),
    { role: 'user'   as const, content: enriched   },
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model, messages,
      max_tokens: Math.min(maxTokens, 32000),
      temperature,
      stream: !!onStreamChunk,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI API ${res.status}`);

  let fullText = '';

  if (onStreamChunk) {
    const reader = res.body!.getReader();
    const dec    = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const d = line.slice(6).trim();
        if (d === '[DONE]') break;
        try {
          const chunk = JSON.parse(d).choices?.[0]?.delta?.content ?? '';
          if (chunk) { fullText += chunk; onStreamChunk(chunk); }
        } catch { /* skip */ }
      }
    }
  } else {
    const data = await res.json();
    fullText   = data.choices?.[0]?.message?.content ?? '';
  }

  return {
    text: fullText, inputTokens: 0, outputTokens: 0,
    provider: 'openai', model, label: 'GPT-5.1 Codex',
    isFallback: true, agentType: 'coding',
  };
}

// ── Main entry ────────────────────────────────────────────────────

export async function callCodingAgent(
  prompt:        string,
  history:       Message[],
  documents:     AttachedDocument[],
  sessionContext:string,
  maxTokens:     number,
  temperature:   number,
  onStreamChunk: ((text: string) => void) | undefined,
  signal:        AbortSignal | undefined,
): Promise<CodingAgentResult> {

  // Try Claude first (best code model)
  if (PROVIDERS.claude.available && PROVIDERS.claude.key) {
    try {
      return await callClaude(
        prompt, history, documents, sessionContext,
        maxTokens, temperature, onStreamChunk, signal,
      );
    } catch (err) {
      console.warn('[SEDREX CodingAgent] Claude failed, trying DeepSeek:', err);
    }
  }

  // Fallback: DeepSeek V4 (GPT-5 class at 1/10th cost)
  if (PROVIDERS.deepseek.available && PROVIDERS.deepseek.key) {
    try {
      return await callDeepSeek(
        prompt, history, documents, sessionContext,
        maxTokens, temperature, onStreamChunk, signal,
      );
    } catch (err) {
      console.warn('[SEDREX CodingAgent] DeepSeek failed, trying OpenAI:', err);
    }
  }

  // Fallback: GPT Codex
  if (PROVIDERS.openai.available && PROVIDERS.openai.key) {
    try {
      return await callGPTCode(
        prompt, history, documents, sessionContext,
        maxTokens, temperature, onStreamChunk, signal,
      );
    } catch (err) {
      console.warn('[SEDREX CodingAgent] OpenAI failed, falling back to Gemini:', err);
    }
  }

  // Final: Gemini fallback (aiService handles this)
  console.log('[SEDREX CodingAgent] No external keys — Gemini Pro handles coding');
  return {
    text: '', inputTokens: 0, outputTokens: 0,
    provider: 'gemini-fallback', model: MODELS.GEMINI_PRO, label: 'Gemini 3.1 Pro',
    isFallback: true, agentType: 'coding',
  };
}