// services/pyodideService.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Pyodide Service
// Manages a single persistent Web Worker running Pyodide.
// The worker is created on the first Python run and reused for all
// subsequent runs — Pyodide only loads once (~8 MB, cached by CDN).
// ══════════════════════════════════════════════════════════════════

import type { ExecutionResult } from './codeExecutionService';

type PendingCallback = (result: ExecutionResult) => void;

let worker: Worker | null = null;
let msgId = 0;
const pending = new Map<number, { resolve: PendingCallback; timeout: ReturnType<typeof setTimeout> }>();

const PYTHON_TIMEOUT_MS = 30_000; // Pyodide first-load can be ~5-10s on slow connections

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker('/pyodide-worker.js');

  worker.onmessage = (evt: MessageEvent) => {
    const { id, stdout, stderr, returnVal, elapsed, success } = evt.data;
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timeout);
    pending.delete(id);
    entry.resolve({ stdout, stderr, returnVal, html: '', elapsed, success });
  };

  worker.onerror = (err) => {
    // If the worker itself crashes (e.g. importScripts fails), reject all pending
    const message = err.message ?? 'Pyodide worker crashed';
    for (const [id, entry] of pending) {
      clearTimeout(entry.timeout);
      pending.delete(id);
      entry.resolve({
        stdout: [],
        stderr: [message],
        returnVal: '',
        html: '',
        elapsed: 0,
        success: false,
      });
    }
    // Allow re-creation on next call
    worker = null;
  };

  return worker;
}

/**
 * Run Python code via Pyodide in a Web Worker.
 * Returns a cleanup function that cancels the pending callback (does not
 * actually terminate the worker — Pyodide runs synchronously inside it).
 */
export function runPython(
  code: string,
  onResult: (result: ExecutionResult) => void,
): () => void {
  const id = ++msgId;
  const start = Date.now();

  const timeoutHandle = setTimeout(() => {
    if (!pending.has(id)) return;
    pending.delete(id);
    onResult({
      stdout: [],
      stderr: [`Python execution timed out after ${PYTHON_TIMEOUT_MS / 1000}s`],
      returnVal: '',
      html: '',
      elapsed: PYTHON_TIMEOUT_MS,
      success: false,
    });
  }, PYTHON_TIMEOUT_MS);

  pending.set(id, {
    resolve: (result) => {
      onResult({ ...result, elapsed: result.elapsed || Date.now() - start });
    },
    timeout: timeoutHandle,
  });

  try {
    getWorker().postMessage({ id, code });
  } catch (err: any) {
    clearTimeout(timeoutHandle);
    pending.delete(id);
    onResult({
      stdout: [],
      stderr: [err?.message ?? 'Failed to start Python worker'],
      returnVal: '',
      html: '',
      elapsed: 0,
      success: false,
    });
  }

  // Cleanup: cancel the callback (won't stop the worker, but prevents a
  // stale result from reaching a component that already unmounted)
  return () => {
    const entry = pending.get(id);
    if (entry) {
      clearTimeout(entry.timeout);
      pending.delete(id);
    }
  };
}
