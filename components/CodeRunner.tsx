// components/CodeRunner.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Code Runner Panel
// Rendered below a code block when the user clicks "Run ▶".
// Shows stdout, errors, return value, or an HTML preview.
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import {
  executeCode,
  isExecutable,
  ExecutionResult,
  ExecutionStatus,
} from '../services/codeExecutionService';

interface CodeRunnerProps {
  code:     string;
  language: string;
  onClose?: () => void;
}

// ── Run button (shown inside CodeBlock header when language is executable) ──
export const RunButton = memo(({
  language, onClick,
}: { code: string; language: string; onClick: () => void }) => {
  if (!isExecutable(language)) return null;

  return (
    <button
      type="button"
      className="nx-code-btn code-run-btn"
      onClick={onClick}
      title={`Run ${language}`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      Run
    </button>
  );
});

// ── Main runner panel ─────────────────────────────────────────────
export const CodeRunner = memo(({ code, language, onClose }: CodeRunnerProps) => {
  const [status,    setStatus]    = useState<ExecutionStatus>('idle');
  const [result,    setResult]    = useState<ExecutionResult | null>(null);
  const [slowHint,  setSlowHint]  = useState(false);
  const cleanupRef  = useRef<(() => void) | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPython = language === 'python' || language === 'py';

  const run = useCallback(() => {
    cleanupRef.current?.();
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setStatus('running');
    setResult(null);
    setSlowHint(false);

    // Show "Loading Python runtime…" hint if Python takes > 2s (first load)
    if (isPython) {
      hintTimerRef.current = setTimeout(() => setSlowHint(true), 2000);
    }

    cleanupRef.current = executeCode(code, language, (res) => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      setSlowHint(false);
      setResult(res);
      setStatus(res.success ? 'done' : 'error');
    });
  }, [code, language, isPython]);

  // Auto-run on mount
  useEffect(() => {
    run();
    return () => {
      cleanupRef.current?.();
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isHTML = language === 'html' || language === 'css';

  return (
    <div className="code-runner-panel">
      {/* Runner header */}
      <div className="code-runner-header">
        <div className="code-runner-status-row">
          {status === 'running' && (
            <span className="code-runner-status running">
              <span className="code-runner-spinner" />
              {slowHint ? 'Loading Python runtime…' : 'Running…'}
            </span>
          )}
          {status === 'done' && (
            <span className="code-runner-status done">✓ Done in {result?.elapsed}ms</span>
          )}
          {status === 'error' && (
            <span className="code-runner-status error">✗ Error</span>
          )}
          {status === 'timeout' && (
            <span className="code-runner-status error">⏱ Timed out</span>
          )}
        </div>

        <div className="code-runner-actions">
          <button type="button" className="code-runner-action-btn" onClick={run} title="Re-run">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Re-run
          </button>
          <button type="button" className="code-runner-action-btn" onClick={() => onClose?.()} title="Close">
            ✕
          </button>
        </div>
      </div>

      {/* HTML preview */}
      {isHTML && result?.html && (
        <div className="code-runner-html-preview">
          <p className="code-runner-section-label">Preview</p>
          <iframe
            srcDoc={result.html}
            sandbox="allow-scripts allow-same-origin"
            className="code-runner-iframe"
            title="HTML preview"
          />
        </div>
      )}

      {/* stdout */}
      {result && result.stdout.length > 0 && (
        <div className="code-runner-section">
          <p className="code-runner-section-label">Output</p>
          <div className="code-runner-output">
            {result.stdout.map((line, i) => (
              <div key={i} className="code-runner-line stdout">{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* returnVal */}
      {result?.returnVal && (
        <div className="code-runner-section">
          <p className="code-runner-section-label">Return value</p>
          <div className="code-runner-output">
            <div className="code-runner-line return-val">{result.returnVal}</div>
          </div>
        </div>
      )}

      {/* stderr */}
      {result && result.stderr.length > 0 && (
        <div className="code-runner-section">
          <p className="code-runner-section-label error-label">Errors</p>
          <div className="code-runner-output error-output">
            {result.stderr.map((line, i) => (
              <div key={i} className="code-runner-line stderr">{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* Empty result */}
      {result && !result.html && result.stdout.length === 0 && !result.returnVal && result.stderr.length === 0 && (
        <div className="code-runner-section">
          <p className="code-runner-line" style={{ opacity: 0.5, fontStyle: 'italic' }}>
            No output produced.
          </p>
        </div>
      )}
    </div>
  );
});

CodeRunner.displayName = 'CodeRunner';
RunButton.displayName  = 'RunButton';
