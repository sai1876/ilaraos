import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBusinessWindow, getCurrentBusinessDate } from '@/lib/businessDate';
import { POST as generateClosing } from '@/app/api/daily-closing/generate/route';
import { POST as submitClosing } from '@/app/api/daily-closing/submit/route';
import { POST as reviewClosing } from '@/app/api/daily-closing/review/route';
import { requireRole } from '@/server/auth/requireRole';

const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>() }));
vi.mock('@/server/auth/requireRole', () => ({ requireRole: vi.fn() }));
vi.mock('@/lib/rateLimit', () => ({
  rateLimitDurable: vi.fn(async () => ({ success: true, source: 'memory', retryAfterMs: 0 })),
}));
vi.mock('@/server/events/logBusinessEvent', () => ({ logBusinessEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/firebaseAdmin', () => {
  type Filter = [string, string, unknown];
  type Ref = {
    kind: 'doc' | 'query'; path: string; id?: string; group?: string; filters: Filter[];
    sortField?: string; sortDirection?: string; max?: number;
  };
  type QueryRef = Ref & {
    where: (field: string, operator: string, value: unknown) => QueryRef;
    orderBy: (field: string, direction?: string) => QueryRef;
    limit: (value: number) => QueryRef;
    get: () => Promise<ReturnType<typeof querySnapshot>>;
  };
  const makeDoc = (path: string): Ref => ({ kind: 'doc', path, id: path.split('/').at(-1), filters: [] });
  const compare = (actual: unknown, operator: string, expected: unknown) => {
    if (operator === '==') return actual === expected;
    if (operator === '>=') return String(actual) >= String(expected);
    if (operator === '<=') return String(actual) <= String(expected);
    if (operator === '<') return String(actual) < String(expected);
    return false;
  };
  const docSnapshot = (ref: Ref) => {
    const value = state.docs.get(ref.path);
    return {
      exists: Boolean(value),
      id: ref.id,
      ref: {
        path: ref.path,
        collection: (subName: string) => makeQuery(`${ref.path}/${subName}`),
      },
      data: () => value,
    };
  };
  const querySnapshot = (ref: Ref) => {
    let entries = [...state.docs.entries()].filter(([path, value]) => {
      const inScope = ref.group
        ? path.split('/').at(-2) === ref.group
        : path.startsWith(`${ref.path}/`) && !path.slice(ref.path.length + 1).includes('/');
      return inScope && ref.filters.every(([field, operator, expected]) => compare(value[field], operator, expected));
    });
    if (ref.sortField) {
      entries = entries.sort((left, right) => {
        const comparison = String(left[1][ref.sortField!]).localeCompare(String(right[1][ref.sortField!]));
        return ref.sortDirection === 'desc' ? -comparison : comparison;
      });
    }
    if (ref.max) entries = entries.slice(0, ref.max);
    const docs = entries.map(([path]) => docSnapshot(makeDoc(path)));
    return { empty: docs.length === 0, size: docs.length, docs };
  };
  function makeQuery(path: string, options: Partial<Ref> = {}): QueryRef {
    const ref: Ref & Record<string, unknown> = { kind: 'query', path, filters: options.filters || [], ...options };
    ref.where = (field: string, operator: string, value: unknown) => makeQuery(path, { ...ref, filters: [...ref.filters, [field, operator, value]] });
    ref.orderBy = (field: string, direction = 'asc') => makeQuery(path, { ...ref, sortField: field, sortDirection: direction });
    ref.limit = (value: number) => makeQuery(path, { ...ref, max: value });
    ref.get = async () => querySnapshot(ref as Ref);
    return ref as QueryRef;
  }
  const db = {
    collection: vi.fn((name: string) => {
      const query = makeQuery(name);
      return { ...query, doc: (id: string) => makeDoc(`${name}/${id}`) };
    }),
    collectionGroup: vi.fn((name: string) => makeQuery('', { group: name })),
    runTransaction: vi.fn(async (callback: (transaction: Record<string, unknown>) => Promise<unknown>) => callback({
      get: vi.fn(async (ref: Ref) => ref.kind === 'doc' ? docSnapshot(ref) : querySnapshot(ref)),
      set: vi.fn((ref: Ref, data: Record<string, unknown>) => state.docs.set(ref.path, data)),
      update: vi.fn((ref: Ref, data: Record<string, unknown>) => state.docs.set(ref.path, { ...(state.docs.get(ref.path) || {}), ...data })),
    })),
  };
  return { adminDb: db };
});

const post = (body: Record<string, unknown>) => new Request('http://localhost', {
  method: 'POST', body: JSON.stringify(body),
});

describe('daily closing reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.docs.clear();
  });

  it('uses the 11 AM Asia/Kolkata business boundary', () => {
    expect(getCurrentBusinessDate(new Date('2026-07-10T10:59:59+05:30').getTime())).toBe('2026-07-09');
    expect(getCurrentBusinessDate(new Date('2026-07-10T11:00:00+05:30').getTime())).toBe('2026-07-10');
    const window = getBusinessWindow('2026-07-10');
    expect(window.start_at).toBe(new Date('2026-07-10T11:00:00+05:30').getTime());
    expect(window.end_at - window.start_at).toBe(14 * 60 * 60 * 1000);
  });

  it('blocks a manager from another outlet', async () => {
    vi.mocked(requireRole).mockResolvedValue({ uid: 'manager-1', role: 'manager', outletId: 'outlet-a' } as never);
    const response = await generateClosing(post({ outlet_id: 'outlet-b', business_date: '2026-07-10' }));
    expect(response.status).toBe(403);
  });

  it('reconciles one outlet without importing other-outlet money or losses', async () => {
    vi.mocked(requireRole).mockResolvedValue({ uid: 'manager-1', role: 'manager', outletId: 'outlet-a' } as never);
    const { start_at } = getBusinessWindow('2026-07-10');
    const at = start_at + 1_000;
    state.docs.set('outlets/outlet-a', { status: 'active' });
    state.docs.set('orders/a1', {
      outlet_id: 'outlet-a', created_at: at, updated_at: at, status: 'completed', gross_amount: 90,
      promo_discount: 10, points_redeemed: 0, is_paid: true, payment_status: 'paid',
    });
    state.docs.set('orders/a2', { outlet_id: 'outlet-a', created_at: at, status: 'cancelled' });
    state.docs.set('orders/b1', { outlet_id: 'outlet-b', created_at: at, status: 'completed', gross_amount: 999, is_paid: true });
    state.docs.set('payment_ledger/pay-a', {
      outlet_id: 'outlet-a', captured_at: at, amount: 90, status: 'captured', payment_method: 'cash',
    });
    state.docs.set('payment_ledger/pay-b', {
      outlet_id: 'outlet-b', captured_at: at, amount: 999, status: 'captured', payment_method: 'upi',
    });
    state.docs.set('orders/a1/refunds/ref-a', {
      outlet_id: 'outlet-a', paid_at: at, refund_amount: 20, payment_status: 'paid',
    });
    state.docs.set('orders/b1/refunds/ref-b', {
      outlet_id: 'outlet-b', paid_at: at, refund_amount: 999, payment_status: 'paid',
    });
    state.docs.set('refund_requests/req-a', {
      outlet_id: 'outlet-a', created_at: at, updated_at: at, status: 'approved', payment_status: 'paid',
    });
    state.docs.set('wastage_events/waste-a', {
      outlet_id: 'outlet-a', created_at: at, updated_at: at, status: 'approved', event_type: 'wastage',
      items: [{ quantity: 2, unit_cost_estimate: 5 }],
    });
    state.docs.set('wastage_events/waste-b', {
      outlet_id: 'outlet-b', created_at: at, status: 'approved', event_type: 'wastage',
      items: [{ quantity: 1, unit_cost_estimate: 999 }],
    });
    state.docs.set('stock_movements/move-a', { outlet_id: 'outlet-a', created_at: at, movement_type: 'wastage' });
    state.docs.set('stock_movements/move-b', { outlet_id: 'outlet-b', created_at: at, movement_type: 'wastage' });

    const response = await generateClosing(post({ outlet_id: 'outlet-a', business_date: '2026-07-10' }));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.closing.sales_summary).toMatchObject({
      gross_sales: 100, net_sales: 90, discount_amount: 10, cash_sales: 90, upi_sales: 0,
      completed_order_count: 1, cancelled_order_count: 1, refunded_amount: 20,
    });
    expect(body.closing.refund_summary.refund_amount_paid_today).toBe(20);
    expect(body.closing.wastage_summary.estimated_wastage_cost).toBe(10);
    expect(body.closing.inventory_summary.stock_movements_today).toBe(1);
    expect(body.closing.source_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('never guesses a tender from a paid order without a payment capture', async () => {
    vi.mocked(requireRole).mockResolvedValue({ uid: 'manager-1', role: 'manager', outletId: 'outlet-a' } as never);
    const { start_at } = getBusinessWindow('2026-07-10');
    state.docs.set('outlets/outlet-a', { status: 'active' });
    state.docs.set('orders/a1', {
      outlet_id: 'outlet-a', created_at: start_at + 1, status: 'completed', gross_amount: 100,
      is_paid: true, payment_status: 'paid',
    });
    const body = await (await generateClosing(post({ outlet_id: 'outlet-a', business_date: '2026-07-10' }))).json();
    expect(body.closing.sales_summary.cash_sales).toBe(0);
    expect(body.closing.sales_summary.upi_sales).toBe(0);
  });

  it('does not regenerate a submitted source snapshot', async () => {
    vi.mocked(requireRole).mockResolvedValue({ uid: 'manager-1', role: 'manager', outletId: 'outlet-a' } as never);
    state.docs.set('outlets/outlet-a', { status: 'active' });
    state.docs.set('daily_closings/daily_closing_outlet-a_2026-07-10', { status: 'submitted', outlet_id: 'outlet-a' });
    const response = await generateClosing(post({ outlet_id: 'outlet-a', business_date: '2026-07-10' }));
    expect(response.status).toBe(409);
  });

  it('enforces submission variance notes and owner-only locking', async () => {
    state.docs.set('daily_closings/close-1', {
      closing_id: 'close-1', outlet_id: 'outlet-a', status: 'draft', source_hash: 'abc',
      cash_reconciliation: { expected_cash: 500 }, payment_reconciliation: { expected_upi: 0 },
    });
    vi.mocked(requireRole).mockResolvedValueOnce({ uid: 'manager-1', role: 'manager', outletId: 'outlet-a' } as never);
    let response = await submitClosing(post({ closing_id: 'close-1', counted_cash: 300, verified_upi: 0 }));
    expect(response.status).toBe(400);

    vi.mocked(requireRole).mockResolvedValueOnce({ uid: 'manager-1', role: 'manager', outletId: 'outlet-a' } as never);
    response = await submitClosing(post({
      closing_id: 'close-1', counted_cash: 300, verified_upi: 0, manager_cash_note: 'Verified physical cash variance',
    }));
    expect(response.status).toBe(200);
    expect(state.docs.get('daily_closings/close-1')).toMatchObject({ status: 'submitted' });

    vi.mocked(requireRole).mockResolvedValueOnce({ uid: 'admin-1', role: 'admin' } as never);
    expect((await reviewClosing(post({ closing_id: 'close-1', decision: 'approved' }))).status).toBe(403);
    vi.mocked(requireRole).mockResolvedValueOnce({ uid: 'owner-1', role: 'owner' } as never);
    response = await reviewClosing(post({ closing_id: 'close-1', decision: 'approved' }));
    expect(response.status).toBe(200);
    expect(state.docs.get('daily_closings/close-1')).toMatchObject({ status: 'locked' });
  });
});
