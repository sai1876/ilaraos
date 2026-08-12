import { getActionToken } from '@/lib/auth/getActionToken';
import { queryCache } from '@/lib/queryCache';

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
  cacheKey?: string;
  staleTimeMs?: number;
  dedupe?: boolean;
  retry?: number;
  authMode?: 'session' | 'firebase' | 'none';
  /** @deprecated Use authMode: 'none' instead */
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
  let activeSignal: AbortSignal;
  let timeoutId: NodeJS.Timeout | undefined;

  if (parentSignal) {
    activeSignal = parentSignal;
  } else {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    activeSignal = controller.signal;
  }

  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Determine explicit authMode, falling back to bypassAuth if provided
  const mode = options.authMode || (options.bypassAuth ? 'none' : 'firebase');

  if (mode === 'session') {
    // For session mode, ensure cookies are included and DO NOT attach Bearer tokens
    options.credentials = options.credentials || 'include';
    headers.delete('Authorization');
  } else if (mode === 'firebase' && !headers.has('Authorization')) {
    // Hydrate auth token for Firebase mode
    try {
      const token = await getActionToken(false);
      headers.set('Authorization', `Bearer ${token}`);
    } catch {}
  }

  const isGet = (options.method || 'GET').toUpperCase() === 'GET';

  try {
    const res = await fetch(urlString, {
      ...options,
      headers,
      signal: activeSignal,
    });

    // On 401:
    if (res.status === 401) {
      if (mode === 'session') {
        // Stop polling/caching on 401 for session mode to prevent loops
        queryCache.clearAll();
        // Fire custom event to invalidate operations shell and trigger redirect
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('operations-session-expired'));
        }
      } else if (mode === 'firebase' && retriesLeft > 0) {
        // Firebase mode: attempt forced token refresh retry ONCE
        try {
          const freshToken = await getActionToken(true);
          headers.set('Authorization', `Bearer ${freshToken}`);
          return executeRawFetch<T>(urlString, { ...options, headers }, parentSignal, retriesLeft - 1, timeoutMs);
        } catch {}
      }
    }

    // Classified retry logic for status codes: 502, 503, 504, 429
    const isRetryableStatus = [502, 503, 504, 429].includes(res.status);
    if (!res.ok && isRetryableStatus && isGet && retriesLeft > 0) {
      return executeRawFetch<T>(urlString, options, parentSignal, retriesLeft - 1, timeoutMs);
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
    // Convert timeout / AbortError into clean ApiError 408
    if (err.name === 'AbortError' || activeSignal.aborted) {
      throw new ApiError('Request timed out.', 408, { code: 'REQUEST_TIMEOUT' });
    }

    // Network transport error retry (only if fetch failed before response and status code wasn't received)
    if (retriesLeft > 0 && isGet && !(err instanceof ApiError)) {
      return executeRawFetch<T>(urlString, options, parentSignal, retriesLeft - 1, timeoutMs);
    }

    throw err;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function operationsApiRequest<T>(
  url: string | URL,
  options: Omit<ApiRequestOptions, 'authMode' | 'bypassAuth'> = {}
): Promise<T> {
  return apiRequest<T>(url, { ...options, authMode: 'session' });
}

export async function customerApiRequest<T>(
  url: string | URL,
  options: Omit<ApiRequestOptions, 'authMode' | 'bypassAuth'> = {}
): Promise<T> {
  return apiRequest<T>(url, { ...options, authMode: 'firebase' });
}
