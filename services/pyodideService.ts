// services/pyodideService.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Pyodide Service  (v2 — production hardened)
// Single persistent Web Worker. Pyodide loads ONCE (~8 MB, CDN cached).
//
// Key changes from v1:
//  - Timeout raised from 15 s → 60 s (covers slow first-load)
//  - warmPyodide() exported — call at app boot to pre-heat the runtime
//  - Worker auto-restarts on crash; all pending callbacks drained safely
//  - runPython() cleanup fn cancels stale callbacks without killing worker
// ══════════════════════════════════════════════════════════════════

import type { ExecutionResult } from './codeExecutionService';

type PendingEntry = {
  resolve: (result: ExecutionResult) => void;
  timeout: ReturnType<typeof setTimeout>;
  start:   number;
};

// 60 s: Pyodide WASM download (~5-15 s on slow connections)
//       + Python initialisation (~1-3 s)
//       + actual user code execution
const PYTHON_TIMEOUT_MS = 60_000;

let worker: Worker | null = null;
let msgId  = 0;
const pending = new Map<number, PendingEntry>();

// ── Worker lifecycle ──────────────────────────────────────────────

function createWorker(): Worker {
  const w = new Worker('/pyodide-worker.js');

  w.onmessage = ({ data }) => {
    const { id, stdout, stderr, returnVal, elapsed, success } = data;
    const entry = pending.get(id);
    if (!entry) return;   // timed-out or already cleaned up
    clearTimeout(entry.timeout);
    pending.delete(id);
    entry.resolve({
      stdout:    Array.isArray(stdout) ? stdout.map(String) : [],
      stderr:    Array.isArray(stderr) ? stderr.map(String) : [],
      returnVal: String(returnVal ?? ''),
      html:      '',
      elapsed:   typeof elapsed === 'number' ? elapsed : Date.now() - entry.start,
      success:   Boolean(success),
    });
  };

  w.onerror = (evt) => {
    const message = evt.message ?? 'Pyodide worker crashed';
    console.error('[Sedrex] pyodide-worker error:', message);

    for (const [id, entry] of pending) {
      clearTimeout(entry.timeout);
      pending.delete(id);
      entry.resolve({
        stdout: [], stderr: [message], returnVal: '', html: '',
        elapsed: Date.now() - entry.start, success: false,
      });
    }
    worker = null;   // recreate on next call
  };

  return w;
}

function getWorker(): Worker {
  if (!worker) worker = createWorker();
  return worker;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * warmPyodide — call ONCE at app boot (App.tsx useEffect).
 * Sends a trivial job so Pyodide loads in the background while the user
 * is reading/typing. By the time they click Run, the runtime is ready
 * and execution feels instant instead of showing "Loading runtime…".
 */
export function warmPyodide(): void {
  try {
    // id = 0 deliberately has no pending entry → result is silently discarded
    getWorker().postMessage({ id: 0, code: 'import sys' });
  } catch {
    // Best-effort — failure here doesn't affect actual runs
  }
}

/**
 * runPython — execute Python code in the persistent Pyodide worker.
 * Returns a cleanup function. Call it on component unmount to prevent
 * stale result callbacks updating already-unmounted React state.
 */
export function runPython(
  code:     string,
  onResult: (result: ExecutionResult) => void,
): () => void {
  const id    = ++msgId;
  const start = Date.now();

  const timeoutHandle = setTimeout(() => {
    if (!pending.has(id)) return;
    pending.delete(id);
    onResult({
      stdout: [],
      stderr: [
        `Python execution timed out after ${PYTHON_TIMEOUT_MS / 1000}s.`,
        'First run downloads Pyodide (~8 MB) — this only happens once.',
        'Please try again — subsequent runs are instant.',
      ],
      returnVal: '', html: '', elapsed: PYTHON_TIMEOUT_MS, success: false,
    });
  }, PYTHON_TIMEOUT_MS);

  pending.set(id, { resolve: onResult, timeout: timeoutHandle, start });

  try {
    getWorker().postMessage({ id, code });
  } catch (err: any) {
    clearTimeout(timeoutHandle);
    pending.delete(id);
    onResult({
      stdout: [], stderr: [err?.message ?? 'Failed to communicate with Python worker'],
      returnVal: '', html: '', elapsed: 0, success: false,
    });
  }

  return () => {
    const entry = pending.get(id);
    if (entry) {
      clearTimeout(entry.timeout);
      pending.delete(id);
    }
  };
}