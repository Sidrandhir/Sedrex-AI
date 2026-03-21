// services/apiService.ts
// ═══════════════════════════════════════════════════════════════════
// SEDREX API SERVICE v2.1 — DATA CONSISTENCY FIXES
//
// FIXES in this version:
//   ✅ FIX 1 — Page refresh shows stale data:
//      persistenceService cache now has a 10-minute TTL check.
//      If cache is older than 10 min, skip it and load from cloud.
//      Previously: cache was served with NO expiry — ever.
//
//   ✅ FIX 2 — New messages disappear on refresh:
//      saveMessage() was calling MessageCache.delete(`msgs:${id}:100`)
//      but stored key is `msgs:${id}:${limit}:meta/full`.
//      Fixed to use CacheManager.invalidateConversation(id) which
//      now uses prefix-delete to clear ALL variants (see cacheService.ts fix).
//
//   ✅ FIX 3 — New conversation not shown after page refresh:
//      After creating a conversation, we now also invalidate the
//      ConversationCache prefix so the next load fetches from DB.
//
//   All other logic, retry behaviour, and optimizations unchanged.
// ═══════════════════════════════════════════════════════════════════

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

const API_ERROR_MESSAGES = {
  NO_DB:          'Cloud Connectivity not established.',
  NO_USER:        'User ID not found',
  SESSION_EXPIRED:'Session expired. Please log in again.',
  SAVE_FAILED:    'Failed to save message. Retrying...',
  FETCH_FAILED:   'Failed to load data. Retrying...',
};

// ── FIX 1: Persistence cache TTL ─────────────────────────────────
// Sessions saved to localStorage are considered fresh for 10 minutes.
// After that, skip the cache and fetch from Supabase so the user
// always sees their latest conversations on page refresh.
const PERSISTENCE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PERSISTENCE_CACHE_TS_KEY = 'sedrex_cache_sessions_ts';

function markPersistenceCacheSaved() {
  try {
    localStorage.setItem(PERSISTENCE_CACHE_TS_KEY, String(Date.now()));
  } catch {}
}

function isPersistenceCacheFresh(): boolean {
  try {
    const ts = parseInt(localStorage.getItem(PERSISTENCE_CACHE_TS_KEY) || '0', 10);
    return (Date.now() - ts) < PERSISTENCE_CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export const api = {
  _cachedUserId: null as string | null,
  _cacheExpiry: 0,
  _requestRetries: new Map<string, number>(),

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
        this._cacheExpiry  = 0;
        throw new Error(API_ERROR_MESSAGES.SESSION_EXPIRED);
      }

      this._cachedUserId = session.user.id;
      this._cacheExpiry  = now + 60_000;
      return session.user.id;
    } catch (error) {
      this._cachedUserId = null;
      this._cacheExpiry  = 0;
      throw error;
    }
  },

  clearUserCache() {
    this._cachedUserId = null;
    this._cacheExpiry  = 0;
    CacheManager.invalidateAllConversations();
    // Also clear persistence timestamp so next load hits cloud
    try { localStorage.removeItem(PERSISTENCE_CACHE_TS_KEY); } catch {}
  },

  async getPreferences(): Promise<any> {
    try {
      const userId   = await this._getUserId();
      const cacheKey = `prefs:${userId}`;

      const cached = PreferenceCache.get(cacheKey);
      if (cached) return cached;

      const data   = await getUserPreferences(userId);
      const result = data || {};
      PreferenceCache.set(cacheKey, result);
      return result;
    } catch (error: any) {
      if (error?.code === '57014' || error?.message?.includes('timeout')) {
        console.warn('[getPreferences] Query timeout, using defaults');
        return {};
      }
      console.error('[API] Error fetching preferences:', error);
      return {};
    }
  },

  async updatePreferences(updates: any): Promise<void> {
    try {
      const userId = await this._getUserId();
      if (!userId) throw new Error(API_ERROR_MESSAGES.NO_USER);

      const { error } = await supabase!.from('user_preferences').upsert({
        user_id:             userId,
        custom_instructions: updates.persona        || '',
        response_format:     updates.responseStyle  || '',
        language:            updates.language        || 'en',
        theme:               updates.theme           || 'dark',
        updated_at:          new Date().toISOString(),
      }, { onConflict: 'user_id' });

      if (error) throw error;
      PreferenceCache.delete(`prefs:${userId}`);
    } catch (error) {
      console.error('[API] Error updating preferences:', error);
      throw new Error('Failed to save preferences');
    }
  },

  async getConversations(limit = 30, offset = 0): Promise<ChatSession[]> {
    try {
      const userId   = await this._getUserId();
      const cacheKey = `convs:${userId}:${offset}:${limit}`;

      const cached = ConversationCache.get(cacheKey) as ChatSession[] | null;
      if (cached && Array.isArray(cached)) return cached;

      return await ConversationDeduplicator.deduplicate(cacheKey, async () => {
        const data = await getConversationsByUserId(userId, limit, offset);

        const sessions = ((data as any[]) || []).map(row => ({
          id:             row.id,
          userId:         row.user_id,
          title:          row.title,
          messages:       [],
          createdAt:      new Date(row.created_at).getTime(),
          lastModified:   new Date(row.last_modified || row.created_at).getTime(),
          isFavorite:     row.is_favorite    || false,
          preferredModel: row.preferred_model || 'auto',
        }));

        ConversationCache.set(cacheKey, sessions, 25 * 60 * 1000);

        if (offset === 0) {
          persistenceService.saveSessions(sessions);
          markPersistenceCacheSaved(); // ← FIX 1: stamp when we save fresh data
        }

        return sessions;
      });
    } catch (error: any) {
      if (error?.code === '57014' || error?.message?.includes('timeout')) {
        console.warn('[API] Conversations load timeout');
        return [];
      }
      console.error('[API] Error fetching conversations:', error);
      return [];
    }
  },

  async createConversation(title: string): Promise<ChatSession> {
    try {
      const userId = await this._getUserId();
      const { data, error } = await supabase!
        .from('conversations')
        .insert({ user_id: userId, title })
        .select()
        .single();

      if (error) throw error;

      const session: ChatSession = {
        id:             data.id,
        userId:         data.user_id,
        title:          data.title,
        messages:       [],
        createdAt:      new Date(data.created_at).getTime(),
        lastModified:   new Date(data.last_modified).getTime(),
        isFavorite:     data.is_favorite    || false,
        preferredModel: data.preferred_model || 'auto',
      };

      // ── FIX 3: Invalidate ALL conversation caches so sidebar
      // shows the new chat immediately AND after next refresh.
      CacheManager.invalidateAllConversations();
      // Expire the persistence timestamp so next refresh hits cloud
      try { localStorage.removeItem(PERSISTENCE_CACHE_TS_KEY); } catch {}

      return session;
    } catch (error) {
      console.error('[API] Error creating conversation:', error);
      throw error;
    }
  },

  async deleteConversation(id: string): Promise<void> {
    try {
      const { error } = await supabase!
        .from('conversations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      CacheManager.invalidateConversation(id);
      // Expire persistence so refresh shows deletion
      try { localStorage.removeItem(PERSISTENCE_CACHE_TS_KEY); } catch {}
    } catch (error) {
      console.error('[API] Error deleting conversation:', error);
      throw error;
    }
  },

  async updateConversation(id: string, updates: Partial<ChatSession>): Promise<void> {
    try {
      const dbUpdates: any = { last_modified: new Date().toISOString() };
      if (updates.title          !== undefined) dbUpdates.title           = updates.title;
      if (updates.isFavorite     !== undefined) dbUpdates.is_favorite     = updates.isFavorite;
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

  async getMessages(conversationId: string, limit = 50, metadataOnly = false): Promise<Message[]> {
    try {
      const cacheKey = `msgs:${conversationId}:${limit}:${metadataOnly ? 'meta' : 'full'}`;

      const cached = MessageCache.get(cacheKey) as Message[] | null;
      if (cached && Array.isArray(cached)) return cached;

      return await MessageDeduplicator.deduplicate(cacheKey, async () => {
        const data = await getMessagesByConversationId(conversationId, limit, metadataOnly);

        const messages = ((data as any[]) || []).map(row => {
          const images = Array.isArray(row.image_data)
            ? row.image_data
            : row.image_data
            ? [row.image_data]
            : [];

          return {
            id:                 row.id,
            role:               row.role,
            content:            row.content,
            model:              row.model as AIModel,
            timestamp:          new Date(row.timestamp).getTime(),
            image:              images[0],
            images,
            documents:          row.documents          || [],
            conversationId:     row.conversation_id,
            tokensUsed:         row.tokens_used        || 0,
            inputTokens:        row.input_tokens       || 0,
            outputTokens:       row.output_tokens      || 0,
            groundingChunks:    row.metadata?.grounding_chunks,
            routingContext:     row.metadata,
            generatedImageUrl:  row.metadata?.generatedImageUrl,
          };
        });

        MessageCache.set(cacheKey, messages, 20 * 60 * 1000);

        if (limit >= 30 && !metadataOnly) {
          persistenceService.saveMessages(conversationId, messages);
        }

        return messages;
      });
    } catch (error: any) {
      if (error?.code === '57014' || error?.message?.includes('timeout')) {
        console.warn('[API] Message load timeout, returning empty array');
        return [];
      }
      console.error('[API] Error fetching messages:', error);
      return [];
    }
  },

  async saveMessage(conversationId: string, message: Partial<Message>): Promise<Message> {
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const data = await QueryOptimizer.executeMutation(async () => {
          const { data, error } = await supabase!
            .from('messages')
            .insert({
              conversation_id: conversationId,
              role:            message.role,
              content:         message.content,
              model:           message.model,
              image_data:      message.images || (message.image ? [message.image] : null),
              documents:       message.documents || [],
              grounding_chunks:message.groundingChunks,
              metadata:        { ...message.routingContext, generatedImageUrl: message.generatedImageUrl },
              tokens_used:     message.tokensUsed,
              input_tokens:    message.inputTokens,
              output_tokens:   message.outputTokens,
            })
            .select()
            .single();

          if (error) throw error;
          return data;
        }, `saveMessage:${conversationId}`);

        const images = Array.isArray(data.image_data)
          ? data.image_data
          : data.image_data
          ? [data.image_data]
          : [];

        const result: Message = {
          id:                data.id,
          role:              data.role,
          content:           data.content,
          model:             data.model as AIModel,
          timestamp:         new Date(data.timestamp).getTime(),
          image:             images[0],
          images,
          documents:         data.documents          || [],
          conversationId:    data.conversation_id,
          tokensUsed:        data.tokens_used,
          inputTokens:       data.input_tokens,
          outputTokens:      data.output_tokens,
          groundingChunks:   data.grounding_chunks,
          routingContext:    data.metadata,
          generatedImageUrl: data.metadata?.generatedImageUrl,
        };

        // ── FIX 2: Clear ALL message cache variants for this conversation ──
        // Old:  MessageCache.delete(`msgs:${conversationId}:100`)
        //       → Only cleared one specific key, leaving all other variants stale
        // New:  CacheManager.invalidateConversation() uses prefix-delete in cacheService
        //       → Clears msgs:${id}:50:full, msgs:${id}:100:full, msgs:${id}:50:meta, etc.
        CacheManager.invalidateConversation(conversationId);

        // Update local persistence immediately
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

  async getUserStats(): Promise<UserStats> {
    try {
      const userId   = await this._getUserId();
      const cacheKey = `stats:${userId}`;

      const cached = UserStatsCache.get(cacheKey) as UserStats | null;
      if (cached && cached.userId) return cached;

      const data = await getOptimizedUserStats(userId);

      const stats: UserStats = {
        userId:               data?.user_id            || userId,
        tier:                 data?.tier               || 'free',
        totalMessagesSent:    data?.total_messages     || 0,
        monthlyMessagesSent:  data?.monthly_messages   || 0,
        monthlyMessagesLimit: getMonthlyLimit(data?.tier),
        tokensEstimated:      data?.tokens_estimated   || 0,
        modelUsage:           data?.model_usage        || {},
        dailyHistory:         data?.daily_history      || [],
      };

      UserStatsCache.set(cacheKey, stats);
      return stats;
    } catch (error: any) {
      if (error?.code === '57014' || error?.message?.includes('timeout')) {
        console.warn('[getUserStats] Query timeout, returning default stats');
        return {
          userId:               await this._getUserId(),
          tier:                 'free',
          totalMessagesSent:    0,
          monthlyMessagesSent:  0,
          monthlyMessagesLimit: 10,
          tokensEstimated:      0,
          modelUsage:           {},
          dailyHistory:         [],
        };
      }
      console.error('[API] Error fetching user stats:', error);
      throw error;
    }
  },

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

  async loadInitialChatData(limit = 20): Promise<{
    sessions: ChatSession[];
    firstSessionMessages: Message[];
    fromCache: boolean;
  }> {
    try {
      // ── FIX 1: Only serve persistence cache if it's fresh (< 10 min) ──
      // Old: served cache unconditionally, forever — users saw hours-old data on refresh
      // New: if cache is stale, fall through to cloud fetch immediately
      const cachedSessions = persistenceService.loadSessions() as ChatSession[];
      const lastId         = persistenceService.getLastActiveSessionId();
      const cachedMsgs     = lastId ? persistenceService.loadMessages(lastId) : [];

      if (cachedSessions.length > 0 && isPersistenceCacheFresh()) {
        console.log('[API] Serving from fresh persistence cache');
        return {
          sessions:             cachedSessions,
          firstSessionMessages: cachedMsgs,
          fromCache:            true,
        };
      }

      // Cache is stale or empty — fetch from cloud
      console.log('[API] Persistence cache stale or empty, fetching from cloud');
      const sessions = await this.getConversations(limit, 0);

      if (sessions.length === 0) {
        return { sessions: [], firstSessionMessages: [], fromCache: false };
      }

      const firstSessionMessages = await this.getMessages(sessions[0].id, 30);

      return { sessions, firstSessionMessages, fromCache: false };
    } catch (error: any) {
      if (error?.code === '57014' || error?.message?.includes('timeout')) {
        console.warn('[API] Initial data load timed out');
        try {
          const convs = await this.getConversations(15, 0);
          return { sessions: convs, firstSessionMessages: [], fromCache: false };
        } catch {
          return { sessions: [], firstSessionMessages: [], fromCache: false };
        }
      }
      console.error('[API] Error loading initial chat data:', error);
      return { sessions: [], firstSessionMessages: [], fromCache: false };
    }
  },

  async loadSessionPreviews(sessionIds: string[]): Promise<Record<string, Message[]>> {
    const previews: Record<string, Message[]> = {};
    for (const id of sessionIds) {
      try {
        previews[id] = await this.getMessages(id, 5, true);
      } catch {
        previews[id] = [];
      }
    }
    return previews;
  },
};