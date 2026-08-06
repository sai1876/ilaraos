import crypto from 'node:crypto';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ILARA CAFE - DURABLE RATE LIMITING DOMAIN POLICIES
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * 1. IN-MEMORY BOUNDED DESIGN
 *    - Strictly local and in-memory Map-based cache to eliminate external network
 *      overhead from caching databases.
 *    - Memory leak safety: Triggers a sweep operation when size exceeds 1000 items,
 *      filtering and purging expired records in a non-blocking macro-task event queue.
 * 
 * 2. GRACEFUL FALLBACK & DUPLICATE CHECKS
 *    - Leverages client-side App Check and strict Firestore Security rules as the
 *      primary layer of defense.
 * ══════════════════════════════════════════════════════════════════════════════
 */

interface RateLimitTracker {
  count: number;
  resetTime: number;
}

const rateLimitCache = new Map<string, RateLimitTracker>();

export function rateLimit(identifier: string, limit: number, windowMs: number): { success: boolean; limit: number; remaining: number } {
  const now = Date.now();
  const tracker = rateLimitCache.get(identifier);

  // Clean up expired entries to prevent memory leaks over time in a non-blocking macrotask
  if (rateLimitCache.size > 1000) {
    setTimeout(() => {
      const sweepTime = Date.now();
      rateLimitCache.forEach((val, key) => {
        if (val.resetTime < sweepTime) {
          rateLimitCache.delete(key);
        }
      });
    }, 0);
  }

  if (!tracker || tracker.resetTime < now) {
    // First request or window expired
    rateLimitCache.set(identifier, {
      count: 1,
      resetTime: now + windowMs
    });
    return { success: true, limit, remaining: limit - 1 };
  }

  // Increment inside active window
  tracker.count++;

  if (tracker.count > limit) {
    return { success: false, limit, remaining: 0 };
  }

  return { success: true, limit, remaining: limit - tracker.count };
}

export interface DurableRateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
  source: 'memory' | 'unavailable';
}

/**
 * Durable rate limit — pure in-memory implementation.
 * The `source` field is always 'memory'; the interface keeps API compatibility
 * with call sites that previously checked `source === 'unavailable'`.
 */
export async function rateLimitDurable(
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<DurableRateLimitResult> {
  const result = rateLimit(identifier, limit, windowMs);
  return {
    ...result,
    retryAfterMs: result.success ? 0 : windowMs,
    source: 'memory',
  };
}

export function resetRateLimitStateForTests(): void {
  rateLimitCache.clear();
}

/** Stable SHA-256 key for rate-limit buckets (kept for API compatibility). */
export function rateLimitKey(identifier: string): string {
  return crypto.createHash('sha256').update(identifier).digest('hex');
}
