import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as createRequest } from '@/app/api/refund-requests/create/route';
import { POST as reviewRequest } from '@/app/api/refund-requests/review/route';
import { POST as markPaymentDone } from '@/app/api/refund-requests/mark-payment-done/route';
import { requireRole } from '@/server/auth/requireRole';

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, any>>(),
  creates: [] as Array<{ path: string; data: Record<string, any> }>,
  updates: [] as Array<{ path: string; data: Record<string, any> }>,
}));

vi.mock('@/server/auth/requireRole', () => ({ requireRole: vi.fn() }));
vi.mock('@/lib/rateLimit', () => ({
  rateLimitDurable: vi.fn(async () => ({ success: true, source: 'memory', retryAfterMs: 0 })),
}));
vi.mock('@/server/events/logBusinessEvent', () => ({ logBusinessEvent: vi.fn(async () => undefined) }));

vi.mock('@/lib/firebaseAdmin', () => {
  const makeCollection = (path: string, filters: Array<[string, unknown]> = []) => ({
    kind: filters.length ? 'query' : 'collection',
    path,
    filters,
    doc: (id: string) => makeDoc(`${path}/${id}`),
    where(field: string, _operator: string, value: unknown) {
      return makeCollection(path, [...filters, [field, value]]);
    },
  });
  const makeDoc = (path: string) => ({
    kind: 'doc',
    path,
    id: path.split('/').at(-1),
    collection: (name: string) => makeCollection(`${path}/${name}`),
    set: vi.fn(async (data: Record<string, any>) => state.docs.set(path, data)),
  });
  const documentSnapshot = (ref: any) => {
    const value = state.docs.get(ref.path);
    return { exists: Boolean(value), id: ref.id, ref, data: () => value };
  };
  const querySnapshot = (ref: any) => {
    const prefix = `${ref.path}/`;
    const docs = [...state.docs.entries()]
      .filter(([path, value]) => path.startsWith(prefix)
        && !path.slice(prefix.length).includes('/')
        && ref.filters.every(([field, expected]: [string, unknown]) => value[field] === expected))
      .map(([path]) => documentSnapshot(makeDoc(path)));
    return { empty: docs.length === 0, size: docs.length, docs, forEach: (fn: Function) => docs.forEach(doc => fn(doc)) };
  };
  const db = {
    collection: vi.fn((name: string) => makeCollection(name)),
    runTransaction: vi.fn(async (callback: Function) => callback({
      get: vi.fn(async (ref: any) => ref.kind === 'doc' ? documentSnapshot(ref) : querySnapshot(ref)),
      create: vi.fn((ref: any, data: Record<string, any>) => {
        if (state.docs.has(ref.path)) throw new Error('already exists');
        state.docs.set(ref.path, data);
        state.creates.push({ path: ref.path, data });
      }),
      set: vi.fn((ref: any, data: Record<string, any>) => state.docs.set(ref.path, data)),
      update: vi.fn((ref: any, data: Record<string, any>) => {
        state.docs.set(ref.path, { ...(state.docs.get(ref.path) || {}), ...data });
        state.updates.push({ path: ref.path, data });
      }),
    })),
  };
  return { adminDb: db };
});

const jsonRequest = (body: Record<string, unknown>) => new Request('http://localhost', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const order = (overrides: Record<string, unknown> = {}) => ({
  order_id: 'o1',
  user_id: 'customer-1',
  outlet_id: 'outlet-a',
  gross_amount: 100,
  is_paid: true,
  refunded_amount: 0,
  items: [{ item_id: 'i1', menu_item_id: 'm1', unit_price: 50, quantity: 2 }],
  ...overrides,
});

describe('refund request commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.docs.clear();
    state.creates.length = 0;
    state.updates.length = 0;
  });

  it('creates a customer request with the canonical remaining amount', async () => {
    vi.mocked(requireRole).mockResolvedValue({ uid: 'customer-1', role: 'customer' } as any);
    state.docs.set('orders/o1', order());
    const response = await createRequest(jsonRequest({
      idempotency_key: 'a17a2faa-e4b9-426c-907b-850f5d253720',
      order_id: 'o1',
      request_scope: 'full_order',
      reason_category: 'late_order',
      customer_note: 'The order arrived much too late',
    }));

    expect(response.status).toBe(201);
    expect(state.creates[0].data).toMatchObject({ requested_amount: 100, outlet_id: 'outlet-a' });
  });

  it('rejects a manipulated item amount without creating a request', async () => {
    vi.mocked(requireRole).mockResolvedValue({ uid: 'customer-1', role: 'customer' } as any);
    state.docs.set('orders/o1', order());
    const response = await createRequest(jsonRequest({
      idempotency_key: 'b17a2faa-e4b9-426c-907b-850f5d253720',
      order_id: 'o1',
      request_scope: 'items',
      requested_amount: 1,
      reason_category: 'bad_quality',
      customer_note: 'The item quality was not acceptable',
      items: [{ item_id: 'i1', quantity: 1, requested_amount: 1 }],
    }));

    expect(response.status).toBe(400);
    expect(state.creates).toHaveLength(0);
  });

  it('blocks a manager from reviewing another outlet request', async () => {
    vi.mocked(requireRole).mockResolvedValue({ uid: 'manager-1', role: 'manager', outletId: 'outlet-b' } as any);
    state.docs.set('orders/o1', order());
    state.docs.set('refund_requests/r1', {
      request_id: 'r1', order_id: 'o1', request_scope: 'full_order', requested_amount: 100,
      reason_category: 'late_order', status: 'pending',
    });
    const response = await reviewRequest(jsonRequest({
      request_id: 'r1', decision: 'approved', manager_note: 'Approved after review',
    }));
    expect(response.status).toBe(403);
    expect(state.creates).toHaveLength(0);
  });

  it('calculates an approved legacy item request from the order price', async () => {
    vi.mocked(requireRole).mockResolvedValue({ uid: 'manager-1', role: 'manager', outletId: 'outlet-a' } as any);
    state.docs.set('orders/o1', order());
    state.docs.set('refund_requests/r1', {
      request_id: 'r1', order_id: 'o1', request_scope: 'items', reason_category: 'bad_quality',
      items_requested: [{ item_id: 'i1', quantity: 1 }], status: 'pending',
    });
    const response = await reviewRequest(jsonRequest({
      request_id: 'r1', decision: 'approved', manager_note: 'Approved after review',
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.refunded_amount).toBe(50);
    expect(state.creates.find(entry => entry.path.includes('/refunds/'))?.data.refund_amount).toBe(50);
  });

  it('keeps the order partially pending while another refund is unsettled', async () => {
    vi.mocked(requireRole).mockResolvedValue({ uid: 'manager-1', role: 'manager', outletId: 'outlet-a' } as any);
    state.docs.set('orders/o1', order({ refunded_amount: 100 }));
    state.docs.set('refund_requests/r1', {
      request_id: 'r1', order_id: 'o1', outlet_id: 'outlet-a', linked_refund_id: 'refund-1',
      status: 'approved', payment_status: 'pending',
    });
    state.docs.set('orders/o1/refunds/refund-1', { refund_id: 'refund-1', refund_amount: 40, payment_status: 'pending' });
    state.docs.set('orders/o1/refunds/refund-2', { refund_id: 'refund-2', refund_amount: 60, payment_status: 'pending' });
    const response = await markPaymentDone(jsonRequest({ request_id: 'r1', payment_method: 'cash' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.order_refund_payment_status).toBe('partial_pending');
    expect(state.docs.get('orders/o1')).toMatchObject({ refund_paid_amount: 40, refund_payment_status: 'partial_pending' });
  });

  it('marks the parent paid only when every allocated refund is settled', async () => {
    vi.mocked(requireRole).mockResolvedValue({ uid: 'manager-1', role: 'manager', outletId: 'outlet-a' } as any);
    state.docs.set('orders/o1', order({ refunded_amount: 100 }));
    state.docs.set('refund_requests/r2', {
      request_id: 'r2', order_id: 'o1', outlet_id: 'outlet-a', linked_refund_id: 'refund-2',
      status: 'approved', payment_status: 'pending',
    });
    state.docs.set('orders/o1/refunds/refund-1', { refund_id: 'refund-1', refund_amount: 40, payment_status: 'paid' });
    state.docs.set('orders/o1/refunds/refund-2', { refund_id: 'refund-2', refund_amount: 60, payment_status: 'pending' });
    const response = await markPaymentDone(jsonRequest({ request_id: 'r2', payment_method: 'upi', payment_reference: 'UPI-123' }));
    const body = await response.json();

    expect(body.order_refund_payment_status).toBe('paid');
    expect(state.docs.get('orders/o1')).toMatchObject({ refund_paid_amount: 100, refund_payment_status: 'paid' });
  });
});
