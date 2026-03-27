// components/AdminDashboard.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Admin Dashboard v3.0 (Elite)
//
// Intelligence platform for monitoring every user action.
// Reads from admin_user_summary, admin_platform_daily,
// admin_user_queries, admin_user_sessions views.
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
  num:  (n: number) => n?.toLocaleString() ?? '0',
  k:    (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}k` : (n?.toString() ?? '0'),
  date: (s: string | null) => s ? new Date(s).toLocaleString() : '—',
  ago:  (s: string | null) => {
    if (!s) return '—';
    const d = Date.now() - new Date(s).getTime();
    if (d < 60000)    return 'just now';
    if (d < 3600000)  return `${Math.floor(d/60000)}m ago`;
    if (d < 86400000) return `${Math.floor(d/3600000)}h ago`;
    return `${Math.floor(d/86400000)}d ago`;
  },
  mins: (n: number) => n >= 60 ? `${Math.floor(n/60)}h ${Math.floor(n%60)}m` : `${Math.round(n)}m`,
};

const shortModel = (m: string | null) =>
  m?.replace('Google Gemini', 'Gemini').replace('Anthropic Claude', 'Claude').replace('OpenAI GPT-4', 'GPT-4') ?? '—';

// ── Avatar initials ───────────────────────────────────────────────
// Dynamic hue requires CSS custom property — avoids inline style rule
const Avatar = memo(({ email, size = 28 }: { email: string; size?: number }) => {
  const letter = (email?.[0] ?? '?').toUpperCase();
  const hue = email.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div
      className="ad-avatar"
      data-size={size <= 28 ? 'sm' : 'md'}
      style={{ '--ad-hue': hue, '--ad-sz': `${size}px`, '--ad-fsz': `${Math.round(size * 0.4)}px` } as React.CSSProperties}
    >
      {letter}
    </div>
  );
});

// ── SVG Mini bar chart (7-day) ────────────────────────────────────
const MiniBarChart = memo(({ values, colorClass = 'green', label }: {
  values: number[]; colorClass?: 'green' | 'blue' | 'purple'; label?: string;
}) => {
  const W = 120, H = 36, PAD = 2;
  const max = Math.max(...values, 1);
  const barW = (W - PAD * (values.length - 1)) / values.length;

  return (
    <div className="ad-minichart">
      {label && <div className="ad-minichart-label">{label}</div>}
      <svg width={W} height={H} className="ad-minichart-svg">
        {values.map((v, i) => {
          const barH = Math.max(2, (v / max) * (H - 4));
          const x = i * (barW + PAD);
          const y = H - barH;
          return (
            <rect
              key={i}
              x={x} y={y} width={barW} height={barH}
              className={`ad-minichart-bar ad-minichart-bar--${colorClass}${i === values.length - 1 ? ' ad-minichart-bar--current' : ''}`}
              rx={2}
            />
          );
        })}
      </svg>
    </div>
  );
});

// ── SVG Sparkline ─────────────────────────────────────────────────
const Sparkline = memo(({ values, colorClass = 'green' }: {
  values: number[]; colorClass?: 'green' | 'blue' | 'purple';
}) => {
  const W = 60, H = 20;
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 2) - 1;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={W} height={H} className="ad-sparkline-svg">
      <polyline
        points={pts}
        fill="none"
        className={`ad-sparkline-line ad-sparkline-line--${colorClass}`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

// ── Horizontal progress bar ───────────────────────────────────────
// CSS custom properties carry dynamic values to avoid inline style rule
const ProgressBar = memo(({ label, value, max, colorClass, icon }: {
  label: string; value: number; max: number;
  colorClass: 'green' | 'accent' | 'blue' | 'purple' | 'muted';
  icon?: string;
}) => {
  const pct = max === 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className="ad-prog-row">
      <div className="ad-prog-label">
        {icon && <span>{icon}</span>}
        <span>{label}</span>
      </div>
      <div className="ad-prog-bar-wrap">
        <div
          className={`ad-prog-bar ad-prog-bar--${colorClass}`}
          style={{ '--prog-w': `${pct}%` } as React.CSSProperties}
        />
      </div>
      <div className={`ad-prog-value ad-prog-value--${colorClass}`}>{fmt.num(value)}</div>
    </div>
  );
});

// ── Trend badge ───────────────────────────────────────────────────
const Trend = ({ current, previous }: { current: number; previous: number }) => {
  if (!previous) return null;
  const delta = ((current - previous) / previous) * 100;
  if (Math.abs(delta) < 1) return <span className="ad-trend ad-trend--flat">—</span>;
  return (
    <span className={`ad-trend ${delta > 0 ? 'ad-trend--up' : 'ad-trend--down'}`}>
      {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
    </span>
  );
};

// ── Enhanced Stat Card ─────────────────────────────────────────────
const StatCard = memo(({ label, value, sub, accentClass, trend, sparkValues }: {
  label: string; value: string | number; sub?: string;
  accentClass?: 'green' | 'accent' | 'blue' | 'purple' | 'red';
  trend?: { current: number; previous: number };
  sparkValues?: number[];
}) => (
  <div className="ad-stat-card">
    <div className="ad-stat-label">{label}</div>
    <div className="ad-stat-value-row">
      <div className={`ad-stat-value${accentClass ? ` ad-stat-value--${accentClass}` : ''}`}>{value}</div>
      {trend && <Trend current={trend.current} previous={trend.previous} />}
    </div>
    {sub && <div className="ad-stat-sub">{sub}</div>}
    {sparkValues && sparkValues.length > 1 && (
      <div className="ad-stat-spark">
        <Sparkline values={sparkValues} colorClass={accentClass === 'blue' ? 'blue' : accentClass === 'purple' ? 'purple' : 'green'} />
      </div>
    )}
  </div>
));

// ── Section header ────────────────────────────────────────────────
const SectionHeader = ({ title, count }: { title: string; count?: number }) => (
  <div className="ad-section-header">
    <span className="ad-section-title">{title}</span>
    {count !== undefined && <span className="ad-section-count">{count}</span>}
  </div>
);

// ── Live pulse dot ────────────────────────────────────────────────
const LiveDot = () => (
  <span className="ad-live-dot" aria-hidden="true">
    <span className="ad-live-dot-inner" />
  </span>
);

// ── User detail modal ─────────────────────────────────────────────
const UserModal = memo(({ user, queries, sessions, onClose }: {
  user:     UserSummary;
  queries:  UserQuery[];
  sessions: UserSession[];
  onClose:  () => void;
}) => {
  const [tab, setTab] = useState<'overview' | 'queries' | 'sessions'>('overview');

  const totalReqs = user.total_code_requests + user.total_reasoning_requests + user.total_live_requests +
    Math.max(0, user.total_messages - user.total_code_requests - user.total_reasoning_requests - user.total_live_requests);

  return (
    <div className="ad-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ad-modal">
        {/* Header */}
        <div className="ad-modal-header">
          <div className="ad-modal-title-row">
            <Avatar email={user.email} size={44} />
            <div>
              <div className="ad-modal-email">{user.email}</div>
              <div className="ad-modal-meta-row">
                <span className={`ad-tier-pill ad-tier-pill--${user.tier}`}>{user.tier}</span>
                {user.is_admin  && <span className="ad-admin-badge">admin</span>}
                {user.is_banned && <span className="ad-banned-badge">banned</span>}
                {user.active_sessions > 0 && (
                  <span className="ad-online-badge"><LiveDot /> live now</span>
                )}
              </div>
            </div>
          </div>
          <button type="button" className="ad-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Quick stats bar */}
        <div className="ad-modal-quickstats">
          <div className="ad-modal-qstat">
            <div className="ad-modal-qstat-v">{fmt.k(user.lifetime_tokens)}</div>
            <div className="ad-modal-qstat-l">lifetime tokens</div>
          </div>
          <div className="ad-modal-qstat">
            <div className="ad-modal-qstat-v">{fmt.num(user.total_messages)}</div>
            <div className="ad-modal-qstat-l">messages</div>
          </div>
          <div className="ad-modal-qstat">
            <div className="ad-modal-qstat-v">{user.total_sessions}</div>
            <div className="ad-modal-qstat-l">sessions</div>
          </div>
          <div className="ad-modal-qstat">
            <div className="ad-modal-qstat-v">{user.streak_days}d</div>
            <div className="ad-modal-qstat-l">streak</div>
          </div>
          <div className="ad-modal-qstat">
            <div className="ad-modal-qstat-v">{fmt.mins(user.avg_session_minutes)}</div>
            <div className="ad-modal-qstat-l">avg session</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="ad-modal-tabs">
          {(['overview', 'queries', 'sessions'] as const).map(t => (
            <button
              key={t}
              type="button"
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
              <div className="ad-detail-section">
                <div className="ad-detail-section-title">Identity & Device</div>
                <div className="ad-detail-grid">
                  <div className="ad-detail-item"><span>Signed up</span><span>{fmt.date(user.signup_at)}</span></div>
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

              <div className="ad-detail-section">
                <div className="ad-detail-section-title">Query Type Breakdown</div>
                <div className="ad-prog-list">
                  <ProgressBar label="Coding"    icon="💻" value={user.total_code_requests}     max={Math.max(totalReqs, 1)} colorClass="blue" />
                  <ProgressBar label="Reasoning" icon="🧠" value={user.total_reasoning_requests} max={Math.max(totalReqs, 1)} colorClass="purple" />
                  <ProgressBar label="Live"      icon="🔍" value={user.total_live_requests}      max={Math.max(totalReqs, 1)} colorClass="green" />
                  <ProgressBar label="Artifacts" icon="📄" value={user.total_artifacts}          max={Math.max(user.total_messages, 1)} colorClass="accent" />
                </div>
              </div>

              <div className="ad-detail-section">
                <div className="ad-detail-section-title">Token Usage</div>
                <div className="ad-stat-grid-4">
                  <StatCard label="Input Tokens"   value={fmt.k(user.total_input_tokens)}  accentClass="blue" />
                  <StatCard label="Output Tokens"  value={fmt.k(user.total_output_tokens)} accentClass="purple" />
                  <StatCard label="Lifetime Total" value={fmt.k(user.lifetime_tokens)}      accentClass="accent" />
                  <StatCard label="This Month"     value={fmt.num(user.monthly_messages)}  sub="messages" />
                </div>
              </div>

              {user.favorite_model && (
                <div className="ad-detail-section">
                  <div className="ad-detail-section-title">Favourite Model</div>
                  <div className="ad-fav-model">
                    <span className="ad-fav-model-icon">✦</span>
                    <span>{shortModel(user.favorite_model)}</span>
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
                    <span className={`ad-query-intent ad-intent--${q.intent ?? 'general'}`}>
                      {q.intent ?? 'general'}
                    </span>
                    <span className="ad-query-model">{shortModel(q.model_used)}</span>
                    <span className="ad-query-tokens">{fmt.k(q.total_tokens)} tok</span>
                    <span className="ad-query-time">{fmt.ago(q.created_at)}</span>
                    {q.feedback === 'good' && <span className="ad-query-feedback">👍</span>}
                    {q.feedback === 'bad'  && <span className="ad-query-feedback">👎</span>}
                    {q.had_error       && <span className="ad-flag ad-flag--error">err</span>}
                    {q.artifact_created && <span className="ad-flag ad-flag--artifact">art</span>}
                    {q.was_regenerated  && <span className="ad-flag ad-flag--regen">regen</span>}
                  </div>
                  <div className="ad-query-prompt">
                    {q.prompt_text?.slice(0, 220)}{(q.prompt_text?.length ?? 0) > 220 ? '…' : ''}
                  </div>
                  <div className="ad-query-bottom">
                    <span>{q.response_time_ms}ms</span>
                    <span>in: {fmt.k(q.input_tokens)} · out: {fmt.k(q.output_tokens)}</span>
                    {q.slash_command     && <span className="ad-query-slash">/{q.slash_command}</span>}
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
                      ? <span className="ad-online-badge"><LiveDot /> active now</span>
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
                    {s.timezone     && <span className="ad-session-tz">{s.timezone}</span>}
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
  const [tab, setTab]           = useState<'overview' | 'users' | 'queries' | 'sessions'>('overview');
  const [users, setUsers]       = useState<UserSummary[]>([]);
  const [platform, setPlatform] = useState<PlatformDay[]>([]);
  const [queries, setQueries]   = useState<UserQuery[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [userQueries, setUserQueries]   = useState<UserQuery[]>([]);
  const [userSessions, setUserSessions] = useState<UserSession[]>([]);
  const [lastRefresh, setLastRefresh]   = useState<Date>(new Date());
  const [refreshing, setRefreshing]     = useState(false);

  const loadData = useCallback(async () => {
    if (!supabase) { setError('Supabase not configured'); setLoading(false); return; }
    setRefreshing(true);
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
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleUserClick = useCallback(async (user: UserSummary) => {
    setSelectedUser(user);
    if (!supabase) return;
    const [qRes, sRes] = await Promise.all([
      supabase.from('admin_user_queries').select('*').eq('user_id', user.user_id).order('created_at', { ascending: false }).limit(50),
      supabase.from('admin_user_sessions').select('*').eq('user_id', user.user_id).order('started_at', { ascending: false }).limit(30),
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

  const today     = platform[0];
  const yesterday = platform[1];

  const totals = useMemo(() => ({
    users:         users.length,
    activeNow:     users.filter(u => u.active_sessions > 0).length,
    totalMessages: users.reduce((s, u) => s + (u.total_messages ?? 0), 0),
    totalTokens:   users.reduce((s, u) => s + (u.lifetime_tokens ?? 0), 0),
    todayQueries:  today?.total_queries ?? 0,
    todayTokens:   today?.total_tokens  ?? 0,
    todayUsers:    today?.active_users  ?? 0,
    pro:           users.filter(u => u.tier === 'pro' || u.tier === 'unlimited').length,
  }), [users, today]);

  // Last 7 days in chronological order for charts
  const last7 = useMemo(() => [...platform].reverse().slice(-7), [platform]);
  const spark7Queries = last7.map(d => d.total_queries);
  const spark7Users   = last7.map(d => d.active_users);

  const modelTotal  = (today?.gemini_queries ?? 0) + (today?.claude_queries ?? 0) + (today?.openai_queries ?? 0);
  const intentTotal = (today?.coding_queries ?? 0) + (today?.reasoning_queries ?? 0) +
                      (today?.live_queries ?? 0) + (today?.general_queries ?? 0);

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
      <button type="button" className="ad-retry-btn" onClick={loadData}>Retry</button>
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
              <span className="ad-live-badge"><LiveDot /> {totals.activeNow} live</span>
            )}
            <span className="ad-refresh-time">Updated {fmt.ago(lastRefresh.toISOString())}</span>
          </div>
        </div>
        <button
          type="button"
          className={`ad-refresh-btn${refreshing ? ' ad-refresh-btn--spinning' : ''}`}
          onClick={loadData}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Nav tabs */}
      <div className="ad-nav">
        {(['overview', 'users', 'queries', 'sessions'] as const).map(t => (
          <button
            key={t}
            type="button"
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
            <div className="ad-stat-grid">
              <StatCard label="Total Users"     value={fmt.num(totals.users)}       sub={`${totals.pro} paid · ${totals.users - totals.pro} free`} />
              <StatCard label="Online Now"      value={totals.activeNow}            accentClass="green" />
              <StatCard
                label="Queries Today"
                value={fmt.k(totals.todayQueries)}
                sub={`${totals.todayUsers} users active`}
                accentClass="accent"
                trend={yesterday ? { current: totals.todayQueries, previous: yesterday.total_queries } : undefined}
                sparkValues={spark7Queries}
              />
              <StatCard
                label="Tokens Today"
                value={fmt.k(totals.todayTokens)}
                accentClass="blue"
                trend={yesterday ? { current: totals.todayTokens, previous: yesterday.total_tokens } : undefined}
              />
              <StatCard label="Total Messages"  value={fmt.k(totals.totalMessages)} sparkValues={spark7Users} />
              <StatCard label="Lifetime Tokens" value={fmt.k(totals.totalTokens)}   accentClass="purple" />
            </div>

            {/* 7-day bar chart */}
            {last7.length > 1 && (
              <>
                <SectionHeader title="7-Day Trend" />
                <div className="ad-chart-row">
                  <div className="ad-chart-card">
                    <div className="ad-chart-card-label">Daily Queries</div>
                    <div className="ad-barchart">
                      {last7.map((d, i) => {
                        const max = Math.max(...last7.map(x => x.total_queries), 1);
                        const pct = Math.max((d.total_queries / max) * 100, 4);
                        const isToday = i === last7.length - 1;
                        return (
                          <div key={d.date} className="ad-barchart-col" title={`${d.date}: ${fmt.num(d.total_queries)} queries`}>
                            <div className="ad-barchart-bar-wrap">
                              <div
                                className={`ad-barchart-bar${isToday ? ' ad-barchart-bar--today' : ''}`}
                                style={{ '--bar-h': `${pct}%` } as React.CSSProperties}
                              />
                            </div>
                            <div className="ad-barchart-x">
                              {new Date(d.date).toLocaleDateString('en', { weekday: 'narrow' })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="ad-chart-card">
                    <div className="ad-chart-card-label">Daily Active Users</div>
                    <div className="ad-barchart">
                      {last7.map((d, i) => {
                        const max = Math.max(...last7.map(x => x.active_users), 1);
                        const pct = Math.max((d.active_users / max) * 100, 4);
                        const isToday = i === last7.length - 1;
                        return (
                          <div key={d.date} className="ad-barchart-col" title={`${d.date}: ${d.active_users} users`}>
                            <div className="ad-barchart-bar-wrap">
                              <div
                                className={`ad-barchart-bar ad-barchart-bar--blue${isToday ? ' ad-barchart-bar--today-blue' : ''}`}
                                style={{ '--bar-h': `${pct}%` } as React.CSSProperties}
                              />
                            </div>
                            <div className="ad-barchart-x">
                              {new Date(d.date).toLocaleDateString('en', { weekday: 'narrow' })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Today breakdown */}
            {today && (
              <>
                <SectionHeader title="Today — Model Distribution" />
                <div className="ad-dist-card">
                  <div className="ad-prog-list">
                    <ProgressBar label="Gemini" value={today.gemini_queries} max={Math.max(modelTotal, 1)} colorClass="accent" />
                    <ProgressBar label="Claude" value={today.claude_queries} max={Math.max(modelTotal, 1)} colorClass="purple" />
                    <ProgressBar label="OpenAI" value={today.openai_queries} max={Math.max(modelTotal, 1)} colorClass="blue" />
                  </div>
                  {modelTotal > 0 && (
                    <div className="ad-stacked-bar">
                      {today.gemini_queries > 0 && (
                        <div
                          className="ad-stacked-seg ad-stacked-seg--gemini"
                          style={{ '--seg-flex': today.gemini_queries } as React.CSSProperties}
                          title={`Gemini: ${today.gemini_queries}`}
                        />
                      )}
                      {today.claude_queries > 0 && (
                        <div
                          className="ad-stacked-seg ad-stacked-seg--claude"
                          style={{ '--seg-flex': today.claude_queries } as React.CSSProperties}
                          title={`Claude: ${today.claude_queries}`}
                        />
                      )}
                      {today.openai_queries > 0 && (
                        <div
                          className="ad-stacked-seg ad-stacked-seg--openai"
                          style={{ '--seg-flex': today.openai_queries } as React.CSSProperties}
                          title={`OpenAI: ${today.openai_queries}`}
                        />
                      )}
                    </div>
                  )}
                </div>

                <SectionHeader title="Today — Query Intent" />
                <div className="ad-dist-card">
                  <div className="ad-prog-list">
                    <ProgressBar label="Coding"    icon="💻" value={today.coding_queries}   max={Math.max(intentTotal, 1)} colorClass="blue" />
                    <ProgressBar label="Reasoning" icon="🧠" value={today.reasoning_queries} max={Math.max(intentTotal, 1)} colorClass="purple" />
                    <ProgressBar label="Live"      icon="🔍" value={today.live_queries}      max={Math.max(intentTotal, 1)} colorClass="green" />
                    <ProgressBar label="General"   icon="💬" value={today.general_queries}   max={Math.max(intentTotal, 1)} colorClass="muted" />
                  </div>
                </div>

                <SectionHeader title="Today — Feedback & Engagement" />
                <div className="ad-stat-grid">
                  <StatCard label="Artifacts"    value={fmt.num(today.artifacts_created)} accentClass="accent" />
                  <StatCard label="👍 Positive"   value={fmt.num(today.good_feedback)}     accentClass="green" />
                  <StatCard label="👎 Negative"   value={fmt.num(today.bad_feedback)}      accentClass="red" />
                  <StatCard label="↻ Regenerated" value={fmt.num(today.regenerations)} />
                </div>
              </>
            )}

            {/* 30-day table */}
            <SectionHeader title="30-Day History" count={platform.length} />
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Users</th><th>Queries</th><th>Tokens</th>
                    <th>Gemini</th><th>Claude</th><th>Coding</th><th>Live</th>
                    <th>Artifacts</th><th>👍</th><th>👎</th>
                  </tr>
                </thead>
                <tbody>
                  {platform.map((day, i) => (
                    <tr key={day.date} className={i === 0 ? 'ad-tr-today' : ''}>
                      <td className="ad-td-mono">
                        {day.date}
                        {i === 0 && <span className="ad-today-pill">today</span>}
                      </td>
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
              <div className="ad-search-wrap">
                <span className="ad-search-icon">⌕</span>
                <input
                  className="ad-search"
                  placeholder="Search by email, country, tier…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <span className="ad-toolbar-count">{filteredUsers.length} users</span>
              <div className="ad-toolbar-pills">
                {users.filter(u => u.active_sessions > 0).length > 0 && (
                  <span className="ad-toolbar-pill ad-toolbar-pill--live">
                    <LiveDot /> {users.filter(u => u.active_sessions > 0).length} online
                  </span>
                )}
                <span className="ad-toolbar-pill">{totals.pro} paid</span>
              </div>
            </div>

            <div className="ad-table-wrap">
              <table className="ad-table ad-table--clickable">
                <thead>
                  <tr>
                    <th>User</th><th>Tier</th><th>Status</th><th>Last Seen</th>
                    <th>Messages</th><th>Tokens</th><th>Sessions</th><th>Avg</th>
                    <th>Coding</th><th>Live</th><th>Artifacts</th><th>Today</th>
                    <th>Country</th><th>Device</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr
                      key={u.user_id}
                      onClick={() => handleUserClick(u)}
                      className={u.is_banned ? 'ad-tr-banned' : u.active_sessions > 0 ? 'ad-tr-live' : ''}
                    >
                      <td className="ad-td-user">
                        <Avatar email={u.email} size={26} />
                        <div className="ad-td-user-info">
                          <span className="ad-td-email-text">{u.email}</span>
                          {u.is_admin && <span className="ad-badge-admin">admin</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`ad-tier-pill ad-tier-pill--${u.tier}`}>{u.tier}</span>
                      </td>
                      <td>
                        {u.is_banned
                          ? <span className="ad-badge-banned">banned</span>
                          : u.active_sessions > 0
                          ? <span className="ad-badge-online"><LiveDot /> live</span>
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
                      <td className={u.queries_today > 0 ? 'ad-td-highlight' : 'ad-td-sm'}>
                        {u.queries_today > 0 ? u.queries_today : '—'}
                      </td>
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
            <SectionHeader title="Recent Queries" count={queries.length} />
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>Time</th><th>User</th><th>Prompt</th><th>Intent</th>
                    <th>Model</th><th>Tokens</th><th>Speed</th><th>Confidence</th>
                    <th>Feedback</th><th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {queries.map(q => (
                    <tr key={q.id} className={q.had_error ? 'ad-tr-error' : ''}>
                      <td className="ad-td-mono ad-td-sm">{fmt.ago(q.created_at)}</td>
                      <td className="ad-td-email ad-td-sm">{q.email}</td>
                      <td className="ad-td-prompt">
                        {q.prompt_text?.slice(0, 80)}{(q.prompt_text?.length ?? 0) > 80 ? '…' : ''}
                      </td>
                      <td>
                        <span className={`ad-intent-chip ad-intent-chip--${q.intent ?? 'general'}`}>
                          {q.intent ?? '—'}
                        </span>
                      </td>
                      <td className="ad-td-sm">{shortModel(q.model_used)}</td>
                      <td>{fmt.k(q.total_tokens)}</td>
                      <td className={`ad-td-sm${q.response_time_ms > 5000 ? ' ad-td-slow' : q.response_time_ms < 1500 ? ' ad-td-fast' : ''}`}>
                        {q.response_time_ms}ms
                      </td>
                      <td>
                        <span className={`ad-conf-badge ad-conf-badge--${q.confidence_level ?? 'moderate'}`}>
                          {q.confidence_level ?? '—'}
                        </span>
                      </td>
                      <td>
                        {q.feedback === 'good' && <span className="ad-td-good">👍</span>}
                        {q.feedback === 'bad'  && <span className="ad-td-bad">👎</span>}
                        {!q.feedback && <span className="ad-td-sm">—</span>}
                      </td>
                      <td className="ad-td-flags">
                        {q.had_error        && <span className="ad-flag ad-flag--error">err</span>}
                        {q.artifact_created && <span className="ad-flag ad-flag--artifact">art</span>}
                        {q.was_regenerated  && <span className="ad-flag ad-flag--regen">regen</span>}
                        {q.slash_command    && <span className="ad-flag ad-flag--slash">/{q.slash_command}</span>}
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
            <SectionHeader title="Recent Sessions" count={sessions.length} />
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>User</th><th>Status</th><th>Started</th><th>Duration</th>
                    <th>Messages</th><th>Tokens</th><th>Device</th><th>Browser</th>
                    <th>OS</th><th>Country</th><th>City</th><th>Ended</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s.id} className={s.is_active ? 'ad-tr-live' : ''}>
                      <td className="ad-td-email ad-td-sm">{s.email}</td>
                      <td>
                        {s.is_active
                          ? <span className="ad-badge-online"><LiveDot /> live</span>
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
                      <td className="ad-td-sm">{s.ended_reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

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
