import { auth } from '@/lib/firebase';

const AUTH_TIMEOUT_MS = 1500;

/**
 * Shared Client Auth Helper
 * - Resolves auth state with a 1500ms max timeout
 * - Uses cached valid token (user.getIdToken(false)) without forcing network refresh
 * - Provides retry helper for 401 token expiration
 */
export async function getActionToken(forceRefresh = false): Promise<string> {
  let user = auth.currentUser;

  if (!user) {
    // Race auth.onAuthStateChanged against a 1500ms timeout
    await Promise.race([
      new Promise<void>((resolve) => {
        const unsubscribe = auth.onAuthStateChanged(() => {
          unsubscribe();
          resolve();
        });
      }),
      new Promise<void>((resolve) => setTimeout(resolve, AUTH_TIMEOUT_MS)),
    ]);

    user = auth.currentUser;
  }

  if (!user) {
    throw new Error('Your session is still loading or expired. Please sign in or retry.');
  }

  return user.getIdToken(forceRefresh);
}

/**
 * Executes a fetch request with cached auth token, automatically retrying once with forced refresh if HTTP 401 is returned.
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const token = await getActionToken(false);
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    // If 401 returned, force refresh token ONCE and retry request
    if (res.status === 401 && auth.currentUser) {
      try {
        const freshToken = await getActionToken(true);
        headers.set('Authorization', `Bearer ${freshToken}`);
        res = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });
      } catch {}
    }

    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}
