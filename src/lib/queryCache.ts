/**
 * Phase 22 — Shared Query Cache & Deduplication Manager
 * 
 * Implements:
 * - Stable Query Keys & Custom TTLs
 * - Stale-While-Revalidate (SWR) with <50ms cache hits
 * - In-Flight Request Deduplication
 * - Bounded 3-5s network timeouts (replaces 8s Race timeout)
 * - Observability via window.__ILARA_PERF__
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
  key: string;
}

export interface QueryOptions<T> {
  key: string;
  fetcher: (signal?: AbortSignal) => Promise<T>;
  ttlMs?: number; // Default TTL in milliseconds
  staleTimeMs?: number; // Time after which background revalidation is triggered
  timeoutMs?: number; // Network timeout for fresh fetch (default: 4000ms)
  forceRefresh?: boolean;
}

export interface PerfFetchRecord {
  name: string;
  key: string;
  cacheHit: boolean;
  deduped: boolean;
  durationMs: number;
  timestamp: number;
  status: 'success' | 'stale' | 'error';
}

declare global {
  interface Window {
    __ILARA_PERF__?: PerfFetchRecord[];
  }
}

class QueryCacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private inFlight = new Map<string, Promise<any>>();
  private subscribers = new Map<string, Set<(data: any) => void>>();

  // Default TTLs for common keys
  private defaultTTLs: Record<string, number> = {
    menu: 5 * 60 * 1000,      // 5 minutes
    outlets: 15 * 60 * 1000,  // 15 minutes
    offers: 10 * 60 * 1000,   // 10 minutes
    config: 15 * 60 * 1000,   // 15 minutes
    staff: 60 * 1000,         // 1 minute
    inventory: 30 * 1000,     // 30 seconds
    daily_closing: 45 * 1000, // 45 seconds
    default: 30 * 1000,       // 30 seconds default
  };

  private recordPerf(record: PerfFetchRecord) {
    if (typeof window !== 'undefined') {
      window.__ILARA_PERF__ = window.__ILARA_PERF__ || [];
      window.__ILARA_PERF__.unshift(record);
      if (window.__ILARA_PERF__.length > 100) window.__ILARA_PERF__.pop();
    }

    if (process.env.NODE_ENV !== 'production') {
      if (record.durationMs > 3000) {
        console.error(`[PERF ERROR] Slow GET for ${record.key}: ${record.durationMs}ms`);
      } else if (record.durationMs > 1000 && !record.cacheHit) {
        console.warn(`[PERF WARN] Slow GET for ${record.key}: ${record.durationMs}ms`);
      }
    }
  }

  private getDomainTTL(key: string): number {
    const prefix = key.split(':')[0];
    return this.defaultTTLs[prefix] || this.defaultTTLs.default;
  }

  /**
   * Main query function: handles cache-first lookup, in-flight deduplication, and SWR revalidation
   */
  public async query<T>(options: QueryOptions<T>): Promise<T> {
    const { key, fetcher, forceRefresh = false } = options;
    const ttlMs = options.ttlMs || this.getDomainTTL(key);
    const timeoutMs = options.timeoutMs || 4000;
    const startTime = Date.now();

    const cached = this.cache.get(key);
    const now = Date.now();

    // 1. Cache Hit (< 50ms response)
    if (cached && !forceRefresh) {
      const isStale = now - cached.timestamp > ttlMs;

      if (!isStale) {
        this.recordPerf({
          name: key,
          key,
          cacheHit: true,
          deduped: false,
          durationMs: Date.now() - startTime,
          timestamp: now,
          status: 'success',
        });
        return cached.data as T;
      }

      // Stale-While-Revalidate: return stale data immediately & trigger background fetch
      this.revalidateInBackground(options, ttlMs, timeoutMs);
      this.recordPerf({
        name: key,
        key,
        cacheHit: true,
        deduped: false,
        durationMs: Date.now() - startTime,
        timestamp: now,
        status: 'stale',
      });
      return cached.data as T;
    }

    // 2. Request Deduplication: Reuse in-flight request if already pending
    if (this.inFlight.has(key)) {
      this.recordPerf({
        name: key,
        key,
        cacheHit: false,
        deduped: true,
        durationMs: Date.now() - startTime,
        timestamp: now,
        status: 'success',
      });
      return this.inFlight.get(key) as Promise<T>;
    }

    // 3. Cache Miss / Force Refresh: Execute bounded fetcher
    const fetchPromise = this.executeFetcher(fetcher, timeoutMs)
      .then((data) => {
        this.cache.set(key, { data, timestamp: Date.now(), ttlMs, key });
        this.notifySubscribers(key, data);
        this.recordPerf({
          name: key,
          key,
          cacheHit: false,
          deduped: false,
          durationMs: Date.now() - startTime,
          timestamp: Date.now(),
          status: 'success',
        });
        return data;
      })
      .catch((err) => {
        this.recordPerf({
          name: key,
          key,
          cacheHit: false,
          deduped: false,
          durationMs: Date.now() - startTime,
          timestamp: Date.now(),
          status: 'error',
        });
        // If we have stale data on network error, return it gracefully
        if (cached?.data) {
          console.warn(`[QueryCache] Network error for ${key}, falling back to stale data:`, err);
          return cached.data as T;
        }
        throw err;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, fetchPromise);
    return fetchPromise;
  }

  private async executeFetcher<T>(
    fetcher: (signal?: AbortSignal) => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await fetcher(controller.signal);
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private revalidateInBackground<T>(options: QueryOptions<T>, ttlMs: number, timeoutMs: number) {
    const { key, fetcher } = options;
    if (this.inFlight.has(key)) return;

    const bgPromise = this.executeFetcher(fetcher, timeoutMs)
      .then((data) => {
        this.cache.set(key, { data, timestamp: Date.now(), ttlMs, key });
        this.notifySubscribers(key, data);
      })
      .catch((err) => {
        console.warn(`[QueryCache] Background revalidation failed for ${key}:`, err);
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, bgPromise);
  }

  public subscribe<T>(key: string, callback: (data: T) => void): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(callback);

    // If data exists, invoke immediately
    const cached = this.cache.get(key);
    if (cached) {
      callback(cached.data);
    }

    return () => {
      const set = this.subscribers.get(key);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this.subscribers.delete(key);
      }
    };
  }

  private notifySubscribers(key: string, data: any) {
    const set = this.subscribers.get(key);
    if (set) {
      set.forEach((cb) => cb(data));
    }
  }

  public get<T>(key: string): T | undefined {
    return this.cache.get(key)?.data;
  }

  public invalidate(keyOrPrefix: string) {
    for (const k of this.cache.keys()) {
      if (k === keyOrPrefix || k.startsWith(`${keyOrPrefix}:`)) {
        this.cache.delete(k);
      }
    }
  }

  public clearAll() {
    this.cache.clear();
    this.inFlight.clear();
  }
}

export const queryCache = new QueryCacheManager();
