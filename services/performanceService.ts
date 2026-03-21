/**
 * SEDREX — Performance Monitoring Service v1.0
 * Real-time performance tracking with detailed metrics
 * Professional-grade telemetry for optimization insights
 */

export interface PerformanceMetrics {
  name: string;
  duration: number;
  timestamp: number;
  category: 'render' | 'api' | 'ai' | 'artifact' | 'cache' | 'other';
  metadata?: Record<string, any>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private readonly maxMetrics = 1000;
  private timers = new Map<string, number>();
  private slowThresholds = {
    render: 50,
    api: 2000,
    ai: 5000,
    artifact: 1000,
    cache: 100,
    other: 1000,
  };

  start(id: string): void {
    this.timers.set(id, performance.now());
  }

  end(
    id: string,
    category: PerformanceMetrics['category'],
    metadata?: Record<string, any>
  ): number {
    const startTime = this.timers.get(id);
    if (!startTime) {
      console.warn(`[PERF] No start time found for ${id}`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(id);

    // Log slow operations
    const threshold = this.slowThresholds[category];
    if (duration > threshold) {
      console.warn(
        `[PERF] Slow ${category}: ${id} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`,
        metadata
      );
    }

    const metric: PerformanceMetrics = {
      name: id,
      duration,
      timestamp: Date.now(),
      category,
      metadata,
    };

    this.metrics.push(metric);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    return duration;
  }

  measure<T>(
    id: string,
    fn: () => T,
    category: PerformanceMetrics['category'] = 'other'
  ): T {
    this.start(id);
    try {
      return fn();
    } finally {
      this.end(id, category);
    }
  }

  async measureAsync<T>(
    id: string,
    fn: () => Promise<T>,
    category: PerformanceMetrics['category'] = 'other'
  ): Promise<T> {
    this.start(id);
    try {
      return await fn();
    } finally {
      this.end(id, category);
    }
  }

  getMetrics(
    category?: PerformanceMetrics['category']
  ): PerformanceMetrics[] {
    if (!category) return this.metrics;
    return this.metrics.filter(m => m.category === category);
  }

  getStats(category?: PerformanceMetrics['category']) {
    const metrics = this.getMetrics(category);
    if (metrics.length === 0) {
      return null;
    }

    const durations = metrics.map(m => m.duration);
    const sum = durations.reduce((a, b) => a + b, 0);

    return {
      count: metrics.length,
      avg: sum / metrics.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      p95: durations.sort((a, b) => a - b)[Math.floor(metrics.length * 0.95)],
      p99: durations.sort((a, b) => a - b)[Math.floor(metrics.length * 0.99)],
    };
  }

  logReport(): void {
    console.group('[PERF] Performance Report');

    const categories: Array<PerformanceMetrics['category']> = [
      'render',
      'api',
      'ai',
      'artifact',
      'cache',
    ];

    const report: Record<string, any> = {};

    for (const category of categories) {
      const stats = this.getStats(category);
      if (stats) {
        report[category] = {
          count: stats.count,
          avg: `${stats.avg.toFixed(2)}ms`,
          min: `${stats.min.toFixed(2)}ms`,
          max: `${stats.max.toFixed(2)}ms`,
          p95: `${stats.p95.toFixed(2)}ms`,
        };
      }
    }

    console.table(report);
    console.groupEnd();
  }

  clear(): void {
    this.metrics = [];
    this.timers.clear();
  }
}

export const performanceMonitor = new PerformanceMonitor();

// Web Vitals tracking
export interface WebVitals {
  lcp?: number; // Largest Contentful Paint
  fid?: number; // First Input Delay
  cls?: number; // Cumulative Layout Shift
  fcp?: number; // First Contentful Paint
  ttfb?: number; // Time to First Byte
}

export const webVitals: WebVitals = {};

// Measure Web Vitals if supported
if (typeof window !== 'undefined' && 'web-vital' in window) {
  try {
    // This is a simplified version — in production, use the web-vitals library
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'largest-contentful-paint') {
          webVitals.lcp = entry.startTime;
        }
        if (entry.name === 'first-input') {
          webVitals.fid = (entry as any).processingDuration;
        }
      }
    });

    observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input'] });
  } catch (e) {
    console.debug('[PERF] Web Vitals observer not supported');
  }
}

console.log('[PERF] Performance monitoring initialized');
