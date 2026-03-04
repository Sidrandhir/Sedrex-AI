import React, {
  useRef, useEffect, useState, useCallback, useMemo, memo,
} from 'react';
import { Message, AIModel, RouterResult, ChatSession, GroundingChunk } from '../types';
import { Icons } from '../constants';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './ChatArea.css';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { ConfidenceBadge } from './ConfidenceBadge';
import type { ConfidenceSignal } from '../services/aiService';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, LineChart, Line,
} from 'recharts';

// ── Global type augmentation ──────────────────────────────────────
declare global {
  interface Window { __sidebarGestureLock?: boolean; }
}

// ── Types ─────────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

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
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
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

// ═══════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════

// ── Chart tooltip ─────────────────────────────────────────────────
const ChartTooltip = memo(({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '8px 12px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{payload[0].value}</p>
    </div>
  );
});

// ── Chart block ───────────────────────────────────────────────────
const EnhancedChart = memo(({ dataStr }: { dataStr: string }) => {
  try {
    const { type = 'area', data, label = 'Data' } = JSON.parse(dataStr);
    const accent = 'var(--accent)';
    const chartProps = {
      data,
      margin: { top: 8, right: 8, left: -20, bottom: 0 },
    };
    const axisProps = {
      axisLine: false,
      tickLine: false,
      tick: { fontSize: 10, fill: 'var(--text-secondary)', fontWeight: 600 },
    };

    return (
      <div style={{
        margin: '1.25em 0',
        padding: '20px 24px',
        borderRadius: 16,
        border: '1px solid var(--border)',
        background: 'color-mix(in srgb, var(--bg-secondary) 40%, transparent)',
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 16, opacity: 0.6 }}>{label}</p>
        <div style={{ height: 220, width: '100%' }}>
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
  } catch {
    return null;
  }
});

// ── Mermaid diagram ───────────────────────────────────────────────
const MermaidBlock = memo(({ code }: { code: string }) => {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  // Sanitize nested parentheses in node labels
  const sanitize = (raw: string): string =>
    raw
      .replace(/(\w[\w\d_-]*)\[([^\]"]*\([^\]]*\)[^\]"]*)\]/g, (_, id, label) =>
        label.startsWith('"') ? _ : `${id}["${label}"]`
      )
      .replace(/(\w[\w\d_-]*)\(([^)"]*\([^)]*\)[^)"]*)\)/g, (_, id, label) =>
        label.startsWith('"') ? _ : `${id}("${label}")`
      );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
        const id = 'mermaid-' + Math.random().toString(36).slice(2, 9);
        const { svg: rendered } = await mermaid.render(id, sanitize(code));
        if (!cancelled) setSvg(rendered);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Invalid diagram syntax');
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  const handleDownload = () => {
    if (!svg) return;
    downloadFile(new Blob([svg], { type: 'image/svg+xml' }), 'diagram.svg');
  };

  return (
    <div className="nx-diagram">
      <div className="nx-diagram-header">
        <span className="nx-code-lang">Diagram</span>
        {svg && (
          <button onClick={handleDownload} className="nx-code-btn">
            <Icons.Download className="icon-12" />
            SVG
          </button>
        )}
      </div>
      {error ? (
        <div style={{ padding: '16px 20px', color: '#f87171', fontSize: 13 }}>
          Diagram error: {error}
        </div>
      ) : svg ? (
        <div className="nx-diagram-body" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="nx-diagram-loading">
          <div className="nx-spinner" />
        </div>
      )}
    </div>
  );
});

// ── Product grid ──────────────────────────────────────────────────
const ProductGrid = memo(({ dataStr }: { dataStr: string }) => {
  const products = useMemo(() => {
    try {
      const p = JSON.parse(dataStr);
      return Array.isArray(p) ? p : [];
    } catch { return []; }
  }, [dataStr]);

  if (!products.length) return null;

  return (
    <div style={{ margin: '1.25em 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
        Products
      </div>
      <div className="nx-product-grid">
        {products.map((p: any, i: number) => (
          <a key={i} href={p.url || '#'} target="_blank" rel="noopener noreferrer" className="nx-product-card">
            {p.image && (
              <div style={{ height: 112, marginBottom: 12, borderRadius: 8, overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={p.image} alt={p.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} loading="lazy" />
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

  // Horizontal scroll → lock sidebar swipe
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
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, []);

  // Route special languages to their own renderers
  if (language === 'chart')    return <EnhancedChart dataStr={codeString} />;
  if (language === 'mermaid')  return <MermaidBlock code={codeString} />;
  if (language === 'products') return <ProductGrid dataStr={codeString} />;

  const handleCopy = () => {
    copyToClipboard(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext  = EXT_MAP[language]  || language || 'txt';
    const mime = MIME_MAP[language] || 'text/plain';
    downloadFile(new Blob([codeString], { type: mime }), `file.${ext}`);
  };

  // Syntax highlight — skip on large files or weak devices
  const highlighted = useMemo(() => {
    if (!codeString) return '';
    if (codeString.length > 20_000) return escapeHtml(codeString);
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency <= 2) return escapeHtml(codeString);
    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(codeString, { language, ignoreIllegals: true }).value;
      }
      return hljs.highlightAuto(codeString).value;
    } catch {
      return escapeHtml(codeString);
    }
  }, [codeString, language]);

  return (
    <div ref={containerRef} className="nx-code-block">
      <div className="nx-code-header">
        <span className="nx-code-lang">{language || 'code'}</span>
        <div className="nx-code-actions">
          <button onClick={handleDownload} className="nx-code-btn">
            <Icons.Download className="icon-12" />
            Download
          </button>
          <button onClick={handleCopy} className={`nx-code-btn${copied ? ' copied' : ''}`}>
            {copied
              ? <Icons.Check className="icon-12" />
              : <Icons.Copy className="icon-12" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      {/* Dedicated scroll container for code blocks */}
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

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Table with copy-data button ───────────────────────────────────
const EnhancedTable = ({ children }: any) => {
  const [copied, setCopied] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  // Defensive: check if children are valid table rows/cells
  const isValidTable = React.Children.toArray(children).some(
    (child: any) => child && child.type && (
      child.type === 'thead' || child.type === 'tbody' || child.type === 'tr'
    )
  );

  const handleCopy = () => {
    if (!tableRef.current) return;
    const rows = Array.from(tableRef.current.querySelectorAll('tr')) as HTMLTableRowElement[];
    const tsv = rows
      .map(r => Array.from(r.querySelectorAll('th,td') as NodeListOf<HTMLElement>)
        .map(c => c.innerText.trim()).join('\t'))
      .join('\n');
    copyToClipboard(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="nx-table-wrapper">
      <button onClick={handleCopy} className="nx-table-copy-btn">
        {copied
          ? <Icons.Check className="icon-11" />
          : <Icons.Copy className="icon-11" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <div className="nx-table-scroll">
        {isValidTable ? (
          <table ref={tableRef}>{children}</table>
        ) : (
          <div className="nx-table-warning">⚠️ Table markdown is malformed or incomplete. Please check your markdown syntax.</div>
        )}
      </div>
    </div>
  );
};

// ── Inline code style (shared) ────────────────────────────────────
const inlineCodeStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
  fontSize: '0.875em',
  fontWeight: 500,
  padding: '0.15em 0.45em',
  borderRadius: 6,
  background: 'color-mix(in srgb, var(--accent, #10a37f) 10%, var(--bg-tertiary, #2a2a2e))',
  color: 'var(--accent, #10a37f)',
  border: '1px solid color-mix(in srgb, var(--accent, #10a37f) 20%, transparent)',
  whiteSpace: 'nowrap' as const,
};

// ── Markdown component map — stable, never recreated ──────────────
// NOTE: In ReactMarkdown v8 / remark-gfm, the `inline` prop was removed.
// We detect inline code by checking whether `node.tagName` is 'code'
// and whether its parent is NOT a 'pre'. We use the `className` absence
// as the primary signal since fenced blocks always get a language className.
const buildMarkdownComponents = () => ({
  table: EnhancedTable,

  // Paragraph: use <div> to avoid React hydration errors when block-level
  // elements (code blocks, tables) appear inside prose paragraphs.
  p: ({ children }: any) => (
    <div style={{ marginTop: 0, marginBottom: '0.9em', lineHeight: 1.75 }}>
      {children}
    </div>
  ),

  // Headings — keep consistent weight and spacing
  h1: ({ children }: any) => <h2 style={{ fontSize: '1.4em', fontWeight: 700, margin: '1.5em 0 0.5em', lineHeight: 1.3, letterSpacing: '-0.01em' }}>{children}</h2>,
  h2: ({ children }: any) => <h2 style={{ fontSize: '1.2em', fontWeight: 600, margin: '1.4em 0 0.5em', lineHeight: 1.3, letterSpacing: '-0.01em' }}>{children}</h2>,
  h3: ({ children }: any) => <h3 style={{ fontSize: '1.05em', fontWeight: 600, margin: '1.2em 0 0.4em', lineHeight: 1.35 }}>{children}</h3>,
  h4: ({ children }: any) => <h4 style={{ fontSize: '1em', fontWeight: 600, margin: '1em 0 0.35em', lineHeight: 1.4 }}>{children}</h4>,

  // Lists — consistent spacing
  ul: ({ children }: any) => <ul style={{ margin: '0.25em 0 0.9em', paddingLeft: '1.6em', listStyleType: 'disc' }}>{children}</ul>,
  ol: ({ children }: any) => <ol style={{ margin: '0.25em 0 0.9em', paddingLeft: '1.6em', listStyleType: 'decimal' }}>{children}</ol>,
  li: ({ children }: any) => <li style={{ marginBottom: '0.3em', lineHeight: 1.7 }}>{children}</li>,

  // Blockquote
  blockquote: ({ children }: any) => (
    <blockquote style={{
      margin: '0.9em 0',
      paddingLeft: '1rem',
      borderLeft: '3px solid var(--accent, #10a37f)',
      color: 'var(--text-secondary)',
      fontStyle: 'normal',
    }}>
      {children}
    </blockquote>
  ),

  // Strong / em
  strong: ({ children }: any) => <strong style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{children}</strong>,

  // Code: detect fenced blocks by the presence of a language className.
  // Inline code has no className (or className is empty / undefined).
  pre: ({ children }: any) => {
    const codeEl = children?.props;
    return (
      <CodeBlock className={codeEl?.className}>
        {codeEl?.children}
      </CodeBlock>
    );
  },
  code: ({ inline, children }: any) => {
    return <code style={inlineCodeStyle}>{children}</code>;
  },

  // Horizontal rule
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.5em 0' }} />,
});

// ═══════════════════════════════════════════════════════════════════
// MESSAGE ITEM
// Memoized — only re-renders when its own data changes.
// ═══════════════════════════════════════════════════════════════════

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

const MessageItem = memo(
  ({
    msg, isLast, isLoading, copiedId, editingId, editContent, speakingMsgId,
    confidence,
    onCopy, onStartEdit, onCancelEdit, onSubmitEdit, onEditChange,
    onRegenerate, onFeedback, onSpeak, onSuggestionClick,
    mdComponents, remarkPlugins,
  }: MessageItemProps) => {
    const isUser      = msg.role === 'user';
    const isEditing   = editingId === msg.id;
    const isCopied    = copiedId === msg.id;
    const isSpeaking  = speakingMsgId === msg.id;
    const isStreaming = isLoading && isLast && !isUser;

    // Document file type metadata
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

    return (
      <div className={`message-group message-enter ${isUser ? 'message-user' : 'message-assistant'}`}>

        {/* ── User bubble ─────────────────────────────────────────── */}
        {isUser && (
          <div>
            {/* Attached documents */}
            {msg.documents && msg.documents.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, justifyContent: 'flex-end' }}>
                {msg.documents.map((doc, i) => {
                  const ext = doc.title.split('.').pop()?.toLowerCase() || '';
                  const meta = DOC_META[ext] || { color: 'var(--text-secondary)', bg: 'var(--bg-tertiary)', icon: '📄', label: 'FILE' };
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                      borderRadius: 10, border: `1px solid ${meta.color}30`,
                      background: meta.bg, maxWidth: 200,
                    }}>
                      <div style={{
                        width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 6, background: meta.bg, fontSize: 12, flexShrink: 0,
                      }}>{meta.icon}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', opacity: 0.7 }}>{meta.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isEditing ? (
              <div style={{ width: '100%', maxWidth: 620 }}>
                <textarea
                  className="edit-textarea"
                  value={editContent}
                  onChange={e => onEditChange(e.target.value)}
                  rows={3}
                  autoFocus
                />
                <div className="edit-actions">
                  <button className="edit-btn-primary" onClick={() => onSubmitEdit(msg.id)}>Update</button>
                  <button className="edit-btn-cancel" onClick={onCancelEdit}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="message-user"><div className="message-user-bubble">{msg.content}</div></div>
            )}

            {/* Attached image */}
            {msg.image && (
              <img
                src={`data:${msg.image.mimeType};base64,${msg.image.inlineData.data}`}
                alt="Attached"
                style={{ marginTop: 10, maxWidth: '100%', borderRadius: 12, border: '1px solid var(--border)' }}
              />
            )}

            {/* User message action row */}
            {!isEditing && (
              <div className="message-actions" style={{ justifyContent: 'flex-end', paddingRight: 4 }}>
                <button className={`message-action-btn${isCopied ? ' active-copy' : ''}`} onClick={() => onCopy(msg.content, msg.id)} title="Copy">
                  {isCopied ? <Icons.Check className="icon-14" /> : <Icons.Copy className="icon-14" />}
                </button>
                <button className="message-action-btn" onClick={() => onStartEdit(msg.id, msg.content)} title="Edit">
                  <Icons.Edit className="icon-14" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Assistant message ────────────────────────────────────── */}
        {!isUser && (
          <div className="message-assistant-body">
            {/* Thinking/loading indicator */}
            {isStreaming && !msg.content && (
              <div className="typing-dots">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            )}

            {/* Markdown body */}
            {msg.content && (
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={remarkPlugins} components={mdComponents}>
                  {typeof msg.content === 'string' ? msg.content : String(msg.content ?? '')}
                </ReactMarkdown>
              </div>
            )}

            {/* Confidence signal — rendered after content settles, not during streaming */}
            {msg.content && !isStreaming && confidence && (
              <div style={{ marginTop: 12, marginBottom: 2 }}>
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
            <div className="message-actions" style={{ paddingLeft: 2 }}>
              <button className={`message-action-btn${isCopied ? ' active-copy' : ''}`} onClick={() => onCopy(msg.content, msg.id)} title="Copy">
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
                {isSpeaking
                  ? <Icons.VolumeX className="icon-14" />
                  : <Icons.Volume2 className="icon-14" />}
              </button>
              <div className="message-action-divider" />
              <button
                className={`message-action-btn${msg.feedback === 'good' ? ' active-good' : ''}`}
                onClick={() => onFeedback(msg.id, msg.feedback === 'good' ? null : 'good')}
                title="Good response"
              >
                <Icons.ThumbsUp className="icon-14" />
              </button>
              <button
                className={`message-action-btn${msg.feedback === 'bad' ? ' active-bad' : ''}`}
                onClick={() => onFeedback(msg.id, msg.feedback === 'bad' ? null : 'bad')}
                title="Bad response"
              >
                <Icons.ThumbsDown className="icon-14" />
              </button>
            </div>

            {/* Follow-up suggestion chips */}
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
    if (prev.msg.content    !== next.msg.content)    return false;
    if (prev.msg.feedback   !== next.msg.feedback)   return false;
    if (prev.msg.suggestions !== next.msg.suggestions) return false;
    if (prev.isLast     !== next.isLast)     return false;
    if (prev.isLoading  !== next.isLoading)  return false;
    if (prev.confidence?.level !== next.confidence?.level) return false;
    if ((prev.copiedId   === prev.msg.id) !== (next.copiedId   === next.msg.id)) return false;
    if ((prev.editingId  === prev.msg.id) !== (next.editingId  === next.msg.id)) return false;
    if (prev.editingId === prev.msg.id && prev.editContent !== next.editContent) return false;
    if ((prev.speakingMsgId === prev.msg.id) !== (next.speakingMsgId === next.msg.id)) return false;
    return true;
  }
);

// ═══════════════════════════════════════════════════════════════════
// CHAT AREA (ROOT)
// ═══════════════════════════════════════════════════════════════════

const ChatArea: React.FC<ChatAreaProps> = ({
  session, isLoading, onExport, onToggleSidebar, isSidebarOpen,
  onRegenerate, onEditMessage, onFeedback, theme, onThemeToggle, onSuggestionClick,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages  = session?.messages ?? [];

  const [copiedId,     setCopiedId]     = useState<string | null>(null);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editContent,  setEditContent]  = useState('');
  const [autoScroll,   setAutoScroll]   = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // ── Scroll management ──────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAutoScroll(nearBottom);
    setShowScrollBtn(!nearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => {
    if (autoScroll) scrollToBottom();
  }, [messages, isLoading, autoScroll, scrollToBottom]);

  // ── TTS ────────────────────────────────────────────────────────
  const speakMessage = useCallback((msgId: string, text: string) => {
    const synth = window.speechSynthesis;
    try {
      if (speakingMsgId === msgId) {
        synth.cancel();
        setSpeakingMsgId(null);
        utteranceRef.current = null;
        return;
      }
      synth.cancel();
      const cleaned = stripMarkdown(text);
      if (!cleaned) return;

      const doSpeak = () => {
        const u = new SpeechSynthesisUtterance(cleaned);
        u.rate = 1.0; u.pitch = 1.0;
        const voices = synth.getVoices();
        const voice  =
          voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
          voices.find(v => v.lang.startsWith('en-US') && !v.localService) ||
          voices.find(v => v.lang.startsWith('en'));
        if (voice) u.voice = voice;
        u.onend  = () => { setSpeakingMsgId(null); utteranceRef.current = null; };
        u.onerror = () => { setSpeakingMsgId(null); utteranceRef.current = null; };
        utteranceRef.current = u;
        setSpeakingMsgId(msgId);
        synth.cancel();
        setTimeout(() => synth.speak(u), 50);
      };

      if (synth.getVoices().length === 0) {
        let done = false;
        const onVC = () => { synth.removeEventListener('voiceschanged', onVC); if (!done) { done = true; doSpeak(); } };
        synth.addEventListener('voiceschanged', onVC);
        setTimeout(() => { synth.removeEventListener('voiceschanged', onVC); if (!done) { done = true; doSpeak(); } }, 500);
      } else {
        doSpeak();
      }
    } catch {
      setSpeakingMsgId(null);
      utteranceRef.current = null;
    }
  }, [speakingMsgId]);

  // Cleanup TTS on session change
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    };
  }, [session?.id]);

  // ── Message actions ────────────────────────────────────────────
  const handleCopy = useCallback((text: string, id: string) => {
    copyToClipboard(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleStartEdit = useCallback((id: string, content: string) => {
    setEditingId(id); setEditContent(content);
  }, []);

  const handleCancelEdit = useCallback(() => setEditingId(null), []);

  const handleSubmitEdit = useCallback((id: string) => {
    if (editContent.trim()) {
      onEditMessage(id, editContent.trim());
      setEditingId(null);
    }
  }, [editContent, onEditMessage]);

  // ── Stable markdown components (never recreated) ───────────────
  const mdComponents = useMemo(() => buildMarkdownComponents(), []);
  const remarkPlugins = useMemo(() => [remarkGfm], []);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg-primary)', position: 'relative', overflow: 'hidden' }}>

      {/* Top-right controls */}
      <div className="chat-controls">
        <button className="chat-ctrl-btn" onClick={onThemeToggle} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          {theme === 'dark' ? <Icons.Sun className="icon-16" /> : <Icons.Moon className="icon-16" />}
        </button>
        <button className="chat-ctrl-btn" onClick={onExport} title="Export chat">
          <Icons.Download className="icon-16" />
        </button>
      </div>

      {/* Message scroll area */}
      <div ref={scrollRef} onScroll={handleScroll} className="chat-scroll">
        <div className="chat-column">

          {/* Empty state */}
          {messages.length === 0 && (
            <div className="chat-empty-state">
              <div className="chat-empty-icon">
                <Icons.Robot className="icon-24 icon-accent-robot" />
              </div>
            </div>
          )}

          {/* Messages */}
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

          {/* Global loading indicator (before first token) */}
          {isLoading && !messages.some(m => m.role === 'assistant' && m.content) && (
            <div className="typing-dots">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          )}
        </div>
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          className={`scroll-to-bottom-btn-center${isSidebarOpen ? ' scroll-to-bottom-btn-shifted' : ''}`}
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