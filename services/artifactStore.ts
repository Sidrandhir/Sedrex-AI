// src/services/artifactStore.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Artifact Store v2.2
//
// SESSION 8 CHANGES:
//   ✅ deriveTitleFromPrompt() moved to MODULE LEVEL — was nested inside
//      extractArtifactFromResponse(), causing it to be redefined on
//      every single call (closure allocation + GC pressure on long sessions).
//      Root cause: inner function can't be memoized or tested independently,
//      and JS engines do NOT optimize repeatedly-defined inner functions.
//   ✅ All Session 7 logic preserved exactly (versioned titles, diff-aware, etc.)
//
// SESSION 7 CHANGES (preserved):
//   ✅ deriveTitleFromPrompt() — versioned titles: "Apple Page v2", "Apple Page v3"
//   ✅ generateVersionedTitle() — scans in-memory store for conflicts, adds suffix
//   ✅ All other logic unchanged
// ══════════════════════════════════════════════════════════════════

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getArtifactsBySessionId, getAllUserArtifactsByUserId, loadImagesWithContent as queryLoadImages } from './queryOptimizer';

export type ArtifactType = 'code' | 'html' | 'document' | 'diagram' | 'image';

export interface Artifact {
  id:         string;
  sessionId:  string;
  userId:     string;
  title:      string;
  language:   string;
  content:    string;
  type:       ArtifactType;
  filePath?:  string;
  lineCount:  number;
  createdAt:  number;
  updatedAt:  number;
}

export interface ArtifactCreateInput {
  sessionId:  string;
  userId:     string;
  title:      string;
  language:   string;
  content:    string;
  type:       ArtifactType;
  filePath?:  string;
}

// ── Module-level singleton ─────────────────────────────────────────
let _artifacts: Artifact[]        = [];
let _diagrams:  Artifact[]        = [];
let _listeners: Array<() => void> = [];
let _activeId:  string | null     = null;
let _panelOpen: boolean           = false;

function notify() { _listeners.forEach(fn => fn()); }

export function subscribeToArtifacts(fn: () => void): () => void {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

export function getArtifacts():      Artifact[]    { return _artifacts;  }
export function getDiagrams():       Artifact[]    { return _diagrams;   }
export function getImages():         Artifact[]    { return [..._artifacts, ..._diagrams].filter(a => a.type === 'image'); }
export function getActiveId():       string | null { return _activeId;   }
export function isPanelOpen():       boolean       { return _panelOpen;  }

export function setActiveArtifact(id: string | null) {
  _activeId  = id;
  _panelOpen = id !== null;
  notify();
}

export function openPanel()  { _panelOpen = true;  notify(); }
export function closePanel() { _panelOpen = false; _activeId = null; notify(); }

export function getActiveArtifact(): Artifact | null {
  if (!_activeId) return null;
  return [..._artifacts, ..._diagrams].find(a => a.id === _activeId) ?? null;
}

// ── Language detection map ─────────────────────────────────────────
const CODE_LANGUAGES: Record<string, string> = {
  typescript: 'TypeScript', ts: 'TypeScript', tsx: 'TypeScript (React)',
  javascript: 'JavaScript', js: 'JavaScript', jsx: 'JavaScript (React)',
  python: 'Python',       py: 'Python',
  rust: 'Rust',           rs: 'Rust',
  go: 'Go',               golang: 'Go',
  java: 'Java',           kotlin: 'Kotlin',   kt: 'Kotlin',
  css: 'CSS',             scss: 'SCSS',        sass: 'Sass',
  html: 'HTML',           xml: 'XML',
  sql: 'SQL',             graphql: 'GraphQL',  gql: 'GraphQL',
  json: 'JSON',           yaml: 'YAML',        yml: 'YAML',   toml: 'TOML',
  bash: 'Bash',           sh: 'Shell',         powershell: 'PowerShell',
  cpp: 'C++',             c: 'C',              csharp: 'C#',  cs: 'C#',
  ruby: 'Ruby',           rb: 'Ruby',          php: 'PHP',    swift: 'Swift',
  markdown: 'Markdown',   md: 'Markdown',
  csv: 'CSV',             text: 'Text',
  r: 'R',                 matlab: 'MATLAB',    julia: 'Julia',
  tailwind: 'Tailwind',   vue: 'Vue',
};

// Shell/terminal languages are never artifacts — they're commands, not files.
// Listing them explicitly prevents large install scripts from opening the
// artifact panel when they happen to exceed MIN_LINES_FOR_ARTIFACT.
const EXCLUDED_LANGUAGES = new Set([
  'mermaid',
  'chart',
  'products',
  'bash', 'sh', 'shell', 'zsh',
  'console', 'terminal', 'cmd', 'fish',
]);

export interface ExtractedArtifact {
  title:            string;
  language:         string;
  content:          string;
  type:             ArtifactType;
  filePath?:        string;
  lineCount:        number;
  reducedResponse?: string;  // optional — not present on individual items in multi-extract
}

// Returned by extractAllArtifactsFromResponse
export interface MultiExtractResult {
  artifacts:       Omit<ExtractedArtifact, 'reducedResponse'>[];
  reducedResponse: string;
}

const MIN_LINES_FOR_ARTIFACT = 20;

// ══════════════════════════════════════════════════════════════════
// SESSION 8: deriveTitleFromPrompt — MODULE LEVEL
//
// ROOT CAUSE OF MOVE: Previously defined as an inner function inside
// extractArtifactFromResponse(). JS engines create a new function
// object on EVERY call to the outer function — one allocation per
// user message that produces a code artifact. On long sessions with
// many code responses, this adds GC pressure and prevents the
// function from being JIT-compiled efficiently.
//
// FIX: Hoisted to module level. Now allocated once. Safe because:
//   - No closure over mutable state (CODE_LANGUAGES is a module const)
//   - Same logic, same return values — zero behavioral change
//   - Can now be unit tested independently
//
// Called by: extractArtifactFromResponse() → generateVersionedTitle()
// ══════════════════════════════════════════════════════════════════

function deriveTitleFromPrompt(prompt: string, lang: string): string {
  const label = CODE_LANGUAGES[lang] ?? lang.toUpperCase();
  if (!prompt) return `${label} File`;
  const cleaned = prompt
    .replace(/^(write|build|create|generate|make|code|give me|show me|now write|now build|implement|develop|design)/i, '')
    .replace(/\b(the|a|an|for|to|with|using|in|on|html|css|code|page|website|site|file|script|component|function|class|style)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned.length < 3) return `${label} File`;
  const titled = cleaned.split(' ')
    .filter(w => w.length > 0)
    .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .slice(0, 32)
    .trim();
  return titled || `${label} File`;
}

// ══════════════════════════════════════════════════════════════════
// SESSION 7: TITLE VERSIONING
//
// Problem: User asks "write a landing page", then "rewrite it cleaner".
// Both produce an artifact titled "Landing Page". renderWithArtifacts
// uses title as the key → always finds the first artifact → wrong one.
//
// Fix: before creating a new artifact, scan _artifacts for matching
// base title. If found, append " v2", " v3", etc.
// ══════════════════════════════════════════════════════════════════

function generateVersionedTitle(baseTitle: string): string {
  const all = [..._artifacts, ..._diagrams];
  const existing = all.filter(a => {
    const stripped = a.title.replace(/\sv\d+$/, '');
    return stripped === baseTitle || a.title === baseTitle;
  });

  if (existing.length === 0) return baseTitle;

  let maxVersion = 1;
  for (const a of existing) {
    const m = a.title.match(/\sv(\d+)$/);
    if (m) {
      maxVersion = Math.max(maxVersion, parseInt(m[1], 10));
    }
  }

  return `${baseTitle} v${maxVersion + 1}`;
}

// Like generateVersionedTitle but also tracks titles that were just generated
// within the same batch (before any of them are pushed to _artifacts).
function generateVersionedTitleInBatch(baseTitle: string, usedInBatch: Set<string>): string {
  const all = [..._artifacts, ..._diagrams];
  const allTitles = [...all.map(a => a.title), ...usedInBatch];

  const hasBase = allTitles.some(t => {
    const stripped = t.replace(/\sv\d+$/, '');
    return stripped === baseTitle || t === baseTitle;
  });

  if (!hasBase) {
    usedInBatch.add(baseTitle);
    return baseTitle;
  }

  let maxVersion = 1;
  for (const t of allTitles) {
    const stripped = t.replace(/\sv\d+$/, '');
    if (stripped === baseTitle || t === baseTitle) {
      const m = t.match(/\sv(\d+)$/);
      if (m) maxVersion = Math.max(maxVersion, parseInt(m[1], 10));
    }
  }

  const versioned = `${baseTitle} v${maxVersion + 1}`;
  usedInBatch.add(versioned);
  return versioned;
}

// ══════════════════════════════════════════════════════════════════
// extractAllArtifactsFromResponse  (v3 — line-based parser)
//
// ROOT CAUSE OF PREVIOUS VERSION'S FAILURE:
//   The gm-regex approach (/^```(\w*)…^```$/gm) relies on JavaScript's
//   regex engine advancing lastIndex correctly across multiple exec() calls
//   in multiline mode. In practice, interleaved prose + bash + file blocks
//   caused the engine to either skip blocks or match the opening fence of
//   block N+1 as the closing fence of block N, so only the last qualifying
//   block appeared in `blocks[]`.
//
//   ADDITIONALLY: extractArtifactFromResponse (used by App.tsx) called this
//   function's predecessor, picked ONE block, and stripped all others via
//   the PART B regex — so even multi-block responses were reduced to a single
//   [ARTIFACT:] marker before ChatArea ever saw the content.
//
// FIX:
//   • Line-based parser — walks every line exactly once, never re-scans,
//     no lastIndex state, guaranteed to find every closed fence.
//   • Qualifying blocks are replaced with [ARTIFACT:] markers by rebuilding
//     the line array (no byte-offset arithmetic = no position corruption).
//   • extractArtifactFromResponse now delegates here so App.tsx's
//     finalContent contains ALL markers, not just one.
// ══════════════════════════════════════════════════════════════════
export function extractAllArtifactsFromResponse(
  response:    string,
  userPrompt?: string,
): MultiExtractResult | null {

  // ── Phase 1: Collect all closed fence blocks ───────────────────────────
  interface RawBlock {
    lang:      string;
    codeLines: string[];
    startLine: number;   // index of opening ``` line in `lines[]`
    endLine:   number;   // index of closing ``` line in `lines[]`
  }

  const lines     = response.split('\n');
  const rawBlocks: RawBlock[] = [];

  let inFence    = false;
  let fenceLang  = '';
  let fenceStart = 0;
  let codeLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inFence) {
      // An opening fence must start with ``` and carry a non-empty language tag.
      // A bare ``` at the top level is a stray closing fence — skip it.
      if (line.startsWith('```')) {
        // Take only the first whitespace-delimited token as the language tag
        // so ` ```javascript tailwind.config.js ` → lang = 'javascript'.
        const rawTag = line.slice(3).trim().split(/\s+/)[0].toLowerCase();
        if (rawTag !== '') {
          inFence    = true;
          fenceLang  = rawTag;
          fenceStart = i;
          codeLines  = [];
        }
      }
    } else {
      // Inside a fence — a closing fence is a line whose trimmed content
      // is exactly ``` (with optional trailing spaces/tabs, no language tag).
      if (line.trimEnd() === '```') {
        rawBlocks.push({
          lang:      fenceLang || 'text',
          codeLines: codeLines.slice(),
          startLine: fenceStart,
          endLine:   i,
        });
        inFence   = false;
        fenceLang = '';
        codeLines = [];
      } else {
        codeLines.push(line);
      }
    }
  }
  // Unclosed fences at EOF are intentionally dropped —
  // the fallback open-fence matcher in extractArtifactFromResponse handles them.

  // ── Phase 2: Filter to qualifying blocks ──────────────────────────────
  const qualifying = rawBlocks.filter(
    b => !EXCLUDED_LANGUAGES.has(b.lang) && b.codeLines.length >= MIN_LINES_FOR_ARTIFACT
  );

  if (qualifying.length === 0) return null;

  // ── Phase 3: Build artifact metadata ──────────────────────────────────
  const usedTitles = new Set<string>();
  const artifacts: Omit<ExtractedArtifact, 'reducedResponse'>[] = [];

  for (const block of qualifying) {
    let lang = block.lang;
    const code      = block.codeLines.join('\n').trimEnd();
    const lineCount = block.codeLines.length;

    // JSX/TSX promotion
    if (['javascript', 'js', 'typescript', 'ts'].includes(lang)) {
      const hasJSXTags   = /<[A-Z][A-Za-z0-9]*[\s\/>]|<\/[A-Za-z][A-Za-z0-9]*>/.test(code);
      const hasReact     = /import\s+.*[Rr]eact|from\s+['"]react['"]|useState|useEffect|useRef/.test(code);
      const hasReturnJSX = /return\s*\(\s*<|=>\s*<[A-Z]/.test(code);
      if ((hasJSXTags && hasReact) || hasReturnJSX) {
        lang = (lang === 'typescript' || lang === 'ts') ? 'tsx' : 'jsx';
      }
    }

    const type: ArtifactType = lang === 'html' ? 'html' : 'code';

    // File-path detection: first-line comment OR the 3 prose lines before the block.
    // EXTENSION GUARD: pathMatch from surrounding prose can pick up filenames
    // from adjacent blocks (e.g. "**File: Main.jsx**" appearing 2 lines before
    // a CSS block → CSS artifact gets titled "Main.jsx").  Only accept a
    // prose-detected path when its extension is compatible with the block language.
    const firstLine    = block.codeLines[0] ?? '';
    const pathFromCode = firstLine.match(/(?:\/\/|#)\s*([\w./\-]+\.\w+)/)?.[1];
    const beforeLines  = lines.slice(Math.max(0, block.startLine - 3), block.startLine).join('\n');
    const pathMatchRaw = beforeLines.match(/(?:\/\/|#|\/\*|\*\*File:?|Path:?)\s*([\w./\-]+\.\w+)/)?.[1];

    // Validate that a prose-detected filename belongs to the same language family.
    const extCompatible = (detectedLang: string, fp: string): boolean => {
      const ext = (fp.split('.').pop() ?? '').toLowerCase();
      const CSS_EXTS  = ['css', 'scss', 'sass', 'less'];
      const JS_EXTS   = ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'];
      const PY_EXTS   = ['py', 'pyw'];
      const HTML_EXTS = ['html', 'htm'];
      if (CSS_EXTS.includes(detectedLang))                              return CSS_EXTS.includes(ext);
      if (['javascript', 'js', 'jsx'].includes(detectedLang))           return JS_EXTS.includes(ext);
      if (['typescript', 'ts', 'tsx'].includes(detectedLang))           return JS_EXTS.includes(ext);
      if (['python', 'py'].includes(detectedLang))                      return PY_EXTS.includes(ext);
      if (['html', 'htm'].includes(detectedLang))                       return HTML_EXTS.includes(ext);
      return true; // other languages: accept any matched path
    };

    const validatedProseMatch = (pathMatchRaw && extCompatible(lang, pathMatchRaw))
      ? pathMatchRaw
      : undefined;

    const filePath = pathFromCode ?? validatedProseMatch;

    // For CSS/SCSS blocks with no detected filename, default to 'styles.css'
    // rather than deriving a meaningless title from surrounding conversation text.
    const baseTitle = filePath
      ? filePath.split('/').pop() ?? filePath
      : (['css', 'scss', 'sass', 'less'].includes(lang))
        ? 'styles.css'
        : deriveTitleFromPrompt(userPrompt ?? '', lang);

    const title = generateVersionedTitleInBatch(baseTitle, usedTitles);

    artifacts.push({ title, language: lang, content: code, type, filePath, lineCount });
  }

  // ── Phase 4: Build reducedResponse ────────────────────────────────────
  // Walk lines forward. When we reach a qualifying block's opening line,
  // emit an [ARTIFACT:title] marker and skip through (inclusive) its closing
  // line. All other lines — prose, non-qualifying fences, small snippets —
  // are emitted as-is.
  const qualifyingByStart = new Map<number, number>();
  qualifying.forEach((b, idx) => qualifyingByStart.set(b.startLine, idx));

  const outLines: string[] = [];
  let skipUntil = -1;

  for (let i = 0; i < lines.length; i++) {
    if (i <= skipUntil) continue;  // inside a block being replaced

    if (qualifyingByStart.has(i)) {
      const artIdx = qualifyingByStart.get(i)!;
      outLines.push('');
      outLines.push(`[ARTIFACT:${artifacts[artIdx].title}]`);
      outLines.push('');
      skipUntil = qualifying[artIdx].endLine;  // skip through the closing ```
    } else {
      outLines.push(lines[i]);
    }
  }

  const reducedResponse = outLines.join('\n')
    .replace(/^(here is|here's|the following|below is|this is)\b[^\n]*:\s*\n/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { artifacts, reducedResponse };
}

// ══════════════════════════════════════════════════════════════════
// extractArtifactFromResponse  (v3 — delegates to multi-extractor)
//
// WHY THIS CHANGE:
//   App.tsx calls extractArtifactFromResponse and stores its
//   `reducedResponse` as the final message content in the DB.
//   The old implementation picked ONE block and STRIPPED all others
//   (PART B regex), so only one [ARTIFACT:] marker ever reached
//   ChatArea — regardless of how many code blocks were in the response.
//
//   By delegating to extractAllArtifactsFromResponse we get a
//   reducedResponse with ALL [ARTIFACT:] markers.  App.tsx's
//   createArtifact() still persists only the first artifact (artifact[0])
//   to the DB.  Artifacts [1..n] are registered ephemerally here so
//   their cards appear immediately in the current session.
//
// FALLBACK:
//   extractAllArtifactsFromResponse only matches CLOSED fences.
//   For streaming cut-offs (unclosed fence at EOF) the open-fence
//   matcher below handles the edge case.
// ══════════════════════════════════════════════════════════════════
export function extractArtifactFromResponse(
  response:    string,
  userPrompt?: string,
): ExtractedArtifact | null {
  if (!response.includes('```')) return null;

  // ── Primary path: closed fences ───────────────────────────────────────
  const multiResult = extractAllArtifactsFromResponse(response, userPrompt);

  if (multiResult && multiResult.artifacts.length > 0) {
    const [first, ...rest] = multiResult.artifacts;

    // Register extra artifacts in memory so renderWithArtifacts finds them.
    // App.tsx will call createArtifact() only for `first` — the extras are
    // ephemeral for this session load.  A page reload will show them as
    // "pending" until a deeper architectural fix persists all to the DB.
    for (const extra of rest) {
      registerEphemeralArtifact(extra);
    }

    return {
      ...first,
      reducedResponse: multiResult.reducedResponse,
    };
  }

  // ── Fallback: open fence (streaming cut-off or missing closing ```) ───
  const openMatch = /^```(\w+)[ \t]*\r?\n([\s\S]*)/m.exec(response);
  if (!openMatch) return null;

  const rawLang = openMatch[1].trim().split(/\s+/)[0].toLowerCase() || 'text';
  const code    = openMatch[2];
  const lines   = code.split('\n').length;

  if (EXCLUDED_LANGUAGES.has(rawLang) || lines < MIN_LINES_FOR_ARTIFACT) return null;

  // JSX/TSX promotion
  let lang = rawLang;
  if (['javascript', 'js', 'typescript', 'ts'].includes(lang)) {
    const hasJSXTags   = /<[A-Z][A-Za-z0-9]*[\s\/>]|<\/[A-Za-z][A-Za-z0-9]*>/.test(code);
    const hasReact     = /import\s+.*[Rr]eact|from\s+['"]react['"]|useState|useEffect|useRef/.test(code);
    const hasReturnJSX = /return\s*\(\s*<|=>\s*<[A-Z]/.test(code);
    if ((hasJSXTags && hasReact) || hasReturnJSX) {
      lang = (lang === 'typescript' || lang === 'ts') ? 'tsx' : 'jsx';
    }
  }

  const type: ArtifactType = lang === 'html' ? 'html' : 'code';

  const firstLine    = code.split('\n')[0] ?? '';
  const pathFromCode = firstLine.match(/(?:\/\/|#)\s*([\w./\-]+\.\w+)/)?.[1];
  const baseTitle    = pathFromCode
    ? pathFromCode.split('/').pop() ?? pathFromCode
    : deriveTitleFromPrompt(userPrompt ?? '', lang);
  const title        = generateVersionedTitle(baseTitle);

  const reducedResponse = response
    .replace(openMatch[0], `\n\n[ARTIFACT:${title}]\n`)
    .replace(/^```[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    title,
    language:  lang,
    content:   code.trimEnd(),
    type,
    filePath:  pathFromCode,
    lineCount: lines,
    reducedResponse,
  };
}

export function extractDiagramsFromResponse(response: string): string[] {
  const FENCE_RE = /```mermaid\n([\s\S]*?)```/g;
  const codes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = FENCE_RE.exec(response)) !== null) {
    const code = match[1].trim();
    if (code) codes.push(code);
  }
  return codes;
}

// ══════════════════════════════════════════════════════════════════
// SESSION 9: registerEphemeralArtifact
//
// Re-hydrates [ARTIFACT:] markers in historical/cached messages that
// were stored before artifact extraction ran (e.g. page reload where
// setSessions race left raw code in msg.content).
//
// Called by ChatArea FIX 3 path after extractArtifactFromResponse()
// so the [ARTIFACT:title] marker in reducedResponse resolves to a
// real ArtifactCard instead of the dead "pending" placeholder.
//
// Does NOT hit the DB — in-memory only, ephemeral across page loads.
// ══════════════════════════════════════════════════════════════════
export function registerEphemeralArtifact(extracted: ExtractedArtifact): Artifact {
  // Deduplicate by title — if already in store from a prior render, return it
  const alreadyExists = _artifacts.find(a => a.title === extracted.title);
  if (alreadyExists) return alreadyExists;

  const artifact: Artifact = {
    id:        crypto.randomUUID(),
    sessionId: 'ephemeral',
    userId:    'ephemeral',
    title:     extracted.title,
    language:  extracted.language,
    content:   extracted.content,
    type:      extracted.type,
    filePath:  extracted.filePath,
    lineCount: extracted.lineCount,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  _artifacts = [artifact, ..._artifacts];
  notify();
  return artifact;
}

export async function storeDiagram(input: ArtifactCreateInput): Promise<Artifact> {
  const lineCount = input.content.split('\n').length;

  const localId = crypto.randomUUID();
  const diagram: Artifact = {
    id:        localId,
    sessionId: input.sessionId,
    userId:    input.userId,
    title:     input.title,
    language:  'mermaid',
    content:   input.content,
    type:      'diagram',
    lineCount,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const exists = _diagrams.some(d => d.sessionId === input.sessionId && d.content === input.content);
  if (exists) return _diagrams.find(d => d.sessionId === input.sessionId && d.content === input.content)!;

  _diagrams = [diagram, ..._diagrams];
  notify();

  if (!isSupabaseConfigured) return diagram;

  try {
    const { data, error } = await supabase!
      .from('generated_diagrams')
      .insert({
        session_id:    input.sessionId,
        user_id:       input.userId,
        title:         input.title,
        language:      'mermaid',
        mermaid_code:  input.content,
        artifact_type: 'diagram',
        file_path:     null,
        line_count:    lineCount,
      })
      .select()
      .single();

    if (error) { console.warn('[SEDREX Diagrams] DB save failed:', error.message); return diagram; }

    const saved: Artifact = {
      id:        data.id,
      sessionId: data.session_id ?? input.sessionId,
      userId:    data.user_id,
      title:     data.title,
      language:  'mermaid',
      content:   data.mermaid_code ?? input.content,
      type:      'diagram',
      lineCount: data.line_count ?? lineCount,
      createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
      updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : Date.now(),
    };

    _diagrams = _diagrams.map(d => d.id === localId ? saved : d);
    notify();
    return saved;
  } catch (e) {
    console.warn('[SEDREX Diagrams] DB exception:', e);
    return diagram;
  }
}

export async function storeImage(
  sessionId: string,
  userId: string,
  title: string,
  dataUrl: string
): Promise<Artifact> {
  const localId = crypto.randomUUID();
  const imageArtifact: Artifact = {
    id:        localId,
    sessionId,
    userId,
    title,
    language:  'png',
    content:   dataUrl,
    type:      'image',
    lineCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  _artifacts = [imageArtifact, ..._artifacts];
  notify();

  if (!isSupabaseConfigured) return imageArtifact;

  try {
    const { data, error } = await supabase!
      .from('generated_images')
      .insert({
        session_id:    sessionId,
        user_id:       userId,
        title,
        language:      'png',
        base64_data:   dataUrl,
        artifact_type: 'image',
        file_path:     null,
        line_count:    0,
      })
      .select()
      .single();

    if (error) {
      console.warn('[SEDREX Images] DB save failed:', error.message);
      return imageArtifact;
    }

    const saved: Artifact = {
      ...imageArtifact,
      id:        data.id,
      sessionId: data.session_id ?? sessionId,
      createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
    };

    _artifacts = _artifacts.map(a => a.id === localId ? saved : a);
    notify();
    return saved;
  } catch (e) {
    console.warn('[SEDREX Images] DB exception:', e);
    return imageArtifact;
  }
}

// ── CRUD ───────────────────────────────────────────────────────────

export async function createArtifact(input: ArtifactCreateInput): Promise<Artifact> {
  const lineCount = input.content.split('\n').length;

  const localId = crypto.randomUUID();
  const localArtifact: Artifact = {
    id:        localId,
    sessionId: input.sessionId,
    userId:    input.userId,
    title:     input.title,
    language:  input.language,
    content:   input.content,
    type:      input.type,
    filePath:  input.filePath,
    lineCount,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  _artifacts = [localArtifact, ..._artifacts];
  setActiveArtifact(localId);

  if (!isSupabaseConfigured) return localArtifact;

  try {
    const { data, error } = await supabase!
      .from('generated_code')
      .insert({
        session_id:   input.sessionId,
        user_id:      input.userId,
        title:        input.title,
        language:     input.language,
        code_content: input.content,
        artifact_type:input.type,
        file_path:    input.filePath ?? null,
        line_count:   lineCount,
      })
      .select()
      .single();

    if (error) {
      console.warn('[SEDREX Artifacts] DB save failed (artifact still visible in session):', error.message);
      return localArtifact;
    }

    const savedArtifact: Artifact = {
      id:        data.id,
      sessionId: data.session_id ?? input.sessionId,
      userId:    data.user_id,
      title:     data.title,
      language:  data.language,
      content:   data.code_content ?? data.content ?? input.content,
      type:      (data.artifact_type ?? data.type ?? input.type) as ArtifactType,
      filePath:  data.file_path ?? undefined,
      lineCount: data.line_count ?? lineCount,
      createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
      updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : Date.now(),
    };

    _artifacts = _artifacts.map(a => a.id === localId ? savedArtifact : a);
    if (_activeId === localId) _activeId = savedArtifact.id;
    notify();
    return savedArtifact;

  } catch (e) {
    console.warn('[SEDREX Artifacts] DB save exception:', e);
    return localArtifact;
  }
}

export async function updateArtifact(id: string, content: string): Promise<void> {
  const lineCount = content.split('\n').length;
  _artifacts = _artifacts.map(a => a.id === id ? { ...a, content, lineCount, updatedAt: Date.now() } : a);
  notify();
  if (!isSupabaseConfigured) return;
  await supabase!.from('artifacts')
    .update({ content, line_count: lineCount, updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function deleteArtifact(id: string): Promise<void> {
  _artifacts = _artifacts.filter(a => a.id !== id);
  _diagrams  = _diagrams.filter(d => d.id !== id);
  if (_activeId === id) { _activeId = null; _panelOpen = false; }
  notify();
  if (!isSupabaseConfigured) return;
  await supabase!.from('artifacts').delete().eq('id', id);
}

export async function loadArtifactsForSession(sessionId: string, metadataOnly = false): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const data = await getArtifactsBySessionId(sessionId, metadataOnly);

    const all: Artifact[] = (data ?? []).map(row => {
      const existing = _artifacts.find(a => a.id === row.id) || _diagrams.find(d => d.id === row.id);
      return {
        id:        row.id,
        sessionId: row.session_id ?? sessionId,
        userId:    row.user_id,
        title:     row.title,
        language:  row.language ?? 'text',
        content:   (row as any).content ?? (existing?.content || ''),
        type:      (row.artifact_type ?? 'code') as ArtifactType,
        filePath:  row.file_path ?? undefined,
        lineCount: row.line_count ?? 0,
        createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
      };
    });

    const dbDiagrams  = all.filter(a => a.type === 'diagram' || a.language === 'mermaid');
    const dbArtifacts = all.filter(a => a.type !== 'diagram' && a.language !== 'mermaid');

    const memOnlyArtifacts = _artifacts.filter(a => !dbArtifacts.some(db => db.id === a.id));
    const memOnlyDiagrams  = _diagrams.filter(d => !dbDiagrams.some(db => db.id === d.id));

    _artifacts = [...memOnlyArtifacts, ...dbArtifacts];
    _diagrams  = [...memOnlyDiagrams,  ...dbDiagrams];
    notify();
  } catch (error: any) {
    if (error?.code === '57014' || error?.message?.includes('timeout')) {
      console.warn('[SEDREX Artifacts] Load timeout - using cached artifacts');
      return;
    }
    console.error('[SEDREX Artifacts] Exception during load:', error);
  }
}

export async function loadAllUserArtifacts(userId: string, metadataOnly = false): Promise<void> {
  if (!isSupabaseConfigured) return;
  
  try {
    const data = await getAllUserArtifactsByUserId(userId, metadataOnly);

    const all: Artifact[] = (data ?? []).map(row => {
      const existing = _artifacts.find(a => a.id === row.id) || _diagrams.find(d => d.id === row.id);
      
      return {
        id:        row.id,
        sessionId: row.session_id ?? '',
        userId:    row.user_id,
        title:     row.title,
        language:  row.language ?? 'text',
        content:   (row as any).content ?? (existing?.content || ''),
        type:      ((row as any).artifact_type ?? (row as any).type ?? 'code') as ArtifactType,
        filePath:  row.file_path ?? undefined,
        lineCount: row.line_count ?? 0,
        createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
      };
    });

    _diagrams  = all.filter(a => a.type === 'diagram' || a.language === 'mermaid');
    _artifacts = all.filter(a => !(a.type === 'diagram' || a.language === 'mermaid'));
    notify();
  } catch (error: any) {
    if (error?.code === '57014' || error?.message?.includes('timeout')) {
      console.warn('[loadAllUserArtifacts] Query timeout, returning empty artifacts');
      return;
    }
    console.error('[loadAllUserArtifacts] Error loading artifacts:', error);
  }
}

// ── Populate images from already-loaded session messages ──────────
// No DB call — uses generatedImageUrl already in memory.
// Call this after sessions/messages are loaded.
export function addImageFromMessage(
  messageId: string,
  sessionId: string,
  userId:    string,
  title:     string,
  dataUrl:   string,
  createdAt?: number,
): void {
  if (!dataUrl) return;
  // Deduplicate by content URL to avoid double entries across reloads
  if (_artifacts.some(a => a.type === 'image' && (a.id === messageId || a.content === dataUrl))) return;
  const ts = createdAt ?? Date.now();
  _artifacts = [{
    id:        messageId,
    sessionId, userId, title,
    language:  'png',
    content:   dataUrl,
    type:      'image' as ArtifactType,
    lineCount: 0,
    createdAt: ts,
    updatedAt: ts,
  }, ..._artifacts];
  notify();
}

// ── Load image content on demand (called when LibraryView opens) ──
// Merges base64 content into already-loaded image entries in _artifacts.
export async function loadImagesWithContent(userId: string): Promise<void> {
  if (!isSupabaseConfigured || !userId) return;
  try {
    const rows = await queryLoadImages(userId, 20);
    if (!rows.length) return;
    // Merge content into existing _artifacts image entries, or add new ones
    for (const row of rows) {
      const existing = _artifacts.find(a => a.id === row.id);
      if (existing) {
        existing.content = row.content;
      } else {
        _artifacts.unshift({
          id:        row.id,
          sessionId: row.session_id ?? '',
          userId:    row.user_id,
          title:     row.title,
          language:  row.language ?? 'png',
          content:   row.content,
          type:      'image' as ArtifactType,
          filePath:  row.file_path ?? undefined,
          lineCount: row.line_count ?? 0,
          createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
          updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
        });
      }
    }
    notify();
  } catch (e) {
    console.warn('[SEDREX Images] loadImagesWithContent failed:', e);
  }
}

export function clearArtifacts(): void {
  _artifacts  = [];
  _diagrams   = [];
  _activeId   = null;
  _panelOpen  = false;
  notify();
}

export function getArtifactsForSession(sessionId: string): Artifact[] {
  return [..._artifacts, ..._diagrams].filter(a => a.sessionId === sessionId);
}

export function getAllArtifacts(): Artifact[] {
  return [..._artifacts, ..._diagrams];
}

export async function loadArtifactContent(id: string): Promise<string> {
  if (!isSupabaseConfigured || !id) return '';
  try {
    const { data: codeRow } = await supabase!
      .from('generated_code')
      .select('id, code_content')
      .eq('id', id)
      .maybeSingle();
    if (codeRow?.code_content) {
      const content = codeRow.code_content as string;
      _artifacts = _artifacts.map(a => a.id === id ? { ...a, content } : a);
      notify();
      return content;
    }

    const { data: diagRow } = await supabase!
      .from('generated_diagrams')
      .select('id, mermaid_code')
      .eq('id', id)
      .maybeSingle();
    if (diagRow?.mermaid_code) {
      const content = diagRow.mermaid_code as string;
      _diagrams = _diagrams.map(d => d.id === id ? { ...d, content } : d);
      notify();
      return content;
    }

    const { data: imgRow } = await supabase!
      .from('generated_images')
      .select('id, base64_data')
      .eq('id', id)
      .maybeSingle();
    if (imgRow?.base64_data) {
      const content = imgRow.base64_data as string;
      _artifacts = _artifacts.map(a => a.id === id ? { ...a, content } : a);
      notify();
      return content;
    }

    const { data: artRow } = await supabase!
      .from('artifacts')
      .select('id, content')
      .eq('id', id)
      .maybeSingle();
    if (artRow?.content) {
      const content = artRow.content as string;
      _artifacts = _artifacts.map(a => a.id === id ? { ...a, content } : a);
      _diagrams  = _diagrams.map(d => d.id === id ? { ...d, content } : d);
      notify();
      return content;
    }

    return '';
  } catch (e) {
    console.warn('[SEDREX Artifacts] loadArtifactContent failed:', e);
    return '';
  }
}

// ── React hook ─────────────────────────────────────────────────────
import { useState, useEffect } from 'react';

export function useArtifacts() {
  const [artifacts, setArtifacts] = useState<Artifact[]>(_artifacts);
  const [diagrams,  setDiagrams]  = useState<Artifact[]>(_diagrams);
  const [images,    setImages]    = useState<Artifact[]>(() => _artifacts.filter(a => a.type === 'image'));
  const [activeId,  setActiveId]  = useState<string | null>(_activeId);
  const [panelOpen, setPanelOpen] = useState<boolean>(_panelOpen);

  useEffect(() => {
    const unsub = subscribeToArtifacts(() => {
      setArtifacts([..._artifacts]);
      setDiagrams([..._diagrams]);
      setImages([..._artifacts].filter(a => a.type === 'image'));
      setActiveId(_activeId);
      setPanelOpen(_panelOpen);
    });
    return unsub;
  }, []);

  return {
    artifacts: artifacts.filter(a => a.type !== 'image'),
    diagrams,
    images,
    activeId,
    panelOpen,
    activeArtifact: activeId
      ? ([..._artifacts, ..._diagrams].find(a => a.id === activeId) ?? null)
      : null,
    openArtifact:   (id: string) => setActiveArtifact(id),
    closePanel:     () => closePanel(),
    openPanel:      () => openPanel(),
    deleteArtifact,
    updateArtifact,
  };
}