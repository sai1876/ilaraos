import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as createWastage } from '@/app/api/wastage-events/create/route';
import { POST as approveWastage } from '@/app/api/wastage-events/approve/route';
import { GET as listWastage } from '@/app/api/wastage-events/list/route';
import { requireRole } from '@/server/auth/requireRole';

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  creates: [] as Array<{ path: string; data: Record<string, unknown> }>,
  writeStarted: false,
  readAfterWrite: false,
}));

vi.mock('@/server/auth/requireRole', () => ({ requireRole: vi.fn() }));
vi.mock('@/lib/rateLimit', () => ({
  rateLimitDurable: vi.fn(async () => ({ success: true, source: 'memory', retryAfterMs: 0 })),
}));
vi.mock('@/server/events/logBusinessEvent', () => ({ logBusinessEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/firebaseAdmin', () => {
  type Filter = [string, unknown];
  type Ref = { kind: 'doc' | 'collection' | 'query'; path: string; id?: string; filters: Filter[] };
  type DocRef = Ref & { collection: (name: string) => CollectionRef };
  type CollectionRef = Ref & {
    doc: (id: string) => DocRef;
    where: (field: string, operator: string, value: unknown) => CollectionRef;
    orderBy: () => CollectionRef;
    limit: () => CollectionRef;
    get: () => Promise<ReturnType<typeof querySnapshot>>;
  };
  const makeDoc = (path: string): DocRef => ({
    kind: 'doc', path, id: path.split('/').at(-1), filters: [],
    collection: (name: string) => makeCollection(`${path}/${name}`),
  });
  const snapshot = (ref: Ref) => {
    const value = state.docs.get(ref.path);
    return { exists: Boolean(value), id: ref.id, ref, data: () => value };
  };
  const querySnapshot = (ref: Ref) => {
    const prefix = `${ref.path}/`;
    const docs = [...state.docs.entries()]
      .filter(([path, value]) => path.startsWith(prefix)
        && !path.slice(prefix.length).includes('/')
        && ref.filters.every(([field, expected]) => value[field] === expected))
      .sort((left, right) => Number(right[1].created_at || 0) - Number(left[1].created_at || 0))
      .map(([path]) => snapshot(makeDoc(path)));
    return { empty: docs.length === 0, size: docs.length, docs };
  };
  function makeCollection(path: string, filters: Filter[] = []): CollectionRef {
    const ref: Ref & Record<string, unknown> = { kind: filters.length ? 'query' : 'collection', path, filters };
    ref.doc = (id: string) => makeDoc(`${path}/${id}`);
    ref.where = (field: string, _operator: string, value: unknown) => makeCollection(path, [...filters, [field, value]]);
    ref.orderBy = () => ref;
    ref.limit = () => ref;
    ref.get = async () => querySnapshot(ref as Ref);
    return ref as CollectionRef;
  }
  const db = {
    collection: vi.fn((name: string) => makeCollection(name)),
    runTransaction: vi.fn(async (callback: (transaction: Record<string, unknown>) => Promise<unknown>) => callback({
      get: vi.fn(async (ref: Ref) => {
        if (state.writeStarted) state.readAfterWrite = true;
        return ref.kind === 'doc' ? snapshot(ref) : querySnapshot(ref);
      }),
      create: vi.fn((ref: Ref, data: Record<string, unknown>) => {
        state.writeStarted = true;
        state.docs.set(ref.path, data);
        state.creates.push({ path: ref.path, data });
      }),
      update: vi.fn((ref: Ref, data: Record<string, unknown>) => {
        state.writeStarted = true;
        state.docs.set(ref.path, { ...(state.docs.get(ref.path) || {}), ...data });
      }),
    })),
  };
  return { adminDb: db };
});

const request = (body: Record<string, unknown>, url = 'http://localhost/api/wastage-events') => new Request(url, {
  method: 'POST', body: JSON.stringify(body),
});

describe('wastage commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.docs.clear();
    state.creates.length = 0;
    state.writeStarted = false;
    state.readAfterWrite = false;
  });

  it('stores canonical menu data and outlet instead of caller labels and costs', async () => {
    vi.mocked(requireRole).mockResolvedValue({ uid: 'chef-1', role: 'kitchen', outletId: 'outlet-a' } as never);
    state.docs.set('menu/menu-1', { name: 'Canonical Burger', station: 'grill' });
    state.docs.set('documents/doc-1', {
      document_type: 'wastage_photo',
      attachment_state: 'pending_entity',
      related_entity_id: '11111111-1111-4111-8111-111111111111'
    });
    const response = await createWastage(request({
      idempotency_key: '11111111-1111-4111-8111-111111111111',
      source_type: 'kitchen_error', event_type: 'remake',
      items: [{ menu_item_id: 'menu-1', item_name: 'Forged', unit_cost_estimate: 9999, quantity: 1, loss_basis: 'menu_item' }],
      reason_category: 'burned', manager_note: 'Reported by kitchen',
      document_ids: ['doc-1']
    }));

    expect(response.status).toBe(201);
    const event = state.creates[0].data;
    expect(event).toMatchObject({ outlet_id: 'outlet-a', deduct_inventory: true, deduction_method: 'recipe' });
    expect((event.items as Array<Record<string, unknown>>)[0]).toMatchObject({ item_name: 'Canonical Burger' });
    expect((event.items as Array<Record<string, unknown>>)[0]).not.toHaveProperty('unit_cost_estimate');
  });

  it('rejects a stock item from another outlet', async () => {
    vi.mocked(requireRole).mockResolvedValue({ uid: 'manager-1', role: 'manager', outletId: 'outlet-a' } as never);
    state.docs.set('inventory/stock-1', { name: 'Cheese', outlet_id: 'outlet-b', current_quantity: 10 });
    state.docs.set('documents/doc-2', {
      document_type: 'wastage_photo',
      attachment_state: 'pending_entity',
      related_entity_id: '22222222-2222-4222-8222-222222222222'
    });
    const response = await createWastage(request({
      idempotency_key: '22222222-2222-4222-8222-222222222222',
      source_type: 'expired_stock', event_type: 'spoilage',
      items: [{ stock_item_id: 'stock-1', quantity: 1, loss_basis: 'stock_item' }],
      reason_category: 'expired', manager_note: 'Expired stock found',
      document_ids: ['doc-2']
    }));
    expect(response.status).toBe(403);
    expect(state.creates).toHaveLength(0);
  });

  it('deducts a multi-stock recipe atomically with no read after a write', async () => {
    vi.mocked(requireRole).mockResolvedValue({ uid: 'manager-1', role: 'manager', outletId: 'outlet-a' } as never);
    state.docs.set('wastage_events/event-1', {
      event_id: 'event-1', outlet_id: 'outlet-a', status: 'reported', deduct_inventory: true,
      deduction_method: 'recipe', event_type: 'remake', reason_category: 'burned',
      items: [{ menu_item_id: 'menu-1', quantity: 2, loss_basis: 'menu_item' }],
    });
    state.docs.set('menu/menu-1', { recipe: [{ stock_id: 'stock-1', quantity: 2 }, { stock_id: 'stock-2', quantity: 1 }] });
    state.docs.set('inventory/stock-1', { outlet_id: 'outlet-a', current_quantity: 10 });
    state.docs.set('inventory/stock-2', { outlet_id: 'outlet-a', current_quantity: 10 });
    const response = await approveWastage(request({ event_id: 'event-1', decision: 'approved' }));

    expect(response.status).toBe(200);
    expect(state.readAfterWrite).toBe(false);
    expect(state.docs.get('inventory/stock-1')).toMatchObject({ current_quantity: 6 });
    expect(state.docs.get('inventory/stock-2')).toMatchObject({ current_quantity: 8 });
    expect(state.creates.filter(entry => entry.path.startsWith('stock_movements/'))).toHaveLength(2);
  });

  it('rejects insufficient stock without clamping inventory to zero', async () => {
    vi.mocked(requireRole).mockResolvedValue({ uid: 'manager-1', role: 'manager', outletId: 'outlet-a' } as never);
    state.docs.set('wastage_events/event-1', {
      event_id: 'event-1', outlet_id: 'outlet-a', status: 'reported', deduct_inventory: true,
      deduction_method: 'stock_direct', event_type: 'spoilage', reason_category: 'expired',
      items: [{ stock_item_id: 'stock-1', quantity: 5, loss_basis: 'stock_item' }],
    });
    state.docs.set('inventory/stock-1', { outlet_id: 'outlet-a', current_quantity: 2 });
    const response = await approveWastage(request({ event_id: 'event-1', decision: 'approved' }));
    expect(response.status).toBe(409);
    expect(state.docs.get('inventory/stock-1')).toMatchObject({ current_quantity: 2 });
    expect(state.creates).toHaveLength(0);
  });

  it('lists only the manager outlet with a bounded query', async () => {
    vi.mocked(requireRole).mockResolvedValue({ uid: 'manager-1', role: 'manager', outletId: 'outlet-a' } as never);
    state.docs.set('wastage_events/a', { event_id: 'a', outlet_id: 'outlet-a', created_at: 2 });
    state.docs.set('wastage_events/b', { event_id: 'b', outlet_id: 'outlet-b', created_at: 1 });
    const response = await listWastage(new Request('http://localhost/api/wastage-events/list?limit=10'));
    const body = await response.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].event_id).toBe('a');
  });
});
