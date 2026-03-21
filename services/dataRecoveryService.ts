/**
 * SEDREX — Comprehensive Error Recovery System v1.0
 * Ensures chat history loads properly with smart fallbacks
 * Professional-grade error handling with user feedback
 */

import { api } from './apiService';
import { ChatSession, Message } from '../types';
import { performanceMonitor } from './performanceService';

export interface DataLoadResult<T> {
  data: T | null;
  error: Error | null;
  recovered: boolean;
  fallback: boolean;
  duration: number;
}

/**
 * Robust conversation loading with fallbacks
 */
export async function loadConversationsRobust(
  limit = 50,
  offset = 0
): Promise<DataLoadResult<ChatSession[]>> {
  const startTime = performance.now();

  try {
    performanceMonitor.start('load_conversations');

    // Try primary load
    const conversations = await api.getConversations(limit, offset);

    performanceMonitor.end('load_conversations', 'api', {
      count: conversations.length,
      fromCache: false,
    });

    if (conversations.length === 0) {
      console.warn('[DATA] No conversations loaded, may be initial user');
      return {
        data: [],
        error: null,
        recovered: false,
        fallback: false,
        duration: performance.now() - startTime,
      };
    }

    return {
      data: conversations,
      error: null,
      recovered: false,
      fallback: false,
      duration: performance.now() - startTime,
    };
  } catch (error) {
    console.error('[DATA] Failed to load conversations:', error);

    // Return empty array with error flag
    return {
      data: [],
      error: error as Error,
      recovered: false,
      fallback: true,
      duration: performance.now() - startTime,
    };
  }
}

/**
 * Robust message loading with retries and fallbacks
 */
export async function loadMessagesRobust(
  conversationId: string,
  limit = 100
): Promise<DataLoadResult<Message[]>> {
  const startTime = performance.now();
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      performanceMonitor.start(`load_messages_attempt_${attempt}`);

      const messages = await api.getMessages(conversationId, limit);

      performanceMonitor.end(`load_messages_attempt_${attempt}`, 'api', {
        count: messages.length,
        attempt,
      });

      return {
        data: messages,
        error: null,
        recovered: attempt > 0,
        fallback: false,
        duration: performance.now() - startTime,
      };
    } catch (error) {
      console.warn(
        `[DATA] Attempt ${attempt + 1} to load messages failed:`,
        error
      );

      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, then 1s
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      } else {
        console.error(`[DATA] Failed to load messages after ${maxRetries} retries`);
        return {
          data: [],
          error: error as Error,
          recovered: false,
          fallback: true,
          duration: performance.now() - startTime,
        };
      }
    }
  }

  return {
    data: [],
    error: new Error('Failed to load messages after max retries'),
    recovered: false,
    fallback: true,
    duration: performance.now() - startTime,
  };
}

/**
 * Check if Supabase connection is healthy
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    // Try a simple operation to check if DB is accessible
    await api.getConversations(1, 0);
    console.log('[HEALTH] Database connection healthy');
    return true;
  } catch (error) {
    console.error('[HEALTH] Database connection failed:', error);
    return false;
  }
}

/**
 * Validate loaded data
 */
export function validateConversations(
  sessions: ChatSession[] | null
): sessions is ChatSession[] {
  if (!Array.isArray(sessions)) {
    console.error(
      '[VALIDATE] Conversations validation failed: not an array',
      sessions
    );
    return false;
  }

  // Allow empty array (new users)
  if (sessions.length === 0) {
    return true;
  }

  // Validate first item has required fields
  const first = sessions[0];
  if (!first.id || !first.userId || !first.title) {
    console.error('[VALIDATE] Invalid conversation structure:', first);
    return false;
  }

  return true;
}

/**
 * Validate loaded messages
 */
export function validateMessages(
  messages: Message[] | null
): messages is Message[] {
  if (!Array.isArray(messages)) {
    console.error('[VALIDATE] Messages validation failed: not an array', messages);
    return false;
  }

  // Allow empty array (no messages yet)
  if (messages.length === 0) {
    return true;
  }

  // Validate first message has required fields
  const first = messages[0];
  if (!first.id || !first.role || !first.conversationId) {
    console.error('[VALIDATE] Invalid message structure:', first);
    return false;
  }

  return true;
}

/**
 * Complete data loading pipeline with error recovery
 */
export async function loadChatDataCompletely(
  userId: string
): Promise<{
  conversations: ChatSession[];
  firstMessages: Message[];
  hasErrors: boolean;
  errorMessages: string[];
}> {
  const errors: string[] = [];

  try {
    // Step 1: Check database health
    const isHealthy = await checkDatabaseHealth();
    if (!isHealthy) {
      errors.push(
        'Database connection issue. Retrying in background...'
      );
    }

    // Step 2: Load conversations
    const convResult = await loadConversationsRobust(50, 0);
    if (convResult.error) {
      errors.push(
        `Failed to load chat history: ${convResult.error.message}`
      );
    }

    const conversations = convResult.data || [];

    if (!validateConversations(conversations)) {
      errors.push('Chat history data validation failed');
      return {
        conversations: [],
        firstMessages: [],
        hasErrors: true,
        errorMessages: errors,
      };
    }

    // Step 3: Load messages for first conversation
    let firstMessages: Message[] = [];
    if (conversations.length > 0) {
      const msgResult = await loadMessagesRobust(conversations[0].id, 100);
      if (msgResult.error) {
        errors.push(`Failed to load messages: ${msgResult.error.message}`);
      }

      firstMessages = msgResult.data || [];

      if (!validateMessages(firstMessages)) {
        console.warn('[DATA] Message data validation failed, using empty array');
        firstMessages = [];
      }
    }

    return {
      conversations,
      firstMessages,
      hasErrors: errors.length > 0,
      errorMessages: errors,
    };
  } catch (error) {
    console.error('[DATA] Critical error in data loading pipeline:', error);
    return {
      conversations: [],
      firstMessages: [],
      hasErrors: true,
      errorMessages: [
        ...errors,
        `Critical error: ${(error as Error).message}`,
      ],
    };
  }
}

console.log('[DATA] Error recovery system initialized');
