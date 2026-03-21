/**
 * SEDREX — Performance Optimization Index
 * Central hub for all performance optimization modules
 * Enables smooth, professional-grade AI chat experience
 */

export { CacheManager, ConversationCache, MessageCache, ArtifactCache, UserStatsCache } from './cacheService';
export type { CacheStats } from './cacheService';

export { performanceMonitor, type WebVitals } from './performanceService';
export type { PerformanceMetrics } from './performanceService';

export {
  OptimizedMessageRow,
  preprocessMarkdownOptimized,
  VirtualScrollHelper,
  truncateString,
  createDebouncedUpdater,
} from './messageRenderingOptimizations';

export {
  DebouncedInputHandler,
  ThrottledEventHandler,
  RequestBatcher,
  ResizeObserverHelper,
  IntersectionObserverHelper,
} from './inputOptimizations';

console.log('[SEDREX] Performance optimization suite initialized');
