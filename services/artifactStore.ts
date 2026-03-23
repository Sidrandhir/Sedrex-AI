import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getArtifactsBySessionId, getAllUserArtifactsByUserId } from './queryOptimizer';

export type ArtifactType = 'code' | 'html' | 'document' | 'diagram' | 'image';

export interface Artifact {
  id:         string;
  sessionId:  string;   // maps to conversation_id in DB
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
let _diagrams:  Artifact[]        = [];   // mermaid diagrams stored separately
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

// ── CRITICAL: Languages that must NEVER become artifacts ──────────
// These have dedicated renderers in ChatArea (MermaidBlock,
// EnhancedChart, ProductGrid) and must stay in the chat bubble.
const EXCLUDED_LANGUAGES = new Set([
  'mermaid',    // → MermaidBlock renderer
  'chart',      // → EnhancedChart renderer
  'products',   // → ProductGrid renderer
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

// Threshold: extract code blocks >= 20 lines (lowered from 30 to catch Python/CSS/HTML)
const MIN_LINES_FOR_ARTIFACT = 20;

export function extractArtifactFromResponse(
  response:   string,
  userPrompt?: string,
): ExtractedArtifact | null {
  // Robust fence regex — closing ``` must be at LINE START
  // Prevents backticks inside strings/regexes from terminating early
  const FENCE_RE = /^```(\w*)[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
  let best: { lang: string; code: string; full: string } | null = null;
  let bestLines = 0;
  let match: RegExpExecArray | null;

  while ((match = FENCE_RE.exec(response)) !== null) {
    const lang  = match[1].toLowerCase().trim() || 'text';
    const code  = match[2];
    const lines = code.split('\n').length;

    // ── CRITICAL FIX: Skip mermaid/chart/products entirely ────────
    // These have dedicated ChatArea renderers — routing them to the
    // artifact panel breaks the in-chat diagram display.
    if (EXCLUDED_LANGUAGES.has(lang)) continue;

    if (lines >= MIN_LINES_FOR_ARTIFACT && lines > bestLines) {
      best      = { lang, code, full: match[0] };
      bestLines = lines;
    }
  }

  if (!best) return null;

  let lang     = best.lang;
  const code   = best.code.trimEnd();

  // ── Promote js/ts to jsx/tsx if content contains React/JSX ──
  // AI often writes React code with ```javascript instead of ```jsx.
  // Detect by: JSX element tags + React import/hooks patterns.
  if (['javascript', 'js', 'typescript', 'ts'].includes(lang)) {
    const hasJSXTags   = /<[A-Z][A-Za-z0-9]*[\s\/>]|<\/[A-Za-z][A-Za-z0-9]*>/.test(code);
    const hasReact     = /import\s+.*[Rr]eact|from\s+['"]react['"]|useState|useEffect|useRef/.test(code);
    const hasReturnJSX = /return\s*\(\s*<|=>\s*<[A-Z]/.test(code);
    if ((hasJSXTags && hasReact) || hasReturnJSX) {
      lang = (lang === 'typescript' || lang === 'ts') ? 'tsx' : 'jsx';
    }
  }

  const isHtml = lang === 'html';
  const isReact = lang === 'jsx' || lang === 'tsx';
  const type: ArtifactType = isHtml ? 'html' : isReact ? 'code' : 'code';

  // Try to extract file path from the comment on the first line
  const firstLine = code.split('\n')[0] ?? '';
  const pathFromCode = firstLine.match(/(?:\/\/|#)\s*([\w./\-]+\.\w+)/)?.[1];

  // Also check the lines immediately before the code fence
  const beforeBlock = response.slice(0, response.indexOf(best.full));
  const lastLines   = beforeBlock.split('\n').slice(-3).join('\n');
  const pathMatch   = lastLines.match(/(?:\/\/|#|\/\*|\*\*File:?|Path:?)\s*([\w./\-]+\.\w+)/);
  const filePath    = pathFromCode ?? pathMatch?.[1];

  const langLabel = CODE_LANGUAGES[lang] ?? lang.toUpperCase();

  // ── FIX: Derive unique descriptive title from user prompt ──
  // Old: all HTML files were titled 'HTML File' → impossible to distinguish
  // New: extract meaningful words from the user's request
  // e.g. 'write microsoft landing page' → 'Microsoft Landing Page'
  //      'build apple page'             → 'Apple Page'
  //      'rewrite the code'             → 'HTML File (v2)' (fallback)
  function deriveTitleFromPrompt(prompt: string, lang: string): string {
    const label = CODE_LANGUAGES[lang] ?? lang.toUpperCase();
    if (!prompt) return `${label} File`;
    // Strip common command words
    const cleaned = prompt
      .replace(/^(write|build|create|generate|make|code|give me|show me|now write|now build|implement|develop|design)/i, '')
      .replace(/\b(the|a|an|for|to|with|using|in|on|html|css|code|page|website|site|file|script|component|function|class|style)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || cleaned.length < 3) return `${label} File`;
    // Title-case the cleaned string, cap at 32 chars
    const titled = cleaned.split(' ')
      .filter(w => w.length > 0)
      .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
      .slice(0, 32)
      .trim();
    return titled || `${label} File`;
  }

  const title = filePath
    ? filePath.split('/').pop() ?? filePath
    : deriveTitleFromPrompt(userPrompt ?? '', lang);

  let reducedResponse = response.replace(best.full, `\n\n[ARTIFACT:${title}]\n`);

  // Strip remaining large code fences — keeps chat clean after artifact card
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

// ── NEW: Extract all diagrams for sidebar storage ──────────────────
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

// ── Store mermaid diagram separately (called from aiService) ──────
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

  // Simple deduplication check for the current session
  const exists = _diagrams.some(d => d.sessionId === input.sessionId && d.content === input.content);
  if (exists) return _diagrams.find(d => d.sessionId === input.sessionId && d.content === input.content)!;

  _diagrams = [diagram, ..._diagrams];
  notify();

  // Persist to DB with artifact_type = 'diagram'
  if (!isSupabaseConfigured) return diagram;

  try {
    const { data, error } = await supabase!
      .from('generated_diagrams')
      .insert({
        session_id: input.sessionId,
        user_id:         input.userId,
        title:           input.title,
        language:        'mermaid',
        mermaid_code:    input.content,
        artifact_type:   'diagram',
        file_path:       null,
        line_count:      lineCount,
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

// ── NEW: Store Image Artifact ────────────────────────────────────────
export async function storeImage(
  sessionId: string,
  userId: string,
  title: string,
  dataUrl: string
): Promise<Artifact> {
  const localId = crypto.randomUUID();
  const imageArtifact: Artifact = {
    id:        localId,
    sessionId: sessionId,
    userId:    userId,
    title:     title,
    language:  'png', // Store as PNG meta
    content:   dataUrl,
    type:      'image',
    lineCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Add to artifacts store
  _artifacts = [imageArtifact, ..._artifacts];
  notify();

  if (!isSupabaseConfigured) return imageArtifact;

  try {
    const { data, error } = await supabase!
      .from('generated_images')
      .insert({
        session_id:      sessionId,
        user_id:         userId,
        title:           title,
        language:        'png',
        base64_data:     dataUrl,
        artifact_type:   'image',
        file_path:       null,
        line_count:      0,
      })
      .select()
      .single();

    if (error) {
      console.warn('[SEDREX Images] DB save failed:', error.message);
      return imageArtifact;
    }

    const saved: Artifact = {
      ...imageArtifact,
      id: data.id,
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

  // Step 1: In-memory first — panel opens immediately
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

  // Step 2: Persist to DB
  if (!isSupabaseConfigured) return localArtifact;

  try {
    const { data, error } = await supabase!
      .from('generated_code')
      .insert({
        session_id: input.sessionId,
        user_id:         input.userId,
        title:           input.title,
        language:        input.language,
        code_content:    input.content,
        artifact_type:   input.type,
        file_path:       input.filePath ?? null,
        line_count:      lineCount,
      })
      .select()
      .single();

    if (error) {
      console.warn('[SEDREX Artifacts] DB save failed (artifact still visible in session):', error.message);
      return localArtifact;
    }

    // Step 3: Swap local placeholder with DB artifact (atomic, no duplicate key)
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

// Loads code artifacts AND diagrams for a session from DB
// Now using queryOptimizer for retry logic and timeout protection
export async function loadArtifactsForSession(sessionId: string, metadataOnly = false): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    // Use optimized query with timeout protection and metadata filter
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

    // Separate diagrams from code artifacts
    const dbDiagrams  = all.filter(a => a.type === 'diagram' || a.language === 'mermaid');
    const dbArtifacts = all.filter(a => a.type !== 'diagram' && a.language !== 'mermaid');

    // Keep in-memory-only items (not yet in DB)
    const memOnlyArtifacts = _artifacts.filter(a => !dbArtifacts.some(db => db.id === a.id));
    const memOnlyDiagrams  = _diagrams.filter(d => !dbDiagrams.some(db => db.id === d.id));

    _artifacts = [...memOnlyArtifacts, ...dbArtifacts];
    _diagrams  = [...memOnlyDiagrams,  ...dbDiagrams];
    notify();
  } catch (error: any) {
    // Graceful degradation on timeout errors
    if (error?.code === '57014' || error?.message?.includes('timeout')) {
      console.warn('[SEDREX Artifacts] Load timeout - using cached artifacts');
      return;
    }
    console.error('[SEDREX Artifacts] Exception during load:', error);
  }
}

// Loads ALL artifacts for a user across ALL sessions (for sidebar panel)
// Now using queryOptimizer for retry logic, timeout protection, and chunking
export async function loadAllUserArtifacts(userId: string, metadataOnly = false): Promise<void> {
  if (!isSupabaseConfigured) return;
  
  try {
    // Use optimized query with timeout protection, sequential chunking, and metadata filter
    const data = await getAllUserArtifactsByUserId(userId, metadataOnly);

    const all: Artifact[] = (data ?? []).map(row => {
      // PRESERVE CONTENT: Check if we already have this artifact with content
      const existing = _artifacts.find(a => a.id === row.id) || _diagrams.find(d => d.id === row.id);
      
      return {
        id:        row.id,
        sessionId: row.session_id ?? '',
        userId:    row.user_id,
        title:     row.title,
        language:  row.language ?? 'text',
        // If metadataOnly sync, but we already have content, keep it!
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
    // Graceful degradation on timeout errors
    if (error?.code === '57014' || error?.message?.includes('timeout')) {
      console.warn('[loadAllUserArtifacts] Query timeout, returning empty artifacts');
      return;
    }
    console.error('[loadAllUserArtifacts] Error loading artifacts:', error);
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

// ── React hook ─────────────────────────────────────────────────────
import { useState, useEffect } from 'react';


// ── Load content for a single artifact by ID ─────────────────────
// Called by ArtifactPanel when artifact.content is empty string
// (happens when metadataOnly=true was used for initial load).
// Tries each write-target table until content is found.
export async function loadArtifactContent(id: string): Promise<string> {
  if (!isSupabaseConfigured || !id) return '';
  try {
    // Try generated_code first (most common)
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

    // Try generated_diagrams
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

    // Try generated_images
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

    // Fallback: try artifacts table (for any directly-written rows)
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

export function useArtifacts() {
  const [artifacts, setArtifacts] = useState<Artifact[]>(_artifacts);
  const [diagrams,  setDiagrams]  = useState<Artifact[]>(_diagrams);
  const [images,    setImages]    = useState<Artifact[]>([]);
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
    artifacts: artifacts.filter(a => a.type !== 'image'), // strictly non-image artifacts
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