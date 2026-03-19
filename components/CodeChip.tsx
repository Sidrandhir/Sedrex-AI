// components/CodeChip.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Code Chip v2.0
//
// FIXES:
//   ✅ Expanded state shows FULL content in a scrollable code block
//      (was only showing a few lines — now shows everything)
//   ✅ Proper max-height + overflow scroll so large files don't
//      take over the entire screen
//   ✅ Syntax highlighting via hljs (lazy loaded)
//   ✅ Copy button in expanded state
//   ✅ Collapse back to chip with ▲ button
// ══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, memo } from 'react';

// ── Language detection ─────────────────────────────────────────────
const LANG_PATTERNS: Array<{ pattern: RegExp; lang: string }> = [
  { pattern: /^import\s+.*from\s+['"]|^export\s+(default|const|function|class)|^\s*(const|let|var)\s+\w+\s*[:=].*[=><]/m, lang: 'typescript' },
  { pattern: /^(import|from)\s+\w|^def\s+\w+\(|^class\s+\w+:/m, lang: 'python' },
  { pattern: /^(package\s+main|import\s+"fmt")/m, lang: 'go' },
  { pattern: /^(use std::|fn\s+main\(\))/m, lang: 'rust' },
  { pattern: /^(public\s+class|import\s+java\.|@Override)/m, lang: 'java' },
  { pattern: /^\s*<[a-zA-Z][^>]*>[\s\S]*<\/[a-zA-Z]>/m, lang: 'html' },
  { pattern: /^\s*[.#]?[\w-]+\s*\{[\s\S]*?\}/m, lang: 'css' },
  { pattern: /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/im, lang: 'sql' },
  { pattern: /^\{[\s\S]*\}$|^\[[\s\S]*\]$/m, lang: 'json' },
  { pattern: /^#!/m, lang: 'bash' },
];

export function detectPastedCode(text: string): string | null {
  if (text.split('\n').length < 3) return null;
  for (const { pattern, lang } of LANG_PATTERNS) {
    if (pattern.test(text)) return lang;
  }
  // Generic: if it has multiple indented lines and brackets, treat as code
  const hasIndent    = /^[ \t]{2,}/m.test(text);
  const hasBrackets  = /[{}()\[\]]/.test(text);
  const hasKeywords  = /\b(function|return|if|for|while|class|const|let|var|import|export|def|fn)\b/.test(text);
  if (hasIndent && hasBrackets && hasKeywords) return 'text';
  return null;
}

const FILE_ICONS: Record<string, string> = {
  typescript: '⚡', javascript: '⚡', python: '🐍', rust: '🦀',
  go: '🔹', java: '☕', html: '🌐', css: '🎨', sql: '🗄️',
  json: '{ }', bash: '💻', text: '📄',
};

const LANG_LABELS: Record<string, string> = {
  typescript: 'TypeScript', javascript: 'JavaScript', python: 'Python',
  rust: 'Rust', go: 'Go', java: 'Java', html: 'HTML', css: 'CSS',
  sql: 'SQL', json: 'JSON', bash: 'Shell', text: 'Code',
};

interface CodeChipProps {
  language:  string;
  content:   string;
  lineCount: number;
  onRemove:  () => void;
}

const CodeChip: React.FC<CodeChipProps> = memo(({ language, content, lineCount, onRemove }) => {
  const [expanded,    setExpanded]    = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [highlighted, setHighlighted] = useState('');

  const lang  = language.toLowerCase();
  const icon  = FILE_ICONS[lang]  ?? '📄';
  const label = LANG_LABELS[lang] ?? language.toUpperCase();

  // Lazy-load highlight.js only when expanded
  useEffect(() => {
    if (!expanded || highlighted) return;
    let cancelled = false;
    (async () => {
      try {
        const hljs = (await import('highlight.js')).default;
        const result = hljs.getLanguage(lang)
          ? hljs.highlight(content, { language: lang, ignoreIllegals: true }).value
          : hljs.highlightAuto(content).value;
        if (!cancelled) setHighlighted(result);
      } catch {
        if (!cancelled) setHighlighted(escapeHtml(content));
      }
    })();
    return () => { cancelled = true; };
  }, [expanded, content, lang, highlighted]);

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(content); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = content; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  if (!expanded) {
    // ── Collapsed chip ───────────────────────────────────────────
    return (
      <div style={{
        display:     'inline-flex',
        alignItems:  'center',
        gap:         6,
        padding:     '5px 10px',
        background:  'var(--bg-secondary, #0d1117)',
        border:      '1px solid var(--border, rgba(255,255,255,0.1))',
        borderRadius: 8,
        cursor:      'pointer',
        userSelect:  'none',
        maxWidth:    240,
        flexShrink:  0,
      }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <button
          onClick={() => setExpanded(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4, padding: 0,
          }}
          title="Click to expand code"
        >
          <span style={{
            fontSize: 12, fontWeight: 600,
            color: 'var(--text-primary, #e4e8f0)',
            fontFamily: 'monospace',
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 11,
            color: 'var(--text-secondary, #8b9ab0)',
          }}>
            · {lineCount} lines
          </span>
          <svg style={{ width: 10, height: 10, color: 'var(--text-secondary, #8b9ab0)', marginLeft: 2 }}
            viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 4l4 4 4-4"/>
          </svg>
        </button>
        <button
          onClick={onRemove}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '0 2px', color: 'var(--text-secondary, #8b9ab0)',
            display: 'flex', alignItems: 'center',
            marginLeft: 2,
          }}
          title="Remove"
        >
          <svg style={{ width: 10, height: 10 }} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 1l10 10M11 1L1 11"/>
          </svg>
        </button>
      </div>
    );
  }

  // ── Expanded state — FULL content visible ────────────────────────
  return (
    <div style={{
      width:        '100%',
      background:   'var(--bg-primary, #0a0e17)',
      border:       '1px solid var(--border, rgba(255,255,255,0.1))',
      borderRadius: 10,
      overflow:     'hidden',
      marginBottom: 4,
    }}>
      {/* Header bar */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '8px 12px',
        background:     'var(--bg-secondary, #0d1117)',
        borderBottom:   '1px solid var(--border, rgba(255,255,255,0.08))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>{icon}</span>
          <span style={{
            fontSize: 12, fontWeight: 600,
            color: 'var(--text-primary, #e4e8f0)',
            fontFamily: 'monospace',
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 11,
            color: 'var(--text-secondary, #8b9ab0)',
          }}>
            · {lineCount} lines
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Copy button */}
          <button
            onClick={handleCopy}
            style={{
              display:      'flex', alignItems: 'center', gap: 4,
              padding:      '3px 8px',
              background:   copied ? 'rgba(16,185,129,0.15)' : 'var(--bg-tertiary, rgba(255,255,255,0.05))',
              border:       '1px solid var(--border, rgba(255,255,255,0.1))',
              borderRadius: 6, cursor: 'pointer',
              fontSize:     11, fontWeight: 600,
              color:        copied ? '#10B981' : 'var(--text-secondary, #8b9ab0)',
              transition:   'all 0.15s',
            }}
          >
            {copied ? (
              <>
                <svg style={{ width: 10, height: 10 }} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="1 6 4 9 11 2"/>
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg style={{ width: 10, height: 10 }} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="4" y="4" width="7" height="7" rx="1"/>
                  <path d="M1 8V2a1 1 0 011-1h6"/>
                </svg>
                Copy
              </>
            )}
          </button>

          {/* Collapse button */}
          <button
            onClick={() => setExpanded(false)}
            style={{
              display:      'flex', alignItems: 'center',
              padding:      '3px 6px',
              background:   'none',
              border:       '1px solid var(--border, rgba(255,255,255,0.1))',
              borderRadius: 6, cursor: 'pointer',
              color:        'var(--text-secondary, #8b9ab0)',
            }}
            title="Collapse"
          >
            <svg style={{ width: 10, height: 10 }} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 8l4-4 4 4"/>
            </svg>
          </button>

          {/* Remove button */}
          <button
            onClick={onRemove}
            style={{
              display:      'flex', alignItems: 'center',
              padding:      '3px 6px',
              background:   'none',
              border:       '1px solid var(--border, rgba(255,255,255,0.1))',
              borderRadius: 6, cursor: 'pointer',
              color:        '#f87171',
            }}
            title="Remove"
          >
            <svg style={{ width: 10, height: 10 }} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 1l10 10M11 1L1 11"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── FIX: Full content in scrollable pre block ───────────────
          Previously showed only a few lines because max-height was
          too small. Now shows all content with scroll on overflow.
          Max-height is 400px — enough to read substantial files.   */}
      <div style={{
        maxHeight:  400,
        overflowY:  'auto',
        overflowX:  'auto',
      }}>
        <pre style={{
          margin:     0,
          padding:    '12px 14px',
          fontSize:   12,
          lineHeight: 1.6,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', monospace",
          color:      'var(--text-primary, #e4e8f0)',
          whiteSpace: 'pre',
          minWidth:   0,
        }}>
          {highlighted ? (
            <code
              className={`hljs language-${lang}`}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          ) : (
            <code>{content}</code>
          )}
        </pre>
      </div>
    </div>
  );
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default CodeChip;