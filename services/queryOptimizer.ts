/**
 * SEDREX — Query Optimization Service v1.1
 *
 * FIX — Artifact Queries (Bug 3 & 4):
 *   The app has 4 artifact-related tables:
 *     - artifacts         (generic, has `content` column)
 *     - generated_code    (has `code_content` column)   ← createArtifact() writes here
 *     - generated_diagrams(has `mermaid_code` column)   ← storeDiagram() writes here
 *     - generated_images  (has `base64_data` column)    ← storeImage() writes here
 *
 *   The old getAllUserArtifactsByUserId/getArtifactsBySessionId read from `artifacts`
 *   but nothing in the app writes TO `artifacts` — so the sidebar always showed 0.
 *
 *   Fix: query all 3 write-target tables in parallel, normalise columns,
 *   merge and sort by created_at DESC. Content is included unless metadataOnly=true.
 *
 * All other optimizations (timeout, concurrency limiter, retry) unchanged.
 */

import { supabase } from './supabaseClient';

export class QueryOptimizer {
  private static readonly TIMEOUT_MS  = 30000;
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1500;

  private static activeQueries = 0;
  private static readonly MAX_CONCURRENT = 2;
  private static queue: (() => void)[] = [];

  private static async enqueue(): Promise<void> {
    if (this.activeQueries < this.MAX_CONCURRENT) {
      this.activeQueries++;
      return;
    }
    return new Promise(resolve => this.queue.push(resolve));
  }

  private static dequeue(): void {
    this.activeQueries--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) { this.activeQueries++; next(); }
    }
  }

  public static async executeMutation<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    return this.executeWithTimeout(operation, `${context}:mutation`, 45000);
  }

  static async executeWithTimeout<T>(
    query: () => Promise<T>,
    operationName: string,
    maxRetries = this.MAX_RETRIES
  ): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await this.enqueue();

      try {
        const timeoutPromise = new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout exceeded')), this.TIMEOUT_MS)
        );

        const result = await Promise.race([query(), timeoutPromise]);
        this.dequeue();
        return result;
      } catch (error: any) {
        this.dequeue();
        const msg       = error?.message || '';
        const isTimeout = msg.includes('timeout') || msg.includes('57014') || msg.includes('500');

        console.warn(`[QUERY] ${operationName} attempt ${attempt + 1} failed:`, msg);

        if (!isTimeout || attempt === maxRetries) throw error;

        await new Promise(r => setTimeout(r, this.RETRY_DELAY * (attempt + 1)));
      }
    }

    throw new Error(`Failed to execute ${operationName} after ${maxRetries} retries`);
  }

  static async fetchInChunks<T>(
    query: (offset: number, limit: number) => Promise<T[]>,
    totalLimit = 200,
    chunkSize  = 50
  ): Promise<T[]> {
    const results: T[] = [];

    for (let offset = 0; offset < totalLimit; offset += chunkSize) {
      try {
        const chunk = await this.executeWithTimeout(
          () => query(offset, Math.min(chunkSize, totalLimit - offset)),
          `fetch chunk at offset ${offset}`
        );
        results.push(...chunk);
        if (chunk.length < chunkSize) break;
      } catch (error) {
        console.error(`[QUERY] Error fetching chunk at offset ${offset}:`, error);
        break;
      }
    }

    return results;
  }
}

// ── Normalised artifact row shape returned by all queries ─────────
// Maps each table's unique content column to the generic `content`
// field so consumers don't need to know which table was queried.
interface NormalisedArtifactRow {
  id:            string;
  session_id:    string | null;
  user_id:       string;
  title:         string;
  language:      string;
  content:       string;     // normalised from code_content / mermaid_code / base64_data
  artifact_type: string;
  file_path:     string | null;
  line_count:    number;
  created_at:    string;
  updated_at:    string;
}

// ── FIX: getAllUserArtifactsByUserId ──────────────────────────────
// Queries the 3 tables that artifactStore.ts actually writes to,
// normalises the content column, and returns a unified sorted list.
export async function getAllUserArtifactsByUserId(
  userId:       string,
  metadataOnly  = false
): Promise<NormalisedArtifactRow[]> {
  return QueryOptimizer.executeWithTimeout(
    async () => {
      const metaCols = 'id, user_id, session_id, title, language, artifact_type, line_count, created_at, updated_at, file_path';

      // Run all 3 table queries in parallel — fast even with concurrency limit
      const [codeRes, diagramRes, imageRes] = await Promise.all([

        // generated_code — content column: code_content
        supabase!
          .from('generated_code')
          .select(metadataOnly ? metaCols : `${metaCols}, code_content`)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(100),

        // generated_diagrams — content column: mermaid_code
        supabase!
          .from('generated_diagrams')
          .select(metadataOnly ? metaCols : `${metaCols}, mermaid_code`)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),

        // generated_images — content column: base64_data
        supabase!
          .from('generated_images')
          .select(metadataOnly ? metaCols : `${metaCols}, base64_data`)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (codeRes.error)    console.warn('[QUERY] generated_code error:',    codeRes.error.message);
      if (diagramRes.error) console.warn('[QUERY] generated_diagrams error:', diagramRes.error.message);
      if (imageRes.error)   console.warn('[QUERY] generated_images error:',   imageRes.error.message);

      const normalised: NormalisedArtifactRow[] = [
        ...(codeRes.data    || []).map((r: any) => ({ ...r, content: r.code_content    ?? '' })),
        ...(diagramRes.data || []).map((r: any) => ({ ...r, content: r.mermaid_code    ?? '' })),
        ...(imageRes.data   || []).map((r: any) => ({ ...r, content: r.base64_data     ?? '' })),
      ];

      // Sort newest first across all tables
      normalised.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      return normalised;
    },
    `getAllUserArtifacts:${metadataOnly ? 'meta' : 'full'}`
  );
}

// ── FIX: getArtifactsBySessionId ─────────────────────────────────
// Same approach — reads the 3 write-target tables filtered by session_id.
export async function getArtifactsBySessionId(
  sessionId:    string,
  metadataOnly  = false
): Promise<NormalisedArtifactRow[]> {
  return QueryOptimizer.executeWithTimeout(
    async () => {
      const metaCols = 'id, user_id, session_id, title, language, artifact_type, line_count, created_at, updated_at, file_path';

      const [codeRes, diagramRes, imageRes] = await Promise.all([

        supabase!
          .from('generated_code')
          .select(metadataOnly ? metaCols : `${metaCols}, code_content`)
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false })
          .limit(50),

        supabase!
          .from('generated_diagrams')
          .select(metadataOnly ? metaCols : `${metaCols}, mermaid_code`)
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false })
          .limit(30),

        supabase!
          .from('generated_images')
          .select(metadataOnly ? metaCols : `${metaCols}, base64_data`)
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (codeRes.error)    console.warn('[QUERY] generated_code session error:',    codeRes.error.message);
      if (diagramRes.error) console.warn('[QUERY] generated_diagrams session error:', diagramRes.error.message);
      if (imageRes.error)   console.warn('[QUERY] generated_images session error:',   imageRes.error.message);

      const normalised: NormalisedArtifactRow[] = [
        ...(codeRes.data    || []).map((r: any) => ({ ...r, content: r.code_content ?? '' })),
        ...(diagramRes.data || []).map((r: any) => ({ ...r, content: r.mermaid_code ?? '' })),
        ...(imageRes.data   || []).map((r: any) => ({ ...r, content: r.base64_data  ?? '' })),
      ];

      normalised.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      return normalised;
    },
    `getArtifactsBySessionId:${sessionId}:${metadataOnly ? 'meta' : 'full'}`
  );
}

// ── Unchanged: message queries ────────────────────────────────────
export async function getMessagesByConversationId(
  conversationId: string,
  limit           = 100,
  metadataOnly    = false
) {
  return QueryOptimizer.executeWithTimeout(
    async () => {
      let selectCols = 'id, role, model, timestamp, image_data, documents, conversation_id, tokens_used, input_tokens, output_tokens, grounding_chunks, metadata';
      if (!metadataOnly) selectCols += ', content';

      if (limit > 50) {
        const { data: part1, error: err1 } = await supabase!
          .from('messages')
          .select(selectCols)
          .eq('conversation_id', conversationId)
          .order('timestamp', { ascending: true })
          .limit(50);

        if (err1) throw err1;

        if (part1 && part1.length === 50) {
          const { data: part2, error: err2 } = await supabase!
            .from('messages')
            .select(selectCols)
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: true })
            .range(50, limit - 1);

          if (err2) throw err2;
          return [...(part1 || []), ...(part2 || [])];
        }

        return part1 || [];
      } else {
        const { data, error } = await supabase!
          .from('messages')
          .select(selectCols)
          .eq('conversation_id', conversationId)
          .order('timestamp', { ascending: true })
          .limit(limit);

        if (error) throw error;
        return data || [];
      }
    },
    `getMessages:${conversationId}:${metadataOnly ? 'meta' : 'full'}`
  );
}

// ── Unchanged: conversations ──────────────────────────────────────
export async function getConversationsByUserId(userId: string, limit = 50, offset = 0) {
  return QueryOptimizer.executeWithTimeout(
    async () => {
      const { data, error } = await supabase!
        .from('conversations')
        .select('id, user_id, title, created_at, last_modified, is_favorite, preferred_model')
        .eq('user_id', userId)
        .order('last_modified', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data || [];
    },
    `getConversations:${userId}:${offset}`
  );
}

// ── Unchanged: user stats ─────────────────────────────────────────
export async function getUserStats(userId: string) {
  return QueryOptimizer.executeWithTimeout(
    async () => {
      const { data, error } = await supabase!
        .from('user_stats')
        .select('user_id, tier, total_messages, monthly_messages, tokens_estimated, model_usage, daily_history')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      return data || null;
    },
    `getUserStats:${userId}`
  );
}

// ── Unchanged: preferences ────────────────────────────────────────
export async function getUserPreferences(userId: string) {
  return QueryOptimizer.executeWithTimeout(
    async () => {
      const { data, error } = await supabase!
        .from('user_preferences')
        .select('user_id, custom_instructions, response_format, language, theme, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      return data || null;
    },
    `getPreferences:${userId}`
  );
}

console.log('[QUERY] Query optimization service initialized');