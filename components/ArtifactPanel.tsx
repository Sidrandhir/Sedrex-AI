import React, {
  useRef, useEffect, useState, useCallback, memo,
} from 'react';
import {
  useArtifacts, updateArtifact, deleteArtifact, Artifact, loadArtifactContent,
} from '../services/artifactStore';
import { Icons } from '../constants';
import './ArtifactPanel.css';

const LANG_LABELS: Record<string, string> = {
  typescript: 'TypeScript', ts: 'TypeScript', tsx: 'TypeScript (React)',
  javascript: 'JavaScript', js: 'JavaScript', jsx: 'JavaScript (React)',
  python: 'Python', rust: 'Rust', go: 'Go', java: 'Java', kotlin: 'Kotlin',
  css: 'CSS', scss: 'SCSS', html: 'HTML', sql: 'SQL', graphql: 'GraphQL',
  json: 'JSON', yaml: 'YAML', bash: 'Shell', sh: 'Shell',
  markdown: 'Markdown', mermaid: 'Diagram', text: 'Text',
  svg: 'SVG', xml: 'XML', toml: 'TOML', r: 'R',
};

const FILE_ICONS: Record<string, string> = {
  typescript: '⚡', ts: '⚡', tsx: '⚛', javascript: '⚡', js: '⚡', jsx: '⚛',
  python: '🐍', rust: '🦀', go: '🔹', java: '☕', kotlin: '🟣',
  css: '🎨', scss: '🎨', html: '🌐', sql: '🗄️', json: '{ }',
  yaml: '⚙️', bash: '💻', sh: '💻', markdown: '📝',
  mermaid: '🔷', diagram: '🔷', text: '📄', svg: '🖼️', image: '🖼️',
};

const MIME_MAP: Record<string, string> = {
  json: 'application/json', html: 'text/html', css: 'text/css',
  sql: 'application/sql', csv: 'text/csv', markdown: 'text/markdown', md: 'text/markdown',
};
const EXT_MAP: Record<string, string> = {
  typescript: 'ts', javascript: 'js', python: 'py', rust: 'rs', go: 'go',
  java: 'java', kotlin: 'kt', css: 'css', scss: 'scss', html: 'html',
  sql: 'sql', json: 'json', yaml: 'yml', bash: 'sh', markdown: 'md',
  mermaid: 'mmd', text: 'txt', svg: 'svg',
};

const langLabel = (lang: string) => LANG_LABELS[lang?.toLowerCase()] ?? lang?.toUpperCase() ?? 'Code';
const fileIcon = (lang: string) => FILE_ICONS[lang?.toLowerCase()] ?? '📄';

function escapeHtml(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type PanelTab = 'code' | 'preview' | 'history';

function isDiagramArtifact(a: Artifact): boolean {
  return a.type === 'diagram' || (a.language ?? '').toLowerCase() === 'mermaid';
}

// Every artifact has a preview — Python runs via Pyodide, JS executes, others display richly
function canPreviewArtifact(_a: Artifact): boolean { return true; }

// Handle raw base64 without data: prefix
function getImageSrc(content: string, title = ''): string {
  if (!content) return '';
  if (content.startsWith('data:') || content.startsWith('http')) return content;
  const ext = (title.split('.').pop() ?? 'png').toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'gif' ? 'image/gif'
      : ext === 'webp' ? 'image/webp'
        : ext === 'svg' ? 'image/svg+xml'
          : 'image/png';
  return `data:${mime};base64,${content}`;
}

// ── Universal srcdoc builder ──────────────────────────────────────
function buildSrcdoc(artifact: Artifact): string {
  let lang = (artifact.language ?? '').toLowerCase();
  const content = artifact.content ?? '';

  // ── Auto-detect React/JSX written with wrong fence tag ──────
  // AI often writes React code with ```javascript instead of ```jsx
  // Detect: has JSX element syntax AND React import/hooks → promote to jsx
  if (['javascript', 'js', 'typescript', 'ts'].includes(lang)) {
    const hasJSXTags = /<[A-Z][A-Za-z0-9]*[\s\/>]|<\/[A-Za-z][A-Za-z0-9]*>/.test(content);
    const hasReact = /import\s+.*[Rr]eact|from\s+['"]react['"]|useState|useEffect|useRef|React\./.test(content);
    const hasReturnJSX = /return\s*\(\s*<|=>\s*</.test(content);
    if ((hasJSXTags && hasReact) || hasReturnJSX) {
      lang = (lang === 'typescript' || lang === 'ts') ? 'tsx' : 'jsx';
    }
  }

  const base = `<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#0b0f1a;color:#e4e8f0;min-height:100vh}.sx-err{color:#f87171;background:rgba(248,113,113,.08);padding:14px;border-radius:8px;border:1px solid rgba(248,113,113,.25);font-family:monospace;font-size:13px;white-space:pre-wrap;margin:12px}.sx-out{font-family:'Fira Code',monospace;font-size:13px;line-height:1.6;padding:16px;white-space:pre-wrap;word-break:break-word}.sx-label{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(16,185,129,.7);padding:12px 16px 4px;font-family:monospace}pre{margin:0}</style>`;

  // HTML direct — inject a compatibility patch for common AI-generated issues:
  // 1. Lucide deprecated icon names (twitter→x, etc.)
  // 2. Suppress CDN production warnings
  if (lang === 'html' || content.trimStart().toLowerCase().startsWith('<!doctype html') || content.trimStart().toLowerCase().startsWith('<html')) {
    const lucidePatch = `<script>
// Patch deprecated lucide icon names the AI commonly uses
document.addEventListener('DOMContentLoaded',()=>{
  const aliases={'twitter':'x','github':'github','linkedin':'linkedin','facebook':'facebook','instagram':'instagram','youtube':'youtube','mail':'mail','home':'house','search':'search'};
  const deprecated={'twitter':'x'};
  document.querySelectorAll('[data-lucide]').forEach(el=>{
    const name=el.getAttribute('data-lucide');
    if(deprecated[name])el.setAttribute('data-lucide',deprecated[name]);
  });
});
// Suppress CDN warnings from inside preview
const _cw=console.warn;console.warn=(...a)=>{if(typeof a[0]==='string'&&a[0].includes('cdn.tailwindcss.com'))return;_cw(...a);};
</script>`;
    // Inject before </head> if present, otherwise prepend
    if (content.includes('</head>')) return content.replace('</head>', lucidePatch + '</head>');
    return lucidePatch + content;
  }

  // SVG
  if (lang === 'svg' || content.trimStart().startsWith('<svg')) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${base}<style>body{display:flex;align-items:center;justify-content:center;padding:20px;background:#fff;min-height:100vh}</style></head><body>${content}</body></html>`;
  }

  // JSX/TSX — Babel (FIXED: was crashing all React previews due to duplicate const Root=)
  if (lang === 'jsx' || lang === 'tsx') {
    // Strip TypeScript-only constructs and import/export for browser execution
    const clean = content
      .replace(/^export\s+default\s+(\w+)\s*;?\s*$/gm, '/* exported: $1 */')
      .replace(/^export\s+default\s+/gm, '')
      .replace(/^export\s+(const|let|var|function|class)\s+/gm, '$1 ')
      .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
      .replace(/^import\s+type\s+.*$/gm, '')
      .replace(/^import\s+.*from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
      .replace(/^import\s+['"][^'"]+['"]\s*;?\s*$/gm, '');

    // Component name extractor — runs AFTER babel transpiles the clean code
    // CRITICAL FIX: The old code had `${clean}const Root=const _names=` which is
    // a JavaScript syntax error causing every React preview to silently crash.
    // Fix: use a separate script tag for the root-finder so it runs after Babel.
    const rootFinderScript = `
const _pref=['App','Component','Dashboard','Page','Main','Home','Index','Root',
  'Portfolio','Landing','Layout','Screen','View','Widget','Hero','Profile','Showcase',
  'Form','Modal','Card','Table','List','Grid','Chart','Map','Player','Editor'];
const _names=Object.keys(window).filter(n=>/^[A-Z]/.test(n)&&typeof window[n]==='function'&&window[n].toString().includes('return'));
const _Root=_pref.map(n=>window[n]).find(Boolean)||(_names.length?window[_names[0]]:null);
if(_Root){
  try{ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(_Root));}
  catch(e){document.getElementById('root').innerHTML='<div class="sx-err">Render error: '+e.message+'</div>';}
}else{
  document.getElementById('root').innerHTML='<div class="sx-err" style="padding:20px"><strong>No component found to render.</strong><br/><br/>Sedrex looked for: App, Component, Dashboard, Page, Layout, and more.<br/><br/>Make sure your component function starts with a capital letter.</div>';
}`;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<base target="_blank"/>
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script>
// Safe localStorage shim for sandboxed iframes
try{localStorage.setItem('_sx','1');localStorage.removeItem('_sx');}
catch(e){Object.defineProperty(window,'localStorage',{value:{_d:{},setItem(k,v){this._d[k]=v},getItem(k){return this._d[k]??null},removeItem(k){delete this._d[k]},clear(){this._d={}}}});}
</script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<script>
// Suppress CDN-only warnings that pollute the host DevTools console
const _cw=console.warn;console.warn=(...a)=>{if(typeof a[0]==='string'&&(a[0].includes('cdn.tailwindcss.com')||a[0].includes('should not be used in production')))return;_cw(...a);};
</script>
${base}
<style>
body{padding:16px}
.sx-loading{display:flex;align-items:center;justify-content:center;height:60px;color:rgba(16,185,129,.7);font-family:monospace;font-size:13px;gap:8px}
</style>
</head>
<body>
<div id="root"><div class="sx-loading">⚡ Rendering component…</div></div>
<script>
// Global error handler — shows friendly error instead of blank screen
window.onerror=function(msg,src,line,col,err){
  document.getElementById('root').innerHTML=
    '<div class="sx-err"><strong>Runtime Error</strong><br/>'+msg+
    (err&&err.stack?'<br/><br/><small style="opacity:.6">'+err.stack.split('\\n').slice(0,3).join('<br/>')+'</small>':'')+'</div>';
  return true;
};
window.addEventListener('unhandledrejection',function(e){
  document.getElementById('root').innerHTML=
    '<div class="sx-err"><strong>Promise Rejected</strong><br/>'+(e.reason?.message||String(e.reason))+'</div>';
});
</script>
<script type="text/babel" data-presets="react,typescript">
try {
  // React hooks destructuring — available globally
  const {
    useState, useEffect, useRef, useCallback, useMemo,
    useReducer, useContext, createContext, Fragment, memo,
    forwardRef, useImperativeHandle, useLayoutEffect,
    useDebugValue, useId, useTransition, useDeferredValue,
  } = React;

  // User code (imports removed, exports flattened)
  ${clean}

} catch(compileErr) {
  document.getElementById('root').innerHTML=
    '<div class="sx-err"><strong>Compile Error</strong><br/>'+compileErr.message+'</div>';
}
</script>
<script>
// Root component finder — runs AFTER Babel compiles the component
// IMPORTANT: This is separate from the Babel script to avoid the
// "const Root=const _names=" syntax error that was crashing all previews
${rootFinderScript}
</script>
</body>
</html>`;
  }

  // JavaScript / TypeScript — console output sandbox
  if (['javascript', 'js', 'typescript', 'ts'].includes(lang)) {
    const isTS = lang === 'typescript' || lang === 'ts';
    // Strip TypeScript-only syntax for browser eval
    const jsCode = isTS
      ? content
          .replace(/^import\s+type\s+.*$/gm, '')
          .replace(/^import\s+.*from\s+['"][^'"]+['"]\s*;?$/gm, '')
          .replace(/^export\s+default\s+/gm, 'window._defaultExport = ')
          .replace(/^export\s+/gm, '')
          .replace(/:\s*(string|number|boolean|void|any|unknown|never|object|null|undefined|bigint)(\[\]|\s*\|\s*null|\s*\|\s*undefined)*/g, '')
          .replace(/^(interface|type)\s+\w[^{]*\{[\s\S]*?\n\}/gm, '')
          .replace(/<[A-Z][A-Za-z0-9]*(?:\s*,\s*[A-Z][A-Za-z0-9]*)*>/g, '')
          .replace(/as\s+\w[\w.<>|&\[\]]*(?=[\s;,)\]])/g, '')
      : content
          .replace(/^import\s+.*from\s+['"][^'"]+['"]\s*;?$/gm, '')
          .replace(/^export\s+default\s+/gm, 'window._defaultExport = ')
          .replace(/^export\s+/gm, '');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${base}</head><body><div class="sx-label">${lang === 'typescript' || lang === 'ts' ? 'TypeScript' : 'JavaScript'} Output</div><div class="sx-out" id="out"></div><script>const _out=document.getElementById('out');const _w=(type,...a)=>{const d=document.createElement('div');d.style.color=type==='error'?'#f87171':type==='warn'?'#fbbf24':'#e4e8f0';d.textContent=a.map(x=>typeof x==='object'?JSON.stringify(x,null,2):String(x)).join(' ');_out.appendChild(d);};const console={log:(...a)=>_w('log',...a),error:(...a)=>_w('error',...a),warn:(...a)=>_w('warn',...a),info:(...a)=>_w('log',...a),table:(d)=>_w('log',JSON.stringify(d,null,2)),dir:(d)=>_w('log',JSON.stringify(d,null,2))};window.onerror=function(m,s,l,c,e){_w('error','Error: '+m+(e&&e.stack?'\\n'+e.stack.split('\\n').slice(0,3).join('\\n'):''));return true;};try{${jsCode}}catch(e){_w('error',e.message+(e.stack?'\\n'+e.stack.split('\\n').slice(0,4).join('\\n'):''));}if(!_out.children.length){const d=document.createElement('div');d.style.color='rgba(255,255,255,.3)';d.style.fontStyle='italic';d.textContent='No console output';_out.appendChild(d);}</script></body></html>`;
  }

  // Python — Pyodide
  if (lang === 'python' || lang === 'py') {
    const indented = content.split('\n').map((l: string) => '    ' + l).join('\n');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${base}<script src="https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js"></script></head><body><div class="sx-label">Python Output</div><div class="sx-out" id="out"><span style="color:rgba(16,185,129,.7)">Loading Python runtime (first run ~5s)…</span></div><script>(async()=>{const out=document.getElementById('out');try{const pyodide=await loadPyodide();pyodide.globals.set('__captured__',[]);await pyodide.runPythonAsync(\`import sys,io\nclass _Cap(io.StringIO):\n    def write(self,s):\n        __captured__.append(s)\n        return len(s)\nsys.stdout=_Cap();sys.stderr=_Cap()\ntry:\n${indented}\nexcept Exception as e:\n    import traceback\n    __captured__.append(traceback.format_exc())\`);const lines=pyodide.globals.get('__captured__').toJs();const result=lines.join('');out.innerHTML='';if(result.trim()){result.split('\\n').forEach(line=>{const d=document.createElement('div');d.style.color=line.startsWith('Error')||line.startsWith('Traceback')||line.includes('Error:')?'#f87171':'#e4e8f0';d.textContent=line;out.appendChild(d);});}else{out.innerHTML='<span style="color:rgba(255,255,255,.3);font-style:italic">No output</span>';}}catch(e){out.innerHTML='<div class="sx-err">'+e.message+'</div>';}})();</script></body></html>`;
  }

  // CSS live preview
  if (lang === 'css' || lang === 'scss') {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#fff;color:#111;padding:20px;line-height:1.5}</style><style>${content}</style></head><body><h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3><p>Paragraph with <a href="#">a link</a>, <strong>bold</strong>, <em>italic</em>.</p><button class="btn" type="button">Button</button><button class="btn btn-primary" type="button">Primary</button><ul><li>List item one</li><li>List item two</li><li>List item three</li></ul><div class="card"><div class="card-header">Card Header</div><div class="card-body">Card body content.</div></div><input class="input form-control" type="text" placeholder="Input field" style="margin:8px 0;display:block"/><div class="alert alert-success" style="margin-top:8px">Success alert</div><div class="alert alert-danger alert-error" style="margin-top:4px">Error alert</div><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><span class="badge badge-primary">Badge</span><span class="tag">Tag</span><span class="chip">Chip</span></div><table class="table" style="margin-top:12px;width:100%"><thead><tr><th>Name</th><th>Role</th><th>Status</th></tr></thead><tbody><tr><td>Alice</td><td>Admin</td><td>Active</td></tr><tr><td>Bob</td><td>User</td><td>Inactive</td></tr></tbody></table></body></html>`;
  }

  // JSON tree
  if (lang === 'json') {
    const js = JSON.stringify(content);
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${base}<style>body{padding:16px}.jv{font-family:'Fira Code',monospace;font-size:13px;line-height:1.7}.jk{color:#818cf8}.jn{color:#79c0ff}.js{color:#98c379}.jb{color:#f472b6}details>summary{cursor:pointer;list-style:none;outline:none;user-select:none}details>summary::-webkit-details-marker{display:none}</style></head><body><div class="jv" id="root"></div><script>function r(v,d=0){if(v===null)return '<span class="jb">null</span>';if(typeof v==='boolean')return '<span class="jb">'+v+'</span>';if(typeof v==='number')return '<span class="jn">'+v+'</span>';if(typeof v==='string')return '<span class="js">"'+v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')+'</span>';if(Array.isArray(v)){if(!v.length)return '<span style="color:#94a3b8">[]</span>';return '<details open><summary><span style="color:#94a3b8">[ '+v.length+' items ]</span></summary>'+v.map((x,i)=>'<div style="padding-left:18px">'+r(x,d+1)+(i<v.length-1?',':'')+'</div>').join('')+'</details>';}if(typeof v==='object'){const ks=Object.keys(v);if(!ks.length)return '<span style="color:#94a3b8">{}</span>';return '<details open><summary><span style="color:#94a3b8">{ '+ks.length+' keys }</span></summary>'+ks.map((k,i)=>'<div style="padding-left:18px"><span class="jk">"'+k+'"</span>: '+r(v[k],d+1)+(i<ks.length-1?',':'')+'</div>').join('')+'</details>';}return String(v);}try{document.getElementById('root').innerHTML=r(JSON.parse(${js}));}catch(e){document.getElementById('root').innerHTML='<div class="sx-err">JSON Parse Error: '+e.message+'</div>';}</script></body></html>`;
  }

  // Markdown
  if (lang === 'markdown' || lang === 'md') {
    const ms = JSON.stringify(content);
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown-dark.min.css"><style>body{background:#0b0f1a;padding:24px;max-width:800px;margin:0 auto}.markdown-body{background:transparent;color:#e4e8f0;font-family:system-ui,sans-serif}</style></head><body class="markdown-body"><div id="md"></div><script>document.getElementById('md').innerHTML=marked.parse(${ms});</script></body></html>`;
  }

  // SQL display
  if (lang === 'sql') {
    const ss = JSON.stringify(content);
    const kk = JSON.stringify(['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'ON', 'GROUP', 'ORDER', 'BY', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW', 'WITH', 'AS', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'ILIKE', 'BETWEEN', 'IS', 'NULL', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'BEGIN', 'COMMIT', 'ROLLBACK', 'RETURNING', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'DEFAULT', 'CONSTRAINT', 'IF', 'EXISTS']);
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${base}<style>body{padding:16px}.note{color:rgba(16,185,129,.7);font-size:11px;margin-bottom:10px;font-family:monospace}pre{background:#0d1117;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:20px;font-family:'Fira Code',monospace;font-size:13px;line-height:1.65;overflow:auto;color:#e4e8f0}.kw{color:#c9a84c;font-weight:700}.str{color:#98c379}.cmt{color:#6b7280;font-style:italic}.num{color:#79c0ff}</style></head><body><div class="note">📝 SQL — syntax display only (no database connection)</div><pre id="sql"></pre><script>const sql=${ss};const kws=${kk};let h=sql.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');h=h.replace(/'[^']*'/g,m=>'<span class="str">'+m+'</span>');h=h.replace(/--[^\\n]*/g,m=>'<span class="cmt">'+m+'</span>');h=h.replace(/\\b(\\d+(\\.\\d+)?)\\b/g,'<span class="num">$1</span>');const re=new RegExp('\\\\b('+kws.join('|')+')\\\\b','gi');h=h.replace(re,m=>'<span class="kw">'+m.toUpperCase()+'</span>');document.getElementById('sql').innerHTML=h;</script></body></html>`;
  }

  // Bash/Shell
  if (lang === 'bash' || lang === 'sh' || lang === 'shell') {
    const ls = JSON.stringify(content.split('\n'));
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${base}<style>body{padding:0;background:#0d1117}.terminal{background:#0d1117;border:1px solid rgba(255,255,255,.08);border-radius:8px;margin:16px;overflow:hidden}.term-bar{background:#1c1c1c;padding:10px 16px;display:flex;gap:6px;align-items:center}.dot{width:12px;height:12px;border-radius:50%}.term-body{padding:16px;font-family:'Fira Code',monospace;font-size:13px;line-height:1.7}.prompt{color:#c9a84c}.cmd{color:#e4e8f0}.cmt{color:#6b7280;font-style:italic}.note{color:rgba(255,255,255,.3);font-size:11px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06)}</style></head><body><div class="terminal"><div class="term-bar"><div class="dot" style="background:#ef4444"></div><div class="dot" style="background:#f59e0b"></div><div class="dot" style="background:#c9a84c"></div></div><div class="term-body" id="out"></div></div><script>const lines=${ls};const out=document.getElementById('out');lines.forEach(line=>{const d=document.createElement('div');if(!line.trim()){d.innerHTML='&nbsp;';out.appendChild(d);return;}if(line.trim().startsWith('#')){d.innerHTML='<span class="cmt">'+line.replace(/</g,'&lt;')+'</span>';}else{d.innerHTML='<span class="prompt">$ </span><span class="cmd">'+line.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</span>';}out.appendChild(d);});const n=document.createElement('div');n.className='note';n.textContent='Shell preview is read-only. Run in your terminal to execute.';out.appendChild(n);</script></body></html>`;
  }

  // Generic fallback — all other languages (Go, Rust, Java, C, C++, Ruby, PHP, Swift, etc.)
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${base}<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css"><script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script><style>body{padding:16px;background:#0b0f1a}pre{margin:0;border-radius:8px;overflow:auto;background:#0d1117!important}pre code.hljs{padding:20px;font-size:13px;line-height:1.65;border-radius:8px}.badge{display:inline-block;background:rgba(16,185,129,.1);color:#c9a84c;font-family:monospace;font-size:10px;padding:2px 8px;border-radius:4px;margin-bottom:10px;text-transform:uppercase;font-weight:700}</style></head><body><div class="badge">${escapeHtml(lang || 'code')}</div><pre><code class="language-${escapeHtml(lang || 'plaintext')}">${escapeHtml(content)}</code></pre><script>hljs.highlightAll();</script></body></html>`;
}

// ── Diagram Viewer ────────────────────────────────────────────────
// FIX: Loads mermaid content if empty before rendering
const DiagramViewer = memo(({ artifact }: { artifact: Artifact }) => {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [fullContent, setFullContent] = useState(artifact.content ?? '');
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    const c = artifact.content ?? '';
    if (c.trim() === '') {
      setFetching(true);
      loadArtifactContent(artifact.id).then(fetched => {
        setFullContent(fetched);
        setFetching(false);
      }).catch(() => setFetching(false));
    } else {
      setFullContent(c);
    }
  }, [artifact.id, artifact.content]);

  useEffect(() => {
    if (fetching || !fullContent.trim()) return;
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          maxTextSize: 500000,
          flowchart: {
            htmlLabels: true,
            useMaxWidth: true,
            rankSpacing: 50,
            nodeSpacing: 30,
          },
          maxEdges: 500,
        });
        const id = 'ap-' + Math.random().toString(36).slice(2, 9);
        const sanitized = fullContent
          .split('\n')
          .filter((line: string) => !line.trim().startsWith('//') && !line.trim().startsWith('#'))
          .join('\n')
          .replace(/^[\w./\-]+\.mmd\s*\n/m, '')
          .trim();
        const { svg: rendered } = await mermaid.render(id, sanitized);
        if (!cancelled) setSvg(rendered);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Invalid diagram syntax');
      }
    })();
    return () => { cancelled = true; };
  }, [fullContent, fetching]);

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(fullContent); } catch { }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="ap-code-viewer">
      <div className="ap-code-toolbar">
        <div className="ap-code-meta">
          <span className="ap-code-icon">🔷</span>
          <span className="ap-code-lang">Mermaid Diagram</span>
          <span className="ap-code-lines">{artifact.lineCount} lines</span>
        </div>
        <div className="ap-code-actions">
          {svg && <button className="ap-action-btn" onClick={() => downloadFile(svg, `${artifact.title}.svg`, 'image/svg+xml')}><Icons.Download className="icon-12" /><span>SVG</span></button>}
          <button className="ap-action-btn" onClick={() => downloadFile(fullContent, `${artifact.title}.mmd`, 'text/plain')}><Icons.Download className="icon-12" /><span>Source</span></button>
          <button className={`ap-action-btn${copied ? ' ap-action-btn--success' : ''}`} onClick={handleCopy}>{copied ? <Icons.Check className="icon-12" /> : <Icons.Copy className="icon-12" />}<span>{copied ? 'Copied!' : 'Copy'}</span></button>
        </div>
      </div>
      {error ? (
        <div style={{ padding: 20 }}><div style={{ color: '#f87171', marginBottom: 12, fontSize: 13 }}>⚠ {error}</div><pre style={{ fontSize: 11, opacity: 0.6, overflowX: 'auto', color: 'var(--text-secondary)' }}>{fullContent}</pre></div>
      ) : svg ? (
        <div className="ap-code-scroll" style={{ padding: 20, display: 'flex', justifyContent: 'center' }}><div dangerouslySetInnerHTML={{ __html: svg }} style={{ maxWidth: '100%' }} /></div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="ap-spinner" /></div>
      )}
    </div>
  );
});

// ── Code Viewer ───────────────────────────────────────────────────
// FIX: Detects empty content (metadataOnly) and fetches before highlighting
const CodeViewer = memo(({ artifact }: { artifact: Artifact }) => {
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState('');
  const [fullContent, setFullContent] = useState(artifact.content ?? '');
  const [fetching, setFetching] = useState(false);

  // Fetch content if empty
  useEffect(() => {
    const c = artifact.content ?? '';
    if (c.trim() === '') {
      setFetching(true);
      loadArtifactContent(artifact.id).then(fetched => {
        setFullContent(fetched);
        setFetching(false);
      }).catch(() => { setFetching(false); });
    } else {
      setFullContent(c);
    }
  }, [artifact.id, artifact.content]);

  useEffect(() => {
    if (fetching) return;
    let cancelled = false;
    (async () => {
      try {
        const hljs = (await import('highlight.js')).default;
        const lang = (artifact.language ?? '').toLowerCase();
        const res = lang && hljs.getLanguage(lang) ? hljs.highlight(fullContent, { language: lang, ignoreIllegals: true }).value : hljs.highlightAuto(fullContent).value;
        if (!cancelled) setHighlighted(res);
      } catch { if (!cancelled) setHighlighted(escapeHtml(fullContent)); }
    })();
    return () => { cancelled = true; };
  }, [fullContent, fetching, artifact.language]);

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(fullContent); }
    catch { const ta = document.createElement('textarea'); ta.value = fullContent; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [fullContent]);

  const handleDownload = useCallback(() => {
    const lang = (artifact.language ?? '').toLowerCase();
    const ext = EXT_MAP[lang] || lang || 'txt';
    const mime = MIME_MAP[lang] || 'text/plain';
    const filename = artifact.filePath ? artifact.filePath.split('/').pop()! : `${artifact.title.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
    downloadFile(artifact.content, filename, mime);
  }, [artifact]);

  return (
    <div className="ap-code-viewer">
      <div className="ap-code-toolbar">
        <div className="ap-code-meta">
          <span className="ap-code-icon">{fileIcon(artifact.language)}</span>
          <span className="ap-code-lang">{langLabel(artifact.language)}</span>
          {artifact.filePath && <span className="ap-code-path">{artifact.filePath}</span>}
          <span className="ap-code-lines">{artifact.lineCount} lines</span>
        </div>
        <div className="ap-code-actions">
          <button className="ap-action-btn" onClick={handleDownload}><Icons.Download className="icon-12" /><span>Download</span></button>
          <button className={`ap-action-btn${copied ? ' ap-action-btn--success' : ''}`} onClick={handleCopy}>{copied ? <Icons.Check className="icon-12" /> : <Icons.Copy className="icon-12" />}<span>{copied ? 'Copied!' : 'Copy'}</span></button>
        </div>
      </div>
      {fetching ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
          <div className="ap-spinner" />
        </div>
      ) : (
        <div className="ap-code-scroll"><pre className="ap-code-pre"><code className={`hljs language-${artifact.language}`} dangerouslySetInnerHTML={{ __html: highlighted || escapeHtml(fullContent) }} /></pre></div>
      )}
    </div>
  );
});

// ── Preview Pane — universal, always renders ──────────────────────
// FIX: Detects empty content (metadataOnly load) and fetches full
// content before rendering. Shows spinner during fetch.

// ── Lucide icon name fixer ────────────────────────────────────────
// Some icon names changed between lucide versions. Fix known renames
// and pin unpkg to a stable version to avoid future breakage.
function fixLucideIcons(html: string): string {
  return html
    .replace(/data-lucide="twitter"/g,  'data-lucide="x"')
    .replace(/data-lucide="github"/g,   'data-lucide="code-2"')
    .replace(/data-lucide="linkedin"/g, 'data-lucide="briefcase"')
    .replace(/https:\/\/unpkg\.com\/lucide@latest/g, 'https://unpkg.com/lucide@0.263.1');
}

// ── CDN script cache — fetched in parent, injected inline ────────
// Brave browser blocks CDN scripts inside srcdoc iframes.
// Fetch in parent page context (allowed), then inject as inline text.
const _scriptCache = new Map<string, string>();
async function fetchScript(url: string): Promise<string> {
  if (_scriptCache.has(url)) return _scriptCache.get(url)!;
  try {
    const res = await fetch(url);
    const text = res.ok ? await res.text() : '';
    if (text) _scriptCache.set(url, text);
    return text;
  } catch { return ''; }
}
const CDN = {
  react: 'https://unpkg.com/react@18/umd/react.development.js',
  reactDom: 'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
  babel: 'https://unpkg.com/@babel/standalone/babel.min.js',
  tailwind: 'https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css',
};

function buildSrcdocInline(
  artifact: Artifact,
  reactTxt: string, reactDomTxt: string, babelTxt: string, tailwindTxt: string,
): string {
  let lang = (artifact.language ?? '').toLowerCase();
  const raw = artifact.content ?? '';

  if (['javascript', 'js', 'typescript', 'ts'].includes(lang)) {
    const hasJSX = /<[A-Z][A-Za-z0-9]*[\s\/>]|<\/[A-Za-z][A-Za-z0-9]*>/.test(raw);
    const hasReact = /import\s+.*[Rr]eact|from\s+['"]react['"]|useState|useEffect|useRef/.test(raw);
    const hasReturnJSX = /return\s*\(\s*<|=>\s*<[A-Z]/.test(raw);
    if ((hasJSX && hasReact) || hasReturnJSX) lang = lang === 'typescript' || lang === 'ts' ? 'tsx' : 'jsx';
  }

  const clean = raw
    .replace(/^export\s+default\s+(\w+)\s*;?\s*$/gm, '/* $1 */')
    .replace(/^export\s+default\s+/gm, '')
    .replace(/^export\s+(const|let|var|function|class)\s+/gm, '$1 ')
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    .replace(/^import\s+type\s+.*$/gm, '')
    .replace(/^import\s+.*from\s+['"'][^'"]+['"']\s*;?\s*$/gm, '')
    .replace(/^import\s+['"'][^'"]+['"']\s*;?\s*$/gm, '');

  const base = `<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#0b0f1a;color:#e4e8f0;min-height:100vh}.sx-err{color:#f87171;background:rgba(248,113,113,.08);padding:14px;border-radius:8px;border:1px solid rgba(248,113,113,.25);font-family:monospace;font-size:13px;white-space:pre-wrap;margin:12px}</style>`;

  const motionStub = `window.motion=new Proxy({},{get:(_,tag)=>React.forwardRef(({children,...p},ref)=>React.createElement(tag||'div',{...p,ref},children))});window.AnimatePresence=({children})=>children;window.useAnimation=()=>({start:()=>{},stop:()=>{}});window.useInView=()=>true;window.useScroll=()=>({scrollY:{get:()=>0}});window.useSpring=v=>v;window.useTransform=v=>v;`;

  const localStorageShim = `try{localStorage.setItem('sx','1');localStorage.removeItem('sx');}catch(e){Object.defineProperty(window,'localStorage',{value:{_d:{},setItem(k,v){this._d[k]=v},getItem(k){return this._d[k]??null},removeItem(k){delete this._d[k]},clear(){this._d={}}}});}`;

  const rootDetect = `const _names=Object.keys(window).filter(n=>/^[A-Z]/.test(n)&&typeof window[n]==='function'&&window[n].toString().includes('return'));const _pref=['App','Component','Dashboard','Page','Main','Home','Index','Root','Portfolio','Landing','Layout','Screen','View','Widget','Hero','Profile','Showcase'];const _Root=_pref.map(n=>window[n]).find(Boolean)||(_names.length?window[_names[0]]:null);if(_Root){ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(_Root));}else{document.getElementById('root').innerHTML='<div class="sx-err">No component found. Make sure your component function name starts with a capital letter.</div>';}`;

  const hooks = `const {useState,useEffect,useRef,useCallback,useMemo,useReducer,useContext,createContext,Fragment,memo}=React;`;

  const sc = (txt: string) => `<script>${txt}<\/script>`;
  const head = [
    '<!DOCTYPE html><html><head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<base target="_blank"/>',
    reactTxt ? sc(reactTxt) : '<script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>',
    reactDomTxt ? sc(reactDomTxt) : '<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>',
    babelTxt ? sc(babelTxt) : '<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>',
    tailwindTxt ? `<style>${tailwindTxt}<\/style>` : '',
    sc(localStorageShim + motionStub),
    base,
    '<style>body{padding:16px}<\/style>',
    '<\/head><body><div id="root"><\/div>',
  ].join('');
  const errHandler = `<script>window.onerror=function(m){document.body.innerHTML='<div class=\"sx-err\">'+m+'<\/div>';};<\/script>`;
  const babelScript = `<script type="text/babel">try{${hooks}${clean}${rootDetect}}catch(e){document.body.innerHTML='<div class=\"sx-err\">'+e.message+'<\/div>';}<\/script>`;
  return head + errHandler + babelScript + '<\/body><\/html>';
}


const PreviewPane = memo(({ artifact }: { artifact: Artifact }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fullContent, setFullContent] = useState(artifact.content ?? '');
  const lang = (artifact.language ?? '').toLowerCase();

  // When artifact changes, reset and check if we need to fetch content
  useEffect(() => {
    setLoaded(false);
    setErrMsg('');
    const c = artifact.content ?? '';
    if (c.trim() === '') {
      // Content not loaded yet — fetch it from DB
      setFetching(true);
      loadArtifactContent(artifact.id).then(fetched => {
        setFullContent(fetched);
        setFetching(false);
      }).catch(() => {
        setFetching(false);
        setFullContent('');
      });
    } else {
      setFullContent(c);
    }
  }, [artifact.id, artifact.content]);

  // Set srcdoc once we have content — async for React to bypass CDN blocking
  useEffect(() => {
    if (fetching || fullContent.trim() === '') return;
    const lang = (artifact.language ?? '').toLowerCase();
    const isReact = ['jsx', 'tsx'].includes(lang) ||
      (['javascript', 'js', 'typescript', 'ts'].includes(lang) &&
        /import.*[Rr]eact|from\s+['"]react['"]|useState|useEffect/.test(fullContent) &&
        /<[A-Z][A-Za-z0-9]*[\s\/>]|return\s*\(\s*</.test(fullContent));
    setLoaded(false);
    if (isReact) {
      (async () => {
        try {
          const [rTxt, rdTxt, bTxt, twTxt] = await Promise.all([
            fetchScript(CDN.react), fetchScript(CDN.reactDom),
            fetchScript(CDN.babel), fetchScript(CDN.tailwind),
          ]);
          if (iframeRef.current)
            iframeRef.current.srcdoc = fixLucideIcons(buildSrcdocInline(
              { ...artifact, content: fullContent }, rTxt, rdTxt, bTxt, twTxt
            ));
        } catch (e: any) { setErrMsg(e.message || 'Preview failed'); }
      })();
    } else {
      try {
        if (iframeRef.current)
          iframeRef.current.srcdoc = fixLucideIcons(buildSrcdoc({ ...artifact, content: fullContent }));
      } catch (e: any) { setErrMsg(e.message || 'Preview failed'); }
    }
  }, [fullContent, fetching, artifact.language, artifact.type]);

  if (errMsg) return <div style={{ padding: 20, color: '#f87171', fontFamily: 'monospace', fontSize: 13 }}>Preview error: {errMsg}</div>;

  const isLoading = fetching || (!loaded && fullContent.trim() !== '');
  const isEmpty = !fetching && fullContent.trim() === '';

  return (
    <div className="ap-preview-container" style={{ flex: 1, overflow: 'hidden', height: '100%', minHeight: 0 }}>
      {(fetching || !loaded) && (
        <div className="ap-preview-loading">
          <div className="ap-spinner" />
          <span>
            {fetching ? 'Loading content…'
              : lang === 'python' || lang === 'py' ? 'Loading Python runtime…'
                : 'Rendering…'}
          </span>
        </div>
      )}
      {isEmpty && !fetching && (
        <div className="ap-preview-loading">
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No content available</span>
        </div>
      )}
      <iframe
        key={artifact.id}
        ref={iframeRef}
        className={`ap-preview-iframe${loaded ? ' ap-preview-iframe--visible' : ''}`}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-pointer-lock"
        title={artifact.title}
        onLoad={() => setTimeout(() => setLoaded(true), 50)}
        onError={() => setErrMsg('Failed to load preview')}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block', backgroundColor: '#0a0a0f' }} />
    </div>
  );
});

// ── Image Viewer ──────────────────────────────────────────────────
// FIX: Loads image content if empty (metadataOnly initial load)
const ImageViewer = memo(({ artifact }: { artifact: Artifact }) => {
  const [imgContent, setImgContent] = useState(artifact.content ?? '');
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    const c = artifact.content ?? '';
    if (c.trim() === '') {
      setFetching(true);
      loadArtifactContent(artifact.id).then(fetched => {
        setImgContent(fetched);
        setFetching(false);
      }).catch(() => setFetching(false));
    } else {
      setImgContent(c);
    }
  }, [artifact.id, artifact.content]);

  const src = getImageSrc(imgContent, artifact.title);
  return (
    <div className="ap-code-viewer" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="ap-code-toolbar">
        <div className="ap-code-meta"><span className="ap-code-icon">🖼️</span><span className="ap-code-lang">Generated Image</span></div>
        <div className="ap-code-actions"><button className="ap-action-btn" onClick={() => { const a = document.createElement('a'); a.href = src; a.download = artifact.title || 'image.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); }}><Icons.Download className="icon-12" /><span>Download</span></button></div>
      </div>
      <div className="ap-code-scroll" style={{ padding: 20, display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, background: '#000' }}>
        {fetching ? (
          <div className="ap-spinner" />
        ) : src ? (
          <img src={src} alt={artifact.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }} />
        ) : (
          <div style={{ color: '#6b7280', fontSize: 13 }}>Image data unavailable</div>
        )}
      </div>
    </div>
  );
});

// ── History Pane ──────────────────────────────────────────────────
const HistoryPane = memo(({ artifacts, diagrams, images, activeId, onSelect, onDelete }: { artifacts: Artifact[]; diagrams: Artifact[]; images: Artifact[]; activeId: string | null; onSelect: (id: string) => void; onDelete: (id: string) => void; }) => {
  const all = [...artifacts, ...diagrams, ...images];
  if (all.length === 0) return <div className="ap-history-empty"><div className="ap-history-empty-icon">📂</div><p className="ap-history-empty-title">No artifacts yet</p><p className="ap-history-empty-sub">Code files over 20 lines appear here instead of in the chat bubble.</p></div>;

  const renderSection = (items: Artifact[], label: string) => {
    if (!items.length) return null;
    return (<>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-secondary)', padding: '8px 12px 4px', opacity: 0.7 }}>{label}</div>
      {items.map(a => (
        <div key={a.id} className={`ap-history-item${a.id === activeId ? ' ap-history-item--active' : ''}`} onClick={() => onSelect(a.id)}>
          <span className="ap-history-item-icon">{fileIcon(a.language)}</span>
          <div className="ap-history-item-info"><div className="ap-history-item-title">{a.title}</div><div className="ap-history-item-meta">{langLabel(a.language)} · {a.lineCount} lines</div></div>
          <button className="ap-history-item-delete" onClick={e => { e.stopPropagation(); onDelete(a.id); }} title="Delete"><svg viewBox="0 0 16 16" style={{ width: 12, height: 12 }} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l12 12M14 2L2 14" /></svg></button>
        </div>
      ))}
    </>);
  };

  return <div className="ap-history-list">{renderSection(artifacts, 'Code Artifacts')}{renderSection(diagrams, 'Diagrams')}{renderSection(images, 'Images')}</div>;
});

// ═══════════════════════════════════════════════════════════════════
// MAIN PANEL
// ═══════════════════════════════════════════════════════════════════
interface ArtifactPanelProps { onWidthChange?: (width: number) => void; }

const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ onWidthChange }) => {
  const { artifacts, diagrams, images, activeId, panelOpen, activeArtifact, openArtifact, closePanel } = useArtifacts();
  const [tab, setTab] = useState<PanelTab>('code');
  const [width, setWidth] = useState(480);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const totalCount = artifacts.length + diagrams.length + images.length;

  useEffect(() => { if (activeId) setTab('code'); }, [activeId]);
  useEffect(() => { onWidthChange?.(panelOpen ? width : 0); }, [panelOpen, width, onWidthChange]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && panelOpen) { e.preventDefault(); closePanel(); } };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [panelOpen, closePanel]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: width };
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => { if (!dragRef.current) return; setWidth(Math.max(340, Math.min(800, dragRef.current.startW + dragRef.current.startX - ev.clientX))); };
    const onUp = () => { dragRef.current = null; document.body.style.cursor = ''; document.body.style.userSelect = ''; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
  }, [width]);

  if (!panelOpen) return null;

  const artifact = activeArtifact;
  const isDiagram = artifact ? isDiagramArtifact(artifact) : false;
  const isImage = artifact?.type === 'image';

  return (
    <>
      <div className="ap-resize-handle" onMouseDown={startDrag} title="Drag to resize" />
      <div ref={panelRef} className="ap-root" style={{ width }}>
        <div className="ap-header">
          <div className="ap-header-left">
            {artifact ? (<><span className="ap-header-icon">{fileIcon(artifact.language)}</span><div className="ap-header-info"><span className="ap-header-title">{artifact.title}</span>{artifact.filePath && <span className="ap-header-path">{artifact.filePath}</span>}</div></>) : <span className="ap-header-title">Artifacts</span>}
          </div>
          <div className="ap-header-right">
            <div className="ap-tabs">
              <button className={`ap-tab${tab === 'code' ? ' ap-tab--active' : ''}`} onClick={() => setTab('code')}>
                <svg viewBox="0 0 14 14" style={{ width: 11, height: 11 }} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 3L1 7l3 4M10 3l3 4-3 4M8 1L6 13" /></svg>
                {isDiagram ? 'Diagram' : isImage ? 'Image' : 'Code'}
              </button>
              {!isDiagram && !isImage && (
                <button className={`ap-tab${tab === 'preview' ? ' ap-tab--active' : ''}`} onClick={() => setTab('preview')} title="Live preview">
                  <svg viewBox="0 0 14 14" style={{ width: 11, height: 11 }} fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="7" r="2.5" /><path d="M1 7s2-5 6-5 6 5 6 5-2 5-6 5-6-5-6-5z" /></svg>
                  Preview{artifact && <span className="ap-tab-live">●</span>}
                </button>
              )}
              <button className={`ap-tab${tab === 'history' ? ' ap-tab--active' : ''}`} onClick={() => setTab('history')}>
                <svg viewBox="0 0 14 14" style={{ width: 11, height: 11 }} fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="12" height="12" rx="1.5" /><path d="M4 5h6M4 8h4" /></svg>
                History{totalCount > 0 && <span className="ap-tab-badge">{totalCount}</span>}
              </button>
            </div>
            <button className="ap-close-btn" onClick={closePanel} title="Close (Esc)"><Icons.X className="icon-14" /></button>
          </div>
        </div>
        <div className="ap-content">
          {tab === 'code' && isImage && artifact && <ImageViewer artifact={artifact} />}
          {tab === 'code' && isDiagram && artifact && <DiagramViewer artifact={artifact} />}
          {tab === 'code' && !isDiagram && !isImage && artifact && <CodeViewer artifact={artifact} />}
          {tab === 'code' && !artifact && <div className="ap-empty"><div className="ap-empty-icon">📄</div><p className="ap-empty-title">No artifact selected</p><p className="ap-empty-sub">Pick one from History or ask SEDREX to generate code.</p></div>}
          {tab === 'preview' && artifact && <PreviewPane artifact={artifact} />}
          {tab === 'preview' && !artifact && <div className="ap-empty"><div className="ap-empty-icon">👁️</div><p className="ap-empty-title">No artifact selected</p><p className="ap-empty-sub">Select an artifact to preview it.</p></div>}
          {tab === 'history' && <HistoryPane artifacts={artifacts} diagrams={diagrams} images={images} activeId={activeId} onSelect={id => { openArtifact(id); setTab('code'); }} onDelete={deleteArtifact} />}
        </div>
      </div>
    </>
  );
};

export default ArtifactPanel;