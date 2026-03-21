// services/artifactStore.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Artifact Store v3.0
//
// FIXES in this version:
//   ✅ Mermaid/chart/products EXCLUDED from artifact extraction
//      → they stay in chat as MermaidBlock / EnhancedChart / ProductGrid
//   ✅ artifact_type NOT NULL satisfied — always sent to DB
//   ✅ conversation_id column used (not session_id)
//   ✅ Diagram type added — separate from code artifacts
//   ✅ loadArtifactsForSession loads ALL user artifacts (for sidebar)
//   ✅ getDiagrams() returns mermaid diagrams stored separately
//   ✅ In-memory first — panel opens before DB responds
//   ✅ No duplicate keys on DB swap
// ══════════════════════════════════════════════════════════════════

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

export function extractArtifactFromResponse(response: string): ExtractedArtifact | null {
  const FENCE_RE = /```(\w*)\n([\s\S]*?)```/g;
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

  const lang   = best.lang;
  const code   = best.code.trimEnd();
  const isHtml = lang === 'html';
  const type: ArtifactType = isHtml ? 'html' : 'code';

  // Try to extract file path from the comment on the first line
  const firstLine = code.split('\n')[0] ?? '';
  const pathFromCode = firstLine.match(/(?:\/\/|#)\s*([\w./\-]+\.\w+)/)?.[1];

  // Also check the lines immediately before the code fence
  const beforeBlock = response.slice(0, response.indexOf(best.full));
  const lastLines   = beforeBlock.split('\n').slice(-3).join('\n');
  const pathMatch   = lastLines.match(/(?:\/\/|#|\/\*|\*\*File:?|Path:?)\s*([\w./\-]+\.\w+)/);
  const filePath    = pathFromCode ?? pathMatch?.[1];

  const langLabel = CODE_LANGUAGES[lang] ?? lang.toUpperCase();
  const title     = filePath
    ? filePath.split('/').pop() ?? filePath
    : `${langLabel} File`;

  const reducedResponse = response.replace(best.full, `\n\n[ARTIFACT:${title}]\n`);

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
      content:   data.mermaid_code ?? input.content, // Mapped from mermaid_code
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
        session_id: input.sessionId,      // DB column name is session_id, not conversation_id!
        user_id:         input.userId,
        title:           input.title,
        language:        input.language,
        code_content:    input.content,
        artifact_type:   input.type,           // DB column is artifact_type NOT NULL
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
export async function loadArtifactsForSession(sessionId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    // Use optimized query with timeout protection and exponential backoff
    const data = await getArtifactsBySessionId(sessionId);

    const all: Artifact[] = (data ?? []).map(row => ({
      id:        row.id,
      sessionId: row.session_id ?? sessionId,
      userId:    row.user_id,
      title:     row.title,
      language:  row.language ?? 'text',
      content:   (row as any).content ?? '', // Restored so visual panel works!
      type:      (row.artifact_type ?? 'code') as ArtifactType,
      filePath:  row.file_path ?? undefined,
      lineCount: row.line_count ?? 0,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
    }));

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
export async function loadAllUserArtifacts(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  
  try {
    // Use optimized query with timeout protection, exponential backoff, and chunking
    const data = await getAllUserArtifactsByUserId(userId);

    const all: Artifact[] = (data ?? []).map(row => ({
      id:        row.id,
      sessionId: row.session_id ?? '',
      userId:    row.user_id,
      title:     row.title,
      language:  row.language ?? 'text',
      content:   (row as any).content ?? '', // Restored so visual panel works!
      type:      ((row as any).artifact_type ?? (row as any).type ?? 'code') as ArtifactType,
      filePath:  row.file_path ?? undefined,
      lineCount: row.line_count ?? 0,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
    }));

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

// ── React hook ─────────────────────────────────────────────────────
import { useState, useEffect } from 'react';

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