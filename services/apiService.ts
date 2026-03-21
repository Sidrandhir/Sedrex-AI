
import { ChatSession, Message, AIModel, MessageImage, UserStats, User, UserTier } from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { validateInput } from './validationService';
import { getMonthlyLimit } from './tierConfig';
import {
  ConversationCache,
  MessageCache,
  UserStatsCache,
  PreferenceCache,
  ConversationDeduplicator,
  MessageDeduplicator,
  CacheManager,
} from './cacheService';
import {
  QueryOptimizer,
  getMessagesByConversationId,
  getConversationsByUserId,
  getUserStats as getOptimizedUserStats,
  getUserPreferences,
} from './queryOptimizer';
import { persistenceService } from './persistenceService';

// ═══════════════════════════════════════════════════════════════════
// SEDREX API SERVICE v2.0 — OPTIMIZED FOR PERFORMANCE
// Professional-grade caching, error handling, and parallel loading
// Built with 30+ years industry best practices
// ═══════════════════════════════════════════════════════════════════

const API_ERROR_MESSAGES = {
  NO_DB: "Cloud Connectivity not established.",
  NO_USER: "User ID not found",
  SESSION_EXPIRED: "Session expired. Please log in again.",
  SAVE_FAILED: "Failed to save message. Retrying...",
  FETCH_FAILED: "Failed to load data. Retrying...",
};

export const api = {
  _cachedUserId: null as string | null,
  _cacheExpiry: 0,
  _requestRetries: new Map<string, number>(),

  /**
   * Get current user ID with automatic caching + validation
   * Handles session refresh and expiration gracefully
   */
  async _getUserId(forceRefresh = false): Promise<string> {
    if (!isSupabaseConfigured) throw new Error(API_ERROR_MESSAGES.NO_DB);

    const now = Date.now();
    if (!forceRefresh && this._cachedUserId && now < this._cacheExpiry) {
      return this._cachedUserId;
    }

    try {
      const { data: { session } } = await supabase!.auth.getSession();
      if (!session?.user?.id) {
        this._cachedUserId = null;
        this._cacheExpiry = 0;
        throw new Error(API_ERROR_MESSAGES.SESSION_EXPIRED);
      }

      this._cachedUserId = session.user.id;
      this._cacheExpiry = now + 60_000;
      return session.user.id;
    } catch (error) {
      this._cachedUserId = null;
      this._cacheExpiry = 0;
      throw error;
    }
  },

  clearUserCache() {
    this._cachedUserId = null;
    this._cacheExpiry = 0;
    CacheManager.invalidateAllConversations();
  },

  /**
   * Fetch user preferences with retry logic and timeout protection
   * Now using queryOptimizer for exponential backoff and error recovery
   */
  async getPreferences(): Promise<any> {
    try {
      const userId = await this._getUserId();
      const cacheKey = `prefs:${userId}`;

      const cached = PreferenceCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Use optimized query with retry logic and timeout protection
      const data = await getUserPreferences(userId);

      const result = data || {};
      PreferenceCache.set(cacheKey, result);
      return result;
    } catch (error: any) {
      // Return empty object on timeout errors for graceful degradation
      if (error?.code === '57014' || error?.message?.includes('timeout')) {
        console.warn('[getPreferences] Query timeout, using defaults');
        return {};
      }
      console.error('[API] Error fetching preferences:', error);
      return {};
    }
  },

  /**
   * Update preferences with cache invalidation
   */
  async updatePreferences(updates: any): Promise<void> {
    try {
      const userId = await this._getUserId();
      if (!userId) throw new Error(API_ERROR_MESSAGES.NO_USER);

      const { error } = await supabase!.from('user_preferences').upsert({
        user_id: userId,
        custom_instructions: updates.persona || '',
        response_format: updates.responseStyle || '',
        language: updates.language || 'en',
        theme: updates.theme || 'dark',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      if (error) throw error;
      PreferenceCache.delete(`prefs:${userId}`);
    } catch (error) {
      console.error('[API] Error updating preferences:', error);
      throw new Error('Failed to save preferences');
    }
  },

  /**
   * Load conversations with intelligent caching & deduplication
   * Parallel-ready for faster initial load
   * Now using queryOptimizer for retry logic and exponential backoff
   */
  async getConversations(limit = 30, offset = 0): Promise<ChatSession[]> {
    try {
      const userId = await this._getUserId();
      const cacheKey = `convs:${userId}:${offset}:${limit}`;

      // Check cache first
      const cached = ConversationCache.get(cacheKey);
      if (cached) return cached;

      // Deduplicate parallel requests
      return await ConversationDeduplicator.deduplicate(cacheKey, async () => {
        // Use optimized query with retry logic, timeout protection, and exponential backoff
        const data = await getConversationsByUserId(userId, limit, offset);

        const sessions = (data || []).map(row => ({
          id: row.id,
          userId: row.user_id,
          title: row.title,
          messages: [],
          createdAt: new Date(row.created_at).getTime(),
          lastModified: new Date(row.last_modified || row.updated_at).getTime(),
          isFavorite: row.is_favorite || false,
          preferredModel: row.preferred_model || 'auto',
        }));

        // Cache result (25 min for conversations)
        ConversationCache.set(cacheKey, sessions, 25 * 60 * 1000);
        
        // ── PERSISTENCE SYNC ──────────────────────────────────────────
        // Save to persistent local storage for 0ms load next time
        if (offset === 0) persistenceService.saveSessions(sessions);
        
        return sessions;
      });
    } catch (error: any) {
      // Graceful degradation
      if (error?.code === '57014' || error?.message?.includes('timeout')) {
        console.warn('[API] Conversations load timeout');
        return [];
      }
      console.error('[API] Error fetching conversations:', error);
      return [];
    }
  },

  /**
   * Create new conversation with cache invalidation
   */
  async createConversation(title: string): Promise<ChatSession> {
    try {
      const userId = await this._getUserId();
      const { data, error } = await supabase!
        .from('conversations')
        .insert({ user_id: userId, title })
        .select()
        .single();

      if (error) throw error;

      const session = {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        messages: [],
        createdAt: new Date(data.created_at).getTime(),
        lastModified: new Date(data.last_modified).getTime(),
        isFavorite: data.is_favorite || false,
        preferredModel: data.preferred_model || 'auto',
      };

      // Invalidate conversation list cache
      CacheManager.invalidateAllConversations();
      return session;
    } catch (error) {
      console.error('[API] Error creating conversation:', error);
      throw error;
    }
  },

  /**
   * Delete conversation with cache cleanup
   */
  async deleteConversation(id: string): Promise<void> {
    try {
      const { error } = await supabase!
        .from('conversations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      CacheManager.invalidateConversation(id);
    } catch (error) {
      console.error('[API] Error deleting conversation:', error);
      throw error;
    }
  },

  /**
   * Update conversation metadata
   */
  async updateConversation(id: string, updates: Partial<ChatSession>): Promise<void> {
    try {
      const dbUpdates: any = { last_modified: new Date().toISOString() };
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.isFavorite !== undefined) dbUpdates.is_favorite = updates.isFavorite;
      if (updates.preferredModel !== undefined) dbUpdates.preferred_model = updates.preferredModel;

      const { error } = await supabase!
        .from('conversations')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;
      CacheManager.invalidateConversation(id);
    } catch (error) {
      console.error('[API] Error updating conversation:', error);
      throw error;
    }
  },

  /**
   * Load messages with intelligent caching & deduplication
   * Parallel-ready for faster message loading
   * Now using queryOptimizer for chunking and exponential backoff on retries
   */
  async getMessages(conversationId: string, limit = 50, metadataOnly = false): Promise<Message[]> {
    try {
      const cacheKey = `msgs:${conversationId}:${limit}:${metadataOnly ? 'meta' : 'full'}`;

      // Check cache first
      const cached = MessageCache.get(cacheKey);
      if (cached) return cached;

      // Deduplicate parallel requests
      return await MessageDeduplicator.deduplicate(cacheKey, async () => {
        // Use optimized query with timeout protection, sequential chunking, and retry logic
        const data = await getMessagesByConversationId(conversationId, limit, metadataOnly);

        const messages = (data || []).map(row => {
          const images = Array.isArray(row.image_data)
            ? row.image_data
            : row.image_data
            ? [row.image_data]
            : [];

          return {
            id: row.id,
            role: row.role,
            content: row.content,
            model: row.model as AIModel,
            timestamp: new Date(row.timestamp).getTime(),
            image: images[0],
            images,
            documents: row.documents || [],
            conversationId: row.conversation_id,
            tokensUsed: row.tokens_used || 0,
            inputTokens: row.input_tokens || 0,
            outputTokens: row.output_tokens || 0,
            groundingChunks: row.metadata?.grounding_chunks,
            routingContext: row.metadata,
            generatedImageUrl: row.metadata?.generatedImageUrl,
          };
        });

        // Cache result
        MessageCache.set(cacheKey, messages, 20 * 60 * 1000); // 20 min cache
        
        // ── PERSISTENCE SYNC ──────────────────────────────────────────
        // Save to persistent local storage for 0ms load next time
        // IMPORTANT: Never save metadata-only syncs to persistence to avoid overwriting full content
        if (limit >= 30 && !metadataOnly) {
          persistenceService.saveMessages(conversationId, messages);
        }
        
        return messages;
      });
    } catch (error: any) {
      // Graceful degradation on timeout errors
      if (error?.code === '57014' || error?.message?.includes('timeout')) {
        console.warn('[API] Message load timeout, returning empty array');
        return [];
      }
      console.error('[API] Error fetching messages:', error);
      return [];
    }
  },

  /**
   * Save message with retry logic and error propagation
   */
  async saveMessage(conversationId: string, message: Partial<Message>): Promise<Message> {
    const maxRetries = 3;
    const retryKey = `save:${conversationId}:${Date.now()}`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { data, error } = await supabase!
          .from('messages')
          .insert({
            conversation_id: conversationId,
            role: message.role,
            content: message.content,
            model: message.model,
            image_data: message.images || (message.image ? [message.image] : null),
            documents: message.documents || [],
            grounding_chunks: message.groundingChunks,
            metadata: { ...message.routingContext, generatedImageUrl: message.generatedImageUrl },
            tokens_used: message.tokensUsed,
            input_tokens: message.inputTokens,
            output_tokens: message.outputTokens,
          })
          .select()
          .single();

        if (error) throw error;

        const images = Array.isArray(data.image_data)
          ? data.image_data
          : data.image_data
          ? [data.image_data]
          : [];

        const result: Message = {
          id: data.id,
          role: data.role,
          content: data.content,
          model: data.model as AIModel,
          timestamp: new Date(data.timestamp).getTime(),
          image: images[0],
          images,
          documents: data.documents || [],
          conversationId: data.conversation_id,
          tokensUsed: data.tokens_used,
          inputTokens: data.input_tokens,
          outputTokens: data.output_tokens,
          groundingChunks: data.grounding_chunks,
          routingContext: data.metadata,
          generatedImageUrl: data.metadata?.generatedImageUrl,
        };

        // Invalidate message cache
        MessageCache.delete(`msgs:${conversationId}:100`);
        
        // ── PERSISTENCE SYNC ──────────────────────────────────────────
        // Update local persistent history immediately
        const history = persistenceService.loadMessages(conversationId);
        persistenceService.saveMessages(conversationId, [...history, result]);

        return result;
      } catch (error) {
        if (attempt === maxRetries - 1) {
          console.error(`[API] Failed to save message after ${maxRetries} attempts:`, error);
          throw error;
        }
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }

    throw new Error(API_ERROR_MESSAGES.SAVE_FAILED);
  },

  /**
   * Get user stats with retry logic and timeout protection
   * Uses queryOptimizer for exponential backoff and error recovery
   */
  async getUserStats(): Promise<UserStats> {
    try {
      const userId = await this._getUserId();
      const cacheKey = `stats:${userId}`;

      const cached = UserStatsCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Use optimized query with retry logic and timeout protection
      const data = await getOptimizedUserStats(userId);

      const stats: UserStats = {
        userId: data?.user_id || userId,
        tier: data?.tier || 'free',
        totalMessagesSent: data?.total_messages || 0,
        monthlyMessagesSent: data?.monthly_messages || 0,
        monthlyMessagesLimit: getMonthlyLimit(data?.tier),
        tokensEstimated: data?.tokens_estimated || 0,
        modelUsage: data?.model_usage || {},
        dailyHistory: data?.daily_history || [],
      };

      UserStatsCache.set(cacheKey, stats);
      return stats;
    } catch (error: any) {
      // Return default stats on timeout errors
      if (error?.code === '57014' || error?.message?.includes('timeout')) {
        console.warn('[getUserStats] Query timeout, returning default stats');
        const defaultStats: UserStats = {
          userId: await this._getUserId(),
          tier: 'free',
          totalMessagesSent: 0,
          monthlyMessagesSent: 0,
          monthlyMessagesLimit: 10,
          tokensEstimated: 0,
          modelUsage: {},
          dailyHistory: [],
        };
        return defaultStats;
      }
      console.error('[API] Error fetching user stats:', error);
      throw error;
    }
  },

  /**
   * Update user tier with cache invalidation
   */
  async updateTier(tier: UserTier): Promise<void> {
    try {
      const userId = await this._getUserId();

      const { error: profileError } = await supabase!
        .from('profiles')
        .update({ tier, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (profileError) throw profileError;

      const { error: statsError } = await supabase!
        .from('user_stats')
        .update({ tier })
        .eq('user_id', userId);

      if (statsError) throw statsError;

      CacheManager.invalidateUserStats(userId);
    } catch (error) {
      console.error('[API] Error updating tier:', error);
      throw error;
    }
  },

  /**
   * Purge all conversations for user
   */
  async purgeAllConversations(): Promise<void> {
    try {
      const userId = await this._getUserId();

      const { error } = await supabase!
        .from('conversations')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      this.clearUserCache();
    } catch (error) {
      console.error('[API] Error purging conversations:', error);
      throw error;
    }
  },

  /**
   * Parallel load conversations + first message batch
   * Optimized for fast initial UI render
   * OPTIMIZED: Reduced limits to avoid timeouts
   */
  async loadInitialChatData(limit = 20): Promise<{
    sessions: ChatSession[];
    firstSessionMessages: Message[];
    fromCache: boolean;
  }> {
    try {
      // ── HYPER-OPTIMIZATION: Instant Persistent Load ────────────────
      const cachedSessions = persistenceService.loadSessions() as ChatSession[];
      const lastId = persistenceService.getLastActiveSessionId();
      const cachedMsgs = lastId ? persistenceService.loadMessages(lastId) : [];

      if (cachedSessions.length > 0) {
        console.log('[API] Instant Loading from Persistence Cache...');
        return { 
          sessions: cachedSessions, 
          firstSessionMessages: cachedMsgs,
          fromCache: true 
        };
      }

      // ── FALLBACK: Fetch from Cloud if cache empty ──────────────────
      const sessions = await this.getConversations(limit, 0);

      if (sessions.length === 0) {
        return { sessions: [], firstSessionMessages: [] };
      }

      // OPTIMIZATION: Load only recent messages (30 instead of 100)
      const firstSessionMessages = await this.getMessages(sessions[0].id, 30);

      return { sessions, firstSessionMessages, fromCache: false };
    } catch (error: any) {
      // TIMEOUT HANDLING: Return partial data on timeout
      if (error?.code === '57014' || error?.message?.includes('timeout')) {
        console.warn('[API] Initial data load timed out, returning sessions only');
        const sessions = [];
        try {
          // Retry conversations alone if combined load fails
          const convs = await this.getConversations(15, 0);
          return { sessions: convs, firstSessionMessages: [] };
        } catch (retryError) {
          return { sessions: [], firstSessionMessages: [] };
        }
      }
      console.error('[API] Error loading initial chat data:', error);
      return { sessions: [], firstSessionMessages: [] };
    }
  },

  /**
   * Batch load messages for multiple sessions (for sidebar preview)
   */
  async loadSessionPreviews(sessionIds: string[]): Promise<Record<string, Message[]>> {
    try {
      const results = await Promise.allSettled(
        sessionIds.map(id => this.getMessages(id, 5))
      );

      const previews: Record<string, Message[]> = {};
      sessionIds.forEach((id, idx) => {
        previews[id] = results[idx].status === 'fulfilled' ? results[idx].value : [];
      });

      return previews;
    } catch (error) {
      console.error('[API] Error loading session previews:', error);
      return {};
    }
  },
};
