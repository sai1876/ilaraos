export async function apiRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: init?.cache || 'no-store',
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A non-JSON error is still surfaced through the HTTP status below.
  }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? String(payload.error)
      : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}
