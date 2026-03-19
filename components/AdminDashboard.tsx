// components/AdminDashboard.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Admin Dashboard v2.0
//
// Full intelligence platform for monitoring every user action.
// Reads from admin_user_summary, admin_platform_daily,
// admin_user_queries, admin_user_sessions, user_events views.
//
// ONLY accessible to users where is_admin = true in profiles.
// ══════════════════════════════════════════════════════════════════

import React, {
  useState, useEffect, useCallback, useMemo, memo,
} from 'react';
import { supabase } from '../services/supabaseClient';
import './AdminDashboard.css';

// ── Types ─────────────────────────────────────────────────────────

interface UserSummary {
  user_id:                  string;
  email:                    string;
  tier:                     string;
  is_admin:                 boolean;
  is_banned:                boolean;
  last_seen_at:             string | null;
  total_sessions:           number;
  lifetime_tokens:          number;
  timezone:                 string | null;
  country:                  string | null;
  city:                     string | null;
  device_type:              string | null;
  browser:                  string | null;
  signup_source:            string | null;
  signup_at:                string;
  total_messages:           number;
  monthly_messages:         number;
  total_input_tokens:       number;
  total_output_tokens:      number;
  avg_session_minutes:      number;
  favorite_model:           string | null;
  total_artifacts:          number;
  total_code_requests:      number;
  total_live_requests:      number;
  total_reasoning_requests: number;
  first_message_at:         string | null;
  last_message_at:          string | null;
  streak_days:              number;
  active_sessions:          number;
  queries_today:            number;
  tokens_today:             number;
}

interface PlatformDay {
  date:               string;
  active_users:       number;
  total_queries:      number;
  total_tokens:       number;
  gemini_queries:     number;
  claude_queries:     number;
  openai_queries:     number;
  coding_queries:     number;
  reasoning_queries:  number;
  live_queries:       number;
  general_queries:    number;
  artifacts_created:  number;
  good_feedback:      number;
  bad_feedback:       number;
  regenerations:      number;
}

interface UserQuery {
  id:                   string;
  email:                string;
  conversation_title:   string | null;
  prompt_text:          string;
  prompt_length:        number;
  response_length:      number;
  intent:               string | null;
  model_used:           string | null;
  engine:               string | null;
  input_tokens:         number;
  output_tokens:        number;
  total_tokens:         number;
  response_time_ms:     number;
  confidence_level:     string | null;
  feedback:             string | null;
  was_regenerated:      boolean;
  artifact_created:     boolean;
  had_error:            boolean;
  slash_command:        string | null;
  created_at:           string;
}

interface UserSession {
  id:               string;
  email:            string;
  started_at:       string;
  ended_at:         string | null;
  duration_minutes: number;
  is_active:        boolean;
  device_type:      string | null;
  browser:          string | null;
  os:               string | null;
  country:          string | null;
  city:             string | null;
  timezone:         string | null;
  messages_sent:    number;
  tokens_used:      number;
  ended_reason:     string | null;
}

// ── Utility ───────────────────────────────────────────────────────

const fmt = {
  num:   (n: number) => n?.toLocaleString() ?? '0',
  k:     (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : (n?.toString() ?? '0'),
  date:  (s: string | null) => s ? new Date(s).toLocaleString() : '—',
  ago:   (s: string | null) => {
    if (!s) return '—';
    const d = Date.now() - new Date(s).getTime();
    if (d < 60000)  return 'just now';
    if (d < 3600000) return `${Math.floor(d/60000)}m ago`;
    if (d < 86400000) return `${Math.floor(d/3600000)}h ago`;
    return `${Math.floor(d/86400000)}d ago`;
  },
  mins:  (n: number) => n >= 60 ? `${Math.floor(n/60)}h ${Math.floor(n%60)}m` : `${Math.round(n)}m`,
};

const TIER_COLORS: Record<string, string> = {
  free:      'var(--ad-muted)',
  pro:       'var(--ad-accent)',
  unlimited: 'var(--ad-green)',
};

const INTENT_COLORS: Record<string, string> = {
  coding:    '#60a5fa',
  reasoning: '#a78bfa',
  live:      '#34d399',
  general:   'var(--ad-muted)',
};

// ── Stat Card ─────────────────────────────────────────────────────
const StatCard = memo(({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) => (
  <div className="ad-stat-card">
    <div className="ad-stat-label">{label}</div>
    <div className="ad-stat-value" style={accent ? { color: accent } : {}}>{value}</div>
    {sub && <div className="ad-stat-sub">{sub}</div>}
  </div>
));

// ── Section header ────────────────────────────────────────────────
const SectionHeader = ({ title, count }: { title: string; count?: number }) => (
  <div className="ad-section-header">
    <span className="ad-section-title">{title}</span>
    {count !== undefined && <span className="ad-section-count">{count}</span>}
  </div>
);

// ── User detail modal ─────────────────────────────────────────────
const UserModal = memo(({ user, queries, sessions, onClose }: {
  user:     UserSummary;
  queries:  UserQuery[];
  sessions: UserSession[];
  onClose:  () => void;
}) => {
  const [tab, setTab] = useState<'overview' | 'queries' | 'sessions'>('overview');

  return (
    <div className="ad-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ad-modal">
        {/* Header */}
        <div className="ad-modal-header">
          <div className="ad-modal-title-row">
            <div className="ad-modal-avatar">
              {(user.email[0] || '?').toUpperCase()}
            </div>
            <div>
              <div className="ad-modal-email">{user.email}</div>
              <div className="ad-modal-meta-row">
                <span className="ad-tier-badge" style={{ color: TIER_COLORS[user.tier] }}>
                  {user.tier}
                </span>
                {user.is_admin && <span className="ad-admin-badge">admin</span>}
                {user.is_banned && <span className="ad-banned-badge">banned</span>}
                {user.active_sessions > 0 && (
                  <span className="ad-online-badge">● online</span>
                )}
              </div>
            </div>
          </div>
          <button className="ad-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="ad-modal-tabs">
          {(['overview', 'queries', 'sessions'] as const).map(t => (
            <button
              key={t}
              className={`ad-modal-tab${tab === t ? ' ad-modal-tab--active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="ad-modal-body">
          {tab === 'overview' && (
            <div className="ad-modal-overview">
              {/* Identity */}
              <div className="ad-detail-section">
                <div className="ad-detail-section-title">Identity & Device</div>
                <div className="ad-detail-grid">
                  <div className="ad-detail-item"><span>Signup</span><span>{fmt.date(user.signup_at)}</span></div>
                  <div className="ad-detail-item"><span>Last seen</span><span>{fmt.ago(user.last_seen_at)}</span></div>
                  <div className="ad-detail-item"><span>First message</span><span>{fmt.ago(user.first_message_at)}</span></div>
                  <div className="ad-detail-item"><span>Last message</span><span>{fmt.ago(user.last_message_at)}</span></div>
                  <div className="ad-detail-item"><span>Timezone</span><span>{user.timezone ?? '—'}</span></div>
                  <div className="ad-detail-item"><span>Country</span><span>{user.country ?? '—'}</span></div>
                  <div className="ad-detail-item"><span>City</span><span>{user.city ?? '—'}</span></div>
                  <div className="ad-detail-item"><span>Device</span><span>{user.device_type ?? '—'}</span></div>
                  <div className="ad-detail-item"><span>Browser</span><span>{user.browser ?? '—'}</span></div>
                  <div className="ad-detail-item"><span>Signup via</span><span>{user.signup_source ?? 'email'}</span></div>
                </div>
              </div>

              {/* Usage stats */}
              <div className="ad-detail-section">
                <div className="ad-detail-section-title">Usage</div>
                <div className="ad-stat-grid-4">
                  <StatCard label="Total Messages" value={fmt.num(user.total_messages)} />
                  <StatCard label="This Month" value={fmt.num(user.monthly_messages)} />
                  <StatCard label="Sessions" value={fmt.num(user.total_sessions)} />
                  <StatCard label="Avg Session" value={fmt.mins(user.avg_session_minutes)} />
                  <StatCard label="Input Tokens" value={fmt.k(user.total_input_tokens)} />
                  <StatCard label="Output Tokens" value={fmt.k(user.total_output_tokens)} />
                  <StatCard label="Lifetime Tokens" value={fmt.k(user.lifetime_tokens)} accent="var(--ad-accent)" />
                  <StatCard label="Streak" value={`${user.streak_days}d`} />
                </div>
              </div>

              {/* Intent breakdown */}
              <div className="ad-detail-section">
                <div className="ad-detail-section-title">Query Types</div>
                <div className="ad-stat-grid-4">
                  <StatCard label="💻 Coding" value={fmt.num(user.total_code_requests)} />
                  <StatCard label="🧠 Reasoning" value={fmt.num(user.total_reasoning_requests)} />
                  <StatCard label="🔍 Live Search" value={fmt.num(user.total_live_requests)} />
                  <StatCard label="📄 Artifacts" value={fmt.num(user.total_artifacts)} />
                </div>
              </div>

              {/* Favorite model */}
              {user.favorite_model && (
                <div className="ad-detail-section">
                  <div className="ad-detail-section-title">Favourite Model</div>
                  <div className="ad-detail-item">
                    <span>{user.favorite_model}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'queries' && (
            <div className="ad-modal-queries">
              {queries.length === 0 ? (
                <div className="ad-empty">No queries yet</div>
              ) : queries.map(q => (
                <div key={q.id} className="ad-query-item">
                  <div className="ad-query-top">
                    <span className="ad-query-intent" style={{ color: INTENT_COLORS[q.intent ?? 'general'] }}>
                      {q.intent ?? 'general'}
                    </span>
                    <span className="ad-query-model">{q.model_used ?? '—'}</span>
                    <span className="ad-query-tokens">{fmt.k(q.total_tokens)} tokens</span>
                    <span className="ad-query-time">{fmt.ago(q.created_at)}</span>
                    {q.feedback && (
                      <span className={`ad-query-feedback ad-query-feedback--${q.feedback}`}>
                        {q.feedback === 'good' ? '👍' : '👎'}
                      </span>
                    )}
                    {q.had_error && <span className="ad-query-error">error</span>}
                    {q.artifact_created && <span className="ad-query-artifact">artifact</span>}
                  </div>
                  <div className="ad-query-prompt">{q.prompt_text?.slice(0, 200)}{(q.prompt_text?.length ?? 0) > 200 ? '…' : ''}</div>
                  <div className="ad-query-bottom">
                    <span>{q.response_time_ms}ms</span>
                    <span>in: {fmt.k(q.input_tokens)} · out: {fmt.k(q.output_tokens)}</span>
                    {q.slash_command && <span className="ad-query-slash">/{q.slash_command}</span>}
                    {q.was_regenerated && <span className="ad-query-regen">regenerated</span>}
                    {q.conversation_title && <span className="ad-query-conv">{q.conversation_title}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'sessions' && (
            <div className="ad-modal-sessions">
              {sessions.length === 0 ? (
                <div className="ad-empty">No sessions yet</div>
              ) : sessions.map(s => (
                <div key={s.id} className="ad-session-item">
                  <div className="ad-session-top">
                    {s.is_active
                      ? <span className="ad-online-badge">● active now</span>
                      : <span className="ad-session-ended">{fmt.ago(s.ended_at)}</span>
                    }
                    <span className="ad-session-duration">{fmt.mins(s.duration_minutes)}</span>
                    <span className="ad-session-device">{s.device_type ?? '—'} · {s.browser ?? '—'}</span>
                    {s.country && <span className="ad-session-loc">{s.city ? `${s.city}, ` : ''}{s.country}</span>}
                  </div>
                  <div className="ad-session-bottom">
                    <span>{fmt.date(s.started_at)}</span>
                    <span>{s.messages_sent} msgs</span>
                    <span>{fmt.k(s.tokens_used)} tokens</span>
                    {s.ended_reason && <span className="ad-session-reason">{s.ended_reason}</span>}
                    {s.timezone && <span className="ad-session-tz">{s.timezone}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ════════════════════════════════════════════════════════════════════
// MAIN ADMIN DASHBOARD
// ════════════════════════════════════════════════════════════════════

const AdminDashboard: React.FC = () => {
  const [tab, setTab]             = useState<'overview' | 'users' | 'queries' | 'sessions'>('overview');
  const [users, setUsers]         = useState<UserSummary[]>([]);
  const [platform, setPlatform]   = useState<PlatformDay[]>([]);
  const [queries, setQueries]     = useState<UserQuery[]>([]);
  const [sessions, setSessions]   = useState<UserSession[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState('');
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [userQueries, setUserQueries]   = useState<UserQuery[]>([]);
  const [userSessions, setUserSessions] = useState<UserSession[]>([]);
  const [lastRefresh, setLastRefresh]   = useState<Date>(new Date());

  const loadData = useCallback(async () => {
    if (!supabase) { setError('Supabase not configured'); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [usersRes, platformRes, queriesRes, sessionsRes] = await Promise.all([
        supabase.from('admin_user_summary').select('*').order('last_seen_at', { ascending: false }).limit(200),
        supabase.from('admin_platform_daily').select('*').order('date', { ascending: false }).limit(30),
        supabase.from('admin_user_queries').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('admin_user_sessions').select('*').order('started_at', { ascending: false }).limit(100),
      ]);
      if (usersRes.error)    throw new Error(`Users: ${usersRes.error.message}`);
      if (platformRes.error) throw new Error(`Platform: ${platformRes.error.message}`);
      if (queriesRes.error)  throw new Error(`Queries: ${queriesRes.error.message}`);
      if (sessionsRes.error) throw new Error(`Sessions: ${sessionsRes.error.message}`);
      setUsers(usersRes.data    ?? []);
      setPlatform(platformRes.data ?? []);
      setQueries(queriesRes.data   ?? []);
      setSessions(sessionsRes.data ?? []);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleUserClick = useCallback(async (user: UserSummary) => {
    setSelectedUser(user);
    if (!supabase) return;
    const [qRes, sRes] = await Promise.all([
      supabase.from('admin_user_queries')
        .select('*').eq('user_id', user.user_id)
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('admin_user_sessions')
        .select('*').eq('user_id', user.user_id)
        .order('started_at', { ascending: false }).limit(30),
    ]);
    setUserQueries(qRes.data  ?? []);
    setUserSessions(sRes.data ?? []);
  }, []);

  const filteredUsers = useMemo(() =>
    users.filter(u =>
      !search ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.country?.toLowerCase().includes(search.toLowerCase()) ||
      u.tier?.toLowerCase().includes(search.toLowerCase())
    ), [users, search]);

  const today = platform[0];

  // Platform totals
  const totals = useMemo(() => ({
    users:          users.length,
    activeNow:      users.filter(u => u.active_sessions > 0).length,
    totalMessages:  users.reduce((s, u) => s + (u.total_messages ?? 0), 0),
    totalTokens:    users.reduce((s, u) => s + (u.lifetime_tokens ?? 0), 0),
    todayQueries:   today?.total_queries ?? 0,
    todayTokens:    today?.total_tokens  ?? 0,
    todayUsers:     today?.active_users  ?? 0,
    pro:            users.filter(u => u.tier === 'pro' || u.tier === 'unlimited').length,
  }), [users, today]);

  if (loading) return (
    <div className="ad-loading">
      <div className="ad-spinner" />
      <span>Loading admin data…</span>
    </div>
  );

  if (error) return (
    <div className="ad-error">
      <div className="ad-error-title">⚠ Admin Dashboard Error</div>
      <div className="ad-error-msg">{error}</div>
      <div className="ad-error-hint">
        Make sure you've run the Supabase SQL migration and your account has is_admin = true.
      </div>
      <button className="ad-retry-btn" onClick={loadData}>Retry</button>
    </div>
  );

  return (
    <div className="ad-root">
      {/* Header */}
      <div className="ad-header">
        <div className="ad-header-left">
          <div className="ad-header-title">
            <span className="ad-header-icon">⚡</span>
            SEDREX Admin
          </div>
          <div className="ad-header-sub">
            {totals.activeNow > 0 && (
              <span className="ad-live-badge">● {totals.activeNow} live</span>
            )}
            <span className="ad-refresh-time">Updated {fmt.ago(lastRefresh.toISOString())}</span>
          </div>
        </div>
        <button className="ad-refresh-btn" onClick={loadData} title="Refresh data">
          ↻ Refresh
        </button>
      </div>

      {/* Nav tabs */}
      <div className="ad-nav">
        {(['overview', 'users', 'queries', 'sessions'] as const).map(t => (
          <button
            key={t}
            className={`ad-nav-tab${tab === t ? ' ad-nav-tab--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'overview' && '📊 '}
            {t === 'users'    && '👤 '}
            {t === 'queries'  && '💬 '}
            {t === 'sessions' && '🔗 '}
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'users'    && <span className="ad-nav-count">{totals.users}</span>}
            {t === 'queries'  && <span className="ad-nav-count">{queries.length}</span>}
            {t === 'sessions' && <span className="ad-nav-count">{sessions.length}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="ad-content">

        {/* ── OVERVIEW ─────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="ad-overview">
            {/* Top stats */}
            <div className="ad-stat-grid">
              <StatCard label="Total Users"     value={fmt.num(totals.users)}        sub={`${totals.pro} paid`} />
              <StatCard label="Online Now"      value={totals.activeNow}             accent="var(--ad-green)" />
              <StatCard label="Queries Today"   value={fmt.k(totals.todayQueries)}   sub={`${totals.todayUsers} users`} />
              <StatCard label="Tokens Today"    value={fmt.k(totals.todayTokens)}    accent="var(--ad-accent)" />
              <StatCard label="Total Messages"  value={fmt.k(totals.totalMessages)}  />
              <StatCard label="Lifetime Tokens" value={fmt.k(totals.totalTokens)}    />
            </div>

            {/* Today breakdown */}
            {today && (
              <>
                <SectionHeader title="Today's Query Types" />
                <div className="ad-stat-grid">
                  <StatCard label="💻 Coding"    value={fmt.num(today.coding_queries)}    />
                  <StatCard label="🧠 Reasoning" value={fmt.num(today.reasoning_queries)} />
                  <StatCard label="🔍 Live"       value={fmt.num(today.live_queries)}      />
                  <StatCard label="💬 General"   value={fmt.num(today.general_queries)}   />
                  <StatCard label="📄 Artifacts" value={fmt.num(today.artifacts_created)} />
                  <StatCard label="👍 Good"       value={fmt.num(today.good_feedback)}     accent="var(--ad-green)" />
                  <StatCard label="👎 Bad"        value={fmt.num(today.bad_feedback)}      accent="#f87171" />
                  <StatCard label="↻ Regen"       value={fmt.num(today.regenerations)}     />
                </div>

                <SectionHeader title="Today's Models" />
                <div className="ad-stat-grid">
                  <StatCard label="Gemini"  value={fmt.num(today.gemini_queries)}  accent="var(--ad-accent)" />
                  <StatCard label="Claude"  value={fmt.num(today.claude_queries)}  />
                  <StatCard label="OpenAI"  value={fmt.num(today.openai_queries)}  />
                </div>
              </>
            )}

            {/* Last 7 days table */}
            <SectionHeader title="Last 30 Days" count={platform.length} />
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Users</th>
                    <th>Queries</th>
                    <th>Tokens</th>
                    <th>Gemini</th>
                    <th>Claude</th>
                    <th>Coding</th>
                    <th>Live</th>
                    <th>Artifacts</th>
                    <th>👍</th>
                    <th>👎</th>
                  </tr>
                </thead>
                <tbody>
                  {platform.map(day => (
                    <tr key={day.date}>
                      <td className="ad-td-mono">{day.date}</td>
                      <td>{day.active_users}</td>
                      <td>{fmt.k(day.total_queries)}</td>
                      <td>{fmt.k(day.total_tokens)}</td>
                      <td>{day.gemini_queries}</td>
                      <td>{day.claude_queries}</td>
                      <td>{day.coding_queries}</td>
                      <td>{day.live_queries}</td>
                      <td>{day.artifacts_created}</td>
                      <td className="ad-td-good">{day.good_feedback}</td>
                      <td className="ad-td-bad">{day.bad_feedback}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── USERS ────────────────────────────────────────────── */}
        {tab === 'users' && (
          <div className="ad-users">
            <div className="ad-toolbar">
              <input
                className="ad-search"
                placeholder="Search by email, country, tier…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <span className="ad-toolbar-count">{filteredUsers.length} users</span>
            </div>

            <div className="ad-table-wrap">
              <table className="ad-table ad-table--clickable">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Tier</th>
                    <th>Status</th>
                    <th>Last Seen</th>
                    <th>Messages</th>
                    <th>Tokens</th>
                    <th>Sessions</th>
                    <th>Avg Session</th>
                    <th>Coding</th>
                    <th>Live</th>
                    <th>Artifacts</th>
                    <th>Today</th>
                    <th>Timezone</th>
                    <th>Country</th>
                    <th>Device</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr
                      key={u.user_id}
                      onClick={() => handleUserClick(u)}
                      className={u.is_banned ? 'ad-tr-banned' : ''}
                    >
                      <td className="ad-td-email">
                        {u.active_sessions > 0 && <span className="ad-online-dot">●</span>}
                        {u.email}
                        {u.is_admin && <span className="ad-badge-admin">admin</span>}
                      </td>
                      <td>
                        <span className="ad-tier" style={{ color: TIER_COLORS[u.tier] }}>
                          {u.tier}
                        </span>
                      </td>
                      <td>
                        {u.is_banned
                          ? <span className="ad-badge-banned">banned</span>
                          : u.active_sessions > 0
                          ? <span className="ad-badge-online">online</span>
                          : <span className="ad-badge-offline">offline</span>
                        }
                      </td>
                      <td className="ad-td-mono ad-td-sm">{fmt.ago(u.last_seen_at)}</td>
                      <td>{fmt.k(u.total_messages)}</td>
                      <td>{fmt.k(u.lifetime_tokens)}</td>
                      <td>{u.total_sessions}</td>
                      <td>{fmt.mins(u.avg_session_minutes)}</td>
                      <td>{u.total_code_requests}</td>
                      <td>{u.total_live_requests}</td>
                      <td>{u.total_artifacts}</td>
                      <td className={u.queries_today > 0 ? 'ad-td-highlight' : ''}>
                        {u.queries_today > 0 ? u.queries_today : '—'}
                      </td>
                      <td className="ad-td-sm">{u.timezone ?? '—'}</td>
                      <td className="ad-td-sm">{u.country ?? '—'}</td>
                      <td className="ad-td-sm">{u.device_type ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── QUERIES ──────────────────────────────────────────── */}
        {tab === 'queries' && (
          <div className="ad-queries">
            <SectionHeader title="Recent Queries (last 100)" count={queries.length} />
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Prompt</th>
                    <th>Intent</th>
                    <th>Model</th>
                    <th>Tokens</th>
                    <th>Speed</th>
                    <th>Confidence</th>
                    <th>Feedback</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {queries.map(q => (
                    <tr key={q.id}>
                      <td className="ad-td-mono ad-td-sm">{fmt.ago(q.created_at)}</td>
                      <td className="ad-td-email ad-td-sm">{q.email}</td>
                      <td className="ad-td-prompt">
                        {q.prompt_text?.slice(0, 80)}{(q.prompt_text?.length ?? 0) > 80 ? '…' : ''}
                      </td>
                      <td>
                        <span style={{ color: INTENT_COLORS[q.intent ?? 'general'], fontSize: 11, fontWeight: 600 }}>
                          {q.intent ?? '—'}
                        </span>
                      </td>
                      <td className="ad-td-sm">{q.model_used?.replace('Google Gemini', 'Gemini').replace('Anthropic Claude', 'Claude').replace('OpenAI GPT-4', 'GPT-4') ?? '—'}</td>
                      <td>{fmt.k(q.total_tokens)}</td>
                      <td className="ad-td-sm">{q.response_time_ms}ms</td>
                      <td>
                        <span className={`ad-conf-badge ad-conf-badge--${q.confidence_level ?? 'moderate'}`}>
                          {q.confidence_level ?? '—'}
                        </span>
                      </td>
                      <td>
                        {q.feedback === 'good' && <span className="ad-td-good">👍</span>}
                        {q.feedback === 'bad'  && <span className="ad-td-bad">👎</span>}
                        {!q.feedback && '—'}
                      </td>
                      <td className="ad-td-flags">
                        {q.had_error      && <span className="ad-flag ad-flag--error">err</span>}
                        {q.artifact_created && <span className="ad-flag ad-flag--artifact">art</span>}
                        {q.was_regenerated  && <span className="ad-flag ad-flag--regen">regen</span>}
                        {q.slash_command  && <span className="ad-flag ad-flag--slash">/{q.slash_command}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SESSIONS ─────────────────────────────────────────── */}
        {tab === 'sessions' && (
          <div className="ad-sessions">
            <SectionHeader title="Recent Sessions (last 100)" count={sessions.length} />
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Messages</th>
                    <th>Tokens</th>
                    <th>Device</th>
                    <th>Browser</th>
                    <th>OS</th>
                    <th>Country</th>
                    <th>City</th>
                    <th>Timezone</th>
                    <th>Ended</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s.id} className={s.is_active ? 'ad-tr-active' : ''}>
                      <td className="ad-td-email ad-td-sm">{s.email}</td>
                      <td>
                        {s.is_active
                          ? <span className="ad-badge-online">● live</span>
                          : <span className="ad-badge-offline">ended</span>
                        }
                      </td>
                      <td className="ad-td-mono ad-td-sm">{fmt.date(s.started_at)}</td>
                      <td>{fmt.mins(s.duration_minutes)}</td>
                      <td>{s.messages_sent}</td>
                      <td>{fmt.k(s.tokens_used)}</td>
                      <td className="ad-td-sm">{s.device_type ?? '—'}</td>
                      <td className="ad-td-sm">{s.browser ?? '—'}</td>
                      <td className="ad-td-sm">{s.os ?? '—'}</td>
                      <td className="ad-td-sm">{s.country ?? '—'}</td>
                      <td className="ad-td-sm">{s.city ?? '—'}</td>
                      <td className="ad-td-sm">{s.timezone ?? '—'}</td>
                      <td className="ad-td-sm">{s.ended_reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* User detail modal */}
      {selectedUser && (
        <UserModal
          user={selectedUser}
          queries={userQueries}
          sessions={userSessions}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
};

export default AdminDashboard;