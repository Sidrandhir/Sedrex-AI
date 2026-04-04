// public/pyodide-worker.js
// ══════════════════════════════════════════════════════════════════
// SEDREX — Pyodide Web Worker
// Loads Pyodide once, executes Python code on demand.
// Communicates with the main thread via postMessage.
//
// Message in:  { id, code }
// Message out: { id, stdout, stderr, returnVal, elapsed, success }
// ══════════════════════════════════════════════════════════════════

importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.js');

let pyodide = null;
let loading = false;
let loadError = null;
const queue = [];

async function initPyodide() {
  if (pyodide) return pyodide;
  if (loading) {
    // Wait for the in-flight load
    await new Promise((res) => {
      const check = setInterval(() => {
        if (pyodide || loadError) { clearInterval(check); res(); }
      }, 50);
    });
    if (loadError) throw loadError;
    return pyodide;
  }

  loading = true;
  try {
    pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/',
    });

    // Redirect stdout / stderr to lists Python-side
    await pyodide.runPythonAsync(`
import sys, io, json

class _Capture(io.StringIO):
    def __init__(self, store):
        super().__init__()
        self._store = store
    def write(self, s):
        if s.strip():
            self._store.append(s.rstrip('\\n'))
        return len(s)

_stdout_lines = []
_stderr_lines = []
sys.stdout = _Capture(_stdout_lines)
sys.stderr = _Capture(_stderr_lines)
`);
    return pyodide;
  } catch (e) {
    loadError = e;
    throw e;
  }
}

async function runCode(id, code) {
  const start = Date.now();
  let stdout = [], stderr = [], returnVal = '', success = false;

  try {
    const py = await initPyodide();

    // Clear capture buffers
    await py.runPythonAsync(`
_stdout_lines.clear()
_stderr_lines.clear()
`);

    // Wrap user code in a Python-level try/except so that ALL Python
    // exceptions (SyntaxError, NameError, ZeroDivisionError, etc.) are
    // caught inside the Python interpreter and written to sys.stderr as a
    // full traceback. This prevents the JS inner-catch from silently
    // swallowing exceptions and returning success=true with no output.
    //
    // We use a two-phase approach:
    //   1. Attempt eval (expression) to capture a return value.
    //   2. If that raises a SyntaxError (multi-statement code), fall back to
    //      exec — both wrapped in Python-level try/except/traceback.
    const wrappedCode = [
      'import traceback as _tb',
      '_ret = None',
      '_exec_ok = False',
      'try:',
      '    _ret = eval(compile(' + JSON.stringify(code) + ', "<string>", "eval"))',
      '    _exec_ok = True',
      'except SyntaxError:',
      '    try:',
      '        exec(compile(' + JSON.stringify(code) + ', "<string>", "exec"))',
      '        _exec_ok = True',
      '    except Exception as _e:',
      '        import sys as _sys',
      '        _sys.stderr.write(_tb.format_exc())',
      '        _exec_ok = False',
      'except Exception as _e:',
      '    import sys as _sys',
      '    _sys.stderr.write(_tb.format_exc())',
      '    _exec_ok = False',
    ].join('\n');

    await py.runPythonAsync(wrappedCode);

    // Collect captured output
    stdout    = py.globals.get('_stdout_lines').toJs() ?? [];
    stderr    = py.globals.get('_stderr_lines').toJs() ?? [];
    const ret = py.globals.get('_ret');
    returnVal = (ret !== undefined && ret !== null) ? String(ret) : '';
    // success = true only when no exception was raised
    success   = py.globals.get('_exec_ok') === true;

  } catch (err) {
    // Pyodide surfaces Python tracebacks as the error message
    const msg = err?.message ?? String(err);
    // Strip the redundant "PythonError:" prefix pyodide adds
    stderr = [msg.replace(/^PythonError:\s*/i, '')];
    success = false;
  }

  self.postMessage({
    id,
    stdout:    Array.isArray(stdout) ? stdout.map(String) : [],
    stderr:    Array.isArray(stderr) ? stderr.map(String) : [],
    returnVal: String(returnVal),
    elapsed:   Date.now() - start,
    success,
  });
}

self.onmessage = ({ data }) => {
  const { id, code } = data;
  runCode(id, code);
};
