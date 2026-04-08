// public/pyodide-worker.js
// ══════════════════════════════════════════════════════════════════
// SEDREX — Pyodide Web Worker  (v2 — production hardened)
// Loads Pyodide ONCE, executes Python on demand.
//
// Message in:  { id, code }
// Message out: { id, stdout, stderr, returnVal, elapsed, success }
// ══════════════════════════════════════════════════════════════════

importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.js');

let pyodide      = null;
let loading      = false;
let loadError    = null;

// ── Single shared initialisation ─────────────────────────────────
async function initPyodide() {
  if (pyodide) return pyodide;

  if (loading) {
    // Spin-wait for the in-flight load (max 60 s)
    for (let i = 0; i < 1200; i++) {
      await new Promise(r => setTimeout(r, 50));
      if (pyodide)    return pyodide;
      if (loadError)  throw loadError;
    }
    throw new Error('Pyodide init timed out while waiting for concurrent load');
  }

  loading = true;
  try {
    pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/',
    });

    // ── stdout / stderr capture ────────────────────────────────
    // BUG FIX: previous version used `if s.strip()` which silently
    // dropped blank lines (print(""), print(" "), separator lines).
    // FIX: store EVERY write verbatim. JS side joins with '' so the
    // output mirrors exactly what a real terminal would show.
    await pyodide.runPythonAsync(`
import sys, io

class _CapStream(io.RawIOBase):
    def __init__(self, store):
        self._store = store

    def write(self, s):
        if isinstance(s, (bytes, bytearray)):
            s = s.decode('utf-8', errors='replace')
        self._store.append(s)
        return len(s)

    def readable(self):  return False
    def writable(self):  return True
    def seekable(self):  return False

class _TextWrapper(io.TextIOWrapper):
    def __init__(self, store):
        super().__init__(_CapStream(store), encoding='utf-8', line_buffering=True)

_stdout_parts = []
_stderr_parts = []
sys.stdout = _TextWrapper(_stdout_parts)
sys.stderr = _TextWrapper(_stderr_parts)
`);
    return pyodide;
  } catch (e) {
    loadError = e;
    loading   = false;   // allow retry after a transient network error
    throw e;
  }
}

// ── Per-run execution ─────────────────────────────────────────────
async function runCode(id, code) {
  const start = Date.now();
  let stdout = [], stderr = [], returnVal = '', success = false;

  try {
    const py = await initPyodide();

    // Clear capture buffers for this run
    await py.runPythonAsync(`
_stdout_parts.clear()
_stderr_parts.clear()
`);

    // Two-phase eval/exec — all exceptions caught at Python level
    const safeCode = JSON.stringify(code);

    await py.runPythonAsync(`
import traceback as _tb, sys as _sys

_ret     = None
_exec_ok = False

try:
    _ret     = eval(compile(${safeCode}, '<sedrex>', 'eval'))
    _exec_ok = True
except SyntaxError:
    try:
        exec(compile(${safeCode}, '<sedrex>', 'exec'))
        _exec_ok = True
    except BaseException:
        _sys.stderr.write(_tb.format_exc())
        _exec_ok = False
except BaseException:
    _sys.stderr.write(_tb.format_exc())
    _exec_ok = False

try:
    _sys.stdout.flush()
    _sys.stderr.flush()
except Exception:
    pass
`);

    // Join raw parts with '' (each part already has its own \n from print())
    const joinAndSplit = (parts) =>
      parts.map(String).join('').split('\n');

    stdout    = joinAndSplit(py.globals.get('_stdout_parts').toJs() ?? []);
    stderr    = joinAndSplit(py.globals.get('_stderr_parts').toJs() ?? []);

    // Remove single trailing empty string that split() appends after final \n
    if (stdout.length > 1 && stdout[stdout.length - 1] === '') stdout.pop();
    if (stderr.length > 1 && stderr[stderr.length - 1] === '') stderr.pop();

    const ret = py.globals.get('_ret');
    returnVal = (ret !== undefined && ret !== null) ? String(ret) : '';
    success   = py.globals.get('_exec_ok') === true;

  } catch (err) {
    const msg = (err?.message ?? String(err)).replace(/^PythonError:\s*/i, '');
    stderr  = msg.split('\n');
    success = false;
  }

  self.postMessage({
    id,
    stdout:    stdout.map(String),
    stderr:    stderr.map(String),
    returnVal: String(returnVal),
    elapsed:   Date.now() - start,
    success,
  });
}

self.onmessage = ({ data }) => {
  const { id, code } = data;
  runCode(id, code).catch(err => {
    self.postMessage({
      id,
      stdout:    [],
      stderr:    [(err?.message ?? String(err)).replace(/^PythonError:\s*/i, '')],
      returnVal: '',
      elapsed:   0,
      success:   false,
    });
  });
};