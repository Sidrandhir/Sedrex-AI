// components/Dashboard.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Usage Dashboard (P5.3)
// Shows real usage meters, model breakdown, daily activity, tier features
// Uses getUsageSummary() — adapts to actual enforced limits (or "Unlimited")
// ══════════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';
import { UserStats } from '../types';
import { getUsageSummary, getUsageColor, LimitCheck } from '../services/usageLimitService';
import { getTierConfig } from '../services/tierConfig';
import './Dashboard.css';

interface DashboardProps {
  stats:     UserStats;
  onUpgrade: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────
function daysUntilMonthEnd(): number {
  const now  = new Date();
  const end  = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function shortModelName(model: string): string {
  // Turn "claude-3-5-sonnet-20241022" → "Claude Sonnet"
  if (/claude/i.test(model)) {
    if (/opus/i.test(model))    return 'Claude Opus';
    if (/haiku/i.test(model))   return 'Claude Haiku';
    return 'Claude Sonnet';
  }
  if (/gpt-4o-mini/i.test(model)) return 'GPT-4o mini';
  if (/gpt-4o/i.test(model))      return 'GPT-4o';
  if (/gpt-4/i.test(model))       return 'GPT-4';
  if (/gemini.*pro/i.test(model)) return 'Gemini Pro';
  if (/gemini/i.test(model))      return 'Gemini';
  if (/o[34]-mini/i.test(model))  return model.replace(/-\d+$/, '');
  // Fallback: take last segment
  return model.split(/[-/]/).pop() ?? model;
}

// ── Meter card ─────────────────────────────────────────────────────
function MeterCard({
  label,
  check,
  unit,
  resetLabel,
}: {
  label:      string;
  check:      LimitCheck;
  unit:       string;
  resetLabel?: string;
}) {
  const color  = check.isEnforced ? getUsageColor(check.status) : '#10b981';
  const pct    = check.isEnforced ? Math.min(check.percentUsed, 100) : 0;
  const status = !check.isEnforced
    ? 'unlimited'
    : check.status;

  return (
    <div className="dash-meter-card">
      <div className="dash-meter-top">
        <span className="dash-meter-label">{label}</span>
        <span className={`dash-meter-status ${status}`}>
          {status === 'unlimited' ? 'Unlimited' :
           status === 'blocked'   ? 'Limit reached' :
           status === 'warning'   ? 'Almost full' : 'Good'}
        </span>
      </div>

      <div className="dash-meter-value">{fmtNum(check.used)}</div>
      <div className="dash-meter-limit">
        {check.isEnforced
          ? <>{unit} used of <span>{fmtNum(check.limit)}</span></>
          : <span>Unlimited {unit}</span>
        }
      </div>

      <div className="dash-meter-track">
        <div
          className="dash-meter-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>

      <div className="dash-meter-footer">
        <span className="dash-meter-reset">{resetLabel}</span>
        {check.isEnforced && (
          <span className="dash-meter-pct">{Math.round(pct)}%</span>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────
const Dashboard: React.FC<DashboardProps> = ({ stats, onUpgrade }) => {
  const summary     = getUsageSummary(stats);
  const cfg         = getTierConfig(stats.tier);
  const daysLeft    = daysUntilMonthEnd();
  const resetLabel  = `Resets in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
  const isFree      = stats.tier === 'free';
  const isPro       = stats.tier === 'pro';
  const isEnt       = stats.tier === 'enterprise';

  // Daily activity — last 14 days
  const dailyData = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d   = new Date(today);
      d.setDate(d.getDate() - (13 - i));
      const key = d.toISOString().slice(0, 10);
      const hit = stats.dailyHistory.find(h => h.date === key);
      return { date: key.slice(5), count: hit?.count ?? 0 };
    });
  }, [stats.dailyHistory]);
  const maxDaily = Math.max(...dailyData.map(d => d.count), 1);

  // P10 — 52-week activity heatmap (GitHub style)
  const heatmapData = useMemo(() => {
    const today = new Date();
    const days: Array<{ date: string; count: number; week: number; dow: number }> = [];
    for (let i = 363; i >= 0; i--) {
      const d   = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const hit = stats.dailyHistory.find(h => h.date === key);
      days.push({
        date:  key,
        count: hit?.count ?? 0,
        week:  Math.floor((363 - i) / 7),
        dow:   d.getDay(),
      });
    }
    return days;
  }, [stats.dailyHistory]);
  const heatmapMax = Math.max(...heatmapData.map(d => d.count), 1);

  function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
    if (count === 0) return 0;
    const pct = count / heatmapMax;
    if (pct < 0.25) return 1;
    if (pct < 0.5)  return 2;
    if (pct < 0.75) return 3;
    return 4;
  }

  // Model usage sorted
  const modelRows = useMemo(() => {
    const total = Object.values(stats.modelUsage).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(stats.modelUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([model, count]) => ({
        name: shortModelName(model),
        count,
        pct: Math.round((count / total) * 100),
      }));
  }, [stats.modelUsage]);

  // Feature list
  const featureRows: { label: string; enabled: boolean }[] = [
    { label: 'Code execution',       enabled: cfg.features.codeExecution },
    { label: 'Image generation',     enabled: cfg.features.imageGeneration },
    { label: 'Advanced AI models',   enabled: cfg.features.advancedModels },
    { label: 'Priority routing',     enabled: cfg.features.priorityRouting },
    { label: 'Codebase indexing',    enabled: isEnt || isPro },
    { label: 'Custom system prompt', enabled: cfg.features.customSystemPrompt },
    { label: 'Export conversations', enabled: cfg.features.exportConversations },
    { label: 'API access',           enabled: cfg.features.apiAccess },
    { label: 'Team access',          enabled: cfg.features.teamAccess },
    { label: 'SLA guarantee',        enabled: cfg.features.slaGuarantee },
  ];

  return (
    <div className="dash-root">
      <div className="dash-inner">

        {/* ── Header ─────────────────────────────────── */}
        <div className="dash-header">
          <div className="dash-header-left">
            <h1 className="dash-title">Usage Overview</h1>
            <p className="dash-subtitle">
              {cfg.name} · {daysLeft} day{daysLeft !== 1 ? 's' : ''} until monthly reset
            </p>
          </div>
          <div className="dash-header-right">
            <span className={`dash-tier-badge ${stats.tier}`}>
              <span className="dash-tier-dot" />
              {cfg.name}
            </span>
            {isFree && (
              <button type="button" className="dash-upgrade-btn" onClick={onUpgrade}>
                Upgrade to Pro
              </button>
            )}
          </div>
        </div>

        {/* ── Quick stats ────────────────────────────── */}
        <div className="dash-stats-row">
          <div className="dash-stat-card">
            <span className="dash-stat-label">Total Messages</span>
            <span className="dash-stat-value">{fmtNum(stats.totalMessagesSent)}</span>
            <span className="dash-stat-sub">All time</span>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-label">This Month</span>
            <span className="dash-stat-value accent">{fmtNum(stats.monthlyMessagesSent)}</span>
            <span className="dash-stat-sub">Messages sent</span>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Tokens Used</span>
            <span className="dash-stat-value">{fmtNum(stats.tokensEstimated)}</span>
            <span className="dash-stat-sub">This month</span>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Today</span>
            <span className="dash-stat-value">
              {dailyData[dailyData.length - 1]?.count ?? 0}
            </span>
            <span className="dash-stat-sub">Messages</span>
          </div>
        </div>

        {/* ── Usage meters ───────────────────────────── */}
        <div className="dash-meters-grid">
          <MeterCard
            label="Monthly Messages"
            check={summary.messages}
            unit="messages"
            resetLabel={resetLabel}
          />
          <MeterCard
            label="Daily Messages"
            check={summary.dailyMessages}
            unit="messages"
            resetLabel="Resets at midnight"
          />
          <MeterCard
            label="Token Usage"
            check={summary.tokens}
            unit="tokens"
            resetLabel={resetLabel}
          />
        </div>

        {/* ── Activity + Model usage ──────────────────── */}
        <div className="dash-two-col">

          {/* Daily activity chart */}
          <div className="dash-section-card">
            <p className="dash-section-title">Daily Activity — Last 14 Days</p>
            <div className="dash-chart">
              {dailyData.every(d => d.count === 0) ? (
                <div className="dash-chart-empty">No activity yet</div>
              ) : (
                dailyData.map((day, i) => (
                  <div key={i} className="dash-bar-wrap">
                    <div className="dash-bar-tooltip">
                      {day.date}: {day.count}
                    </div>
                    <div
                      className="dash-bar"
                      style={{
                        height: `${Math.max((day.count / maxDaily) * 100, day.count > 0 ? 4 : 0)}%`,
                        background: day.count > 0
                          ? `rgba(16, 185, 129, ${0.3 + (day.count / maxDaily) * 0.7})`
                          : 'rgba(255,255,255,0.04)',
                      }}
                    />
                    {(i === 0 || i === 6 || i === 13) && (
                      <span className="dash-bar-date">{day.date.slice(3)}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Model usage */}
          <div className="dash-section-card">
            <p className="dash-section-title">Model Usage</p>
            {modelRows.length === 0 ? (
              <div className="dash-model-empty">No data yet</div>
            ) : (
              <div className="dash-model-list">
                {modelRows.map(row => (
                  <div key={row.name} className="dash-model-row">
                    <span className="dash-model-name">{row.name}</span>
                    <div className="dash-model-bar-track">
                      <div className="dash-model-bar-fill" style={{ width: `${row.pct}%` }} />
                    </div>
                    <span className="dash-model-count">{row.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── P10 — Activity heatmap (full-width) ────── */}
        <div className="dash-section-card">
          <p className="dash-section-title">Activity — Past Year</p>
          <div className="dash-heatmap-wrap">
            <div className="dash-heatmap">
              {Array.from({ length: 52 }, (_, week) => (
                <div key={week} className="dash-heatmap-col">
                  {Array.from({ length: 7 }, (_, dow) => {
                    const cell = heatmapData.find(d => d.week === week && d.dow === dow);
                    return (
                      <div
                        key={dow}
                        className="dash-heatmap-cell"
                        title={cell ? `${cell.date}: ${cell.count} message${cell.count !== 1 ? 's' : ''}` : ''}
                        data-level={heatLevel(cell?.count ?? 0)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="dash-heatmap-legend">
              <span className="dash-heatmap-legend-label">Less</span>
              {([0, 1, 2, 3, 4] as const).map(lvl => (
                <div key={lvl} className="dash-heatmap-legend-cell" data-level={lvl} />
              ))}
              <span className="dash-heatmap-legend-label">More</span>
            </div>
          </div>
        </div>

        {/* ── Features included ─────────────────────── */}
        <div className="dash-section-card">
          <p className="dash-section-title">Plan Features — {cfg.name}</p>
          <div className="dash-features-grid">
            {featureRows.map(f => (
              <div key={f.label} className="dash-feature-item">
                <span className={`dash-feature-check ${f.enabled ? 'yes' : 'no'}`}>
                  {f.enabled ? '✓' : '—'}
                </span>
                <span className={`dash-feature-name ${f.enabled ? '' : 'locked'}`}>
                  {f.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Upgrade CTA (free only) ───────────────── */}
        {isFree && (
          <div className="dash-upgrade-card">
            <div className="dash-upgrade-text">
              <p className="dash-upgrade-title">Unlock the full Sedrex experience</p>
              <p className="dash-upgrade-sub">
                Get unlimited history, codebase indexing, priority model access, and early beta features with Pro.
              </p>
            </div>
            <button type="button" className="dash-upgrade-btn" onClick={onUpgrade}>
              Upgrade to Pro — $29/mo
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default Dashboard;
