// services/agents/reasoningAgent.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Reasoning Agent v3.0
// Key-driven: GPT-5.2 → o4-mini (math) → Claude → DeepSeek R1 → Gemini Pro
// Beta (no keys): Gemini Pro with reasoning system prompt
// ══════════════════════════════════════════════════════════════════

import { Message, AttachedDocument }                            from '../../types';
import { buildAgentSystemPrompt, sanitizeConversationHistory }  from '../SedrexsystemPrompt';
import { PROVIDERS, MODELS }                                    from '../providerRegistry';

// ── Result type ───────────────────────────────────────────────────

export interface ReasoningAgentResult {
  text:         string;
  inputTokens:  number;
  outputTokens: number;
  provider:     string;
  model:        string;
  label:        string;
  isFallback:   boolean;
  agentType:    'reasoning';
}

// ── Helpers ───────────────────────────────────────────────────────

function flattenHistory(
  history: Message[],
  maxTurns = 10,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return sanitizeConversationHistory(history)
    .slice(-maxTurns)
    .map(m => ({
      role:    (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content.slice(0, 8000),
    }));
}

function buildPromptWithDocs(prompt: string, documents: AttachedDocument[]): string {
  if (documents.length === 0) return prompt;
  const ctx = documents
    .map(d => `[DOCUMENT: ${d.title}]\n\`\`\`\n${d.content}\n\`\`\``)
    .join('\n\n');
  return `${ctx}\n\nAnalyze the above and answer: ${prompt}`;
}

function buildSystemPrompt(
  sessionContext?: string,
  hasLongContext  = false,
): string {
  return buildAgentSystemPrompt('reasoning', { sessionContext, hasLongContext });
}

// ── OpenAI call (GPT-5.2 for analysis, o4-mini for math) ─────────

async function callOpenAI(
  prompt:        string,
  history:       Message[],
  documents:     AttachedDocument[],
  sessionContext:string,
  maxTokens:     number,
  temperature:   number,
  onStreamChunk: ((text: string) => void) | undefined,
  signal:        AbortSignal | undefined,
  intentHint:    string,
): Promise<ReasoningAgentResult> {
  const { key }  = PROVIDERS.openai;
  // Use o4-mini for math — purpose-built, best reasoning per dollar
  const isMath   = intentHint === 'math';
  const model    = isMath ? MODELS.GPT_REASONING : MODELS.GPT_BALANCED;
  const label    = isMath ? 'o4-mini' : 'GPT-5.2';

  const systemText = buildSystemPrompt(sessionContext, documents.length > 0);
  const enriched   = buildPromptWithDocs(prompt, documents);
  const messages   = [
    { role: 'system' as const, content: systemText },
    ...flattenHistory(history),
    { role: 'user'   as const, content: enriched   },
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      max_tokens:  Math.min(maxTokens, 32000),
      temperature: isMath ? 0.1 : temperature,  // near-zero for math
      stream:      !!onStreamChunk,
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
    return {
      text:         fullText,
      inputTokens:  data.usage?.prompt_tokens     ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      provider: 'openai', model, label,
      isFallback: false, agentType: 'reasoning',
    };
  }

  return {
    text: fullText, inputTokens: 0, outputTokens: 0,
    provider: 'openai', model, label,
    isFallback: false, agentType: 'reasoning',
  };
}

// ── Claude call (fallback 1) ──────────────────────────────────────

async function callClaude(
  prompt:        string,
  history:       Message[],
  documents:     AttachedDocument[],
  sessionContext:string,
  maxTokens:     number,
  temperature:   number,
  onStreamChunk: ((text: string) => void) | undefined,
  signal:        AbortSignal | undefined,
): Promise<ReasoningAgentResult> {
  const { key }    = PROVIDERS.claude;
  const model      = MODELS.CLAUDE_SONNET;
  const systemText = buildSystemPrompt(sessionContext, documents.length > 0);
  const enriched   = buildPromptWithDocs(prompt, documents);
  const messages   = [
    ...flattenHistory(history),
    { role: 'user' as const, content: enriched },
  ];

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
      max_tokens:  Math.min(maxTokens, 32000),
      temperature,
      system:      systemText,
      messages,
      stream:      !!onStreamChunk,
    }),
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}`);

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
          const ev = JSON.parse(d);
          if (ev.type === 'content_block_delta' && ev.delta?.text) {
            fullText += ev.delta.text;
            onStreamChunk(ev.delta.text);
          }
        } catch { /* skip */ }
      }
    }
  } else {
    const data = await res.json();
    fullText   = data.content?.[0]?.text ?? '';
    return {
      text:         fullText,
      inputTokens:  data.usage?.input_tokens  ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      provider: 'claude', model, label: 'Claude Sonnet 4.6',
      isFallback: true, agentType: 'reasoning',
    };
  }

  return {
    text: fullText, inputTokens: 0, outputTokens: 0,
    provider: 'claude', model, label: 'Claude Sonnet 4.6',
    isFallback: true, agentType: 'reasoning',
  };
}

// ── DeepSeek R1 call (fallback 2 — best for math/logic) ──────────

async function callDeepSeekR1(
  prompt:        string,
  history:       Message[],
  documents:     AttachedDocument[],
  sessionContext:string,
  maxTokens:     number,
  onStreamChunk: ((text: string) => void) | undefined,
  signal:        AbortSignal | undefined,
): Promise<ReasoningAgentResult> {
  const { key }    = PROVIDERS.deepseek;
  const model      = MODELS.DEEPSEEK_REASONING;
  const systemText = buildSystemPrompt(sessionContext, documents.length > 0);
  const enriched   = buildPromptWithDocs(prompt, documents);
  const messages   = [
    { role: 'system' as const, content: systemText },
    ...flattenHistory(history),
    { role: 'user'   as const, content: enriched   },
  ];

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model, messages,
      max_tokens: Math.min(maxTokens, 32000),
      temperature: 0.1,  // low for reasoning
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
    provider: 'deepseek', model, label: 'DeepSeek R1',
    isFallback: true, agentType: 'reasoning',
  };
}

// ── Main entry ────────────────────────────────────────────────────

export async function callReasoningAgent(
  prompt:        string,
  history:       Message[],
  documents:     AttachedDocument[],
  sessionContext:string,
  maxTokens:     number,
  temperature:   number,
  onStreamChunk: ((text: string) => void) | undefined,
  signal:        AbortSignal | undefined,
  intentHint     = 'reasoning',  // 'math' triggers o4-mini
): Promise<ReasoningAgentResult> {

  // OpenAI first (GPT-5.2 for analysis, o4-mini for math)
  if (PROVIDERS.openai.available && PROVIDERS.openai.key) {
    try {
      return await callOpenAI(
        prompt, history, documents, sessionContext,
        maxTokens, temperature, onStreamChunk, signal, intentHint,
      );
    } catch (err) {
      console.warn('[SEDREX ReasoningAgent] OpenAI failed, trying Claude:', err);
    }
  }

  // Fallback: Claude Sonnet (excellent reasoning)
  if (PROVIDERS.claude.available && PROVIDERS.claude.key) {
    try {
      return await callClaude(
        prompt, history, documents, sessionContext,
        maxTokens, temperature, onStreamChunk, signal,
      );
    } catch (err) {
      console.warn('[SEDREX ReasoningAgent] Claude failed, trying DeepSeek R1:', err);
    }
  }

  // Fallback: DeepSeek R1 (matches o1 at 96% lower cost)
  if (PROVIDERS.deepseek.available && PROVIDERS.deepseek.key) {
    try {
      return await callDeepSeekR1(
        prompt, history, documents, sessionContext,
        maxTokens, onStreamChunk, signal,
      );
    } catch (err) {
      console.warn('[SEDREX ReasoningAgent] DeepSeek R1 failed, falling back to Gemini:', err);
    }
  }

  // Final: Gemini Pro fallback
  console.log('[SEDREX ReasoningAgent] No external keys — Gemini Pro handles reasoning');
  return {
    text: '', inputTokens: 0, outputTokens: 0,
    provider: 'gemini-fallback', model: MODELS.GEMINI_PRO, label: 'Gemini 3.1 Pro',
    isFallback: true, agentType: 'reasoning',
  };
}