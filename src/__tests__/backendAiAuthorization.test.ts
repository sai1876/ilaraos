import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => {
  class AuthorizationError extends Error {
    constructor(message: string, public readonly status: 401 | 403 | 503) {
      super(message);
    }
  }
  return {
    requireActor: vi.fn(),
    AuthorizationError,
    rateLimit: vi.fn(),
  };
});

vi.mock('@/server/auth/requireSessionActor', () => ({
  requireSessionActor: authMocks.requireActor,
  SessionAuthorizationError: authMocks.AuthorizationError,
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimitDurable: authMocks.rateLimit,
}));

vi.mock('@/server/notifications/triggerLowStockAlert', () => ({
  triggerLowStockAlert: vi.fn(),
}));

import { POST as geminiPost } from '@/app/api/gemini/route';
import { askStaffCopilotAction } from '@/app/_actions/groqActions';
import { triggerCustomerLowStockAlert } from '@/app/_actions/lowStockActions';

describe('backend AI authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.rateLimit.mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      retryAfterMs: 0,
      source: 'memory',
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('rejects an unauthenticated Gemini request before provider calls', async () => {
    authMocks.requireActor.mockRejectedValue(
      new authMocks.AuthorizationError('Authentication required', 401),
    );

    const response = await geminiPost(new Request('http://localhost/api/gemini', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'adjustAtmosphere', payload: { userPrompt: 'rain' } }),
    }));

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(authMocks.rateLimit).not.toHaveBeenCalled();
  });

  it('rejects an invalid Gemini payload before provider calls', async () => {
    authMocks.requireActor.mockResolvedValue({ uid: 'manager1', role: 'manager', staffId: 'manager1' });

    const response = await geminiPost(new Request('http://localhost/api/gemini', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'adjustAtmosphere', payload: { userPrompt: '' } }),
    }));

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks unauthenticated Groq server actions before provider calls', async () => {
    authMocks.requireActor.mockRejectedValue(
      new authMocks.AuthorizationError('Authentication required', 401),
    );

    await expect(askStaffCopilotAction('fixture question', 'fixture context')).rejects.toThrow(
      'Authentication required',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks unauthenticated low-stock email actions', async () => {
    authMocks.requireActor.mockRejectedValue(
      new authMocks.AuthorizationError('Authentication required', 401),
    );

    await expect(triggerCustomerLowStockAlert({
      ingredient: 'Milk',
      current: 1,
      threshold: 2,
      unit: 'L',
    })).rejects.toThrow('Authentication required');
    expect(fetch).not.toHaveBeenCalled();
  });
});
