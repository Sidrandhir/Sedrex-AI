/**
 * SEDREX — Input & UI Optimization Utilities v1.0
 * Optimized input handling with debouncing and throttling
 * Prevents excessive re-renders and API calls
 */

/**
 * Debounced input handler
 * Useful for search, typing indicators, etc.
 */
export class DebouncedInputHandler {
  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private callback: (value: string) => void,
    private delayMs = 300
  ) {}

  handle(value: string): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      this.callback(value);
      this.timeout = null;
    }, this.delayMs);
  }

  cancel(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  destroy(): void {
    this.cancel();
  }
}

/**
 * Throttled event handler
 * Useful for scroll, resize events
 */
export class ThrottledEventHandler {
  private lastExecution = 0;

  constructor(
    private callback: (event: Event) => void,
    private intervalMs = 100
  ) {}

  handle = (event: Event): void => {
    const now = Date.now();
    if (now - this.lastExecution >= this.intervalMs) {
      this.lastExecution = now;
      this.callback(event);
    }
  };

  destroy(): void {
    // Cleanup if needed
  }
}

/**
 * Request batching helper
 * Batches multiple requests and executes them together
 */
export class RequestBatcher<T, R> {
  private batch: T[] = [];
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private resolvers: Array<(result: R) => void> = [];

  constructor(
    private batchFn: (batch: T[]) => Promise<R[]>,
    private batchSize = 10,
    private delayMs = 50
  ) {}

  async add(item: T): Promise<R> {
    return new Promise(resolve => {
      this.batch.push(item);
      this.resolvers.push(resolve);

      if (this.batch.length >= this.batchSize) {
        this.flush();
      } else if (!this.timeout) {
        this.timeout = setTimeout(() => this.flush(), this.delayMs);
      }
    });
  }

  private async flush(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.batch.length === 0) return;

    const batch = this.batch;
    const resolvers = this.resolvers;

    this.batch = [];
    this.resolvers = [];

    try {
      const results = await this.batchFn(batch);
      resolvers.forEach((resolve, idx) => {
        resolve(results[idx]);
      });
    } catch (error) {
      resolvers.forEach(resolve => {
        resolve(undefined as any);
      });
      console.error('[BATCH] Error executing batch:', error);
    }
  }

  async waitForFlush(): Promise<void> {
    return new Promise(resolve => {
      if (this.batch.length === 0) {
        resolve();
      } else {
        const originalFn = this.flush.bind(this);
        this.flush = async () => {
          await originalFn();
          resolve();
        };
      }
    });
  }

  destroy(): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.batch = [];
    this.resolvers = [];
  }
}

/**
 * Resize observer helper
 * Detects element resize with debouncing
 */
export class ResizeObserverHelper {
  private observer: ResizeObserver | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private callback: (width: number, height: number) => void,
    private delayMs = 200
  ) {}

  observe(element: HTMLElement): void {
    if (!element || typeof ResizeObserver === 'undefined') return;

    this.observer = new ResizeObserver(entries => {
      if (this.timeout) clearTimeout(this.timeout);

      this.timeout = setTimeout(() => {
        const entry = entries[0];
        if (entry) {
          const rect = entry.contentRect;
          this.callback(rect.width, rect.height);
        }
      }, this.delayMs);
    });

    this.observer.observe(element);
  }

  unobserve(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  destroy(): void {
    this.unobserve();
  }
}

/**
 * Intersection observer helper for lazy loading
 */
export class IntersectionObserverHelper {
  private observer: IntersectionObserver | null = null;
  private observedElements = new Map<HTMLElement, { onVisible: () => void }>();

  constructor(private threshold = 0.1) {}

  observe(element: HTMLElement, onVisible: () => void): void {
    if (!element || typeof IntersectionObserver === 'undefined') {
      onVisible();
      return;
    }

    this.observedElements.set(element, { onVisible });

    if (!this.observer) {
      this.observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const callbacks = this.observedElements.get(entry.target as HTMLElement);
              if (callbacks) {
                callbacks.onVisible();
                this.unobserve(entry.target as HTMLElement);
              }
            }
          });
        },
        { threshold: this.threshold }
      );
    }

    this.observer.observe(element);
  }

  unobserve(element: HTMLElement): void {
    this.observedElements.delete(element);
    if (this.observer) {
      this.observer.unobserve(element);
    }
  }

  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.observedElements.clear();
  }
}

console.log('[OPTIMIZE] Input and UI optimization utilities loaded');
