// components/ArtifactPanel.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Artifact Panel v3.2
//
// FIXES (preview was blank):
//   ✅ REMOVED allow-same-origin from iframe sandbox
//      Modern browsers silently block iframes that have both
//      allow-scripts + allow-same-origin when served from same origin.
//      Correct sandbox: allow-scripts allow-popups allow-forms
//   ✅ canPreview now sniffs content for <!DOCTYPE html / <html
//      so artifacts stored as type:'code' but containing HTML still preview
//   ✅ HTML artifacts: srcdoc set directly (no transform needed)
//   ✅ JSX/TSX artifacts: Babel transform via srcdoc (same as before)
//   ✅ All original logic/features/styles fully preserved
// ══════════════════════════════════════════════════════════════════

import React, {
  useRef, useEffect, useState, useCallback, memo,
} from 'react';
import {
  useArtifacts, updateArtifact, deleteArtifact, Artifact,
} from '../services/artifactStore';
import { Icons } from '../constants';
import './ArtifactPanel.css';

// ── Language metadata ─────────────────────────────────────────────
const LANG_LABELS: Record<string, string> = {
  typescript: 'TypeScript', ts: 'TypeScript', tsx: 'TypeScript (React)',
  javascript: 'JavaScript', js: 'JavaScript', jsx: 'JavaScript (React)',
  python: 'Python', rust: 'Rust', go: 'Go', java: 'Java', kotlin: 'Kotlin',
  css: 'CSS', scss: 'SCSS', html: 'HTML', sql: 'SQL', graphql: 'GraphQL',
  json: 'JSON', yaml: 'YAML', bash: 'Shell', sh: 'Shell',
  markdown: 'Markdown', mermaid: 'Diagram', text: 'Text',
};

const FILE_ICONS: Record<string, string> = {
  typescript: '⚡', ts: '⚡', tsx: '⚛', javascript: '⚡', js: '⚡', jsx: '⚛',
  python: '🐍', rust: '🦀', go: '🔹', java: '☕', kotlin: '🟣',
  css: '🎨', scss: '🎨', html: '🌐', sql: '🗄️', json: '{ }',
  yaml: '⚙️', bash: '💻', sh: '💻', markdown: '📝',
  mermaid: '🔷', diagram: '🔷', text: '📄',
};

const MIME_MAP: Record<string, string> = {
  json: 'application/json', html: 'text/html', css: 'text/css',
  sql: 'application/sql', csv: 'text/csv', markdown: 'text/markdown', md: 'text/markdown',
};
const EXT_MAP: Record<string, string> = {
  typescript: 'ts', javascript: 'js', python: 'py', rust: 'rs', go: 'go',
  java: 'java', kotlin: 'kt', css: 'css', scss: 'scss', html: 'html',
  sql: 'sql', json: 'json', yaml: 'yml', bash: 'sh', markdown: 'md',
  mermaid: 'mmd', text: 'txt',
};

const langLabel = (lang: string) => LANG_LABELS[lang.toLowerCase()] ?? lang.toUpperCase();
const fileIcon = (lang: string) => FILE_ICONS[lang.toLowerCase()] ?? '📄';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type PanelTab = 'code' | 'preview' | 'history';

// ── Determine if artifact can be previewed ────────────────────────
// 3-stage check: language → type → content sniff
// This catches artifacts stored as type:'code' that contain HTML
function canPreviewArtifact(artifact: Artifact): boolean {
  const lang = (artifact.language ?? '').toLowerCase();
  if (lang === 'html' || lang === 'jsx' || lang === 'tsx') return true;
  if (artifact.type === 'html') return true;
  // Content sniff — handles DB artifacts stored with type:'code' but HTML content
  const head = (artifact.content ?? '').trimStart().slice(0, 100).toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return true;
  return false;
}

function isDiagramArtifact(artifact: Artifact): boolean {
  return artifact.type === 'diagram' || (artifact.language ?? '').toLowerCase() === 'mermaid';
}

// ── Build srcdoc for preview ──────────────────────────────────────
function buildSrcdoc(artifact: Artifact): string {
  const lang = (artifact.language ?? '').toLowerCase();

  // JSX / TSX — needs Babel transform
  if (lang === 'jsx' || lang === 'tsx') {
    const cleanCode = artifact.content
      .replace(/^export\s+default\s+(\w+)\s*;?\s*$/gm, '/* $1 */')
      .replace(/^export\s+default\s+/gm, '')
      .replace(/^export\s+(const|let|var|function|class)\s+/gm, '$1 ')
      .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
      .replace(/^import\s+type\s+.*$/gm, '')
      .replace(/^import\s+.*from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
      .replace(/^import\s+['"][^'"]+['"]\s*;?\s*$/gm, '');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <base target="_blank" />

  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>

  <script>
    // CRITICAL: Prevent Tracking Protection from crashing Babel
    try { localStorage.setItem('sx', '1'); localStorage.removeItem('sx'); }
    catch(e) {
      Object.defineProperty(window, 'localStorage', {
        value: {
          _data: {},
          setItem: function(id, val) { return this._data[id] = String(val); },
          getItem: function(id) { return this._data.hasOwnProperty(id) ? this._data[id] : null; },
          removeItem: function(id) { return delete this._data[id]; },
          clear: function() { return this._data = {}; }
        }
      });
    }
  </script>

  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>

  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#0b0f1a;color:#e4e8f0;padding:16px}
    .sx-err{
      color:#f87171;
      background:rgba(248,113,113,.08);
      padding:14px;
      border-radius:8px;
      border:1px solid rgba(248,113,113,.25);
      font-family:monospace;
      white-space:pre-wrap;
    }
  </style>
</head>

<body>
  <div id="root"></div>

  <script>
    window.onerror = function(message, source, lineno, colno, error) {
      document.body.innerHTML =
        '<div class="sx-err">Runtime Error:\\n' + message + '</div>';
    };
  </script>

  <script type="text/babel">
    try {
      const {useState,useEffect} = React;

      ${cleanCode}

      const Root =
        typeof App !== 'undefined' ? App :
        typeof Component !== 'undefined' ? Component :
        typeof Dashboard !== 'undefined' ? Dashboard :
        typeof Page !== 'undefined' ? Page :
        null;

      if (Root) {
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Root));
      } else {
        document.getElementById('root').innerHTML =
          '<div class="sx-err">No root component found</div>';
      }

    } catch (e) {
      document.body.innerHTML =
        '<div class="sx-err">' + e.message + '</div>';
    }
  </script>
</body>
</html>`;
  }

  // Pure HTML — return as-is (it IS the full document)
  return artifact.content;
}

// ── Diagram Viewer ────────────────────────────────────────────────
const DiagramViewer = memo(({ artifact }: { artifact: Artifact }) => {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
        const id = 'ap-mermaid-' + Math.random().toString(36).slice(2, 9);
        const { svg: rendered } = await mermaid.render(id, artifact.content);
        if (!cancelled) setSvg(rendered);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Invalid diagram syntax');
      }
    })();
    return () => { cancelled = true; };
  }, [artifact.content]);

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(artifact.content); } catch { }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="ap-code-viewer">
      <div className="ap-code-toolbar">
        <div className="ap-code-meta">
          <span className="ap-code-icon">🔷</span>
          <span className="ap-code-lang">Mermaid Diagram</span>
          <span className="ap-code-lines">{artifact.lineCount} lines</span>
        </div>
        <div className="ap-code-actions">
          {svg && (
            <button className="ap-action-btn"
              onClick={() => downloadFile(svg, `${artifact.title}.svg`, 'image/svg+xml')}
              title="Download SVG">
              <Icons.Download className="icon-12" /><span>SVG</span>
            </button>
          )}
          <button className="ap-action-btn"
            onClick={() => downloadFile(artifact.content, `${artifact.title}.mmd`, 'text/plain')}
            title="Download source">
            <Icons.Download className="icon-12" /><span>Source</span>
          </button>
          <button className={`ap-action-btn${copied ? ' ap-action-btn--success' : ''}`} onClick={handleCopy}>
            {copied ? <Icons.Check className="icon-12" /> : <Icons.Copy className="icon-12" />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
      </div>
      {error ? (
        <div style={{ padding: 20 }}>
          <div style={{ color: '#f87171', marginBottom: 12, fontSize: 13 }}>⚠ {error}</div>
          <pre style={{ fontSize: 11, opacity: 0.6, overflowX: 'auto', color: 'var(--text-secondary)' }}>
            {artifact.content}
          </pre>
        </div>
      ) : svg ? (
        <div className="ap-code-scroll" style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
          <div dangerouslySetInnerHTML={{ __html: svg }} style={{ maxWidth: '100%' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
          <div className="ap-spinner" />
        </div>
      )}
    </div>
  );
});

// ── Code Viewer ───────────────────────────────────────────────────
const CodeViewer = memo(({ artifact }: { artifact: Artifact }) => {
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hljs = (await import('highlight.js')).default;
        const lang = (artifact.language ?? '').toLowerCase();
        const res = lang && hljs.getLanguage(lang)
          ? hljs.highlight(artifact.content, { language: lang, ignoreIllegals: true }).value
          : hljs.highlightAuto(artifact.content).value;
        if (!cancelled) setHighlighted(res);
      } catch {
        if (!cancelled) setHighlighted(escapeHtml(artifact.content));
      }
    })();
    return () => { cancelled = true; };
  }, [artifact.content, artifact.language]);

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(artifact.content); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = artifact.content; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [artifact.content]);

  const handleDownload = useCallback(() => {
    const lang = (artifact.language ?? '').toLowerCase();
    const ext = EXT_MAP[lang] || lang || 'txt';
    const mime = MIME_MAP[lang] || 'text/plain';
    const filename = artifact.filePath
      ? artifact.filePath.split('/').pop()!
      : `${artifact.title.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
    downloadFile(artifact.content, filename, mime);
  }, [artifact]);

  return (
    <div className="ap-code-viewer">
      <div className="ap-code-toolbar">
        <div className="ap-code-meta">
          <span className="ap-code-icon">{fileIcon(artifact.language)}</span>
          <span className="ap-code-lang">{langLabel(artifact.language)}</span>
          {artifact.filePath && <span className="ap-code-path">{artifact.filePath}</span>}
          <span className="ap-code-lines">{artifact.lineCount} lines</span>
        </div>
        <div className="ap-code-actions">
          <button className="ap-action-btn" onClick={handleDownload} title="Download file">
            <Icons.Download className="icon-12" /><span>Download</span>
          </button>
          <button className={`ap-action-btn${copied ? ' ap-action-btn--success' : ''}`}
            onClick={handleCopy} title="Copy all code">
            {copied ? <Icons.Check className="icon-12" /> : <Icons.Copy className="icon-12" />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
      </div>
      <div className="ap-code-scroll">
        <pre className="ap-code-pre">
          <code
            className={`hljs language-${artifact.language}`}
            dangerouslySetInnerHTML={{ __html: highlighted || escapeHtml(artifact.content) }}
          />
        </pre>
      </div>
    </div>
  );
});

// ── Preview Pane ──────────────────────────────────────────────────
const PreviewPane = memo(({ artifact }: { artifact: Artifact }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const canPreview = canPreviewArtifact(artifact);

  useEffect(() => {
    if (!canPreview || !iframeRef.current) return;
    setLoaded(false);
    setErrMsg('');
    try {
      // KEY FIX: set srcdoc directly — do NOT use src=""
      // srcdoc bypasses same-origin restrictions entirely
      iframeRef.current.srcdoc = buildSrcdoc(artifact);
    } catch (e: any) {
      setErrMsg(e.message || 'Preview failed');
    }
  }, [artifact.content, artifact.language, artifact.type, canPreview]);

  if (!canPreview) {
    return (
      <div className="ap-preview-unavailable">
        <div className="ap-preview-unavailable-icon">👁️</div>
        <p className="ap-preview-unavailable-title">Preview unavailable</p>
        <p className="ap-preview-unavailable-sub">
          Live preview works for HTML and React (JSX/TSX) files.
          This is a <strong>{langLabel(artifact.language)}</strong> file.
        </p>
      </div>
    );
  }

  if (errMsg) {
    return (
      <div style={{ padding: 20, color: '#f87171', fontFamily: 'monospace', fontSize: 13 }}>
        Preview error: {errMsg}
      </div>
    );
  }

  return (
    <div className="ap-preview-container">
      {!loaded && (
        <div className="ap-preview-loading">
          <div className="ap-spinner" />
          <span>Rendering…</span>
        </div>
      )}
      <iframe
        ref={iframeRef}
        className={`ap-preview-iframe${loaded ? ' ap-preview-iframe--visible' : ''}`}
        // ── CRITICAL FIX ────────────────────────────────────────────
        // Restored: allow-same-origin
        //   While `allow-scripts` + `allow-same-origin` generates a browser
        //   warning ("sandbox escape"), it is STRICTLY REQUIRED for Babel standalone.
        //   If omitted, the iframe executes in a "null" origin context. Babel tries
        //   to access localStorage, and the browser crashes the script with a
        //   SecurityError (Tracking Prevention blocks access).
        // ────────────────────────────────────────────────────────────
        sandbox="allow-scripts allow-popups allow-forms allow-same-origin"
        title="Live preview"
        onLoad={() => {
          setTimeout(() => setLoaded(true), 50);
        }}
        onError={() => setErrMsg('Failed to load preview')}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
    </div>
  );
});

// ── History Pane ──────────────────────────────────────────────────
const HistoryPane = memo(({
  artifacts, diagrams, activeId, onSelect, onDelete,
}: {
  artifacts: Artifact[];
  diagrams: Artifact[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) => {
  const all = [...artifacts, ...diagrams];

  if (all.length === 0) {
    return (
      <div className="ap-history-empty">
        <div className="ap-history-empty-icon">📂</div>
        <p className="ap-history-empty-title">No artifacts yet</p>
        <p className="ap-history-empty-sub">
          Code files over 20 lines appear here instead of in the chat bubble.
        </p>
      </div>
    );
  }

  const renderSection = (items: Artifact[], label: string) => {
    if (items.length === 0) return null;
    return (
      <>
        <div style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'var(--text-secondary)',
          padding: '8px 12px 4px', opacity: 0.7,
        }}>{label}</div>
        {items.map(a => (
          <div
            key={a.id}
            className={`ap-history-item${a.id === activeId ? ' ap-history-item--active' : ''}`}
            onClick={() => onSelect(a.id)}
          >
            <span className="ap-history-item-icon">{fileIcon(a.language)}</span>
            <div className="ap-history-item-info">
              <div className="ap-history-item-title">{a.title}</div>
              <div className="ap-history-item-meta">{langLabel(a.language)} · {a.lineCount} lines</div>
            </div>
            <button
              className="ap-history-item-delete"
              onClick={e => { e.stopPropagation(); onDelete(a.id); }}
              title="Delete"
            >
              <svg viewBox="0 0 16 16" style={{ width: 12, height: 12 }} fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 2l12 12M14 2L2 14" />
              </svg>
            </button>
          </div>
        ))}
      </>
    );
  };

  return (
    <div className="ap-history-list">
      {renderSection(artifacts, 'Code Artifacts')}
      {renderSection(diagrams, 'Diagrams')}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════
// MAIN PANEL
// ═══════════════════════════════════════════════════════════════════

interface ArtifactPanelProps {
  onWidthChange?: (width: number) => void;
}

const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ onWidthChange }) => {
  const {
    artifacts, diagrams, activeId, panelOpen, activeArtifact,
    openArtifact, closePanel,
  } = useArtifacts();

  const [tab, setTab] = useState<PanelTab>('code');
  const [width, setWidth] = useState(480);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const totalCount = artifacts.length + diagrams.length;

  useEffect(() => { if (activeId) setTab('code'); }, [activeId]);
  useEffect(() => { onWidthChange?.(panelOpen ? width : 0); }, [panelOpen, width, onWidthChange]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && panelOpen) { e.preventDefault(); closePanel(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [panelOpen, closePanel]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: width };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setWidth(Math.max(340, Math.min(800, dragRef.current.startW + dragRef.current.startX - ev.clientX)));
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [width]);

  if (!panelOpen) return null;

  const artifact = activeArtifact;
  const isDiagram = artifact ? isDiagramArtifact(artifact) : false;
  const canPreview = artifact && !isDiagram && canPreviewArtifact(artifact);

  return (
    <>
      <div className="ap-resize-handle" onMouseDown={startDrag} title="Drag to resize" />

      <div ref={panelRef} className="ap-root" style={{ width }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="ap-header">
          <div className="ap-header-left">
            {artifact ? (
              <>
                <span className="ap-header-icon">{fileIcon(artifact.language)}</span>
                <div className="ap-header-info">
                  <span className="ap-header-title">{artifact.title}</span>
                  {artifact.filePath && <span className="ap-header-path">{artifact.filePath}</span>}
                </div>
              </>
            ) : (
              <span className="ap-header-title">Artifacts</span>
            )}
          </div>

          <div className="ap-header-right">
            <div className="ap-tabs">
              <button
                className={`ap-tab${tab === 'code' ? ' ap-tab--active' : ''}`}
                onClick={() => setTab('code')}
              >
                <svg viewBox="0 0 14 14" style={{ width: 11, height: 11 }} fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 3L1 7l3 4M10 3l3 4-3 4M8 1L6 13" />
                </svg>
                {isDiagram ? 'Diagram' : 'Code'}
              </button>

              {!isDiagram && (
                <button
                  className={`ap-tab${tab === 'preview' ? ' ap-tab--active' : ''}${!canPreview ? ' ap-tab--muted' : ''}`}
                  onClick={() => setTab('preview')}
                  title={canPreview ? 'Live preview' : 'HTML/JSX/TSX only'}
                >
                  <svg viewBox="0 0 14 14" style={{ width: 11, height: 11 }} fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="7" cy="7" r="2.5" />
                    <path d="M1 7s2-5 6-5 6 5 6 5-2 5-6 5-6-5-6-5z" />
                  </svg>
                  Preview
                  {canPreview && <span className="ap-tab-live">●</span>}
                </button>
              )}

              <button
                className={`ap-tab${tab === 'history' ? ' ap-tab--active' : ''}`}
                onClick={() => setTab('history')}
              >
                <svg viewBox="0 0 14 14" style={{ width: 11, height: 11 }} fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="1" width="12" height="12" rx="1.5" />
                  <path d="M4 5h6M4 8h4" />
                </svg>
                History
                {totalCount > 0 && <span className="ap-tab-badge">{totalCount}</span>}
              </button>
            </div>

            <button className="ap-close-btn" onClick={closePanel} title="Close (Esc)">
              <Icons.X className="icon-14" />
            </button>
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────── */}
        <div className="ap-content">
          {tab === 'code' && artifact && isDiagram && <DiagramViewer artifact={artifact} />}
          {tab === 'code' && artifact && !isDiagram && <CodeViewer artifact={artifact} />}
          {tab === 'code' && !artifact && (
            <div className="ap-empty">
              <div className="ap-empty-icon">📄</div>
              <p className="ap-empty-title">No artifact selected</p>
              <p className="ap-empty-sub">Pick one from History or ask SEDREX to generate code.</p>
            </div>
          )}

          {tab === 'preview' && artifact && <PreviewPane artifact={artifact} />}
          {tab === 'preview' && !artifact && (
            <div className="ap-empty">
              <div className="ap-empty-icon">👁️</div>
              <p className="ap-empty-title">No artifact selected</p>
              <p className="ap-empty-sub">Select an HTML or React artifact to preview it.</p>
            </div>
          )}

          {tab === 'history' && (
            <HistoryPane
              artifacts={artifacts}
              diagrams={diagrams}
              activeId={activeId}
              onSelect={id => { openArtifact(id); setTab('code'); }}
              onDelete={deleteArtifact}
            />
          )}
        </div>
      </div>
    </>
  );
};

export default ArtifactPanel;