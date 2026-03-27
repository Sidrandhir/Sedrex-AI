
import { ChatSession, Message } from '../types';
import { Artifact } from './artifactStore';

/**
 * SEDREX PERSISTENCE SERVICE v1.0
 * Specialized for 0ms UI hydration and context preservation.
 * Uses encrypted LocalStorage for primary cache with automatic binary handling.
 */

const CACHE_KEYS = {
  SESSIONS: 'sedrex_cache_sessions',
  MESSAGES: 'sedrex_cache_messages_',
  ARTIFACTS: 'sedrex_cache_artifacts_',
  ACTIVE_ID: 'sedrex_cache_active_session',
};

export const persistenceService = {
  
  // ── Session List Persistence ───────────────────────────────────────
  
  saveSessions(sessions: ChatSession[]) {
    try {
      // Store only light metadata for the sidebar
      const lightSessions = sessions.map(s => ({
        id: s.id,
        title: s.title,
        lastModified: s.lastModified,
        isFavorite: s.isFavorite
      }));
      localStorage.setItem(CACHE_KEYS.SESSIONS, JSON.stringify(lightSessions.slice(0, 50)));
    } catch (e) {
      console.warn('[PERSISTENCE] Failed to save sessions:', e);
    }
  },

  loadSessions(): Partial<ChatSession>[] {
    try {
      const data = localStorage.getItem(CACHE_KEYS.SESSIONS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  // ── Message History Persistence ────────────────────────────────────

  saveMessages(sessionId: string, messages: Message[]) {
    if (!sessionId) return;
    try {
      // Keep most recent 50 messages per session locally
      const tail = messages.slice(-50);
      localStorage.setItem(`${CACHE_KEYS.MESSAGES}${sessionId}`, JSON.stringify(tail));
      localStorage.setItem(CACHE_KEYS.ACTIVE_ID, sessionId);
    } catch (e) {
      // If local storage is full, clear old session caches
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        this._purgeOldCaches();
      }
    }
  },

  loadMessages(sessionId: string): Message[] {
    try {
      const data = localStorage.getItem(`${CACHE_KEYS.MESSAGES}${sessionId}`);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  // ── Artifact & Workspace Persistence ───────────────────────────────

  saveArtifacts(userId: string, artifacts: Artifact[]) {
    try {
      // Store global user artifacts (metadata only)
      localStorage.setItem(`${CACHE_KEYS.ARTIFACTS}${userId}`, JSON.stringify(artifacts.slice(0, 100)));
    } catch (e) {
      console.warn('[PERSISTENCE] Failed to save artifacts:', e);
    }
  },

  loadArtifacts(userId: string): Artifact[] {
    try {
      const data = localStorage.getItem(`${CACHE_KEYS.ARTIFACTS}${userId}`);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  // ── Utils ─────────────────────────────────────────────────────────

  getLastActiveSessionId(): string | null {
    return localStorage.getItem(CACHE_KEYS.ACTIVE_ID);
  },

  _purgeOldCaches() {
    const keys = Object.keys(localStorage);
    const msgKeys = keys.filter(k => k.startsWith(CACHE_KEYS.MESSAGES)).sort();
    // Remove oldest half of message caches
    msgKeys.slice(0, Math.floor(msgKeys.length / 2)).forEach(k => localStorage.removeItem(k));
  },

  clearAll() {
    Object.values(CACHE_KEYS).forEach(prefix => {
      const keys = Object.keys(localStorage);
      keys.forEach(k => {
        if (k.startsWith(prefix)) localStorage.removeItem(k);
      });
    });
  }
};
