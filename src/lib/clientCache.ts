type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

// Global cache object using a Map
const cache = new Map<string, CacheEntry<any>>();

/**
 * Retrieve data from the client-side cache if not expired.
 */
export function getCachedData<T>(key: string, ttlMs: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  const isExpired = Date.now() - entry.timestamp > ttlMs;
  if (isExpired) {
    cache.delete(key);
    return null;
  }
  
  return entry.data;
}

/**
 * Store data in the client-side cache with the current timestamp.
 */
export function setCachedData<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Clear specific key or the entire cache.
 */
export function clearCache(key?: string): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}
