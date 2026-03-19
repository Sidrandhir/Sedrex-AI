// services/fileIndexer.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Codebase File Indexer
//
// Reads uploaded project files, chunks them intelligently,
// and builds an in-memory searchable index per session.
//
// NO external dependencies. NO backend. NO database.
// Works entirely in the browser with zero new infrastructure.
// ══════════════════════════════════════════════════════════════════

// ── Supported file types ──────────────────────────────────────────
export const SUPPORTED_EXTENSIONS = new Set([
  // TypeScript / JavaScript
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  // Styles
  '.css', '.scss', '.sass', '.less',
  // Config / Data
  '.json', '.jsonc', '.env.example', '.yaml', '.yml', '.toml',
  // Markup
  '.html', '.md', '.mdx',
  // Other text
  '.txt', '.sh', '.ps1', '.prisma', '.graphql', '.gql', '.sql',
]);

const MAX_FILE_SIZE_BYTES = 500_000;  // 500KB per file
const CHUNK_SIZE_CHARS    = 1_500;    // chars per chunk
const CHUNK_OVERLAP_CHARS = 200;      // overlap between chunks

// ── Types ─────────────────────────────────────────────────────────

export interface IndexedChunk {
  id:        string;   // unique chunk id
  filePath:  string;   // e.g. "services/aiService.ts"
  fileName:  string;   // e.g. "aiService.ts"
  extension: string;   // e.g. ".ts"
  content:   string;   // the actual text chunk
  startLine: number;   // approximate start line
  chunkIdx:  number;   // which chunk within the file
  totalChunks: number; // total chunks for this file
}

export interface IndexedFile {
  path:      string;
  name:      string;
  extension: string;
  size:      number;
  lines:     number;
  chunks:    IndexedChunk[];
  language:  string;
}

export interface ProjectIndex {
  files:       IndexedFile[];
  totalChunks: number;
  totalFiles:  number;
  indexedAt:   number;
  projectName: string;
}

// ── Language detector ─────────────────────────────────────────────
function detectLanguage(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript (React)',
    '.js': 'JavaScript', '.jsx': 'JavaScript (React)',
    '.mjs': 'JavaScript', '.cjs': 'JavaScript',
    '.css': 'CSS', '.scss': 'SCSS', '.sass': 'Sass', '.less': 'Less',
    '.json': 'JSON', '.jsonc': 'JSON', '.yaml': 'YAML', '.yml': 'YAML',
    '.toml': 'TOML', '.html': 'HTML', '.md': 'Markdown', '.mdx': 'MDX',
    '.prisma': 'Prisma', '.graphql': 'GraphQL', '.gql': 'GraphQL',
    '.sql': 'SQL', '.sh': 'Shell', '.ps1': 'PowerShell',
  };
  return map[ext] || 'Text';
}

// ── Smart chunker ─────────────────────────────────────────────────
// Tries to split at natural boundaries (function/class definitions,
// blank lines) rather than arbitrary character positions.
function smartChunk(content: string, filePath: string): string[] {
  if (content.length <= CHUNK_SIZE_CHARS) return [content];

  const lines  = content.split('\n');
  const chunks: string[] = [];
  let   current = '';
  let   currentLines = 0;

  // Boundaries where it's natural to split
  const isBoundary = (line: string): boolean => {
    const t = line.trim();
    return (
      t.startsWith('export function ')   ||
      t.startsWith('export const ')      ||
      t.startsWith('export class ')      ||
      t.startsWith('export interface ')  ||
      t.startsWith('export type ')       ||
      t.startsWith('export enum ')       ||
      t.startsWith('function ')          ||
      t.startsWith('class ')             ||
      t.startsWith('const ')             ||
      t.startsWith('// ══')              ||  // section dividers
      t.startsWith('// ──')              ||
      t === ''                           ||  // blank line
      t.startsWith('/*')
    );
  };

  for (const line of lines) {
    const addition = (current ? '\n' : '') + line;

    // If adding this line exceeds chunk size and we're at a boundary
    if (
      current.length + addition.length > CHUNK_SIZE_CHARS &&
      current.length > CHUNK_SIZE_CHARS * 0.5 &&
      isBoundary(line)
    ) {
      chunks.push(current);
      // Start next chunk with overlap from end of previous
      const overlapLines = current.split('\n').slice(-8).join('\n');
      current = overlapLines + '\n' + line;
    } else {
      current += addition;
    }
    currentLines++;
  }

  if (current.trim()) chunks.push(current);
  return chunks.length > 0 ? chunks : [content];
}

// ── File reader ───────────────────────────────────────────────────
async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve((e.target?.result as string) || '');
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file, 'utf-8');
  });
}

// ── Path normaliser ───────────────────────────────────────────────
// Browsers give us just the filename, not the full path.
// We use the webkitRelativePath if available (folder upload).
function getFilePath(file: File): string {
  return (file as any).webkitRelativePath || file.name;
}

function getExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return '.' + parts[parts.length - 1].toLowerCase();
}

// ── Skip list — never index these ────────────────────────────────
const SKIP_PATHS = [
  'node_modules', '.git', 'dist', 'build', '.next', 'out',
  '.cache', 'coverage', '.turbo', '.vercel', 'public',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.env', '.env.local', '.env.production',   // never index secrets
];

function shouldSkip(path: string): boolean {
  return SKIP_PATHS.some(skip => path.includes(skip));
}

// ══════════════════════════════════════════════════════════════════
// MAIN INDEXER
// ══════════════════════════════════════════════════════════════════

export async function indexProjectFiles(
  files: File[],
  onProgress?: (indexed: number, total: number, currentFile: string) => void,
): Promise<ProjectIndex> {
  const validFiles = files.filter(file => {
    const path = getFilePath(file);
    const ext  = getExtension(file.name);
    return (
      !shouldSkip(path) &&
      SUPPORTED_EXTENSIONS.has(ext) &&
      file.size <= MAX_FILE_SIZE_BYTES &&
      file.size > 0
    );
  });

  const indexedFiles: IndexedFile[] = [];
  let totalChunks = 0;

  for (let i = 0; i < validFiles.length; i++) {
    const file    = validFiles[i];
    const path    = getFilePath(file);
    const ext     = getExtension(file.name);

    onProgress?.(i, validFiles.length, file.name);

    try {
      const content  = await readFileAsText(file);
      const lines    = content.split('\n').length;
      const rawChunks = smartChunk(content, path);

      const chunks: IndexedChunk[] = rawChunks.map((chunk, idx) => ({
        id:          `${path}::${idx}`,
        filePath:    path,
        fileName:    file.name,
        extension:   ext,
        content:     chunk,
        startLine:   Math.round((idx / rawChunks.length) * lines),
        chunkIdx:    idx,
        totalChunks: rawChunks.length,
      }));

      indexedFiles.push({
        path,
        name:     file.name,
        extension: ext,
        size:     file.size,
        lines,
        chunks,
        language: detectLanguage(ext),
      });

      totalChunks += chunks.length;

    } catch (err) {
      console.warn(`[SEDREX Indexer] Skipped ${file.name}:`, err);
    }
  }

  onProgress?.(validFiles.length, validFiles.length, 'Done');

  // Derive project name from root folder if available
  const firstPath  = validFiles[0] ? getFilePath(validFiles[0]) : '';
  const projectName = firstPath.includes('/')
    ? firstPath.split('/')[0]
    : 'Project';

  console.log(
    `[SEDREX Indexer] Indexed ${indexedFiles.length} files, ` +
    `${totalChunks} chunks from "${projectName}"`,
  );

  return {
    files:       indexedFiles,
    totalChunks,
    totalFiles:  indexedFiles.length,
    indexedAt:   Date.now(),
    projectName,
  };
}

// ══════════════════════════════════════════════════════════════════
// SEMANTIC RETRIEVER
// Given a query, returns the most relevant chunks from the index.
// Uses keyword + structural matching — no embeddings needed.
// ══════════════════════════════════════════════════════════════════

export function retrieveRelevantChunks(
  query:   string,
  index:   ProjectIndex,
  maxChunks = 8,
): IndexedChunk[] {
  if (!index || index.totalChunks === 0) return [];

  const q         = query.toLowerCase();
  const qWords    = q.split(/\s+/).filter(w => w.length > 2);
  const allChunks = index.files.flatMap(f => f.chunks);

  // Score each chunk
  const scored = allChunks.map(chunk => {
    const c = chunk.content.toLowerCase();
    let score = 0;

    // Exact phrase match — highest signal
    if (c.includes(q.slice(0, 40))) score += 20;

    // Word matches
    for (const word of qWords) {
      const count = (c.match(new RegExp(word, 'g')) || []).length;
      score += count * 2;
    }

    // File name relevance — if query mentions a filename
    if (q.includes(chunk.fileName.toLowerCase().replace(/\.[^.]+$/, ''))) {
      score += 15;
    }

    // Boost important file types for code queries
    const isCodeQuery = /function|class|component|hook|type|interface|import|export|bug|error|fix/.test(q);
    if (isCodeQuery && ['.ts', '.tsx', '.js', '.jsx'].includes(chunk.extension)) {
      score += 3;
    }

    // Boost definition chunks (first chunk of important files)
    if (chunk.chunkIdx === 0 && chunk.filePath.includes('types')) score += 5;
    if (chunk.chunkIdx === 0 && chunk.filePath.includes('service')) score += 3;

    // Penalise very short chunks
    if (chunk.content.length < 100) score -= 5;

    return { chunk, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks)
    .map(s => s.chunk);
}

// ── Context builder ───────────────────────────────────────────────
// Formats retrieved chunks into a clean context block for injection
// into the AI prompt. Called by aiService before every request.
export function buildCodebaseContext(
  query:   string,
  index:   ProjectIndex | null,
  maxChunks = 8,
): string {
  if (!index || index.totalFiles === 0) return '';

  const chunks = retrieveRelevantChunks(query, index, maxChunks);
  if (chunks.length === 0) return '';

  const header = [
    `[CODEBASE CONTEXT — ${index.projectName}]`,
    `${index.totalFiles} files indexed. Showing ${chunks.length} most relevant chunks for this query.`,
    `Use this context to give answers that match the existing codebase patterns, types, and conventions.`,
    '',
  ].join('\n');

  const chunkBlocks = chunks.map(chunk => {
    const lang = chunk.extension.replace('.', '') || 'text';
    return [
      `// File: ${chunk.filePath} (chunk ${chunk.chunkIdx + 1}/${chunk.totalChunks})`,
      '```' + lang,
      chunk.content.trim(),
      '```',
    ].join('\n');
  });

  return header + chunkBlocks.join('\n\n');
}

// ── Project summary ───────────────────────────────────────────────
// Returns a brief summary of the indexed project for display in UI.
export function getProjectSummary(index: ProjectIndex): string {
  const byLang: Record<string, number> = {};
  for (const file of index.files) {
    const lang = file.language;
    byLang[lang] = (byLang[lang] || 0) + 1;
  }

  const langSummary = Object.entries(byLang)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([lang, count]) => `${lang}: ${count}`)
    .join(', ');

  return `${index.totalFiles} files · ${langSummary}`;
}