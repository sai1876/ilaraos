import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { POST as updateItem } from '@/app/api/orders/update-kds-item-status/route';
import { POST as recalculate } from '@/app/api/orders/recalculate-kds-order-status/route';
import { requireRole } from '@/server/auth/requireRole';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

const state = vi.hoisted(() => ({
  order: {} as Record<string, unknown>,
  exists: true,
}));

vi.mock('@/server/auth/requireRole', () => ({ requireRole: vi.fn() }));
vi.mock('@/server/events/logBusinessEvent', () => ({ logBusinessEvent: vi.fn() }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: (collection: string) => ({ doc: (id: string) => ({ collection, id }) }),
    runTransaction: async (callback: (transaction: {
      get: () => Promise<unknown>;
      update: (_ref: unknown, update: Record<string, unknown>) => void;
    }) => Promise<unknown>) => callback({
      async get() {
        return { exists: state.exists, data: () => state.order };
      },
      update(_ref, update) {
        state.order = { ...state.order, ...update };
      },
    }),
  },
}));

function request(body: unknown) {
  return new Request('http://localhost/api/orders/kds', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function authorize(role = 'manager', outletId = 'outlet-a') {
  vi.mocked(requireRole).mockResolvedValueOnce({ uid: 'actor-1', role, outletId } as never);
}

describe('KDS state commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.exists = true;
    state.order = {
      status: 'confirmed',
      outlet_id: 'outlet-a',
      items: [
        { item_id: 'item-1', item_status: 'ordered', station: 'FRYER' },
        { item_id: 'item-2', item_status: 'ordered', station: 'BARISTA' },
      ],
    };
  });

  it('rejects unauthenticated and malformed requests', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(NextResponse.json({ detail: 'Unauthorized' }, { status: 401 }));
    expect((await updateItem(request({ order_id: 'order-1' }))).status).toBe(401);
    authorize();
    expect((await updateItem(request({
      order_id: 'order-1', item_index: 0, item_id: 'item-1', item_status: 'ready', extra: true,
    }))).status).toBe(400);
  });

  it('enforces outlet and station ownership', async () => {
    authorize('manager', 'outlet-b');
    expect((await updateItem(request({
      order_id: 'order-1', item_index: 0, item_id: 'item-1', item_status: 'preparing',
    }))).status).toBe(403);

    authorize('brewer');
    expect((await updateItem(request({
      order_id: 'order-1', item_index: 0, item_id: 'item-1', item_status: 'preparing',
    }))).status).toBe(403);
  });

  it('rejects a generic staff role without an assigned KDS station', async () => {
    authorize('staff');
    expect((await updateItem(request({
      order_id: 'order-1', item_index: 0, item_id: 'item-1', item_status: 'preparing',
    }))).status).toBe(403);
  });

  it('updates an item and parent status atomically', async () => {
    authorize('deep_fryer');
    const response = await updateItem(request({
      order_id: 'order-1', item_index: 0, item_id: 'item-1', item_status: 'preparing',
    }));
    expect(response.status).toBe(200);
    expect(state.order.status).toBe('preparing');
    expect(state.order.items).toEqual([
      expect.objectContaining({ item_id: 'item-1', item_status: 'preparing' }),
      expect.objectContaining({ item_id: 'item-2', item_status: 'ordered' }),
    ]);
    expect(logBusinessEvent).toHaveBeenCalledWith(expect.objectContaining({ outlet_id: 'outlet-a' }));
  });

  it('rejects stale IDs and backward item transitions', async () => {
    authorize();
    expect((await updateItem(request({
      order_id: 'order-1', item_index: 0, item_id: 'stale', item_status: 'ready',
    }))).status).toBe(409);

    state.order = {
      ...state.order,
      items: [{ item_id: 'item-1', item_status: 'ready', station: 'FRYER' }],
    };
    authorize();
    expect((await updateItem(request({
      order_id: 'order-1', item_index: 0, item_id: 'item-1', item_status: 'preparing',
    }))).status).toBe(409);
  });

  it('moves the parent to ready only when every item is ready', async () => {
    state.order = {
      ...state.order,
      status: 'preparing',
      items: [
        { item_id: 'item-1', item_status: 'preparing', station: 'FRYER' },
        { item_id: 'item-2', item_status: 'ready', station: 'BARISTA' },
      ],
    };
    authorize('deep_fryer');
    expect((await updateItem(request({
      order_id: 'order-1', item_index: 0, item_id: 'item-1', item_status: 'ready',
    }))).status).toBe(200);
    expect(state.order.status).toBe('ready');
  });

  it('recalculation is outlet-scoped and idempotent', async () => {
    authorize('manager');
    const response = await recalculate(request({ order_id: 'order-1' }));
    expect(response.status).toBe(200);
    expect((await response.json()).changed).toBe(false);

    authorize('manager', 'outlet-b');
    expect((await recalculate(request({ order_id: 'order-1' }))).status).toBe(403);
  });

  it('does not recalculate terminal orders', async () => {
    state.order = { ...state.order, status: 'delivered' };
    authorize('manager');
    expect((await recalculate(request({ order_id: 'order-1' }))).status).toBe(409);
  });
});
