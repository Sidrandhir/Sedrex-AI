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
  private static readonly TIMEOUT_MS = 30000; // Increased to 30s for heavy loads
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1500; // Increased backoff delay

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
 * Optimized artifact queries - FIXED to query ONLY artifacts table
 */
export async function getAllUserArtifactsByUserId(userId: string) {
  return QueryOptimizer.executeWithTimeout(
    async () => {
      // Single, optimized query to artifacts table with essential columns only
      const { data, error } = await supabase!
        .from('artifacts')
        .select('id, user_id, session_id, title, language, artifact_type, content, line_count, created_at, updated_at, file_path')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
    'getAllUserArtifacts'
  );
}

/**
 * Optimized session artifact queries - FIXED to query ONLY artifacts table
 */
/**
 * Optimized session artifact queries
 */
export async function getArtifactsBySessionId(sessionId: string, metadataOnly = false) {
  return QueryOptimizer.executeWithTimeout(
    async () => {
      let selectCols = 'id, user_id, session_id, title, language, artifact_type, line_count, created_at, updated_at, file_path';
      if (!metadataOnly) selectCols += ', content'; // Only include content if needed

      const { data, error } = await supabase!
        .from('artifacts')
        .select(selectCols)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    `getArtifactsBySessionId:${sessionId}:${metadataOnly ? 'meta' : 'full'}`
  );
}

/**
 * Optimized message queries with sequential chunking to prevent 57014 (timeout)
 */
export async function getMessagesByConversationId(
  conversationId: string, 
  limit = 100, 
  metadataOnly = false
) {
  return QueryOptimizer.executeWithTimeout(
    async () => {
      let selectCols = 'id, role, model, timestamp, image_data, documents, conversation_id, tokens_used, input_tokens, output_tokens, grounding_chunks, metadata';
      if (!metadataOnly) selectCols += ', content';

      // ── SURGICAL FETCHING: Sequential Chunking ──────────────────────
      // We avoid Promise.all for large selects as it saturates the 
      // statement timeout limits on small Supabase instances.
      if (limit > 50) {
        const { data: part1, error: err1 } = await supabase!
          .from('messages')
          .select(selectCols)
          .eq('conversation_id', conversationId)
          .order('timestamp', { ascending: true })
          .limit(50);
        
        if (err1) throw err1;

        // Only fetch second part if we hit the limit of the first
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
