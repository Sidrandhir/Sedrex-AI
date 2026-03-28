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

const EXCLUDED_LANGUAGES = new Set([
  'mermaid',
  'chart',
  'products',
]);

export interface ExtractedArtifact {
  title:           string;
  language:        string;
  content:         string;
  type:            ArtifactType;
  filePath?:       string;
  lineCount:       number;
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

export function extractArtifactFromResponse(
  response:   string,
  userPrompt?: string,
): ExtractedArtifact | null {
  const FENCE_RE = /^```(\w*)[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
  let best: { lang: string; code: string; full: string } | null = null;
  let bestLines = 0;
  let match: RegExpExecArray | null;

  while ((match = FENCE_RE.exec(response)) !== null) {
    const lang  = match[1].toLowerCase().trim() || 'text';
    const code  = match[2];
    const lines = code.split('\n').length;

    if (EXCLUDED_LANGUAGES.has(lang)) continue;

    if (lines >= MIN_LINES_FOR_ARTIFACT && lines > bestLines) {
      best      = { lang, code, full: match[0] };
      bestLines = lines;
    }
  }

  if (!best) {
    // Fallback: opening fence with no closing fence (streaming cut-off or large response).
    // Take everything after the opening ``` as the code body.
    const openMatch = /^```(\w+)[ \t]*\r?\n([\s\S]*)/m.exec(response);
    if (openMatch) {
      const lang  = openMatch[1].toLowerCase().trim() || 'text';
      const code  = openMatch[2];
      const lines = code.split('\n').length;
      if (!EXCLUDED_LANGUAGES.has(lang) && lines >= MIN_LINES_FOR_ARTIFACT) {
        best      = { lang, code, full: openMatch[0] };
        bestLines = lines;
      }
    }
  }

  if (!best) return null;

  let lang     = best.lang;
  const code   = best.code.trimEnd();

  // Promote js/ts to jsx/tsx if React content detected
  if (['javascript', 'js', 'typescript', 'ts'].includes(lang)) {
    const hasJSXTags   = /<[A-Z][A-Za-z0-9]*[\s\/>]|<\/[A-Za-z][A-Za-z0-9]*>/.test(code);
    const hasReact     = /import\s+.*[Rr]eact|from\s+['"]react['"]|useState|useEffect|useRef/.test(code);
    const hasReturnJSX = /return\s*\(\s*<|=>\s*<[A-Z]/.test(code);
    if ((hasJSXTags && hasReact) || hasReturnJSX) {
      lang = (lang === 'typescript' || lang === 'ts') ? 'tsx' : 'jsx';
    }
  }

  const isHtml  = lang === 'html';
  const isReact = lang === 'jsx' || lang === 'tsx';
  const type: ArtifactType = isHtml ? 'html' : isReact ? 'code' : 'code';

  const firstLine   = code.split('\n')[0] ?? '';
  const pathFromCode = firstLine.match(/(?:\/\/|#)\s*([\w./\-]+\.\w+)/)?.[1];

  const beforeBlock = response.slice(0, response.indexOf(best.full));
  const lastLines   = beforeBlock.split('\n').slice(-3).join('\n');
  const pathMatch   = lastLines.match(/(?:\/\/|#|\/\*|\*\*File:?|Path:?)\s*([\w./\-]+\.\w+)/);
  const filePath    = pathFromCode ?? pathMatch?.[1];

  // SESSION 8: deriveTitleFromPrompt is now a module-level function (hoisted above)
  // No behavioral change — same logic, same return values.
  const baseTitle = filePath
    ? filePath.split('/').pop() ?? filePath
    : deriveTitleFromPrompt(userPrompt ?? '', lang);

  // generateVersionedTitle checks current _artifacts in memory
  const title = generateVersionedTitle(baseTitle);

  let reducedResponse = response.replace(best.full, `\n\n[ARTIFACT:${title}]\n`);

  const STRIP_RE = /^```(\w*)[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
  reducedResponse = reducedResponse.replace(
    STRIP_RE, (_m: string, l: string, c: string) => {
      const lo = (l || '').toLowerCase();
      if (EXCLUDED_LANGUAGES.has(lo)) return _m;
      if (c.split('\n').length >= MIN_LINES_FOR_ARTIFACT) return '';
      return _m;
    }
  );
  reducedResponse = reducedResponse
    .replace(/^```[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, language: lang, content: code, type, filePath, lineCount: bestLines, reducedResponse };
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