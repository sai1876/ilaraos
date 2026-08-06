import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as confirmDelivery } from '@/app/api/orders/confirm-delivery/route';
import { GET as activeRoute } from '@/app/api/customer/active-route/route';
import { requireRole } from '@/server/auth/requireRole';

const state = vi.hoisted(() => ({ orders: new Map<string, Record<string, unknown>>() }));

vi.mock('@/server/auth/requireRole', () => ({ requireRole: vi.fn() }));
vi.mock('@/server/events/logBusinessEvent', () => ({ logBusinessEvent: vi.fn() }));
vi.mock('@/lib/firebaseAdmin', () => {
  const snapshot = (id: string) => {
    const data = state.orders.get(id);
    return { id, exists: Boolean(data), data: () => data };
  };
  const query = (filters: Array<{ field: string; value: unknown }> = []) => ({
    where(field: string, _operator: string, value: unknown) {
      return query([...filters, { field, value }]);
    },
    limit() { return this; },
    async get() {
      const docs = [...state.orders.entries()]
        .filter(([, data]) => filters.every(filter => data[filter.field] === filter.value))
        .map(([id]) => snapshot(id));
      return { empty: docs.length === 0, docs };
    },
  });
  const db = {
    collection: () => ({
      doc: (id: string) => ({ id, get: async () => snapshot(id), delete: async () => {} }),
      where: (field: string, operator: string, value: unknown) => query().where(field, operator, value),
    }),
    runTransaction: async (callback: (transaction: {
      get: (ref: { id: string }) => Promise<unknown>;
      update: (ref: { id: string }, update: Record<string, unknown>) => void;
    }) => Promise<unknown>) => callback({
      get: async ref => snapshot(ref.id),
      update: (ref, update) => {
        state.orders.set(ref.id, { ...(state.orders.get(ref.id) || {}), ...update });
      },
    }),
  };
  return { adminDb: db };
});

const secret = 'delivery-test-secret-that-is-at-least-32-characters';

function proofHash(orderId: string, otp: string) {
  return crypto.createHmac('sha256', secret).update(`${orderId}:${otp}`).digest('hex');
}

describe('delivery authorization and privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.orders.clear();
    process.env.DELIVERY_OTP_SECRET = secret;
    state.orders.set('order-1', {
      order_id: 'order-1',
      user_id: 'customer-1',
      order_type: 'delivery',
      status: 'out_for_delivery',
      rider_id: 'rider-1',
      outlet_id: 'outlet-a',
      gross_amount: 100,
      is_paid: true,
      payment_status: 'paid',
      payment_method: 'cash',
      created_at: 200,
      delivery_coordinates: { lat: 17.1, lng: 78.1 },
      delivery_proof: {
        otp_hash: proofHash('order-1', '123456'),
        expires_at: Date.now() + 60_000,
        attempts: 0,
        consumed: false,
      },
    });
  });

  it('allows only the assigned rider with the valid proof', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({
      uid: 'auth-rider', role: 'rider', staffId: 'rider-1', outletId: 'outlet-a',
    } as never);
    const response = await confirmDelivery(new Request('http://localhost/api/orders/confirm-delivery', {
      method: 'POST',
      body: JSON.stringify({ order_id: 'order-1', otp: '123456' }),
    }));
    expect(response.status).toBe(200);
    expect(state.orders.get('order-1')?.status).toBe('delivered');
    expect(state.orders.get('order-1')?.['delivery_proof.consumed']).toBe(true);
  });

  it('rejects the wrong rider and increments invalid proof attempts', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({
      uid: 'other', role: 'rider', staffId: 'rider-2', outletId: 'outlet-a',
    } as never);
    let response = await confirmDelivery(new Request('http://localhost', {
      method: 'POST', body: JSON.stringify({ order_id: 'order-1', otp: '123456' }),
    }));
    expect(response.status).toBe(403);

    vi.mocked(requireRole).mockResolvedValueOnce({
      uid: 'auth-rider', role: 'rider', staffId: 'rider-1', outletId: 'outlet-a',
    } as never);
    response = await confirmDelivery(new Request('http://localhost', {
      method: 'POST', body: JSON.stringify({ order_id: 'order-1', otp: '999999' }),
    }));
    expect(response.status).toBe(403);
    expect(state.orders.get('order-1')?.['delivery_proof.attempts']).toBe(1);
  });

  it('returns queue position only to the owning customer without coordinates', async () => {
    state.orders.set('order-0', {
      user_id: 'another-customer',
      status: 'out_for_delivery',
      rider_id: 'rider-1',
      created_at: 100,
      delivery_coordinates: { lat: 1, lng: 2 },
    });
    vi.mocked(requireRole).mockResolvedValueOnce({ uid: 'customer-1', role: 'customer' } as never);
    const response = await activeRoute(new Request('http://localhost/api/customer/active-route?order_id=order-1'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.orders_ahead).toBe(1);
    expect(body).not.toHaveProperty('waypoints');
    expect(JSON.stringify(body)).not.toContain('lat');
  });

  it('denies another customer access to the order queue', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({ uid: 'customer-2', role: 'customer' } as never);
    expect((await activeRoute(new Request(
      'http://localhost/api/customer/active-route?order_id=order-1',
    ))).status).toBe(403);
  });
});
