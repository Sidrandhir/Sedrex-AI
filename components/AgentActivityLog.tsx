// components/AgentActivityLog.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Agent Activity Log v2.0
//
// Real-time pipeline event timeline. Zero model names shown.
// Design: GitHub Actions steps × Linear activity feed × Sedrex emerald.
//
// Key   = item.id (stable — never item.id+status, avoids React key errors)
// State = updated in-place: running item mutates to done, never duplicated
// ══════════════════════════════════════════════════════════════════

import React, { memo, useState } from 'react';
import { AgentActivity } from '../types';

interface AgentActivityLogProps {
  items:     AgentActivity[];
  isLoading: boolean;
}

// ── elapsed time formatter ─────────────────────────────────────────
function fmt(item: AgentActivity): string {
  if (!item.doneAt) return '';
  const ms = item.doneAt - item.startedAt;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
function totalTime(items: AgentActivity[]): string {
  const first = items[0]?.startedAt ?? 0;
  const last  = items.reduce((a, i) => Math.max(a, i.doneAt ?? 0), 0);
  if (!first || !last) return '';
  const ms = last - first;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ── Single row ─────────────────────────────────────────────────────
const Row = memo(({ item, idx }: { item: AgentActivity; idx: number }) => {
  const [open, setOpen] = useState(false);
  const done    = item.status === 'done';
  const running = item.status === 'running';
  const time    = fmt(item);

  return (
    <div
      className="aal-row"
      style={{ animationDelay: `${idx * 60}ms` }}
    >
      {/* Status column */}
      <div className="aal-status-col">
        {/* Dot */}
        <div className={`aal-dot ${done ? 'aal-dot-done' : running ? 'aal-dot-run' : 'aal-dot-idle'}`}>
          {done && <span className="aal-dot-check">✓</span>}
          {running && <span className="aal-dot-ring" />}
        </div>
        {/* Connector line (rendered by parent via CSS) */}
      </div>

      {/* Content column */}
      <div className="aal-content-col">
        {/* Row header */}
        <button
          type="button"
          className={`aal-row-btn ${item.detail ? 'aal-row-btn-click' : ''}`}
          onClick={() => item.detail && setOpen(o => !o)}
          disabled={!item.detail}
        >
          {/* Icon */}
          <span className={`aal-icon ${running ? 'aal-icon-pulse' : ''}`}>{item.icon}</span>

          {/* Label + badge */}
          <div className="aal-label-group">
            <span className={`aal-label ${running ? 'aal-label-active' : done ? 'aal-label-done' : ''}`}>
              {item.label}
            </span>
            {item.badge && <span className="aal-badge">{item.badge}</span>}
          </div>

          {/* Right: time + chevron */}
          <div className="aal-row-right">
            {running && <span className="aal-spinner-inline" />}
            {time && <span className="aal-time">{time}</span>}
            {item.detail && (
              <span className={`aal-chev ${open ? 'aal-chev-open' : ''}`}>›</span>
            )}
          </div>
        </button>

        {/* Progress bar — only while running */}
        {running && <div className="aal-progress"><div className="aal-progress-fill" /></div>}

        {/* Expandable detail */}
        {item.detail && (
          <div className={`aal-detail-wrap ${open ? 'aal-detail-open' : ''}`}>
            <div className="aal-detail-box">
              {item.badge && <span className="aal-detail-tag">{item.badge}</span>}
              <p className="aal-detail-text">{item.detail}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
Row.displayName = 'Row';

// ── Main component ─────────────────────────────────────────────────
export const AgentActivityLog = memo(({ items, isLoading }: AgentActivityLogProps) => {
  if (!items || items.length === 0) return null;

  const allDone = items.every(i => i.status === 'done');
  const anyRun  = items.some(i => i.status === 'running');
  const total   = totalTime(items);

  return (
    <div className="aal-root">
      {/* Header */}
      <div className="aal-header">
        <span className="aal-header-label">Activity</span>
        {(anyRun || (isLoading && !allDone)) && <span className="aal-header-dot" />}
      </div>

      {/* Timeline */}
      <div className={`aal-timeline ${items.length > 1 ? 'aal-timeline-lined' : ''}`}>
        {items.map((item, idx) => (
          <Row key={item.id} item={item} idx={idx} />
        ))}
      </div>

      {/* Summary — appears once everything is done */}
      {allDone && (
        <div className="aal-summary">
          <span className="aal-sum-check">✓</span>
          <span className="aal-sum-text">
            {items.length} step{items.length !== 1 ? 's' : ''} completed
          </span>
          <span className="aal-sum-icons">
            {items.map(i => <span key={i.id} title={i.label}>{i.icon}</span>)}
          </span>
          {total && <span className="aal-sum-time">· {total}</span>}
        </div>
      )}

      {/* ── Styles ────────────────────────────────────────────────── */}
      <style>{`
        @keyframes aal-in      { from { opacity:0; transform:translateY(5px) } to { opacity:1; transform:none } }
        @keyframes aal-ping    { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.5);opacity:0} }
        @keyframes aal-spin    { to { transform:rotate(360deg) } }
        @keyframes aal-pulse   { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes aal-shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(300%)} }
        @keyframes aal-slide-d { from{max-height:0;opacity:0} to{max-height:160px;opacity:1} }

        /* Root */
        .aal-root {
          width: 100%;
          margin-bottom: 14px;
          font-family: 'IBM Plex Sans', ui-sans-serif, sans-serif;
        }

        /* Header */
        .aal-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 8px;
        }
        .aal-header-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .1em;
          color: rgba(16,185,129,.6);
        }
        .aal-header-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: #10B981;
          animation: aal-pulse .9s ease infinite;
        }

        /* Timeline wrapper — draws the vertical connecting line */
        .aal-timeline { display:flex; flex-direction:column; gap:0; }
        .aal-timeline-lined .aal-status-col::after {
          content:'';
          position:absolute;
          top: 22px; left: 50%;
          transform: translateX(-50%);
          width: 1.5px;
          bottom: -6px;
          background: linear-gradient(to bottom, rgba(16,185,129,.2), rgba(16,185,129,.05));
        }

        /* Row */
        .aal-row {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          animation: aal-in .22s ease both;
          padding-bottom: 6px;
          position: relative;
        }
        .aal-row:last-child { padding-bottom: 0; }

        /* Status column (dot + line) */
        .aal-status-col {
          width: 18px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-top: 9px;
          position: relative;
        }

        /* Status dot */
        .aal-dot {
          width: 14px; height: 14px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
          transition: all .25s ease;
        }
        .aal-dot-idle {
          background: rgba(255,255,255,.06);
          border: 1.5px solid rgba(255,255,255,.1);
        }
        .aal-dot-run {
          background: rgba(16,185,129,.12);
          border: 1.5px solid rgba(16,185,129,.4);
          box-shadow: 0 0 0 3px rgba(16,185,129,.08);
        }
        .aal-dot-run::before {
          content:'';
          position:absolute;
          inset:-3px;
          border-radius:50%;
          border: 1.5px solid rgba(16,185,129,.25);
          animation: aal-ping 1.2s ease infinite;
        }
        .aal-dot-done {
          background: rgba(16,185,129,.15);
          border: 1.5px solid rgba(16,185,129,.5);
        }
        [data-theme='light'] .aal-dot-idle  { background:rgba(0,0,0,.04); border-color:rgba(0,0,0,.1); }
        [data-theme='light'] .aal-dot-run   { background:rgba(16,185,129,.08); }
        [data-theme='light'] .aal-dot-done  { background:rgba(16,185,129,.1); }

        .aal-dot-check { font-size:8px; font-weight:800; color:#10B981; line-height:1; }
        .aal-dot-ring  {
          width:6px; height:6px;
          border-radius:50%;
          border:1.5px solid transparent;
          border-top-color:#10B981;
          animation: aal-spin .65s linear infinite;
        }

        /* Content column */
        .aal-content-col { flex:1; min-width:0; }

        /* Row button */
        .aal-row-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          background: transparent;
          border: none;
          padding: 4px 6px 4px 0;
          border-radius: 6px;
          cursor: default;
          text-align: left;
          transition: background .15s ease;
          min-height: 30px;
        }
        .aal-row-btn-click { cursor: pointer; }
        .aal-row-btn-click:hover { background: rgba(16,185,129,.04); }
        [data-theme='light'] .aal-row-btn-click:hover { background: rgba(16,185,129,.06); }

        /* Icon */
        .aal-icon {
          font-size: 14px;
          line-height: 1;
          flex-shrink: 0;
          display: inline-block;
          width: 20px;
          text-align: center;
        }
        .aal-icon-pulse { animation: aal-pulse 1.1s ease infinite; }

        /* Label group */
        .aal-label-group { display:flex; align-items:center; gap:7px; flex:1; min-width:0; }
        .aal-label {
          font-size: 12.5px;
          font-weight: 500;
          color: var(--text-secondary, #6b7280);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color .2s ease;
        }
        .aal-label-active { color: var(--text-primary, #e5e7eb); font-weight:600; }
        .aal-label-done   { color: var(--text-secondary, #9ca3af); }
        [data-theme='light'] .aal-label        { color:#6b7280; }
        [data-theme='light'] .aal-label-active { color:#111827; }

        /* Badge pill */
        .aal-badge {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .07em;
          padding: 2px 5px;
          border-radius: 3px;
          background: rgba(16,185,129,.1);
          color: rgba(16,185,129,.8);
          border: 1px solid rgba(16,185,129,.18);
          flex-shrink: 0;
        }

        /* Right side */
        .aal-row-right { display:flex; align-items:center; gap:6px; flex-shrink:0; margin-left:auto; }

        /* Inline spinner */
        .aal-spinner-inline {
          width:11px; height:11px;
          border-radius:50%;
          border:1.5px solid rgba(16,185,129,.2);
          border-top-color:#10B981;
          animation: aal-spin .6s linear infinite;
          flex-shrink:0;
        }

        /* Elapsed time */
        .aal-time {
          font-family:'IBM Plex Mono',monospace;
          font-size:10.5px;
          color:rgba(16,185,129,.5);
          letter-spacing:-.02em;
        }

        /* Chevron */
        .aal-chev {
          font-size:15px;
          color:var(--text-secondary,#6b7280);
          opacity:.45;
          transition:transform .2s ease, opacity .2s ease;
          line-height:1;
          margin-top:-1px;
        }
        .aal-chev-open { transform:rotate(90deg); opacity:.75; }

        /* Progress bar */
        .aal-progress {
          height: 1.5px;
          background: rgba(16,185,129,.07);
          border-radius: 1px;
          overflow: hidden;
          margin: 2px 0 0 28px;
        }
        .aal-progress-fill {
          height: 100%;
          width: 40%;
          background: linear-gradient(90deg,transparent,#10B981,transparent);
          animation: aal-shimmer 1.3s ease infinite;
        }

        /* Expandable detail */
        .aal-detail-wrap {
          overflow: hidden;
          max-height: 0;
          opacity: 0;
          transition: max-height .22s ease, opacity .18s ease;
        }
        .aal-detail-open {
          max-height: 160px;
          opacity: 1;
        }
        .aal-detail-box {
          margin: 6px 0 4px 28px;
          background: rgba(0,0,0,.18);
          border: 1px solid rgba(16,185,129,.1);
          border-radius: 6px;
          padding: 8px 11px;
          font-family:'IBM Plex Mono',monospace;
          font-size:11.5px;
          color:var(--text-secondary,#9ca3af);
          overflow-y:auto;
          max-height:140px;
        }
        [data-theme='light'] .aal-detail-box {
          background:rgba(0,0,0,.03);
          border-color:rgba(16,185,129,.15);
          color:#4b5563;
        }
        .aal-detail-tag {
          display:inline-block;
          font-family:'IBM Plex Sans',sans-serif;
          font-size:9.5px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.07em;
          color:rgba(16,185,129,.75);
          background:rgba(16,185,129,.08);
          border:1px solid rgba(16,185,129,.16);
          border-radius:3px;
          padding:1px 5px;
          margin-bottom:6px;
        }
        .aal-detail-text { margin:0; line-height:1.55; white-space:pre-wrap; word-break:break-word; }

        /* Summary bar */
        .aal-summary {
          display:flex; align-items:center; gap:7px;
          padding:8px 0 2px;
          animation:aal-in .2s ease both;
          border-top:1px solid rgba(16,185,129,.08);
          margin-top:6px;
        }
        .aal-sum-check { font-size:11px; font-weight:800; color:#10B981; }
        .aal-sum-text  { font-size:11.5px; color:var(--text-secondary,#6b7280); opacity:.65; }
        .aal-sum-icons { display:flex; gap:3px; font-size:11px; opacity:.4; }
        .aal-sum-time  {
          font-family:'IBM Plex Mono',monospace;
          font-size:10.5px;
          color:rgba(16,185,129,.5);
          margin-left:auto;
        }
      `}</style>
    </div>
  );
});
AgentActivityLog.displayName = 'AgentActivityLog';
