// components/ArtifactCard.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Artifact Card v2.3
//
// FIXES:
//   ✅ ID-ONLY lookup — title fallback removed (duplicate artifact fix)
//   ✅ Mobile: dispatches sedrex:close-sidebar so panel is visible
//   ✅ ArtifactPanel.loadArtifactContent() handles not-yet-loaded case
//   ✅ Preview badge shows for HTML/JSX/TSX
// ══════════════════════════════════════════════════════════════════

import React, { memo } from 'react';
import {
  setActiveArtifact,
  openPanel,
  getArtifacts,
  getDiagrams,
  ArtifactType,
} from '../services/artifactStore';

const FILE_ICONS: Record<string, string> = {
  typescript: '⚡', ts: '⚡', tsx: '⚛', javascript: '⚡', js: '⚡', jsx: '⚛',
  python: '🐍', rust: '🦀', go: '🔹', java: '☕', kotlin: '🟣',
  css: '🎨', scss: '🎨', html: '🌐', sql: '🗄️', json: '{ }',
  yaml: '⚙️', bash: '💻', sh: '💻', markdown: '📝', text: '📄',
  mermaid: '🔷', diagram: '🔷',
};

const LANG_LABELS: Record<string, string> = {
  typescript: 'TypeScript', ts: 'TypeScript', tsx: 'TSX',
  javascript: 'JavaScript', js: 'JavaScript', jsx: 'JSX',
  python: 'Python', rust: 'Rust', go: 'Go', java: 'Java',
  css: 'CSS', scss: 'SCSS', html: 'HTML', sql: 'SQL',
  json: 'JSON', yaml: 'YAML', bash: 'Shell', sh: 'Shell',
  markdown: 'Markdown', mermaid: 'Diagram', text: 'Text',
};

interface ArtifactCardProps {
  id: string;
  title: string;
  language: string;
  lineCount: number;
  type: ArtifactType;
  filePath?: string;
}

const ArtifactCard: React.FC<ArtifactCardProps> = memo(({
  id, title, language, lineCount, type, filePath,
}) => {
  const lang = language.toLowerCase();
  const icon = FILE_ICONS[lang] ?? '📄';
  const label = LANG_LABELS[lang] ?? language.toUpperCase();
  const canPreview = type === 'html' || lang === 'jsx' || lang === 'tsx' || lang === 'html';
  const isDiagram = type === 'diagram' || lang === 'mermaid';

  const handleClick = () => {
    const all = [...getArtifacts(), ...getDiagrams()];
    const artifact = all.find(a => a.id === id);

    // Close sidebar on mobile so ArtifactPanel is visible
    if (window.innerWidth < 1024) {
      window.dispatchEvent(new CustomEvent('sedrex:close-sidebar'));
    }

    // Set active artifact in store
    setActiveArtifact(artifact ? artifact.id : id);
    openPanel();

    // Dispatch custom event as a reliable fallback.
    // This covers the case where the panel is already mounted but
    // the Suspense/lazy load cycle caused activeId to be stale.
    window.dispatchEvent(new CustomEvent('sedrex:open-artifact', {
      detail: { id: artifact ? artifact.id : id },
    }));
  };

  return (
    <button
      className="artifact-card"
      onClick={handleClick}
      type="button"
      title={`Click to open ${title} in artifact panel`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        margin: '6px 0',
        background: 'var(--bg-secondary, #0d1117)',
        border: '1px solid var(--border, rgba(255,255,255,0.1))',
        borderRadius: 10,
        cursor: 'pointer',
        width: '100%',
        maxWidth: 360,
        textAlign: 'left',
        transition: 'border-color 0.15s, background 0.15s',
        color: 'var(--text-primary, #e4e8f0)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--accent, #10B981)';
        e.currentTarget.style.background = 'rgba(16,185,129,0.04)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border, rgba(255,255,255,0.1))';
        e.currentTarget.style.background = 'var(--bg-secondary, #0d1117)';
      }}
    >
      {/* Left: icon + info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 18,
          flexShrink: 0,
          width: 24,
          textAlign: 'center',
          lineHeight: 1,
        }}>
          {icon}
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--text-primary, #e4e8f0)',
          }}>
            {title}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 11,
              color: 'var(--text-secondary, #8b9ab0)',
              fontFamily: 'monospace',
            }}>
              {label}
            </span>
            {filePath && (
              <span style={{
                fontSize: 10,
                color: 'var(--text-secondary, #8b9ab0)',
                opacity: 0.6,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 120,
              }}>
                {filePath}
              </span>
            )}
            <span style={{
              fontSize: 10,
              color: 'var(--text-secondary, #8b9ab0)',
              opacity: 0.6,
            }}>
              {lineCount} lines
            </span>
          </div>
        </div>
      </div>

      {/* Right: badges + arrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {canPreview && !isDiagram && (
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 10,
            fontWeight: 600,
            color: '#818cf8',
            background: 'rgba(129,140,248,0.12)',
            padding: '2px 7px',
            borderRadius: 6,
          }}>
            <svg style={{ width: 9, height: 9 }} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="3" />
              <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
            </svg>
            Preview
          </span>
        )}
        {isDiagram && (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: '#10B981',
            background: 'rgba(16,185,129,0.12)',
            padding: '2px 7px',
            borderRadius: 6,
          }}>
            Diagram
          </span>
        )}
        <svg
          style={{ width: 14, height: 14, color: 'var(--text-secondary, #8b9ab0)' }}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </div>
    </button>
  );
});

export default ArtifactCard;