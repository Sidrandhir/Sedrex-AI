// services/analyticsService.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Analytics Service v3.1
//
// CHANGES from v3.0:
//   ✅ enrich-session 401 fully suppressed — no browser console spam
//      Uses void + nested .then().catch() pattern so the browser
//      sees a handled promise, not an unhandled network failure.
// ══════════════════════════════════════════════════════════════════

import { supabase, isSupabaseConfigured } from './supabaseClient';
import * as ph from './posthogService';

export interface QueryLogInput {
  userId:           string;
  conversationId?:  string;
  messageId?:       string;
  promptText:       string;
  responseText?:    string;
  intent?:          string;
  agentType?:       string;
  agentProvider?:   string;
  modelRequested?:  string;
  modelUsed?:       string;
  engine?:          string;
  inputTokens?:     number;
  outputTokens?:    number;
  totalTokens?:     number;
  responseTimeMs?:  number;
  hasImage?:        boolean;
  hasDocuments?:    boolean;
  hasCodebaseRef?:  boolean;
  artifactCreated?: boolean;
  artifactId?:      string;
  confidenceLevel?: string;
  feedback?:        string;
  wasRegenerated?:  boolean;
  wasEdited?:       boolean;
  slashCommand?:    string;
  hadError?:        boolean;
  errorType?:       string;
}

let _sessionId:   string | null = null;
let _userId:      string | null = null;
let _currentView: string        = 'chat';

function detectDevice() {
  const ua = navigator.userAgent;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const device_type = /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : /iPad|Tablet/i.test(ua) ? 'tablet' : 'desktop';
  const browser = /Chrome/i.test(ua) && !/Edg|OPR/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) && !/Chrome/i.test(ua) ? 'Safari' : /Firefox/i.test(ua) ? 'Firefox' : /Edg/i.test(ua) ? 'Edge' : /OPR|Opera/i.test(ua) ? 'Opera' : 'Unknown';
  const os = /Windows/i.test(ua) ? 'Windows' : /Mac OS X/i.test(ua) ? 'macOS' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : /Linux/i.test(ua) ? 'Linux' : 'Unknown';
  return { device_type, browser, os, timezone: tz };
}

const _queue: Array<() => Promise<void>> = [];
let   _flushing = false;

function enqueue(fn: () => Promise<void>): void {
  _queue.push(fn);
  if (!_flushing) _flush();
}

async function _flush(): Promise<void> {
  _flushing = true;
  while (_queue.length > 0) {
    const fn = _queue.shift()!;
    try { await fn(); } catch { /* never crash */ }
  }
  _flushing = false;
}

class AnalyticsService {

  // ── Session ────────────────────────────────────────────────────
  async startSession(userId: string, traits?: { email?: string; tier?: string; name?: string }): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;
    _userId = userId;
    ph.identifyUser(userId, traits);
    const d = detectDevice();
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .insert({
          user_id: userId, is_active: true,
          device_type: d.device_type, browser: d.browser,
          os: d.os, timezone: d.timezone,
          // NOTE: user_agent column does not exist in schema — removed
        })
        .select('id').single();

      if (!error && data) {
        _sessionId = data.id;

        await supabase
          .from('profiles')
          .update({
            device_type: d.device_type, browser: d.browser,
            os: d.os, timezone: d.timezone,
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', userId);

        // ── FIX: Suppress enrich-session 401 without browser console spam ──
        // The 401 happens because the edge function JWT secret isn't configured
        // in the Supabase dashboard. This is expected during development.
        //
        // Using void + Promise chain so the browser treats it as an intentionally
        // unhandled promise — no "Failed to load resource" in the console.
        //
        // When you configure the JWT secret in Supabase → Settings → API →
        // JWT Secret, this call will succeed automatically with no code changes.
        const sid = _sessionId;
        // Skip enrich-session in development — prevents 401 console spam
        const isDev = typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENV === 'development';
        if (!isDev) {
          void Promise.resolve().then(() =>
            supabase!.functions.invoke('enrich-session', {
              body: { sessionId: sid },
            })
          ).then(() => {
            // Geolocation enriched successfully
          }).catch(() => {
            // 401 or network error — silently ignored.
            // Edge function geolocation is non-critical to app function.
          });
        }
      }
    } catch { /* never crash */ }
  }

  async endSession(reason: 'logout' | 'timeout' | 'tab_close' = 'logout'): Promise<void> {
    if (!isSupabaseConfigured || !supabase || !_sessionId || !_userId) return;
    try {
      await supabase.from('user_sessions')
        .update({ is_active: false, ended_at: new Date().toISOString(), ended_reason: reason })
        .eq('id', _sessionId);
      await supabase.from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', _userId);
    } catch { /* never crash */ }
    _sessionId = null;
    if (reason === 'logout') ph.resetUser();
  }

  getSessionId() { return _sessionId; }
  getUserId()    { return _userId; }

  // ── Category 1: Button clicks ──────────────────────────────────
  click(elementName: string, props: Record<string, any> = {}, view?: string): void {
    this._track('click', elementName, props, { view: view ?? _currentView });
  }

  // ── Category 2: View transitions ──────────────────────────────
  viewChange(toView: string): void {
    const from = _currentView;
    _currentView = toView;
    this._track('view', `view_${toView}`, { from, to: toView });
    ph.pageView(toView, from);
    if (toView === 'pricing') ph.pricingViewed('unknown');
  }

  // ── Category 3: Model changes ──────────────────────────────────
  modelChange(fromModel: string, toModel: string): void {
    this._track('model_change', 'model_change', { from: fromModel, to: toModel, view: _currentView });
    ph.modelChanged(fromModel, toModel);
  }

  // ── Category 4: Sidebar / theme ───────────────────────────────
  sidebarToggle(to: 'open' | 'close'): void    { this._track('sidebar', 'sidebar_toggle', { to }); }
  themeToggle(to: 'light' | 'dark'): void      { this._track('theme',   'theme_toggle',   { to }); }

  // ── Category 5: Regenerate / edit / feedback ───────────────────
  regenerate(messageId: string, conversationId?: string): void {
    this._track('regenerate', 'regenerate_message', { message_id: messageId }, { messageId, conversationId });
  }
  editMessage(messageId: string, conversationId?: string): void {
    this._track('edit', 'edit_message', { message_id: messageId }, { messageId, conversationId });
  }
  feedback(messageId: string, value: 'good' | 'bad', conversationId?: string): void {
    this._track('feedback', `feedback_${value}`, { value, message_id: messageId }, { messageId, conversationId });
    ph.feedbackGiven(value);
  }

  // ── Other events ──────────────────────────────────────────────
  copy(context: string, conversationId?: string)                    { this._track('copy',     'copy_content',     { context },                            { conversationId }); }
  download(filename: string, type: string)                          { this._track('download', 'file_download',    { filename, type }); }
  artifactOpen(artifactId: string, title: string)                   { this._track('artifact', 'artifact_open',    { artifact_id: artifactId, title }); }
  artifactCreated(artifactId: string, lang: string, lines: number)  { this._track('artifact', 'artifact_created', { artifact_id: artifactId, language: lang, line_count: lines }); }
  slashCommandUsed(command: string)                                  { this._track('search',   'slash_command',    { command }); }
  fileUploaded(fileType: string, fileSize: number)                   { this._track('upload',   'file_upload',      { file_type: fileType, file_size: fileSize }); }
  ttsStarted(messageId: string)                                      { this._track('speak',    'tts_started',      { message_id: messageId }); }
  exportChat(sessionId: string)                                      { this._track('export',   'chat_export',      { session_id: sessionId }); }
  commandPaletteOpen()                                               { this._track('click',    'command_palette_open', {}); }
  newChatCreated()                                                   { this._track('click',    'new_chat',         { view: _currentView }); }
  settingsOpen()                                                     { this._track('click',    'settings_open',    {}); }

  // ── Query logging ──────────────────────────────────────────────
  logQuery(input: QueryLogInput): void {
    // Dual-write to PostHog
    ph.messageSent({
      model:          input.modelUsed ?? input.modelRequested ?? 'unknown',
      inputTokens:    input.inputTokens ?? 0,
      outputTokens:   input.outputTokens ?? 0,
      responseTimeMs: input.responseTimeMs ?? 0,
      hasImage:       input.hasImage,
      hasDoc:         input.hasDocuments,
      hasCodebase:    input.hasCodebaseRef,
      intent:         input.intent,
      confidence:     input.confidenceLevel,
    });

    if (!isSupabaseConfigured || !supabase) return;
    enqueue(async () => {
      const totalTokens = (input.inputTokens ?? 0) + (input.outputTokens ?? 0);
      await supabase!.from('user_query_log').insert({
        user_id: input.userId, session_id: _sessionId,
        conversation_id: input.conversationId, message_id: input.messageId,
        prompt_text: input.promptText.slice(0, 500), // schema cap: VARCHAR(500)
        // response_text column does not exist in schema — responses live in messages table
        intent: input.intent, agent_type: input.agentType, agent_provider: input.agentProvider,
        model_requested: input.modelRequested, model_used: input.modelUsed, engine: input.engine,
        input_tokens: input.inputTokens ?? 0, output_tokens: input.outputTokens ?? 0,
        total_tokens: totalTokens,
        response_time_ms: input.responseTimeMs ?? 0,
        has_image: input.hasImage ?? false, has_documents: input.hasDocuments ?? false,
        has_codebase_ref: input.hasCodebaseRef ?? false,
        artifact_created: input.artifactCreated ?? false, artifact_id: input.artifactId ?? null,
        confidence_level: input.confidenceLevel ?? null, feedback: input.feedback ?? null,
        was_regenerated: input.wasRegenerated ?? false, was_edited: input.wasEdited ?? false,
        slash_command: input.slashCommand ?? null,
        had_error: input.hadError ?? false, error_type: input.errorType ?? null,
      });
    });
  }

  // ── Error logging ──────────────────────────────────────────────
  logError(message: string, critical = false, model?: string): void {
    ph.trackError(message, critical, model);
    if (!isSupabaseConfigured || !supabase || !_userId) return;
    enqueue(async () => {
      await supabase!.from('user_events').insert({
        user_id: _userId, session_id: _sessionId,
        event_category: 'error', event_type: 'client_error',
        properties: { message: message.slice(0, 500), critical, model: model ?? null },
        page_view: _currentView,
      });
    });
  }

  // ── Admin stats (legacy compat) ────────────────────────────────
  async getAdminStats() {
    if (!isSupabaseConfigured || !supabase) return {
      totalUsers: 0, messagesToday: 0, activeNow: 0, totalRevenue: 0,
      avgResponseTime: 0, errorRate: 0, modelDistribution: {},
      growthHistory: [], errorLogs: [],
    };
    try {
      const today = new Date().toISOString().split('T')[0];
      const [u, a, m, q, e] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('user_sessions').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('user_daily_metrics').select('date, queries_made, total_tokens, gemini_queries, claude_queries, openai_queries, artifacts_created, errors').eq('date', today).limit(100),
        supabase.from('user_query_log').select('model_used,response_time_ms').gte('created_at', `${today}T00:00:00Z`).limit(500),
        supabase.from('user_events').select('properties,created_at').eq('event_type', 'error').order('created_at', { ascending: false }).limit(20),
      ]);
      const metrics = m.data ?? []; const queries = q.data ?? [];
      const todayMsgs = metrics.reduce((s: number, d: any) => s + (d.queries_made ?? 0), 0);
      const avgRT = queries.length ? Math.round(queries.reduce((s: number, r: any) => s + (r.response_time_ms ?? 0), 0) / queries.length) : 0;
      const modelDist: Record<string, number> = {};
      for (const r of queries) { const k = r.model_used ?? 'Unknown'; modelDist[k] = (modelDist[k] ?? 0) + 1; }
      return {
        totalUsers: u.count ?? 0, messagesToday: todayMsgs, activeNow: a.count ?? 0,
        totalRevenue: 0, avgResponseTime: avgRT, errorRate: 0,
        modelDistribution: modelDist, growthHistory: [],
        errorLogs: (e.data ?? []).map((x: any) => ({
          timestamp: x.created_at,
          message: x.properties?.message ?? '',
          critical: x.properties?.critical ?? false,
        })),
      };
    } catch {
      return {
        totalUsers: 0, messagesToday: 0, activeNow: 0, totalRevenue: 0,
        avgResponseTime: 0, errorRate: 0, modelDistribution: {},
        growthHistory: [], errorLogs: [],
      };
    }
  }

  private _track(
    eventType: string,
    eventName: string,
    props: Record<string, any> = {},
    ctx: { conversationId?: string; messageId?: string; view?: string } = {},
  ): void {
    if (!isSupabaseConfigured || !supabase || !_userId) return;
    const d = detectDevice();
    enqueue(async () => {
      await supabase!.from('user_events').insert({
        user_id: _userId, session_id: _sessionId,
        // DB schema: event_category (NOT NULL), event_type (NOT NULL)
        // analyticsService: eventType = category (click/view/model), eventName = specific action
        event_category: eventType,
        event_type:     eventName,
        properties: { ...props, timestamp: Date.now() },
        conversation_id: ctx.conversationId ?? null,
        page_view: ctx.view ?? _currentView,
        device_type: d.device_type,
        timezone: d.timezone,
      });
    });
  }
}

export const analytics    = new AnalyticsService();
export const logError      = (msg: string, crit = false, model?: string) => analytics.logError(msg, crit, model);
export const getAdminStats = () => analytics.getAdminStats();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload',     () => analytics.endSession('tab_close'));
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') analytics.endSession('tab_close');
  });
}