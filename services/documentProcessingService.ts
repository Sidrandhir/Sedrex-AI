// services/documentProcessingService.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Document Processing Service v1.0
//
// ROOT CAUSE FIX: The old handleDocFiles used FileReader.readAsText()
// on ALL file types including binary PDFs, DOCX, XLSX. Binary files
// contain invalid Unicode sequences (null bytes, surrogates, control
// chars) that break JSON serialization → "Unsupported unicode escape
// sequence" error from the Gemini API.
//
// THIS SERVICE:
//   ✅ PDF       → base64 (Gemini handles PDF as inlineData natively)
//   ✅ DOCX/DOC  → text extraction via mammoth
//   ✅ XLSX/XLS  → CSV text extraction via SheetJS (xlsx)
//   ✅ CSV       → direct text, sanitized
//   ✅ All others → text via FileReader with full unicode sanitization
//
// NEVER call FileReader.readAsText() on binary files again.
// ══════════════════════════════════════════════════════════════════

export interface ProcessedDocument {
  /** Original filename */
  title: string;
  /** File content — base64 string for binary types, text for others */
  content: string;
  /** Raw MIME type from the File object */
  type: string;
  /** How content is encoded */
  encoding: 'text' | 'base64';
  /** Canonical MIME type for this content */
  mimeType: string;
  /** File size in KB — shown in the attachment chip */
  sizeKB: number;
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Strip characters that are illegal in JSON strings and that the
 * Gemini API rejects as "unsupported unicode escape sequence":
 *   • Null bytes (\x00)
 *   • ASCII control chars (except \t, \n, \r)
 *   • Lone surrogates (\uD800–\uDFFF)
 *   • Unicode replacement character (\uFFFD)
 * Safe to call on any string; leaves valid content untouched.
 */
function sanitizeText(text: string): string {
  return text
    .replace(/\x00/g, '')                           // null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // ctrl chars (keep \t \n \r)
    .replace(/[\uD800-\uDFFF]/g, '')                // lone surrogates
    .replace(/\uFFFD/g, '');                         // replacement char
}

/** Read a File as base64, stripping the data-URL prefix. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result = "data:<mime>;base64,<data>"
      const comma = result.indexOf(',');
      resolve(comma !== -1 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** Read a text file safely, stripping invalid unicode. */
function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(sanitizeText(reader.result as string));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file, 'utf-8');
  });
}

/** Extract plain text from DOCX/DOC using mammoth (lazy import). */
async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  // Mammoth result.value is already valid text, but sanitize just in case
  return sanitizeText(result.value || '');
}

/** Extract CSV text from XLSX/XLS using SheetJS (lazy import). */
async function extractXlsxText(file: File): Promise<string> {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`## Sheet: ${sheetName}\n${csv}`);
  }
  return sanitizeText(parts.join('\n\n'));
}

// ── Main export ───────────────────────────────────────────────────

/**
 * Process any uploaded file into a safe, AI-ready document object.
 *
 * @param file - The File object from an <input type="file"> or drag-drop.
 * @returns A ProcessedDocument with safely encoded content.
 */
export async function processDocumentFile(file: File): Promise<ProcessedDocument> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const sizeKB = Math.round(file.size / 1024);

  // ── PDF ────────────────────────────────────────────────────────
  // Google Gemini supports PDF as native inlineData — send as base64.
  // NEVER try to read PDF as text; it is a binary format.
  if (ext === 'pdf') {
    const base64 = await fileToBase64(file);
    return {
      title: file.name,
      content: base64,
      type: file.type || 'application/pdf',
      encoding: 'base64',
      mimeType: 'application/pdf',
      sizeKB,
    };
  }

  // ── DOCX / DOC ─────────────────────────────────────────────────
  if (ext === 'docx' || ext === 'doc') {
    try {
      const text = await extractDocxText(file);
      return {
        title: file.name,
        content: text,
        type: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        encoding: 'text',
        mimeType: 'text/plain',
        sizeKB,
      };
    } catch (err) {
      console.warn('[Sedrex] DOCX text extraction failed, falling back to base64:', err);
      const base64 = await fileToBase64(file);
      return {
        title: file.name,
        content: base64,
        type: file.type || 'application/octet-stream',
        encoding: 'base64',
        mimeType: file.type || 'application/octet-stream',
        sizeKB,
      };
    }
  }

  // ── XLSX / XLS ─────────────────────────────────────────────────
  if (ext === 'xlsx' || ext === 'xls') {
    try {
      const text = await extractXlsxText(file);
      return {
        title: file.name,
        content: text,
        type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        encoding: 'text',
        mimeType: 'text/plain',
        sizeKB,
      };
    } catch (err) {
      console.warn('[Sedrex] XLSX text extraction failed, falling back to base64:', err);
      const base64 = await fileToBase64(file);
      return {
        title: file.name,
        content: base64,
        type: file.type || 'application/octet-stream',
        encoding: 'base64',
        mimeType: file.type || 'application/octet-stream',
        sizeKB,
      };
    }
  }

  // ── Everything else — text-safe files ─────────────────────────
  // TXT, MD, JSON, CSV, JS, TS, TSX, JSX, HTML, CSS, SQL, YAML,
  // TOML, SH, BASH, PY, RS, GO, JAVA, CPP, C, RB, PHP, SWIFT, KT…
  // All read as UTF-8 text with unicode sanitization.
  const text = await fileToText(file);
  return {
    title: file.name,
    content: text,
    type: file.type || 'text/plain',
    encoding: 'text',
    mimeType: file.type || 'text/plain',
    sizeKB,
  };
}

/**
 * Process multiple files in parallel.
 * Errors from individual files are caught and logged — other files
 * still succeed. Returns only successfully processed documents.
 */
export async function processDocumentFiles(
  files: FileList | File[],
): Promise<ProcessedDocument[]> {
  const arr = Array.from(files);
  const results = await Promise.allSettled(arr.map(processDocumentFile));
  return results.flatMap((r, i) => {
    if (r.status === 'fulfilled') return [r.value];
    console.error(`[Sedrex] Failed to process ${arr[i].name}:`, r.reason);
    return [];
  });
}