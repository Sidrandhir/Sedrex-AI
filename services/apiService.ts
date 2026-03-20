
import { ChatSession, Message, AIModel, MessageImage, UserStats, User, UserTier } from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { validateInput } from './validationService';
import { getMonthlyLimit } from './tierConfig';

export const api = {
  _cachedUserId: null as string | null,
  _cacheExpiry: 0,


  async _getUserId(): Promise<string> {
    if (!isSupabaseConfigured) throw new Error("Cloud Connectivity not established.");
    // Cache user ID for 60s to avoid repeated getSession calls
    const now = Date.now();
    if (this._cachedUserId && now < this._cacheExpiry) return this._cachedUserId;
    const { data: { session } } = await supabase!.auth.getSession();
    if (!session?.user?.id) {
      this._cachedUserId = null;
      throw new Error("Session expired. Please log in again.");
    }
    this._cachedUserId = session.user.id;
    this._cacheExpiry = now + 60_000;
    return session.user.id;
  },

  clearUserCache() {
    this._cachedUserId = null;
    this._cacheExpiry = 0;
  },

  async getPreferences(): Promise<any> {
    try {
      const userId = await this._getUserId();
      if (!userId) return {};
      const { data } = await supabase!.from('user_preferences').select('*').eq('user_id', userId).maybeSingle();
      return data || {};
    } catch (e) { 
      console.error('Error fetching preferences:', e);
      return {}; 
    }
  },

  async updatePreferences(updates: any): Promise<void> {
    try {
      const userId = await this._getUserId();
      if (!userId) throw new Error("User ID not found");
      await supabase!.from('user_preferences').upsert({
        user_id: userId,
        custom_instructions: updates.persona || '',
        response_format: updates.responseStyle || '',
        language: updates.language || 'en',
        theme: updates.theme || 'dark',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    } catch (e) {
      console.error('Error updating preferences:', e);
      throw new Error('Failed to save preferences');
    }
  },

  async getConversations(limit = 50, offset = 0): Promise<ChatSession[]> {
    try {
      const userId = await this._getUserId();
      const { data, error } = await supabase!.from('conversations')
        .select('id, user_id, title, created_at, last_modified, is_favorite, preferred_model')
        .eq('user_id', userId)
        .order('last_modified', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return (data || []).map(row => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        messages: [], 
        createdAt: new Date(row.created_at).getTime(),
        lastModified: new Date(row.last_modified).getTime(),
        isFavorite: row.is_favorite || false,
        preferredModel: row.preferred_model || 'auto'
      }));
    } catch (e) { return []; }
  },

  async createConversation(title: string): Promise<ChatSession> {
    const userId = await this._getUserId();
    const { data, error } = await supabase!.from('conversations').insert({ user_id: userId, title }).select().single();
    if (error) throw error;
    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      messages: [],
      createdAt: new Date(data.created_at).getTime(),
      lastModified: new Date(data.last_modified).getTime(),
      isFavorite: data.is_favorite || false,
      preferredModel: data.preferred_model || 'auto'
    };
  },

  async deleteConversation(id: string): Promise<void> {
    await supabase!.from('conversations').delete().eq('id', id);
  },

  async updateConversation(id: string, updates: Partial<ChatSession>): Promise<void> {
    const dbUpdates: any = { last_modified: new Date().toISOString() };
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.isFavorite !== undefined) dbUpdates.is_favorite = updates.isFavorite;
    if (updates.preferredModel !== undefined) dbUpdates.preferred_model = updates.preferredModel;
    await supabase!.from('conversations').update(dbUpdates).eq('id', id);
  },

  async getMessages(conversationId: string, limit = 100): Promise<Message[]> {
    const { data } = await supabase!.from('messages')
      .select('id, role, content, model, timestamp, image_data, documents, conversation_id, tokens_used, input_tokens, output_tokens, grounding_chunks, metadata')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true })
      .limit(limit);
    return (data || []).map(row => {
      const images = Array.isArray(row.image_data) 
        ? row.image_data 
        : (row.image_data ? [row.image_data] : []);
      return {
        id: row.id,
        role: row.role,
        content: row.content,
        model: row.model as AIModel,
        timestamp: new Date(row.timestamp).getTime(),
        image: images[0],
        images: images,
        documents: row.documents || [],
        conversationId: row.conversation_id,
        tokensUsed: row.tokens_used || 0,
        inputTokens: row.input_tokens || 0,
        outputTokens: row.output_tokens || 0,
        groundingChunks: row.grounding_chunks,
        routingContext: row.metadata
      };
    });
  },

  async saveMessage(conversationId: string, message: Partial<Message>): Promise<Message> {
    const { data, error } = await supabase!.from('messages').insert({
      conversation_id: conversationId,
      role: message.role,
      content: message.content,
      model: message.model,
      image_data: message.images || (message.image ? [message.image] : null),
      documents: message.documents || [],
      grounding_chunks: message.groundingChunks,
      metadata: message.routingContext,
      tokens_used: message.tokensUsed,
      input_tokens: message.inputTokens,
      output_tokens: message.outputTokens
    }).select().single();
    if (error) throw error;
    const images = Array.isArray(data.image_data) 
      ? data.image_data 
      : (data.image_data ? [data.image_data] : []);
    return {
      id: data.id,
      role: data.role,
      content: data.content,
      model: data.model as AIModel,
      timestamp: new Date(data.timestamp).getTime(),
      image: images[0],
      images: images,
      documents: data.documents || [],
      conversationId: data.conversation_id,
      tokensUsed: data.tokens_used,
      inputTokens: data.input_tokens,
      outputTokens: data.output_tokens,
      groundingChunks: data.grounding_chunks,
      routingContext: data.metadata
    };
  },

  async getUserStats(): Promise<UserStats> {
    const userId = await this._getUserId();
    const { data } = await supabase!.from('user_stats').select('*').eq('user_id', userId).maybeSingle();
    return {
      userId: data?.user_id || userId,
      tier: data?.tier || 'free',
      totalMessagesSent: data?.total_messages || 0,
      monthlyMessagesSent: data?.monthly_messages || 0,
      monthlyMessagesLimit: getMonthlyLimit(data?.tier),
      tokensEstimated: data?.tokens_estimated || 0,
      modelUsage: data?.model_usage || {},
      dailyHistory: data?.daily_history || []
    };
  },

  async updateTier(tier: UserTier): Promise<void> {
    const userId = await this._getUserId();
    await supabase!.from('profiles').update({ tier, updated_at: new Date().toISOString() }).eq('id', userId);
    await supabase!.from('user_stats').update({ tier }).eq('user_id', userId);
  },

  async purgeAllConversations(): Promise<void> {
    const userId = await this._getUserId();
    await supabase!.from('conversations').delete().eq('user_id', userId);
    this.clearUserCache();
  }
};
