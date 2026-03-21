/**
 * SEDREX — Advanced Caching Service v1.0
 * Intelligent multi-layer caching with TTL, size limits, and smart invalidation
 * Built for professional AI applications with 30+ years of optimization expertise
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
  createdAt: number;
}

export interface CacheStats {
  size: number;
  capacity: number;
  hits: number;
  misses: number;
  hitRate: number;
}

class CacheLayer<T> {
  private store = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly defaultTTL: number;
  private hits = 0;
  private misses = 0;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(maxEntries = 500, defaultTTL = 10 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.defaultTTL = defaultTTL;
    this.startAutoCleanup();
  }

  private startAutoCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let removed = 0;
      for (const [key, entry] of this.store.entries()) {
        if (entry.expiresAt < now) {
          this.store.delete(key);
          removed++;
        }
      }
      if (removed > 0) {
        console.debug(`[CACHE] Auto-cleanup: removed ${removed} expired entries`);
      }
    }, 30_000);
  }

  set(key: string, value: T, ttl: number = this.defaultTTL): void {
    if (this.store.size >= this.maxEntries) {
      // LRU eviction: remove least popular entry
      let lruKey: string | null = null;
      let minHits = Infinity;
      for (const [k, entry] of this.store.entries()) {
        if (entry.hits < minHits) {
          minHits = entry.hits;
          lruKey = k;
        }
      }
      if (lruKey) this.store.delete(lruKey);
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
      hits: 0,
      createdAt: Date.now(),
    });
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      this.misses++;
      return null;
    }

    entry.hits++;
    this.hits++;
    return entry.value;
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      capacity: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : (this.hits / total),
    };
  }

  destroy(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.clear();
  }
}

// Request deduplication layer
class RequestDeduplicator<T> {
  private inFlight = new Map<string, Promise<T>>();

  async deduplicate(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key)!;
    }

    const promise = fn()
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.inFlight.clear();
  }
}

// ─────────────────────────────────────────────────────────────────
// Global Cache Singletons
// ─────────────────────────────────────────────────────────────────

export const ConversationCache = new CacheLayer(100, 15 * 60 * 1000);
export const MessageCache = new CacheLayer(200, 10 * 60 * 1000);
export const ArtifactCache = new CacheLayer(150, 10 * 60 * 1000);
export const UserStatsCache = new CacheLayer(50, 5 * 60 * 1000);
export const PreferenceCache = new CacheLayer(20, 30 * 60 * 1000);

// Request deduplication
export const ConversationDeduplicator = new RequestDeduplicator();
export const MessageDeduplicator = new RequestDeduplicator();

// ─────────────────────────────────────────────────────────────────
// Cache Management Utilities
// ─────────────────────────────────────────────────────────────────

export const CacheManager = {
  invalidateConversation(id: string): void {
    ConversationCache.delete(id);
    MessageCache.delete(`messages:${id}`);
  },

  invalidateAllConversations(): void {
    ConversationCache.clear();
    MessageCache.clear();
  },

  invalidateUserStats(userId: string): void {
    UserStatsCache.delete(`stats:${userId}`);
  },

  getStats() {
    return {
      conversations: ConversationCache.getStats(),
      messages: MessageCache.getStats(),
      artifacts: ArtifactCache.getStats(),
      userStats: UserStatsCache.getStats(),
      preferences: PreferenceCache.getStats(),
    };
  },

  logStats(): void {
    const stats = this.getStats();
    console.table({
      'Conversations': `${stats.conversations.size}/${stats.conversations.capacity} (${(stats.conversations.hitRate * 100).toFixed(1)}% hit)`,
      'Messages': `${stats.messages.size}/${stats.messages.capacity} (${(stats.messages.hitRate * 100).toFixed(1)}% hit)`,
      'Artifacts': `${stats.artifacts.size}/${stats.artifacts.capacity} (${(stats.artifacts.hitRate * 100).toFixed(1)}% hit)`,
      'User Stats': `${stats.userStats.size}/${stats.userStats.capacity} (${(stats.userStats.hitRate * 100).toFixed(1)}% hit)`,
    });
  },

  destroy(): void {
    ConversationCache.destroy();
    MessageCache.destroy();
    ArtifactCache.destroy();
    UserStatsCache.destroy();
    PreferenceCache.destroy();
    ConversationDeduplicator.clear();
    MessageDeduplicator.clear();
  },
};

console.log('[CACHE] Advanced caching system initialized');
