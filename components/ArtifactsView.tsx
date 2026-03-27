// components/ArtifactsView.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Artifacts full-page view
// Opens in ChatArea (not sidebar) when user clicks "Artifacts" nav item.
// Shows all generated code files, HTML pages, and documents in a grid.
// ══════════════════════════════════════════════════════════════════

import React, { useState, useCallback } from 'react';
import './FullViews.css';
import { useArtifacts, setActiveArtifact, openPanel, Artifact, ArtifactType } from '../services/artifactStore';

type ArtTab = 'all' | 'code' | 'html' | 'document' | 'diagram';


const FILE_ICONS: Record<string, string> = {
  typescript: '⚡', ts: '⚡', tsx: '⚛', javascript: '⚡', js: '⚡', jsx: '⚛',
  python: '🐍', rust: '🦀', go: '🔹', java: '☕',
  css: '🎨', scss: '🎨', html: '🌐', sql: '🗄️', json: '{}',
  bash: '💻', sh: '💻', markdown: '📝', mermaid: '🔷', default: '📄',
};

const LANG_LABELS: Record<string, string> = {
  typescript: 'TypeScript', ts: 'TypeScript', tsx: 'TSX',
  javascript: 'JavaScript', js: 'JavaScript', jsx: 'JSX',
  python: 'Python', rust: 'Rust', go: 'Go', java: 'Java',
  css: 'CSS', scss: 'SCSS', html: 'HTML', sql: 'SQL',
  json: 'JSON', bash: 'Shell', sh: 'Shell', markdown: 'Markdown',
  mermaid: 'Diagram', text: 'Text',
};

const langIcon  = (l: string) => FILE_ICONS[l.toLowerCase()] ?? FILE_ICONS.default;
const langLabel = (l: string) => LANG_LABELS[l.toLowerCase()] ?? l.toUpperCase();

// ── Code preview: first 5 lines ───────────────────────────────────
function codePreviewLines(content: string): string[] {
  return content.split('\n').slice(0, 5).map(l => l.slice(0, 45));
}

// ── Artifact card ─────────────────────────────────────────────────
const ArtifactCard = ({ item, onClick }: { item: Artifact; onClick: () => void }) => {
  const lang  = item.language.toLowerCase();
  const icon  = langIcon(lang);
  const lines = codePreviewLines(item.content);
  const isHtml = item.type === 'html';

  return (
    <button type="button" className="av-card" onClick={onClick} title={item.title}>
      {/* Preview — data-lang drives all color via CSS, zero inline styles */}
      <div className="av-card-preview" data-lang={lang}>
        {isHtml ? (
          <div className="av-card-html-preview">
            <span className="av-card-html-icon">🌐</span>
            <span className="av-card-html-label">HTML</span>
          </div>
        ) : item.type === 'diagram' ? (
          <div className="av-card-html-preview">
            <span className="av-card-html-icon">🔷</span>
            <span className="av-card-html-label">Diagram</span>
          </div>
        ) : item.type === 'document' ? (
          <div className="av-card-doc-preview">
            {lines.map((line, i) => (
              <span key={i} className="av-card-doc-line">{line || '\u00a0'}</span>
            ))}
          </div>
        ) : (
          <div className="av-card-code-preview">
            <span className="av-card-code-icon">{icon}</span>
            <div className="av-card-code-lines">
              {lines.map((line, i) => (
                <span key={i} className="av-card-code-line">{line || '\u00a0'}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="av-card-footer">
        <span className="av-card-title">{item.title}</span>
        <span className="av-card-meta">{langLabel(lang)} · {item.lineCount} lines</span>
      </div>
    </button>
  );
};

// ── Empty state ───────────────────────────────────────────────────
const EmptyState = ({ tab }: { tab: ArtTab }) => (
  <div className="av-empty">
    <svg className="av-empty-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M12 6L6 14l6 8M36 6l6 8-6 8M28 3L20 45"/>
    </svg>
    <p className="av-empty-title">
      {tab === 'all' ? 'No artifacts yet' : `No ${tab} artifacts yet`}
    </p>
    <p className="av-empty-sub">
      Ask Sedrex to write code, build a web page, or create a document — it will appear here.
    </p>
  </div>
);

// ── Main view ─────────────────────────────────────────────────────
const ArtifactsView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { artifacts, diagrams } = useArtifacts();
  const [tab, setTab] = useState<ArtTab>('all');

  const handleOpen = useCallback((id: string) => {
    setActiveArtifact(id);
    openPanel();
  }, []);

  const all = [...artifacts, ...diagrams].sort((a, b) => b.updatedAt - a.updatedAt);

  const filtered = tab === 'all'
    ? all
    : all.filter(a => a.type === tab);

  const counts: Record<ArtTab, number> = {
    all:      all.length,
    code:     all.filter(a => a.type === 'code').length,
    html:     all.filter(a => a.type === 'html').length,
    document: all.filter(a => a.type === 'document').length,
    diagram:  all.filter(a => a.type === 'diagram').length,
  };

  const tabDefs: { id: ArtTab; label: string }[] = [
    { id: 'all',      label: 'All' },
    { id: 'code',     label: 'Code' },
    { id: 'html',     label: 'HTML' },
    { id: 'document', label: 'Docs' },
    { id: 'diagram',  label: 'Diagrams' },
  ];

  return (
    <div className="av-root">
      {/* Header */}
      <div className="av-header">
        <div className="av-header-left">
          <button type="button" className="av-back" onClick={onClose} aria-label="Back to chat">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10 3L5 8l5 5"/>
            </svg>
          </button>
          <h1 className="av-title">Artifacts</h1>
          {all.length > 0 && <span className="av-count">{all.length}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="av-tabs">
        {tabDefs.map(t => counts[t.id] > 0 || t.id === 'all' ? (
          <button
            key={t.id}
            type="button"
            className={`av-tab${tab === t.id ? ' av-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {counts[t.id] > 0 && <span className="av-tab-count">{counts[t.id]}</span>}
          </button>
        ) : null)}
      </div>

      {/* Grid */}
      <div className="av-content">
        {filtered.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="av-grid">
            {filtered.map(item => (
              <ArtifactCard key={item.id} item={item} onClick={() => handleOpen(item.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ArtifactsView;
