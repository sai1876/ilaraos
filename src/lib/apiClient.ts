import { getActionToken } from '@/lib/auth/getActionToken';
import { queryCache } from '@/lib/queryCache';

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
  cacheKey?: string;
  staleTimeMs?: number;
  dedupe?: boolean;
  retry?: number;
  bypassAuth?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public payload?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Upgraded API Client for Phase 22
 * - Controlled Timeouts with AbortController
 * - Automatic Deduplication & Session Query Caching for GET requests
 * - Retries once on GET network errors or 401 token expiry
 */
export async function apiRequest<T>(
  url: string | URL,
  options: ApiRequestOptions = {}
): Promise<T> {
  const urlString = typeof url === 'string' ? url : url.toString();
  const method = (options.method || 'GET').toUpperCase();
  const isGet = method === 'GET';

  const cacheKey = options.cacheKey || (isGet ? `api:${urlString}` : undefined);
  const dedupe = options.dedupe !== undefined ? options.dedupe : isGet;
  const timeoutMs = options.timeoutMs || (isGet ? 5000 : 8000);
  const retryCount = options.retry !== undefined ? options.retry : (isGet ? 1 : 0);

  // For GET requests with a cache key, delegate to queryCache for SWR & deduplication
  if (isGet && cacheKey && dedupe && !options.body) {
    return queryCache.query<T>({
      key: cacheKey,
      ttlMs: options.staleTimeMs,
      timeoutMs,
      fetcher: async (signal) => executeRawFetch<T>(urlString, options, signal, retryCount),
    });
  }

  return executeRawFetch<T>(urlString, options, undefined, retryCount, timeoutMs);
}

async function executeRawFetch<T>(
  urlString: string,
  options: ApiRequestOptions,
  parentSignal?: AbortSignal,
  retriesLeft = 1,
  overrideTimeoutMs?: number
): Promise<T> {
  const timeoutMs = overrideTimeoutMs || options.timeoutMs || 8000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (parentSignal) {
    parentSignal.addEventListener('abort', () => controller.abort());
  }

  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Hydrate auth token if not bypassed
  if (!options.bypassAuth && !headers.has('Authorization')) {
    try {
      const token = await getActionToken(false);
      headers.set('Authorization', `Bearer ${token}`);
    } catch {}
  }

  try {
    const res = await fetch(urlString, {
      ...options,
      headers,
      signal: controller.signal,
    });

    // On 401, attempt forced token refresh retry ONCE
    if (res.status === 401 && !options.bypassAuth && retriesLeft > 0) {
      try {
        const freshToken = await getActionToken(true);
        headers.set('Authorization', `Bearer ${freshToken}`);
        return executeRawFetch<T>(urlString, { ...options, headers }, parentSignal, retriesLeft - 1, timeoutMs);
      } catch {}
    }

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {}

    if (!res.ok) {
      const msg = typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as any).error)
        : `Request to ${urlString} failed with status ${res.status}`;
      throw new ApiError(msg, res.status, payload);
    }

    return payload as T;
  } catch (err: any) {
    if (retriesLeft > 0 && (options.method || 'GET').toUpperCase() === 'GET' && err.name !== 'AbortError') {
      return executeRawFetch<T>(urlString, options, parentSignal, retriesLeft - 1, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
