// services/codeExecutionService.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Code Execution Service
//
// Runs user code safely.
// JS/TS:   sandboxed iframe (no allow-same-origin, CSP blocks network)
// Python:  Pyodide Web Worker (lazy-loaded ~8MB, cached by CDN)
// HTML/CSS: iframe preview
// JSON:    synchronous validation + pretty-print
//
// Security model:
//   - JS/TS runs in a sandboxed iframe — no DOM, no cookies, no network
//   - Python runs in an isolated Web Worker — no access to main thread
//   - Timeout: 8s JS/TS, 30s Python (first load may take ~5-10s)
// ══════════════════════════════════════════════════════════════════

import { runPython } from './pyodideService';

export type ExecutionLanguage =
  | 'javascript' | 'typescript'
  | 'html' | 'css'
  | 'python'
  | 'json' | 'sql';

export interface ExecutionResult {
  stdout:    string[];   // console.log lines
  stderr:    string[];   // console.error / uncaught exceptions
  returnVal: string;     // last expression value (stringified)
  html:      string;     // rendered HTML (for html/css language)
  elapsed:   number;     // ms
  success:   boolean;
}

export type ExecutionStatus = 'idle' | 'running' | 'done' | 'error' | 'timeout';

// ── Supported languages ───────────────────────────────────────────

// 'html' intentionally excluded — html execution produces a blank iframe
// (index.html has no content without a dev server) and causes the Run
// button to appear on html artifact cards with no useful output.
export const EXECUTABLE_LANGS = new Set<string>([
  'javascript', 'js',
  'typescript', 'ts',
  'python', 'py',
  'json',
]);

export function isExecutable(language: string): boolean {
  return EXECUTABLE_LANGS.has(language.toLowerCase());
}

// ── Language normalizer ───────────────────────────────────────────

function normalizeLanguage(lang: string): ExecutionLanguage {
  const l = lang.toLowerCase();
  if (l === 'js')   return 'javascript';
  if (l === 'ts')   return 'typescript';
  if (l === 'py')   return 'python';
  return l as ExecutionLanguage;
}

// ── HTML runner ───────────────────────────────────────────────────
// Returns the raw HTML to render in an iframe preview.

function buildHTMLPreview(code: string, lang: string): string {
  if (lang === 'html') return code;
  if (lang === 'css')  return `<!DOCTYPE html><html><head><style>${code}</style></head><body><p>CSS preview — add HTML elements to see them styled.</p></body></html>`;
  return '';
}

// ── JS/TS sandbox ─────────────────────────────────────────────────
// Creates a throwaway iframe, runs the code, captures output.

const SANDBOX_TIMEOUT_MS = 8_000;

function buildSandboxHTML(code: string): string {
  // TypeScript: strip type annotations with a very lightweight pass
  // (not a full transpiler — only removes : Type, <Generic>, and interface/type declarations)
  const stripped = code
    .replace(/:\s*\w[\w<>[\], |&?]*(?=\s*[=,);{])/g, '')  // : TypeAnnotation
    .replace(/^(interface|type)\s+\w[\s\S]*?\n}/gm, '')      // interface / type blocks
    .replace(/<\w[\w, |&?]*>/g, '');                          // <Generic>

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
</head>
<body>
<script>
(function() {
  const __logs = [];
  const __errs = [];
  const __orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };

  ['log', 'info', 'warn'].forEach(m => {
    console[m] = (...args) => {
      __logs.push(args.map(a => {
        try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }
        catch { return String(a); }
      }).join(' '));
    };
  });
  console.error = (...args) => {
    __errs.push(args.map(a => String(a)).join(' '));
  };

  let __ret = undefined;
  try {
    __ret = (function() {
      ${stripped}
    })();
  } catch (e) {
    __errs.push(e.message || String(e));
  }

  window.parent.postMessage({
    type:      'sedrex-exec-result',
    stdout:    __logs,
    stderr:    __errs,
    returnVal: __ret !== undefined ? JSON.stringify(__ret, null, 2) : '',
  }, '*');
})();
</script>
</body>
</html>`;
}

// ── JSON validator ────────────────────────────────────────────────

function runJSON(code: string): ExecutionResult {
  const start = Date.now();
  try {
    const parsed = JSON.parse(code);
    const pretty = JSON.stringify(parsed, null, 2);
    return {
      stdout: [`Valid JSON — ${Object.keys(parsed).length ?? 0} top-level keys`],
      stderr: [],
      returnVal: pretty,
      html: '',
      elapsed: Date.now() - start,
      success: true,
    };
  } catch (e: any) {
    return {
      stdout: [],
      stderr: [e.message],
      returnVal: '',
      html: '',
      elapsed: Date.now() - start,
      success: false,
    };
  }
}

// ── Main execution function ───────────────────────────────────────
// SAFETY: wrapped in try/catch at top level — any unexpected error is
// delivered to onResult instead of propagating to React's error boundary
// and crashing the whole app with a full-page error screen.

export function executeCode(
  code:     string,
  language: string,
  onResult: (result: ExecutionResult) => void,
): () => void {  // returns cleanup function

  try {
    const lang = normalizeLanguage(language);

    // JSON — synchronous, no iframe needed
    if (lang === 'json') {
      onResult(runJSON(code));
      return () => {};
    }

    // HTML / CSS — return rendered preview, no execution
    if (lang === 'html' || lang === 'css') {
      const html = buildHTMLPreview(code, lang);
      onResult({ stdout: [], stderr: [], returnVal: '', html, elapsed: 0, success: true });
      return () => {};
    }

    // Python — Pyodide Web Worker (lazy-loaded on first run)
    if (lang === 'python') {
      return runPython(code, onResult);
    }

    // JavaScript / TypeScript — sandboxed iframe
    const start  = Date.now();
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
    iframe.setAttribute('sandbox', 'allow-scripts');  // no allow-same-origin = fully isolated
    document.body.appendChild(iframe);

    let timeoutId: ReturnType<typeof setTimeout>;
    let settled = false;

    const cleanup = () => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      clearTimeout(timeoutId);
      window.removeEventListener('message', handler);
    };

    const handler = (evt: MessageEvent) => {
      if (evt.data?.type !== 'sedrex-exec-result') return;
      if (settled) return;
      settled = true;
      cleanup();
      onResult({
        stdout:    evt.data.stdout    ?? [],
        stderr:    evt.data.stderr    ?? [],
        returnVal: evt.data.returnVal ?? '',
        html:      '',
        elapsed:   Date.now() - start,
        success:   evt.data.stderr.length === 0,
      });
    };

    window.addEventListener('message', handler);

    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      onResult({
        stdout: [],
        stderr: [`Execution timed out after ${SANDBOX_TIMEOUT_MS / 1000}s`],
        returnVal: '',
        html: '',
        elapsed: SANDBOX_TIMEOUT_MS,
        success: false,
      });
    }, SANDBOX_TIMEOUT_MS);

    // Write sandbox HTML into the iframe.
    // CRASH FIX: contentDocument can be null in certain browser security
    // contexts even after the iframe is appended to the DOM. The previous
    // code used the non-null assertion (!) which gives no runtime protection —
    // calling .open() on null throws "Cannot read properties of null
    // (reading 'open')" and crashes the entire app via React's error boundary.
    // Guard explicitly and surface the error in the output panel instead.
    const doc = iframe.contentDocument;
    if (!doc) {
      cleanup();
      console.warn('[Sedrex] executeCode: iframe.contentDocument is null — cannot open sandbox');
      onResult({
        stdout: [],
        stderr: ['Execution sandbox unavailable (contentDocument is null). Try a different browser or disable extensions that block iframes.'],
        returnVal: '',
        html: '',
        elapsed: Date.now() - start,
        success: false,
      });
      return () => {};
    }

    try {
      doc.open();
      doc.write(buildSandboxHTML(code));
      doc.close();
    } catch (writeErr: any) {
      cleanup();
      console.warn('[Sedrex] executeCode: failed to write to sandbox iframe:', writeErr);
      onResult({
        stdout: [],
        stderr: [writeErr?.message ?? 'Failed to initialise execution sandbox'],
        returnVal: '',
        html: '',
        elapsed: Date.now() - start,
        success: false,
      });
      return () => {};
    }

    return cleanup;

  } catch (unexpectedErr: any) {
    // Last-resort catch — must never let an error escape to React's boundary
    console.warn('[Sedrex] executeCode: unexpected error:', unexpectedErr);
    onResult({
      stdout: [],
      stderr: [unexpectedErr?.message ?? 'Unexpected error during code execution'],
      returnVal: '',
      html: '',
      elapsed: 0,
      success: false,
    });
    return () => {};
  }
}
