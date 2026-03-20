/**
 * Validation & Sanitization Service
 * Provides input validation and output sanitization for the SEDREX platform.
 * Prevents XSS, injection, and malformed data from reaching Supabase or the UI.
 */

// ── Maximum lengths ─────────────────────────────────────────────────
const MAX_MESSAGE_LENGTH   = 100_000;   // 100k chars — generous for code pastes
const MAX_TITLE_LENGTH     = 200;
const MAX_PREFERENCE_LENGTH = 5_000;

// ── Dangerous HTML/script patterns ──────────────────────────────────
const SCRIPT_RE    = /<script[\s>][\s\S]*?<\/script>/gi;
const EVENT_RE     = /\bon\w+\s*=\s*["'][^"']*["']/gi;
const IFRAME_RE    = /<iframe[\s>][\s\S]*?<\/iframe>/gi;
const OBJECT_RE    = /<object[\s>][\s\S]*?<\/object>/gi;
const EMBED_RE     = /<embed[\s>][\s\S]*?>/gi;
const BASE_RE      = /<base[\s>][\s\S]*?>/gi;
const PROTO_RE     = /javascript\s*:/gi;

/**
 * Sanitize a string by stripping dangerous HTML constructs.
 * Does NOT strip all HTML — only dangerous tags/attributes.
 * Safe for use on user input that will be rendered via react-markdown.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return '';
  return input
    .replace(SCRIPT_RE, '')
    .replace(IFRAME_RE, '')
    .replace(OBJECT_RE, '')
    .replace(EMBED_RE, '')
    .replace(BASE_RE, '')
    .replace(EVENT_RE, '')
    .replace(PROTO_RE, '');
}

/**
 * Validate user input before sending to AI or Supabase.
 * Returns the sanitized string, or throws if invalid.
 */
export function validateInput(
  input: string,
  opts: { maxLength?: number; fieldName?: string } = {}
): string {
  const { maxLength = MAX_MESSAGE_LENGTH, fieldName = 'input' } = opts;

  if (typeof input !== 'string') {
    throw new Error(`${fieldName} must be a string.`);
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    throw new Error(`${fieldName} cannot be empty.`);
  }

  if (trimmed.length > maxLength) {
    throw new Error(
      `${fieldName} exceeds maximum length of ${maxLength.toLocaleString()} characters.`
    );
  }

  return sanitizeHtml(trimmed);
}

/**
 * Validate a conversation title.
 */
export function validateTitle(title: string): string {
  return validateInput(title, { maxLength: MAX_TITLE_LENGTH, fieldName: 'Title' });
}

/**
 * Validate preference/settings text fields.
 */
export function validatePreference(value: string): string {
  return validateInput(value, { maxLength: MAX_PREFERENCE_LENGTH, fieldName: 'Preference' });
}

/**
 * Sanitize AI output before rendering to the UI.
 * Strips dangerous injection vectors that could slip through model output.
 */
export function sanitizeOutput(output: string): string {
  if (!output) return '';
  return sanitizeHtml(output);
}

/**
 * Validate an email format (basic check).
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Validate a UUID format.
 */
export function isValidUUID(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
