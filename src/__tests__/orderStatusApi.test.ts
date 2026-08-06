import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { POST } from '@/app/api/orders/update-status/route';
import { requireRole } from '@/server/auth/requireRole';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

const state = vi.hoisted(() => ({
  order: {} as Record<string, unknown>,
  rider: {} as Record<string, unknown>,
  orderExists: true,
  riderExists: true,
  movements: [] as Array<{ id: string; data: Record<string, unknown> }>,
  stocks: new Map<string, Record<string, unknown>>(),
  createdMovements: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/server/auth/requireRole', () => ({ requireRole: vi.fn() }));
vi.mock('@/server/events/logBusinessEvent', () => ({ logBusinessEvent: vi.fn() }));
vi.mock('@/lib/firebaseAdmin', () => {
  const makeRef = (collection: string, id: string) => ({ kind: 'doc', collection, id });
  return {
    adminDb: {
      collection: (collection: string) => ({
        doc: (id: string) => makeRef(collection, id),
        where: (field: string, _operator: string, value: unknown) => ({ kind: 'query', collection, field, value }),
      }),
      runTransaction: async (callback: (transaction: {
        get: (ref: { kind: string; collection: string; id?: string }) => Promise<unknown>;
        update: (ref: { collection: string; id?: string }, update: Record<string, unknown>) => void;
        create: (ref: { collection: string; id?: string }, data: Record<string, unknown>) => void;
      }) => Promise<unknown>) => callback({
        async get(ref) {
          if (ref.kind === 'query' && ref.collection === 'stock_movements') {
            const docs = state.movements.map(movement => ({
              id: movement.id,
              data: () => movement.data,
            }));
            return { empty: docs.length === 0, docs };
          }
          if (ref.collection === 'orders') return { exists: state.orderExists, data: () => state.order };
          if (ref.collection === 'inventory') {
            const data = state.stocks.get(ref.id!);
            return { exists: Boolean(data), data: () => data };
          }
          if (ref.collection === 'payment_ledger') return { exists: false, data: () => undefined };
          if (ref.collection === 'stock_movements') return { exists: false, data: () => undefined };
          return { exists: state.riderExists, data: () => state.rider };
        },
        update(ref, update) {
          if (ref.collection === 'orders') state.order = { ...state.order, ...update };
          if (ref.collection === 'inventory' && ref.id) {
            state.stocks.set(ref.id, { ...(state.stocks.get(ref.id) || {}), ...update });
          }
        },
        create(_ref, data) { state.createdMovements.push(data); },
      }),
    },
  };
});

function request(body: unknown) {
  return new Request('http://localhost/api/orders/update-status', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function authorize(role = 'staff', outletId = 'outlet-a') {
  vi.mocked(requireRole).mockResolvedValueOnce({ uid: 'actor-1', role, outletId } as never);
}

describe('POST /api/orders/update-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.orderExists = true;
    state.riderExists = true;
    state.order = {
      order_id: 'order-1',
      status: 'confirmed',
      order_type: 'pickup',
      outlet_id: 'outlet-a',
      gross_amount: 100,
      is_paid: false,
      rush_held: false,
    };
    state.rider = { role: 'rider', status: 'active', outlet_id: 'outlet-a' };
    state.movements = [];
    state.stocks.clear();
    state.createdMovements = [];
  });

  it('rejects unauthorized access', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(NextResponse.json({ detail: 'Unauthorized' }, { status: 401 }));
    expect((await POST(request({ order_id: 'order-1', next_status: 'preparing' }))).status).toBe(401);
  });

  it('rejects unknown fields and direct delivered transitions', async () => {
    authorize('manager');
    expect((await POST(request({ order_id: 'order-1', next_status: 'preparing', arbitrary: true }))).status).toBe(400);
    authorize('manager');
    expect((await POST(request({ order_id: 'order-1', next_status: 'delivered' }))).status).toBe(400);
  });

  it('enforces the actor outlet', async () => {
    authorize('staff', 'outlet-b');
    expect((await POST(request({ order_id: 'order-1', next_status: 'preparing' }))).status).toBe(403);
  });

  it('allows a valid forward transition and logs it', async () => {
    authorize('staff');
    const response = await POST(request({ order_id: 'order-1', next_status: 'preparing' }));
    expect(response.status).toBe(200);
    expect(state.order.status).toBe('preparing');
    expect(logBusinessEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'order_status_changed',
      outlet_id: 'outlet-a',
    }));
  });

  it('requires proof for delivery completion', async () => {
    state.order = { ...state.order, status: 'ready', order_type: 'delivery', rider_id: 'rider-1' };
    authorize('manager');
    expect((await POST(request({ order_id: 'order-1', next_status: 'completed' }))).status).toBe(409);
  });

  it('rejects completion until a pickup or dine-in order is paid', async () => {
    state.order = { ...state.order, status: 'ready', order_type: 'pickup', is_paid: false, payment_status: 'unpaid' };
    authorize('manager');
    expect((await POST(request({ order_id: 'order-1', next_status: 'completed' }))).status).toBe(409);
  });

  it('keeps terminal states immutable', async () => {
    state.order = { ...state.order, status: 'completed' };
    authorize('owner');
    expect((await POST(request({ order_id: 'order-1', next_status: 'preparing' }))).status).toBe(409);
  });

  it('restricts payment changes to elevated roles', async () => {
    authorize('staff');
    expect((await POST(request({ order_id: 'order-1', payment_status: 'paid', payment_method: 'cash' }))).status).toBe(403);
    authorize('manager');
    expect((await POST(request({ order_id: 'order-1', payment_status: 'paid', payment_method: 'cash' }))).status).toBe(200);
    expect(state.order.is_paid).toBe(true);
  });

  it('validates rider role and outlet before dispatch', async () => {
    state.order = { ...state.order, status: 'ready', order_type: 'delivery' };
    state.rider = { role: 'rider', status: 'active', outlet_id: 'outlet-b' };
    authorize('manager');
    expect((await POST(request({
      order_id: 'order-1',
      next_status: 'out_for_delivery',
      rider_id: 'rider-1',
    }))).status).toBe(409);

    state.rider = { role: 'rider', status: 'active', outlet_id: 'outlet-a' };
    authorize('manager');
    expect((await POST(request({
      order_id: 'order-1',
      next_status: 'out_for_delivery',
      rider_id: 'rider-1',
    }))).status).toBe(200);
    expect(state.order.rider_id).toBe('rider-1');
  });

  it('does not assign an offline rider', async () => {
    state.order = { ...state.order, status: 'ready', order_type: 'delivery' };
    state.rider = { role: 'rider', status: 'offline', outlet_id: 'outlet-a' };
    authorize('manager');
    expect((await POST(request({
      order_id: 'order-1', next_status: 'out_for_delivery', rider_id: 'rider-1',
    }))).status).toBe(409);
  });

  it('restores inventory exactly once when cancelled before preparation', async () => {
    state.movements = [{
      id: 'movement-1',
      data: { order_id: 'order-1', outlet_id: 'outlet-a', stock_id: 'stock-1', quantity_delta: -2, reason: 'order_created' },
    }];
    state.stocks.set('stock-1', { outlet_id: 'outlet-a', current_quantity: 8 });
    authorize('manager');
    const response = await POST(request({
      order_id: 'order-1', next_status: 'cancelled', reason: 'Customer cancelled order',
    }));

    expect(response.status).toBe(200);
    expect(state.stocks.get('stock-1')?.current_quantity).toBe(10);
    expect(state.createdMovements[0]).toMatchObject({ quantity_delta: 2, reversed_movement_id: 'movement-1' });
    expect(state.order).toMatchObject({ inventory_refunded: true, is_stock_refunded: true });
  });

  it('does not return consumed ingredients after preparation has started', async () => {
    state.order = { ...state.order, status: 'preparing' };
    state.movements = [{
      id: 'movement-1',
      data: { order_id: 'order-1', outlet_id: 'outlet-a', stock_id: 'stock-1', quantity_delta: -2, reason: 'order_created' },
    }];
    state.stocks.set('stock-1', { outlet_id: 'outlet-a', current_quantity: 8 });
    authorize('manager');
    const response = await POST(request({
      order_id: 'order-1', next_status: 'cancelled', reason: 'Cancelled after cooking',
    }));

    expect(response.status).toBe(200);
    expect(state.stocks.get('stock-1')?.current_quantity).toBe(8);
    expect(state.createdMovements).toHaveLength(0);
    expect(state.order.inventory_reversal_status).toBe('not_restored_after_preparation');
  });
});
