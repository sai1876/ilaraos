import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  orderData: {} as Record<string, any>,
  orderUpdate: vi.fn(),
  transactionUpdate: vi.fn(),
  createCustomToken: vi.fn(),
  rateLimit: vi.fn(),
  collection: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimitDurable: mocks.rateLimit,
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminAuth: {
    createCustomToken: mocks.createCustomToken,
  },
  adminDb: {
    collection: mocks.collection,
    runTransaction: mocks.runTransaction,
  },
}));

import { POST } from '@/app/api/auth/magic-link/route';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

function request(session: string) {
  return new Request('http://localhost/api/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session }),
  });
}

describe('single-use voice magic link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orderData = {
      status: 'staged',
      expires_at: Date.now() + 60_000,
      user_id: 'fixture-user',
      items: [{ name: 'Fixture Item', unit_price: 100, qty: 1 }],
    };
    mocks.rateLimit.mockResolvedValue({
      success: true,
      limit: 3,
      remaining: 2,
      retryAfterMs: 0,
      source: 'memory',
    });
    mocks.createCustomToken.mockResolvedValue('fixture-custom-token');
    mocks.orderUpdate.mockImplementation(async (updates: Record<string, unknown>) => {
      Object.assign(mocks.orderData, updates);
    });
    mocks.transactionUpdate.mockImplementation((_ref: unknown, updates: Record<string, unknown>) => {
      Object.assign(mocks.orderData, updates);
    });

    const orderRef = { update: mocks.orderUpdate };
    mocks.collection.mockImplementation((name: string) => {
      if (name === 'voice_orders') {
        return { doc: vi.fn(() => orderRef) };
      }
      if (name === 'menu') {
        return {
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({
              docs: [{ data: () => ({ item_id: 'menu-1', name: 'Fixture Item', station: 'Kitchen' }) }],
            })),
          })),
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    });
    mocks.runTransaction.mockImplementation(async (callback: any) => callback({
      get: vi.fn(async () => ({ exists: true, data: () => ({ ...mocks.orderData }) })),
      update: mocks.transactionUpdate,
    }));
  });

  it('mints one token and marks the bearer consumed', async () => {
    const response = await POST(request(SESSION_ID));

    expect(response.status).toBe(200);
    expect(mocks.createCustomToken).toHaveBeenCalledTimes(1);
    expect(mocks.transactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ magic_link_state: 'consuming' }),
    );
    expect(mocks.orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ magic_link_state: 'consumed' }),
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('rejects replay without minting another token', async () => {
    expect((await POST(request(SESSION_ID))).status).toBe(200);
    const replay = await POST(request(SESSION_ID));

    expect(replay.status).toBe(410);
    expect(mocks.createCustomToken).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed session before database work', async () => {
    const response = await POST(request('not-a-session'));

    expect(response.status).toBe(400);
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(mocks.createCustomToken).not.toHaveBeenCalled();
  });
});
