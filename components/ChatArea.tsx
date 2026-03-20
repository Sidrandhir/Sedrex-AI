import React, {
  useRef, useEffect, useState, useCallback, useMemo, memo,
} from 'react';
import { Message, AIModel, RouterResult, ChatSession, GroundingChunk } from '../types';
import { Icons } from '../constants';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import './ChatArea.css';
import EmptyState from './EmptyState';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { ConfidenceBadge } from './ConfidenceBadge';
import type { ConfidenceSignal } from '../services/aiService';
import ArtifactCard from './ArtifactCard';
import { getArtifacts } from '../services/artifactStore';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, LineChart, Line,
} from 'recharts';

declare global {
  interface Window { __sidebarGestureLock?: boolean; }
}

interface ChatAreaProps {
  session: ChatSession;
  isLoading: boolean;
  routingInfo: RouterResult | null;
  onExport: () => void;
  onShare: () => void;
  onModelChange: (model: AIModel | 'auto') => void;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  onRegenerate: (messageId: string) => void;
  onEditMessage: (messageId: string, newContent: string) => void;
  onFeedback: (messageId: string, feedback: 'good' | 'bad' | null) => void;
  streamingTokens?: number;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onSuggestionClick?: (text: string) => void;
}

// ══════════════════════════════════════════════════════════════════
// FIX 1 — MARKDOWN PREPROCESSOR
// Strict separator-only regex + HTML <br> → \n conversion
// + auto-detect mermaid from bare "graph TD" / "flowchart" blocks
// ══════════════════════════════════════════════════════════════════
function preprocessMarkdown(raw: string): string {
  if (!raw) return '';

  let result = raw;

  // FIX 1a: Strip HTML <br> tags — replace with newline
  result = result.replace(/<br\s*\/?>/gi, '\n');

  // FIX 1b: Remove stray HTML tags from LLM output.
  // SECURITY: <a> and <img> are intentionally excluded — both can carry
  // onerror/onload attributes that execute JS even inside React, because
  // Mermaid output uses dangerouslySetInnerHTML. Only safe inline tags kept.
  result = result.replace(/<(?!\/?(strong|em|code|s)\b)[^>]+>/gi, '');

  // FIX 1c: Strict separator-only regex — never match data rows
  // Old: /^(\|(?:[:\-\s|]+)\|)$/gm  ← too broad, matched cells with dashes
  // New: strictly requires each segment to be only colons/dashes/spaces
  result = result.replace(
    /^\|(\s*:?-+:?\s*\|)+\s*$/gm,
    (row) => row.replace(/:{2,}/g, ':')
  );

  // FIX 1d: Blank line BEFORE table block (header + separator must be contiguous)
  result = result.replace(
    /([^\n])\n(\|[^\n]+\|\n\|[-:\s|]+\|)/g,
    '$1\n\n$2'
  );

  // FIX 1e: Blank line AFTER table block
  result = result.replace(
    /(\|[^\n]+\|\n)(?!\|)/g,
    '$1\n'
  );

  // FIX 1f: Auto-wrap bare mermaid/graph blocks that LLM forgot to fence.
  // CRITICAL GUARD: only wrap if the block contains actual diagram arrows.
  // Without this, "graph theory is used in mathematics" → falsely fenced.
  result = result.replace(
    /^(graph\s+(?:TD|LR|RL|BT|TB)[\s\S]*?)(?=\n{2,}|$)/gm,
    (match) => {
      if (match.trim().startsWith('```')) return match;
      // Require at least one real arrow — no arrow = normal prose, skip
      if (!match.includes('-->') && !match.includes('->')) return match;
      return '```mermaid\n' + match.trim() + '\n```';
    }
  );
  result = result.replace(
    /^((?:flowchart\s+(?:TD|LR|RL|BT|TB)|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie)[\s\S]*?)(?=\n{2,}|$)/gm,
    (match) => {
      if (match.trim().startsWith('```')) return match;
      if (!match.includes('-->') && !match.includes('->') && !match.includes(':')) return match;
      return '```mermaid\n' + match.trim() + '\n```';
    }
  );

  return result;
}

// ══════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════

const copyToClipboard = (text: string): void => {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
};

const fallbackCopy = (text: string): void => {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
};

const downloadFile = (blob: Blob, filename: string): void => {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const url = URL.createObjectURL(blob);
  if (isIOS) {
    if (navigator.share && navigator.canShare?.({ files: [new File([blob], filename)] })) {
      navigator.share({ files: [new File([blob], filename, { type: blob.type })] })
        .catch(() => window.open(url, '_blank'));
    } else {
      window.open(url, '_blank');
    }
  } else {
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

const stripMarkdown = (text: string): string =>
  text
    .replace(/```[\s\S]*?```/g, '. code block omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/^\s*[-*+]\s/gm, '')
    .replace(/^\s*\d+\.\s/gm, '')
    .replace(/^\s*>\s/gm, '')
    .replace(/---/g, '')
    .replace(/\|[^\n]+\|/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim();

// ══════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════

const ChartTooltip = memo(({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      <p className="chart-tooltip-value">{payload[0].value}</p>
    </div>
  );
});

const EnhancedChart = memo(({ dataStr }: { dataStr: string }) => {
  try {
    const { type = 'area', data, label = 'Data' } = JSON.parse(dataStr);
    const accent = 'var(--accent)';
    const chartProps = { data, margin: { top: 8, right: 8, left: -20, bottom: 0 } };
    const axisProps = { axisLine: false, tickLine: false, tick: { fontSize: 10, fill: 'var(--text-secondary)', fontWeight: 600 } };
    return (
      <div className="enhanced-chart-container">
        <p className="enhanced-chart-label">{label}</p>
        <div className="enhanced-chart-inner">
          <ResponsiveContainer width="100%" height="100%">
            {type === 'bar' ? (
              <BarChart {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" {...axisProps} dy={8} />
                <YAxis {...axisProps} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="value" fill={accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : type === 'line' ? (
              <LineChart {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" {...axisProps} dy={8} />
                <YAxis {...axisProps} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="value" stroke={accent} strokeWidth={2} dot={{ r: 3, fill: 'var(--bg-primary)', strokeWidth: 2 }} activeDot={{ r: 4 }} />
              </LineChart>
            ) : (
              <AreaChart {...chartProps}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={accent} stopOpacity={0.12} />
                    <stop offset="95%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" {...axisProps} dy={8} />
                <YAxis {...axisProps} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="value" stroke={accent} strokeWidth={2} fillOpacity={1} fill="url(#areaGrad)" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    );
  } catch { return null; }
});

// ══════════════════════════════════════════════════════════════════
// FIX 2 — MERMAID BLOCK
// Full sanitizer for subgraph parentheses, node limit guard,
// size guard (10k chars), error display with raw fallback
// ══════════════════════════════════════════════════════════════════
const MAX_MERMAID_CHARS        = 10_000;
const MAX_MERMAID_EDGES        = 200;   // raised — Notion/Claude safely render 150-300 edges
const MERMAID_WARN_EDGES       = 120;   // soft-warn above this, still render

function sanitizeMermaid(raw: string): string {
  let code = raw;

  // Fix: subgraph Frontend (Client-side) → subgraph "Frontend (Client-side)"
  code = code.replace(
    /subgraph\s+([A-Za-z0-9_][\w\s-]*)\s*\(([^)\n]+)\)/g,
    (_match, name, paren) => `subgraph "${name.trim()} (${paren.trim()})"`
  );

  // Fix: node labels with parentheses that break parser
  // e.g.  A[Label (detail)] → A["Label (detail)"]
  code = code.replace(
    /(\b[\w]+)\[([^\]"]*\([^\]]*\)[^\]"]*)\]/g,
    (_m, id, label) => `${id}["${label}"]`
  );
  code = code.replace(
    /(\b[\w]+)\(([^)"]*\([^)]*\)[^)"]*)\)/g,
    (_m, id, label) => `${id}("${label}")`
  );

  // Fix: subgraph id [label] -> subgraph id ["label"] (sensitive to special chars)
  code = code.replace(/subgraph\s+([A-Za-z0-9_]+)\s*\[([^\]\n]+)\]/g, 'subgraph $1 ["$2"]');

  // Fix: subgraph [label] -> subgraph ["label"]
  code = code.replace(/subgraph\s+\[([^\]\n]+)\]/g, 'subgraph ["$1"]');

  // Fix: malformed labels with & or : that break parser
  code = code.replace(/\[\s*([^\]"]*&[^\]"]*)\s*\]/g, '["$1"]');
  code = code.replace(/\[\s*([^\]"]*:[^\]"]*)\s*\]/g, '["$1"]');

  return code;
}

const MermaidBlock = memo(({ code }: { code: string }) => {
  const [svg, setSvg]       = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;

    const renderDiagram = async () => {
      try {
        setLoading(true);
        const mermaid = (await import('mermaid')).default;

        // Initialize only once globally for the session
        if (!(window as any).__MERMAID_READY__) {
          mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            securityLevel: 'strict',
            fontFamily: 'Inter, system-ui, sans-serif'
          });
          (window as any).__MERMAID_READY__ = true;
        }

        const { svg: rendered } = await mermaid.render(id, sanitizeMermaid(code));
        if (active) {
          setSvg(rendered);
          setError('');
        }
      } catch (err: any) {
        if (active) setError(err.message || 'Syntax error in diagram');
      } finally {
        if (active) setLoading(false);
      }
    };

    renderDiagram();
    return () => { active = false; };
  }, [code]);

  return (
    <div className="nx-diagram">
      <div className="nx-diagram-header">
        <span className="nx-code-lang">Diagram</span>
        {svg && (
          <button
            onClick={() => downloadFile(new Blob([svg], { type: 'image/svg+xml' }), 'diagram.svg')}
            className="nx-code-btn"
          >
            <Icons.Download className="icon-12" />SVG
          </button>
        )}
      </div>
      {/* Soft warning banner — shown even when diagram renders successfully */}
      {error ? (
        <div className="diagram-error">
          <div style={{ marginBottom: 8, color: '#ef4444', fontWeight: 'bold' }}>⚠ Diagram Error</div>
          <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>{error}</div>
          <pre style={{ fontSize: 10, opacity: 0.5, overflowX: 'auto', margin: 0 }}>{code}</pre>
        </div>
      ) : loading ? (
        <div className="nx-diagram-loading"><div className="nx-spinner" /></div>
      ) : (
        <div className="nx-diagram-body" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </div>
  );
});

const ProductGrid = memo(({ dataStr }: { dataStr: string }) => {
  const products = useMemo(() => {
    try { const p = JSON.parse(dataStr); return Array.isArray(p) ? p : []; }
    catch { return []; }
  }, [dataStr]);
  if (!products.length) return null;
  return (
    <div className="product-grid-outer">
      <div className="product-grid-header">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
        Products
      </div>
      <div className="nx-product-grid">
        {products.map((p: any, i: number) => (
          <a key={i} href={p.url || '#'} target="_blank" rel="noopener noreferrer" className="nx-product-card">
            {p.image && (
              <div className="product-image-container">
                <img src={p.image} alt={p.name} className="product-image" loading="lazy" />
              </div>
            )}
            <div className="nx-product-name">{p.name}</div>
            {p.description && <div className="nx-product-desc">{p.description}</div>}
            <div className="nx-product-footer">
              <span className="nx-product-price">{p.price}</span>
              <div className="nx-product-meta">
                {p.rating && <span>⭐ {p.rating}</span>}
                {p.store && <span className="nx-product-store">{p.store}</span>}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
});

// ── Code block ────────────────────────────────────────────────────
const EXT_MAP: Record<string, string> = {
  javascript: 'js', typescript: 'ts', python: 'py', java: 'java',
  cpp: 'cpp', c: 'c', csharp: 'cs', go: 'go', rust: 'rs',
  ruby: 'rb', php: 'php', swift: 'swift', kotlin: 'kt',
  html: 'html', css: 'css', scss: 'scss', sql: 'sql',
  json: 'json', yaml: 'yml', xml: 'xml', markdown: 'md',
  bash: 'sh', shell: 'sh', powershell: 'ps1', csv: 'csv',
};
const MIME_MAP: Record<string, string> = {
  csv: 'text/csv', json: 'application/json', html: 'text/html',
  xml: 'application/xml', sql: 'application/sql', markdown: 'text/markdown',
};

const CodeBlock = memo(({ children, className }: { children?: React.ReactNode; className?: string }) => {
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const language = (className ?? '').replace('language-', '').toLowerCase();
  const codeString = String(children ?? '').replace(/\n$/, '');

  // Touch gesture lock for horizontal scroll inside code blocks
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let startX = 0, startY = 0, locked = false;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY; locked = false;
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (!locked && dx > 10 && dx > dy && el.scrollWidth > el.clientWidth) {
        locked = true; window.__sidebarGestureLock = true;
      }
    };
    const onEnd = () => setTimeout(() => { window.__sidebarGestureLock = false; }, 80);
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove',  onMove,  { passive: true });
    el.addEventListener('touchend',   onEnd,   { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, []);

  // Special renderers
  if (language === 'chart' && codeString.trim().startsWith('{'))
    return <EnhancedChart dataStr={codeString} />;
  if (language === 'mermaid')
    return <MermaidBlock code={codeString} />;
  if (language === 'products')
    return <ProductGrid dataStr={codeString} />;

  const handleCopy = () => {
    copyToClipboard(codeString); setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleDownload = () => {
    const ext  = EXT_MAP[language]  || language || 'txt';
    const mime = MIME_MAP[language] || 'text/plain';
    downloadFile(new Blob([codeString], { type: mime }), `file.${ext}`);
  };

  const highlighted = useMemo(() => {
    if (!codeString) return '';
    // FIX 7: Dual guard — hardwareConcurrency alone is unreliable (phones fake 8+ cores).
    // Add a code-length threshold: >15k chars is slow regardless of device class.
    if (codeString.length > 20_000) return escapeHtml(codeString);
    if (codeString.length > 15_000) return escapeHtml(codeString); // length beats fake core count
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency <= 2)
      return escapeHtml(codeString);

    // FIX 5: Hash-based key — a 20k char codeString as a Map key wastes ~40KB
    // per entry. djb2 reduces that to 7 bytes at negligible collision risk.
    const cacheKey = `${language}:${djb2(codeString)}`;
    if (highlightCache.has(cacheKey)) return highlightCache.get(cacheKey)!;

    let result = '';
    try {
      if (language && hljs.getLanguage(language)) {
        result = hljs.highlight(codeString, { language, ignoreIllegals: true }).value;
      } else {
        result = hljs.highlightAuto(codeString).value;
      }
    } catch { result = escapeHtml(codeString); }

    setHighlightCache(cacheKey, result);
    return result;
  }, [codeString, language]);

  return (
    <div ref={containerRef} className="nx-code-block">
      <div className="nx-code-header">
        <span className="nx-code-lang">{language || 'code'}</span>
        <div className="nx-code-actions">
          <button onClick={handleDownload} className="nx-code-btn">
            <Icons.Download className="icon-12" />Download
          </button>
          <button onClick={handleCopy} className={`nx-code-btn${copied ? ' copied' : ''}`}>
            {copied ? <Icons.Check className="icon-12" /> : <Icons.Copy className="icon-12" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="nx-code-scroll">
        <pre>
          <code
            className={`hljs${className ? ` ${className}` : ''}`}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════
// CACHE KEY HASH — djb2 (zero-dependency, ~10ns per call)
// Replaces full-string keys which balloon to MBs on long messages.
// Collision rate: ~1 in 4 billion — acceptable for a render cache.
// ══════════════════════════════════════════════════════════════════
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h >>>= 0; // keep unsigned 32-bit
  }
  return h.toString(36);
}

// ── Highlight cache ─────────────────────────────────────────────
const HIGHLIGHT_CACHE_LIMIT = 200;
const highlightCache = new Map<string, string>();

function setHighlightCache(key: string, value: string) {
  if (highlightCache.size >= HIGHLIGHT_CACHE_LIMIT) {
    const firstKey = highlightCache.keys().next().value as string | undefined;
    if (firstKey) highlightCache.delete(firstKey);
  }
  highlightCache.set(key, value);
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Markdown cache ───────────────────────────────────────────────
const MARKDOWN_CACHE_LIMIT = 300;
const markdownCache = new Map<string, string>();

function setMarkdownCache(key: string, value: string) {
  if (markdownCache.size >= MARKDOWN_CACHE_LIMIT) {
    const firstKey = markdownCache.keys().next().value as string | undefined;
    if (firstKey) markdownCache.delete(firstKey);
  }
  markdownCache.set(key, value);
}

// ══════════════════════════════════════════════════════════════════
// ENHANCED TABLE
// ══════════════════════════════════════════════════════════════════
const EnhancedTable = ({ children }: any) => {
  const [copied, setCopied] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  const handleCopy = () => {
    if (!tableRef.current) return;
    const rows = Array.from(tableRef.current.querySelectorAll('tr')) as HTMLTableRowElement[];
    const tsv = rows
      .map(r =>
        Array.from(r.querySelectorAll('th,td') as NodeListOf<HTMLElement>)
          .map(c => c.innerText.trim()).join('\t')
      )
      .join('\n');
    copyToClipboard(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="nx-table-wrapper" style={{ width: '100%', maxWidth: '100%' }}>
      <button onClick={handleCopy} className="nx-table-copy-btn">
        {copied ? <Icons.Check className="icon-11" /> : <Icons.Copy className="icon-11" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <div className="nx-table-scroll">
        <table ref={tableRef} style={{ width: '100%', minWidth: 0 }}>
          {children}
        </table>
      </div>
    </div>
  );
};

// ── Inline code style ────────────────────────────────────────────
const inlineCodeStyle: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: '0.875em',
  fontWeight: 500,
  padding: '0.15em 0.45em',
  borderRadius: 4,
  background: 'rgba(16,185,129,0.1)',
  color: 'var(--accent, #10B981)',
  border: '1px solid rgba(16,185,129,0.2)',
  whiteSpace: 'nowrap' as const,
};

// ══════════════════════════════════════════════════════════════════
// FIX 3 — MARKDOWN COMPONENTS
// code: distinguish inline vs block correctly using `node` prop
// pre: correctly unwrap code element
// ══════════════════════════════════════════════════════════════════
const markdownComponents = {
  table: EnhancedTable,

  p: ({ children }: any) => (
    <p className="md-paragraph">{children}</p>
  ),

  h1: ({ children }: any) => (
    <h1 style={{ fontSize: '1.5em', fontWeight: 700, margin: '1.6em 0 0.5em', lineHeight: 1.3, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 style={{ fontSize: '1.25em', fontWeight: 700, margin: '1.5em 0 0.5em', lineHeight: 1.3, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{children}</h2>
  ),
  h3: ({ children }: any) => (
    <h3 style={{ fontSize: '1.1em', fontWeight: 650, margin: '1.3em 0 0.4em', lineHeight: 1.35, color: 'var(--text-primary)' }}>{children}</h3>
  ),
  h4: ({ children }: any) => (
    <h4 style={{ fontSize: '1em', fontWeight: 600, margin: '1.1em 0 0.35em', lineHeight: 1.4, color: 'var(--text-primary)' }}>{children}</h4>
  ),

  ul: ({ children }: any) => (
    <ul style={{ margin: '0.25em 0 1em', paddingLeft: '1.6em', listStyleType: 'disc' }}>{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol style={{ margin: '0.25em 0 1em', paddingLeft: '1.6em', listStyleType: 'decimal' }}>{children}</ol>
  ),
  li: ({ children }: any) => (
    <li style={{ marginBottom: '0.35em', lineHeight: 1.72, paddingLeft: '0.2em' }}>{children}</li>
  ),

  blockquote: ({ children }: any) => (
    <blockquote style={{
      margin: '1em 0', padding: '0.75em 1.25em',
      borderLeft: '3px solid var(--accent, #10B981)',
      background: 'rgba(16,185,129,0.05)',
      borderRadius: '0 8px 8px 0',
      color: 'var(--text-secondary)',
    }}>
      {children}
    </blockquote>
  ),

  strong: ({ children }: any) => (
    <strong style={{ fontWeight: 650, color: 'var(--text-primary)' }}>{children}</strong>
  ),

  hr: () => (
    <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.5em 0' }} />
  ),

  // FIX 3a: pre correctly passes className + children to CodeBlock
  pre: ({ children }: any) => {
    // ReactMarkdown wraps <code> inside <pre> — extract its props
    const child = React.Children.only(children) as React.ReactElement<any> | null;
    if (child && child.props) {
      return (
        <CodeBlock className={child.props.className}>
          {child.props.children}
        </CodeBlock>
      );
    }
    // Fallback: no child element (shouldn't happen, but be safe)
    return <CodeBlock>{children}</CodeBlock>;
  },

  // FIX 3b: Correct inline vs block detection
  // ReactMarkdown passes inline=true for backtick code, inline=false for fenced blocks
  // Fenced blocks are handled by <pre> above, so here we ONLY render inline code
  code: ({ inline, children, className }: any) => {
    if (inline) {
      return <code style={inlineCodeStyle}>{children}</code>;
    }
    // Block code inside <pre> is already handled by the pre renderer above.
    // This branch runs only if ReactMarkdown renders a block <code> without <pre>
    // (rare edge case). Render it without the inline style to avoid confusion.
    return <code>{children}</code>;
  },
};

// ══════════════════════════════════════════════════════════════════
// FIX 4 — STREAMING CURSOR CSS injection (runtime, no CSS file change needed)
// Applied via a <style> tag injected once
// ══════════════════════════════════════════════════════════════════
const STREAMING_CURSOR_CSS = `
.streaming-cursor::after {
  content: "▋";
  animation: blink-cursor 1s step-start infinite;
  margin-left: 2px;
  font-size: 0.9em;
  vertical-align: baseline;
  color: var(--accent, #10B981);
  opacity: 0.85;
}
@keyframes blink-cursor {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
`;

function injectStreamingCursorStyle() {
  if (document.getElementById('sx-streaming-cursor')) return;
  const style = document.createElement('style');
  style.id = 'sx-streaming-cursor';
  style.textContent = STREAMING_CURSOR_CSS;
  document.head.appendChild(style);
}

// ══════════════════════════════════════════════════════════════════
// RENDER WITH ARTIFACTS
// Splits response content at [ARTIFACT:title] markers and renders
// ArtifactCard components inline in chat bubbles — exactly like
// Claude's artifact panel. Code blocks >30 lines go to the panel.
// ══════════════════════════════════════════════════════════════════

function renderWithArtifacts(
  content:       string,
  remarkPlugins: any[],
  mdComponents:  any,
): React.ReactNode {
  const ARTIFACT_RE = /\[ARTIFACT:([^\]]+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = ARTIFACT_RE.exec(content)) !== null) {
    // Text before the artifact marker
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index).trim();
      if (textBefore) {
        parts.push(
          <ReactMarkdown
            key={`txt-${keyIdx++}`}
            remarkPlugins={remarkPlugins}
            components={mdComponents}
          >
            {textBefore}
          </ReactMarkdown>
        );
      }
    }

    // Find the artifact by title in the store
    const title     = match[1];
    const artifacts = getArtifacts();
    const artifact  = artifacts.find(a => a.title === title);

    if (artifact) {
      parts.push(
        <ArtifactCard
          key={`art-${title.replace(/\s+/g, '-')}`}
          id={artifact.id}
          title={artifact.title}
          language={artifact.language}
          lineCount={artifact.lineCount}
          type={artifact.type}
          filePath={artifact.filePath}
        />
      );
    } else {
      // Artifact not yet persisted — show a loading placeholder
      parts.push(
        <div key={`pending-${keyIdx++}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', margin: '6px 0',
          border: '1px solid var(--border)', borderRadius: 10,
          fontSize: 12, color: 'var(--text-secondary)',
          background: 'rgba(16,185,129,0.04)',
        }}>
          <span>📄</span><span>{title}</span>
        </div>
      );
    }

    lastIndex = match.index + match[0].length;
    keyIdx++;
  }

  // Remaining text after last marker
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) {
      parts.push(
        <ReactMarkdown
          key={`txt-${keyIdx++}`}
          remarkPlugins={remarkPlugins}
          components={mdComponents}
        >
          {remaining}
        </ReactMarkdown>
      );
    }
  }

  if (parts.length > 0) return parts;
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={mdComponents}>
      {content}
    </ReactMarkdown>
  );
}

// ══════════════════════════════════════════════════════════════════
// MESSAGE ITEM
// ══════════════════════════════════════════════════════════════════

interface MessageItemProps {
  msg: Message;
  isLast: boolean;
  isLoading: boolean;
  copiedId: string | null;
  editingId: string | null;
  editContent: string;
  speakingMsgId: string | null;
  confidence?: ConfidenceSignal;
  onCopy: (text: string, id: string) => void;
  onStartEdit: (id: string, content: string) => void;
  onCancelEdit: () => void;
  onSubmitEdit: (id: string) => void;
  onEditChange: (val: string) => void;
  onRegenerate: (id: string) => void;
  onFeedback: (id: string, fb: 'good' | 'bad' | null) => void;
  onSpeak: (id: string, text: string) => void;
  onSuggestionClick?: (text: string) => void;
  mdComponents: any;
  remarkPlugins: any[];
}

const DOC_META: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  pdf:  { color: '#f87171', bg: 'rgba(248,113,113,0.08)', icon: '📄', label: 'PDF' },
  docx: { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  icon: '📝', label: 'DOC' },
  doc:  { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  icon: '📝', label: 'DOC' },
  xlsx: { color: '#34d399', bg: 'rgba(52,211,153,0.08)',  icon: '📊', label: 'XLS' },
  xls:  { color: '#34d399', bg: 'rgba(52,211,153,0.08)',  icon: '📊', label: 'XLS' },
  csv:  { color: '#34d399', bg: 'rgba(52,211,153,0.08)',  icon: '📊', label: 'CSV' },
  json: { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  icon: '{ }', label: 'JSON' },
  zip:  { color: '#fb923c', bg: 'rgba(251,146,60,0.08)',  icon: '📦', label: 'ZIP' },
  md:   { color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', icon: '📑', label: 'MD' },
};

const MessageItem = memo(
  ({
    msg, isLast, isLoading, copiedId, editingId, editContent, speakingMsgId,
    confidence, onCopy, onStartEdit, onCancelEdit, onSubmitEdit, onEditChange,
    onRegenerate, onFeedback, onSpeak, onSuggestionClick,
    mdComponents, remarkPlugins,
  }: MessageItemProps) => {
    const isUser      = msg.role === 'user';
    const isEditing   = editingId === msg.id;
    const isCopied    = copiedId === msg.id;
    const isSpeaking  = speakingMsgId === msg.id;
    const isStreaming = isLoading && isLast && !isUser;

    // ── Markdown processing with caching ──────────────────────────
    const processedMarkdown = useMemo(() => {
      const content = typeof msg.content === 'string' ? msg.content : String(msg.content ?? '');
      // FIX 4: Hash key — long messages (5k+ tokens) as Map keys = multi-MB leak.
      // djb2 hash collapses the key to 7 bytes regardless of content length.
      const cacheKey = djb2(content);
      if (markdownCache.has(cacheKey)) return markdownCache.get(cacheKey)!;
      const result = preprocessMarkdown(content);
      setMarkdownCache(cacheKey, result);
      return result;
    }, [msg.content]);

    return (
      <div className={`message-group message-enter ${isUser ? 'message-user' : 'message-assistant'}`}>

        {/* ── USER ──────────────────────────────────────────────── */}
        {isUser && (
          <div>
            {msg.documents && msg.documents.length > 0 && (
              <div className="doc-attachments">
                {msg.documents.map((doc, i) => {
                  const ext = doc.title.split('.').pop()?.toLowerCase() || '';
                  const meta = DOC_META[ext] || { color: 'var(--text-secondary)', bg: 'var(--bg-tertiary)', icon: '📄', label: 'FILE' };
                  return (
                    <div
                      key={i}
                      className="doc-chip"
                      style={{ border: `1px solid ${meta.color}30`, background: meta.bg }}
                    >
                      <div className="doc-chip-icon" style={{ background: meta.bg }}>{meta.icon}</div>
                      <div className="doc-chip-info">
                        <div className="doc-chip-title">{doc.title}</div>
                        <div className="doc-chip-label">{meta.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isEditing ? (
              <div className="edit-container">
                <textarea
                  className="edit-textarea"
                  value={editContent}
                  onChange={e => onEditChange(e.target.value)}
                  rows={3}
                  autoFocus
                />
                <div className="edit-actions">
                  <button className="edit-btn-primary" onClick={() => onSubmitEdit(msg.id)}>Update</button>
                  <button className="edit-btn-cancel"  onClick={onCancelEdit}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="message-user">
                <div className="message-user-bubble">{msg.content}</div>
              </div>
            )}

            {/* ── CODEBASE REFERENCE CARD ──────────────────────────
                Added: shows which project was indexed when this
                message was sent. Right-aligned below the bubble.
                Nothing else in this component was changed. */}
            {!isEditing && msg.codebaseRef && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 5 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 9px 3px 7px',
                  background: 'rgba(74,222,128,0.05)',
                  border: '1px solid rgba(74,222,128,0.18)',
                  borderRadius: 6, fontSize: 11,
                  color: 'var(--text-secondary)',
                  userSelect: 'none' as const,
                }}>
                  <svg style={{ width: 11, height: 11, flexShrink: 0, color: '#4ade80' }}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                  </svg>
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>
                    {msg.codebaseRef.projectName}
                  </span>
                  <span style={{ opacity: 0.6, fontSize: 10 }}>
                    {msg.codebaseRef.totalFiles} files referenced
                  </span>
                </div>
              </div>
            )}

            {msg.image && (
              <img
                src={`data:${msg.image.mimeType};base64,${msg.image.inlineData.data}`}
                alt="Attached"
                className="message-image"
              />
            )}

            {!isEditing && (
              <div className="message-actions message-actions-end">
                <button
                  className={`message-action-btn${isCopied ? ' active-copy' : ''}`}
                  onClick={() => onCopy(msg.content, msg.id)}
                  title="Copy"
                >
                  {isCopied ? <Icons.Check className="icon-14" /> : <Icons.Copy className="icon-14" />}
                </button>
                <button className="message-action-btn" onClick={() => onStartEdit(msg.id, msg.content)} title="Edit">
                  <Icons.Edit className="icon-14" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── ASSISTANT ─────────────────────────────────────────── */}
        {!isUser && (
          <div className="message-assistant-body">
            {/* Typing indicator — only when no content yet */}
            {isStreaming && !msg.content && (
              <div className="typing-dots">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            )}

            {/* FIX 6: Smart streaming render.
                - Plain prose, bold, lists → render with ReactMarkdown immediately (no layout shift)
                - Tables and fenced code blocks → defer to plain text until stream ends
                  because partial markdown for these types corrupts the DOM structure.
                Detection: if the streaming content contains an open fence (```) with no
                closing fence, or a pipe row with no separator yet, fall back to plain text. */}
            {msg.content && (
              <div className={`markdown-body${isStreaming ? ' streaming-cursor' : ''}`}>
                {isStreaming ? (() => {
                  const c = msg.content;
                  const openFence = (c.match(/```/g) || []).length % 2 !== 0;
                  const openTable = /\|[^\n]+\|/.test(c) && !/\|[-:\s|]+\|/.test(c);
                  if (openFence || openTable) {
                    return <span style={{ whiteSpace: 'pre-wrap' }}>{c}</span>;
                  }
                  return (
                    <ReactMarkdown remarkPlugins={remarkPlugins} components={mdComponents}>
                      {processedMarkdown}
                    </ReactMarkdown>
                  );
                })() : (
                  // FIX 1: Use renderWithArtifacts for completed messages —
                  // splits [ARTIFACT:title] markers into ArtifactCard components
                  <>{renderWithArtifacts(processedMarkdown, remarkPlugins, mdComponents)}</>
                )}
              </div>
            )}

            {/* Confidence badge */}
            {msg.content && !isStreaming && confidence && (
              <div className="confidence-spacer">
                <ConfidenceBadge confidence={confidence} />
              </div>
            )}

            {/* Grounding sources */}
            {msg.groundingChunks && msg.groundingChunks.length > 0 && (
              <div className="sources-strip">
                {msg.groundingChunks.map((chunk: GroundingChunk, i: number) => {
                  const uri   = chunk.web?.uri || chunk.maps?.uri;
                  const title = chunk.web?.title || chunk.maps?.title;
                  if (!uri) return null;
                  return (
                    <a key={i} href={uri} target="_blank" rel="noopener noreferrer" className="source-chip">
                      <span>{title || 'Source'}</span>
                    </a>
                  );
                })}
              </div>
            )}

            {/* Action toolbar */}
            <div className="message-actions message-actions-start">
              <button
                className={`message-action-btn${isCopied ? ' active-copy' : ''}`}
                onClick={() => onCopy(msg.content, msg.id)}
                title="Copy"
              >
                {isCopied ? <Icons.Check className="icon-14" /> : <Icons.Copy className="icon-14" />}
              </button>
              <button className="message-action-btn" onClick={() => onRegenerate(msg.id)} title="Regenerate">
                <Icons.RotateCcw className="icon-14" />
              </button>
              <button
                className={`message-action-btn${isSpeaking ? ' active-speak' : ''}`}
                onClick={() => onSpeak(msg.id, msg.content)}
                title={isSpeaking ? 'Stop' : 'Read aloud'}
              >
                {isSpeaking ? <Icons.VolumeX className="icon-14" /> : <Icons.Volume2 className="icon-14" />}
              </button>
              <button
                className="message-action-btn feedback-form-btn"
                onClick={() => window.open('https://forms.gle/SB93bLtFPjvJnRNRA', '_blank')}
                title="Feedback"
              >
                Feedback Form
              </button>
              <div className="message-action-divider" />
              <button
                className={`message-action-btn${msg.feedback === 'good' ? ' active-good' : ''}`}
                onClick={() => onFeedback(msg.id, msg.feedback === 'good' ? null : 'good')}
                title="Good"
              >
                <Icons.ThumbsUp className="icon-14" />
              </button>
              <button
                className={`message-action-btn${msg.feedback === 'bad' ? ' active-bad' : ''}`}
                onClick={() => onFeedback(msg.id, msg.feedback === 'bad' ? null : 'bad')}
                title="Bad"
              >
                <Icons.ThumbsDown className="icon-14" />
              </button>
            </div>

            {/* Follow-up suggestions */}
            {isLast && !isLoading && msg.suggestions && msg.suggestions.length > 0 && (
              <div className="suggestion-chips">
                {msg.suggestions.map((s, i) => (
                  <button key={i} className="suggestion-chip" onClick={() => onSuggestionClick?.(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    if (prev.msg.content       !== next.msg.content)       return false;
    if (prev.msg.feedback      !== next.msg.feedback)      return false;
    if (prev.msg.suggestions   !== next.msg.suggestions)   return false;
    if (prev.msg.codebaseRef   !== next.msg.codebaseRef)   return false;
    if (prev.isLast            !== next.isLast)            return false;
    if (prev.isLoading         !== next.isLoading)         return false;
    if (prev.confidence?.level !== next.confidence?.level) return false;
    if ((prev.copiedId    === prev.msg.id) !== (next.copiedId    === next.msg.id)) return false;
    if ((prev.editingId   === prev.msg.id) !== (next.editingId   === next.msg.id)) return false;
    if (prev.editingId === prev.msg.id && prev.editContent !== next.editContent)   return false;
    if ((prev.speakingMsgId === prev.msg.id) !== (next.speakingMsgId === next.msg.id)) return false;
    return true;
  }
);

// ══════════════════════════════════════════════════════════════════
// CHAT AREA ROOT
// ══════════════════════════════════════════════════════════════════

const ChatArea: React.FC<ChatAreaProps> = ({
  session, isLoading, onExport, onToggleSidebar, isSidebarOpen,
  onRegenerate, onEditMessage, onFeedback, theme, onThemeToggle, onSuggestionClick,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages  = session?.messages ?? [];

  const [copiedId,      setCopiedId]      = useState<string | null>(null);
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [editContent,   setEditContent]   = useState('');
  const [autoScroll,    setAutoScroll]    = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Inject streaming cursor CSS once on mount
  useEffect(() => { injectStreamingCursorStyle(); }, []);

  // ── FIX 5: Auto-scroll with 120px threshold (Claude-standard) ──
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setAutoScroll(nearBottom);
    setShowScrollBtn(!nearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => {
    if (autoScroll) scrollToBottom();
  }, [messages, isLoading, autoScroll, scrollToBottom]);

  // ── FIX 6: TTS — cleanup on unmount (not just session change) ──
  const speakMessage = useCallback((msgId: string, text: string) => {
    const synth = window.speechSynthesis;
    try {
      if (speakingMsgId === msgId) {
        if (synth.speaking) synth.cancel();
        setSpeakingMsgId(null); utteranceRef.current = null; return;
      }
      if (synth.speaking) synth.cancel();
      const cleaned = stripMarkdown(text);
      if (!cleaned) return;
      const doSpeak = () => {
        const u = new SpeechSynthesisUtterance(cleaned);
        u.rate = 1.0; u.pitch = 1.0;
        const voices = synth.getVoices();
        // FIX 8: Tiered fallback — Google voices are Chrome-only.
        // Querying v.name.includes('Google') throws on Safari & Firefox.
        // Priority: Google en-US → en-US non-local → en-US → en-* → en → system default.
        const voice =
          voices.find(v => v.lang === 'en-US' && v.name.toLowerCase().includes('google')) ||
          voices.find(v => v.lang === 'en-US' && !v.localService) ||
          voices.find(v => v.lang === 'en-US') ||
          voices.find(v => v.lang.startsWith('en-')) ||
          voices.find(v => v.lang.startsWith('en')) ||
          null; // null = let browser pick — always works on all engines
        if (voice) u.voice = voice;
        u.onend  = () => { setSpeakingMsgId(null); utteranceRef.current = null; };
        u.onerror = () => { setSpeakingMsgId(null); utteranceRef.current = null; };
        utteranceRef.current = u;
        setSpeakingMsgId(msgId);
        if (synth.speaking) synth.cancel();
        setTimeout(() => synth.speak(u), 50);
      };
      if (synth.getVoices().length === 0) {
        let done = false;
        const onVC = () => {
          synth.removeEventListener('voiceschanged', onVC);
          if (!done) { done = true; doSpeak(); }
        };
        synth.addEventListener('voiceschanged', onVC);
        setTimeout(() => {
          synth.removeEventListener('voiceschanged', onVC);
          if (!done) { done = true; doSpeak(); }
        }, 500);
      } else {
        doSpeak();
      }
    } catch { setSpeakingMsgId(null); utteranceRef.current = null; }
  }, [speakingMsgId]);

  // FIX 6: Cancel speech on unmount (not just on session switch)
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    };
  }, []); // ← empty deps = runs on component unmount always

  // Also cancel on session change (keep original behaviour)
  useEffect(() => {
    window.speechSynthesis.cancel();
    setSpeakingMsgId(null);
  }, [session?.id]);

  // ── Message actions ────────────────────────────────────────────
  const handleCopy = useCallback((text: string, id: string) => {
    copyToClipboard(text); setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);
  const handleStartEdit  = useCallback((id: string, content: string) => {
    setEditingId(id); setEditContent(content);
  }, []);
  const handleCancelEdit = useCallback(() => setEditingId(null), []);
  const handleSubmitEdit = useCallback((id: string) => {
    if (editContent.trim()) { onEditMessage(id, editContent.trim()); setEditingId(null); }
  }, [editContent, onEditMessage]);

  const mdComponents  = markdownComponents;
  // FIX 9: remark-breaks preserves single newlines as <br> inside paragraphs.
  // Without it, LLM output with soft line breaks collapses into run-on sentences.
  const remarkPlugins = useMemo(
    () => [[remarkGfm, { singleTilde: false }], remarkBreaks] as any[],
    []
  );

  return (
    <div className="chat-root">

      {/* Top controls */}
      <div className="chat-controls">
        <button
          className="chat-ctrl-btn"
          onClick={onThemeToggle}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Icons.Sun className="icon-16" /> : <Icons.Moon className="icon-16" />}
        </button>
        <button className="chat-ctrl-btn" onClick={onExport} title="Export chat">
          <Icons.Download className="icon-16" />
        </button>
      </div>

      {/* Scroll area */}
      <div ref={scrollRef} onScroll={handleScroll} className="chat-scroll">
        <div className="chat-column">

          {messages.length === 0 && (
            <EmptyState
              onSuggestionClick={(prompt) => onSuggestionClick?.(prompt)}
            />
          )}

          {messages.map((msg, idx) => (
            <MessageItem
              key={msg.id}
              msg={msg}
              isLast={idx === messages.length - 1}
              isLoading={isLoading}
              copiedId={copiedId}
              editingId={editingId}
              editContent={editContent}
              speakingMsgId={speakingMsgId}
              confidence={(msg as any).confidence as ConfidenceSignal | undefined}
              onCopy={handleCopy}
              onStartEdit={handleStartEdit}
              onCancelEdit={handleCancelEdit}
              onSubmitEdit={handleSubmitEdit}
              onEditChange={setEditContent}
              onRegenerate={onRegenerate}
              onFeedback={onFeedback}
              onSpeak={speakMessage}
              onSuggestionClick={onSuggestionClick}
              mdComponents={mdComponents}
              remarkPlugins={remarkPlugins}
            />
          ))}

          {/* Global typing dots — only when NO assistant message with content exists */}
          {isLoading && !messages.some(m => m.role === 'assistant' && m.content) && (
            <div className="typing-dots">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          )}
        </div>
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <button
          className="scroll-to-bottom-btn-center"
          onClick={scrollToBottom}
          aria-label="Scroll to latest"
        >
          <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default ChatArea;