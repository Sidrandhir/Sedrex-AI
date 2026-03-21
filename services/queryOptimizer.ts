/**
 * SEDREX — Query Optimization Service v1.0
 * Solves Supabase timeout issues by optimizing queries
 * Professional-grade database query optimization
 */

import { supabase } from './supabaseClient';

/**
 * Query timeout handler with automatic retries
 */
export class QueryOptimizer {
  private static readonly TIMEOUT_MS = 25000; // 25 second client timeout for large queries
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000;

  /**
   * Execute query with timeout protection and retries
   */
  static async executeWithTimeout<T>(
    query: () => Promise<T>,
    operationName: string,
    maxRetries = this.MAX_RETRIES
  ): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Wrap query with timeout
        const timeoutPromise = new Promise<T>((_, reject) =>
          setTimeout(
            () => reject(new Error('Query timeout exceeded')),
            this.TIMEOUT_MS
          )
        );

        const result = await Promise.race([query(), timeoutPromise]);
        return result;
      } catch (error: any) {
        const errorMsg = error?.message || '';
        const isTimeout =
          errorMsg.includes('timeout') ||
          errorMsg.includes('57014') ||
          errorMsg.includes('500');

        console.warn(
          `[QUERY] ${operationName} attempt ${attempt + 1} failed:`,
          errorMsg
        );

        if (!isTimeout || attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff
        await new Promise(r => setTimeout(r, this.RETRY_DELAY * (attempt + 1)));
      }
    }

    throw new Error(`Failed to execute ${operationName} after ${maxRetries} retries`);
  }

  /**
   * Chunk large result sets to avoid timeout
   */
  static async fetchInChunks<T>(
    query: (offset: number, limit: number) => Promise<T[]>,
    totalLimit = 200,
    chunkSize = 50
  ): Promise<T[]> {
    const results: T[] = [];

    for (let offset = 0; offset < totalLimit; offset += chunkSize) {
      try {
        const chunk = await this.executeWithTimeout(
          () => query(offset, Math.min(chunkSize, totalLimit - offset)),
          `fetch chunk at offset ${offset}`
        );

        results.push(...chunk);

        if (chunk.length < chunkSize) break; // No more results
      } catch (error) {
        console.error(`[QUERY] Error fetching chunk at offset ${offset}:`, error);
        break; // Return partial results
      }
    }

    return results;
  }
}

/**
 * Optimized artifact queries with chunking for performance
 */
export async function getAllUserArtifactsByUserId(userId: string) {
  return QueryOptimizer.executeWithTimeout(
    async () => {
      // Parallel fetch across the decoupled architecture plus legacy fallback
      const queries = [
        supabase!.from('artifacts').select('id, user_id, session_id, title, language, artifact_type, file_path, line_count, created_at, updated_at, content').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
        supabase!.from('generated_images').select('id, user_id, session_id, title, language, artifact_type, file_path, line_count, created_at, updated_at, base64_data').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
        supabase!.from('generated_diagrams').select('id, user_id, session_id, title, language, artifact_type, file_path, line_count, created_at, updated_at, mermaid_code').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
        supabase!.from('generated_code').select('id, user_id, session_id, title, language, artifact_type, file_path, line_count, created_at, updated_at, code_content').eq('user_id', userId).order('created_at', { ascending: false }).limit(50)
      ];

      const results = await Promise.all(queries);
      
      const unified = [
        ...(results[0].data || []),
        ...(results[1].data || []).map(r => ({ ...r, content: r.base64_data })),
        ...(results[2].data || []).map(r => ({ ...r, content: r.mermaid_code })),
        ...(results[3].data || []).map(r => ({ ...r, content: r.code_content }))
      ];

      return unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 100);
    },
    'getAllUserArtifacts'
  );
}

/**
 * Optimized session artifact queries
 */
export async function getArtifactsBySessionId(sessionId: string) {
  return QueryOptimizer.executeWithTimeout(
    async () => {
      // Parallel fetch across the decoupled architecture plus legacy fallback
      const queries = [
        supabase!.from('artifacts').select('id, user_id, session_id, title, language, artifact_type, file_path, line_count, created_at, updated_at, content').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(50),
        supabase!.from('generated_images').select('id, user_id, session_id, title, language, artifact_type, file_path, line_count, created_at, updated_at, base64_data').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(50),
        supabase!.from('generated_diagrams').select('id, user_id, session_id, title, language, artifact_type, file_path, line_count, created_at, updated_at, mermaid_code').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(50),
        supabase!.from('generated_code').select('id, user_id, session_id, title, language, artifact_type, file_path, line_count, created_at, updated_at, code_content').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(50)
      ];

      const results = await Promise.all(queries);
      
      const unified = [
        ...(results[0].data || []),
        ...(results[1].data || []).map(r => ({ ...r, content: r.base64_data })),
        ...(results[2].data || []).map(r => ({ ...r, content: r.mermaid_code })),
        ...(results[3].data || []).map(r => ({ ...r, content: r.code_content }))
      ];

      return unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    `getArtifactsBySessionId:${sessionId}`
  );
}

/**
 * Optimized message queries with chunking
 */
export async function getMessagesByConversationId(conversationId: string, limit = 100) {
  return QueryOptimizer.executeWithTimeout(
    async () => {
      // Split into 2 queries if limit > 50 to avoid timeout
      if (limit > 50) {
        const [part1, part2] = await Promise.all([
          supabase!
            .from('messages')
            .select(
              'id, role, content, model, timestamp, image_data, documents, conversation_id, tokens_used, input_tokens, output_tokens, grounding_chunks, metadata'
            )
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: true })
            .limit(50),
          supabase!
            .from('messages')
            .select(
              'id, role, content, model, timestamp, image_data, documents, conversation_id, tokens_used, input_tokens, output_tokens, grounding_chunks, metadata'
            )
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: true })
            .range(50, Math.min(50 + limit - 50, 100)),
        ]);

        if (part1.error) throw part1.error;
        if (part2.error) throw part2.error;

        return [...(part1.data || []), ...(part2.data || [])];
      } else {
        const { data, error } = await supabase!
          .from('messages')
          .select(
            'id, role, content, model, timestamp, image_data, documents, conversation_id, tokens_used, input_tokens, output_tokens, grounding_chunks, metadata'
          )
          .eq('conversation_id', conversationId)
          .order('timestamp', { ascending: true })
          .limit(limit);

        if (error) throw error;
        return data || [];
      }
    },
    `getMessages:${conversationId}`
  );
}

/**
 * Optimized conversations query
 */
export async function getConversationsByUserId(userId: string, limit = 50, offset = 0) {
  return QueryOptimizer.executeWithTimeout(
    async () => {
      const { data, error } = await supabase!
        .from('conversations')
        .select(
          'id, user_id, title, created_at, last_modified, is_favorite, preferred_model'
        )
        .eq('user_id', userId)
        .order('last_modified', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data || [];
    },
    `getConversations:${userId}:${offset}`
  );
}

/**
 * Optimized user stats query
 */
export async function getUserStats(userId: string) {
  return QueryOptimizer.executeWithTimeout(
    async () => {
      const { data, error } = await supabase!
        .from('user_stats')
        .select(
          'user_id, tier, total_messages, monthly_messages, tokens_estimated, model_usage, daily_history'
        )
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      return data || null;
    },
    `getUserStats:${userId}`
  );
}

/**
 * Optimized preferences query
 */
export async function getUserPreferences(userId: string) {
  return QueryOptimizer.executeWithTimeout(
    async () => {
      const { data, error } = await supabase!
        .from('user_preferences')
        .select(
          'user_id, custom_instructions, response_format, language, theme, updated_at'
        )
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      return data || null;
    },
    `getPreferences:${userId}`
  );
}

console.log('[QUERY] Query optimization service initialized');
