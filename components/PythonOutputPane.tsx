// components/PythonOutputPane.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Python Output Pane
//
// Renders Python execution results directly in the ArtifactPanel
// preview tab WITHOUT loading a second Pyodide instance inside an
// iframe. It reuses the singleton pyodideService Web Worker that
// already exists — Pyodide loads once, runs everywhere.
//
// Why this file exists:
//   The old buildSrcdoc() Python branch injected a full Pyodide
//   load inside a sandboxed srcdoc iframe. That iframe's fetch()
//   calls for the 8 MB WASM bundle were blocked by Brave, Firefox
//   strict-mode, and aggressive CSPs, leaving the UI permanently
//   stuck on "Loading Python runtime (first run ~5s)…".
//
//   This component fixes the issue at its root: Python code is sent
//   to the shared worker, results come back as structured data, and
//   we render them with React — no second runtime, no CDN blocking.
// ══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { runPython } from '../services/pyodideService';
import type { ExecutionResult } from '../services/codeExecutionService';

interface PythonOutputPaneProps {
  code: string;
  /** Called with the artifact id so the panel can track re-runs */
  artifactId?: string;
}

type RunState = 'loading' | 'running' | 'done' | 'error';

const PythonOutputPane: React.FC<PythonOutputPaneProps> = memo(({ code, artifactId }) => {
  const [state,   setState]   = useState<RunState>('loading');
  const [result,  setResult]  = useState<ExecutionResult | null>(null);
  const [runCount, setRunCount] = useState(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  const execute = useCallback(() => {
    cleanupRef.current?.();
    setState('running');
    setResult(null);

    cleanupRef.current = runPython(code, (res) => {
      setResult(res);
      setState(res.success ? 'done' : 'error');
    });
  }, [code]);

  // Run on mount and whenever code/artifactId changes
  useEffect(() => {
    execute();
    return () => { cleanupRef.current?.(); };
  }, [execute, artifactId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRerun = () => {
    setRunCount(c => c + 1);
    execute();
  };

  // ── Styles (inline — no additional CSS file needed) ────────────
  const s = {
    root: {
      display: 'flex', flexDirection: 'column' as const,
      height: '100%', minHeight: 0,
      background: 'var(--bg-primary, #0b0f1a)',
      fontFamily: "'Fira Code', 'Cascadia Code', monospace",
    },
    toolbar: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 14px',
      borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))',
      background: 'var(--bg-secondary, #0d1117)',
      flexShrink: 0,
    },
    label: {
      fontSize: 10, fontWeight: 700, letterSpacing: '.1em',
      textTransform: 'uppercase' as const,
      color: 'rgba(16,185,129,0.7)',
      display: 'flex', alignItems: 'center', gap: 6,
    },
    statusDot: (st: RunState) => ({
      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
      background: st === 'running' ? '#f59e0b'
                : st === 'done'    ? '#10b981'
                : st === 'error'   ? '#f87171'
                :                    'rgba(255,255,255,0.2)',
      boxShadow: st === 'running' ? '0 0 6px #f59e0b' : 'none',
      animation: st === 'running' ? 'sx-pulse 1s ease-in-out infinite' : 'none',
    }),
    rerunBtn: {
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 6, border: 'none',
      background: 'rgba(16,185,129,0.1)',
      color: '#10b981', cursor: 'pointer', fontSize: 11, fontWeight: 600,
      transition: 'background 0.15s',
    },
    body: {
      flex: 1, overflowY: 'auto' as const, padding: '14px 16px',
    },
    loadingWrap: {
      display: 'flex', flexDirection: 'column' as const,
      alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 12,
      color: 'rgba(16,185,129,0.7)', fontSize: 13,
    },
    spinner: {
      width: 22, height: 22, border: '2px solid rgba(16,185,129,0.2)',
      borderTop: '2px solid #10b981', borderRadius: '50%',
      animation: 'sx-spin 0.8s linear infinite',
    },
    line: {
      fontSize: 13, lineHeight: 1.65,
      whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
      padding: '1px 0',
    },
    sectionLabel: {
      fontSize: 10, fontWeight: 700, letterSpacing: '.08em',
      textTransform: 'uppercase' as const, marginTop: 12, marginBottom: 6,
      paddingBottom: 4,
      borderBottom: '1px solid var(--border, rgba(255,255,255,0.06))',
    },
    noOutput: {
      color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' as const, fontSize: 13,
    },
    elapsed: {
      fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 8,
    },
  };

  const isError = (line: string) =>
    line.startsWith('Traceback') ||
    line.startsWith('  File ') ||
    /^(SyntaxError|NameError|TypeError|ValueError|ZeroDivision|AttributeError|ImportError|KeyError|IndexError|RuntimeError|StopIteration|OSError|IOError|OverflowError|MemoryError|RecursionError|AssertionError)/.test(line);

  return (
    <div style={s.root}>
      {/* Keyframes injected once */}
      <style>{`
        @keyframes sx-spin  { to { transform: rotate(360deg); } }
        @keyframes sx-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      {/* Toolbar */}
      <div style={s.toolbar}>
        <div style={s.label}>
          <div style={s.statusDot(state)} />
          Python Output
          {result && (
            <span style={s.elapsed}>{result.elapsed}ms</span>
          )}
        </div>
        <button
          style={s.rerunBtn}
          onClick={handleRerun}
          disabled={state === 'running' || state === 'loading'}
          title="Re-run"
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.18)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.1)')}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Re-run
        </button>
      </div>

      {/* Body */}
      <div style={s.body}>

        {/* Loading state — Pyodide warming up */}
        {(state === 'loading' || state === 'running') && !result && (
          <div style={s.loadingWrap}>
            <div style={s.spinner} />
            <span>
              {state === 'loading'
                ? 'Loading Python runtime… (first run only, ~5-10s)'
                : 'Running…'}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
              Pyodide downloads once and is cached — all subsequent runs are instant.
            </span>
          </div>
        )}

        {/* stdout */}
        {result && result.stdout.length > 0 && (
          <div>
            <div style={{ ...s.sectionLabel, color: 'rgba(16,185,129,0.6)' }}>Output</div>
            {result.stdout.map((line, i) => (
              <div key={i} style={{ ...s.line, color: '#e4e8f0' }}>{line}</div>
            ))}
          </div>
        )}

        {/* return value */}
        {result?.returnVal && (
          <div style={{ marginTop: result.stdout.length > 0 ? 12 : 0 }}>
            <div style={{ ...s.sectionLabel, color: 'rgba(129,140,248,0.7)' }}>Return value</div>
            <div style={{ ...s.line, color: '#a5b4fc' }}>{result.returnVal}</div>
          </div>
        )}

        {/* stderr / tracebacks */}
        {result && result.stderr.length > 0 && (
          <div style={{ marginTop: (result.stdout.length > 0 || result.returnVal) ? 12 : 0 }}>
            <div style={{ ...s.sectionLabel, color: 'rgba(248,113,113,0.7)' }}>Errors</div>
            {result.stderr.map((line, i) => (
              <div key={i} style={{
                ...s.line,
                color: isError(line) ? '#f87171' : 'rgba(248,113,113,0.8)',
                background: line.startsWith('Traceback') ? 'rgba(248,113,113,0.04)' : 'transparent',
              }}>
                {line}
              </div>
            ))}
          </div>
        )}

        {/* Empty result */}
        {result && result.stdout.length === 0 && !result.returnVal && result.stderr.length === 0 && (
          <div style={s.noOutput}>No output produced.</div>
        )}
      </div>
    </div>
  );
});

PythonOutputPane.displayName = 'PythonOutputPane';
export default PythonOutputPane;