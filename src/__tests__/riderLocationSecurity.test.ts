import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as deliveryPost } from '../app/api/operations/delivery/route';
import { requireSessionActor } from '../server/auth/requireSessionActor';

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  createdDocs: [] as Array<{ path: string; data: Record<string, unknown> }>,
}));

vi.mock('../server/auth/requireSessionActor', () => {
  class SessionAuthorizationError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return {
    requireSessionActor: vi.fn(),
    SessionAuthorizationError,
  };
});

vi.mock('../lib/rateLimit', () => ({
  rateLimitDurable: vi.fn(async () => ({ success: true, source: 'memory', retryAfterMs: 0 })),
}));

vi.mock('../lib/firebaseAdmin', () => {
  const db = {
    collection: (colName: string) => ({
      doc: (docId: string) => {
        const path = `${colName}/${docId}`;
        return {
          path,
          id: docId,
          get: async () => {
            const val = state.docs.get(path);
            return { exists: Boolean(val), data: () => val };
          },
          set: async (data: any) => {
            state.docs.set(path, data);
            state.createdDocs.push({ path, data });
          },
        };
      },
      where: (field: string, operator: string, value: unknown) => {
        return {
          where: (f2: string, op2: string, val2: unknown) => {
            return {
              where: (f3: string, op3: string, val3: unknown) => {
                return {
                  limit: () => ({
                    get: async () => {
                      const matching = [...state.docs.entries()]
                        .filter(([path, data]) => {
                          return path.startsWith('orders/') &&
                                 data[field] === value &&
                                 data[f2] === val2 &&
                                 data[f3] === val3;
                        })
                        .map(([id, data]) => ({ id, data: () => data }));
                      return { empty: matching.length === 0, docs: matching };
                    }
                  })
                };
              }
            };
          }
        };
      },
    }),
  };
  return { adminDb: db };
});

describe('Rider Location Security and Validation', () => {
  beforeEach(() => {
    state.docs.clear();
    state.createdDocs.length = 0;
    vi.clearAllMocks();
  });

  it('rejects location updates from non-rider staff roles', async () => {
    vi.mocked(requireSessionActor).mockResolvedValueOnce({
      uid: 'staff_1',
      role: 'staff', // Not 'rider'
      staffId: 'staff_1',
      outletId: 'outlet_1',
    } as any);

    const req = new Request('http://localhost/api/operations/delivery', {
      method: 'POST',
      body: JSON.stringify({ action: 'location', lat: 12.97, lng: 77.59, accuracy: 10 }),
    });

    const res = await deliveryPost(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('rider access required');
  });

  it('allows updates only if rider has active assignments currently out_for_delivery', async () => {
    vi.mocked(requireSessionActor).mockResolvedValue({
      uid: 'rider_uid_1',
      role: 'rider',
      staffId: 'rider_1',
      outletId: 'outlet_1',
    } as any);

    // No active assignment in state.docs yet
    const req = new Request('http://localhost/api/operations/delivery', {
      method: 'POST',
      body: JSON.stringify({ action: 'location', lat: 12.97, lng: 77.59, accuracy: 10 }),
    });

    let res = await deliveryPost(req);
    expect(res.status).toBe(409);
    let body = await res.json();
    expect(body.error).toContain('No active delivery assignment');

    // Add active out_for_delivery order assigned to rider_1
    state.docs.set('orders/order_123', {
      outlet_id: 'outlet_1',
      rider_id: 'rider_1',
      status: 'out_for_delivery',
    });

    const reqValid = new Request('http://localhost/api/operations/delivery', {
      method: 'POST',
      body: JSON.stringify({ action: 'location', lat: 12.97, lng: 77.59, accuracy: 10 }),
    });

    res = await deliveryPost(reqValid);
    expect(res.status).toBe(200);
    body = await res.json();
    expect(body.success).toBe(true);

    // Check location doc written strictly to 'delivery_locations' and separate from user profiles
    const savedLocation = state.createdDocs.find(d => d.path === 'delivery_locations/rider_1');
    expect(savedLocation).toBeDefined();
    const data = savedLocation?.data as any;
    expect(data.rider_id).toBe('rider_1');
    expect(data.location.lat).toBe(12.97);
    expect(data.location.lng).toBe(77.59);
  });

  it('rejects out of bounds, non-finite or spoofed coordinates', async () => {
    vi.mocked(requireSessionActor).mockResolvedValue({
      uid: 'rider_uid_1',
      role: 'rider',
      staffId: 'rider_1',
      outletId: 'outlet_1',
    } as any);

    // Spoofed: out of bounds latitude
    let req = new Request('http://localhost/api/operations/delivery', {
      method: 'POST',
      body: JSON.stringify({ action: 'location', lat: 95.0, lng: 77.59, accuracy: 10 }),
    });
    let res = await deliveryPost(req);
    expect(res.status).toBe(400);

    // Spoofed: out of bounds longitude
    req = new Request('http://localhost/api/operations/delivery', {
      method: 'POST',
      body: JSON.stringify({ action: 'location', lat: 12.97, lng: 185.0, accuracy: 10 }),
    });
    res = await deliveryPost(req);
    expect(res.status).toBe(400);

    // Spoofed: non-finite coordinate value
    req = new Request('http://localhost/api/operations/delivery', {
      method: 'POST',
      body: JSON.stringify({ action: 'location', lat: NaN, lng: 77.59, accuracy: 10 }),
    });
    res = await deliveryPost(req);
    expect(res.status).toBe(400);

    // Spoofed: negative or too high accuracy
    req = new Request('http://localhost/api/operations/delivery', {
      method: 'POST',
      body: JSON.stringify({ action: 'location', lat: 12.97, lng: 77.59, accuracy: -5 }),
    });
    res = await deliveryPost(req);
    expect(res.status).toBe(400);

    req = new Request('http://localhost/api/operations/delivery', {
      method: 'POST',
      body: JSON.stringify({ action: 'location', lat: 12.97, lng: 77.59, accuracy: 2000 }), // Max 1000
      headers: { 'Content-Type': 'application/json' },
    });
    res = await deliveryPost(req);
    expect(res.status).toBe(400);
  });
});
