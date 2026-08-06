import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOrderServer,
  OrderCreationError,
  type CreateOrderCommand,
} from '@/server/orders/createOrderServer';

type StoredDocument = Record<string, unknown>;
type FakeRef = { kind: 'doc'; collection: string; id: string; path: string };
type FakeQuery = {
  kind: 'query';
  collection: string;
  filters: Array<{ field: string; value: unknown }>;
  max?: number;
  where: (field: string, operator: string, value: unknown) => FakeQuery;
  limit: (max: number) => FakeQuery;
};

const fake = vi.hoisted(() => {
  const documents = new Map<string, StoredDocument>();

  const makeRef = (collection: string, id: string): FakeRef => ({
    kind: 'doc',
    collection,
    id,
    path: `${collection}/${id}`,
  });
  const makeSnapshot = (ref: FakeRef) => {
    const data = documents.get(ref.path);
    return { id: ref.id, ref, exists: Boolean(data), data: () => data };
  };
  const makeQuery = (
    collection: string,
    filters: Array<{ field: string; value: unknown }> = [],
    max?: number,
  ): FakeQuery => ({
    kind: 'query',
    collection,
    filters,
    max,
    where(field: string, _operator: string, value: unknown) {
      return makeQuery(collection, [...filters, { field, value }], max);
    },
    limit(limitValue: number) {
      return makeQuery(collection, filters, limitValue);
    },
  });
  const querySnapshot = (query: FakeQuery) => {
    const prefix = `${query.collection}/`;
    const matches = [...documents.entries()]
      .filter(([path, data]) => path.startsWith(prefix)
        && query.filters.every(filter => data[filter.field] === filter.value))
      .slice(0, query.max)
      .map(([path]) => makeSnapshot(makeRef(query.collection, path.slice(prefix.length))));
    return { empty: matches.length === 0, size: matches.length, docs: matches };
  };

  const db = {
    collection(collection: string) {
      return {
        doc(id = `generated-${documents.size}`) {
          return makeRef(collection, id);
        },
        where(field: string, operator: string, value: unknown) {
          return makeQuery(collection).where(field, operator, value);
        },
      };
    },
    async runTransaction<T>(callback: (transaction: {
      get: (target: FakeRef | FakeQuery) => Promise<ReturnType<typeof makeSnapshot> | ReturnType<typeof querySnapshot>>;
      set: (ref: FakeRef, data: StoredDocument) => void;
      create: (ref: FakeRef, data: StoredDocument) => void;
      update: (ref: FakeRef, data: StoredDocument) => void;
    }) => Promise<T>): Promise<T> {
      return callback({
        async get(target) {
          return target.kind === 'query' ? querySnapshot(target) : makeSnapshot(target);
        },
        set(ref, data) {
          documents.set(ref.path, { ...data });
        },
        create(ref, data) {
          if (documents.has(ref.path)) throw new Error('already exists');
          documents.set(ref.path, { ...data });
        },
        update(ref, data) {
          documents.set(ref.path, { ...(documents.get(ref.path) || {}), ...data });
        },
      });
    },
  };

  return { documents, db };
});

vi.mock('@/lib/firebaseAdmin', () => ({ adminDb: fake.db }));
vi.mock('@/server/notifications/triggerLowStockAlert', () => ({
  triggerLowStockAlert: vi.fn().mockResolvedValue(true),
}));

function seedBase() {
  fake.documents.set('outlets/hyd_campus', {
    outlet_id: 'hyd_campus',
    name: 'HYD CAMPUS',
    status: 'active',
    hatches: ['OASIS'],
  });
  fake.documents.set('users/test-user', {
    is_active: true,
    account_status: 'active',
    status: 'active',
    points: 200,
  });
  fake.documents.set('menu/item1', {
    name: 'Canonical Coffee',
    price: 200,
    category: 'Beverages',
    station: 'BARISTA',
    is_available: true,
    recipe: [],
  });
}

function command(overrides: Partial<CreateOrderCommand> = {}): CreateOrderCommand {
  return {
    userId: 'test-user',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    clientExpectedTotal: 1,
    pointsRedeemed: 0,
    orderType: 'pickup',
    items: [{ menuItemId: 'item1', quantity: 2, modifiers: [] }],
    hatch: 'OASIS',
    outlet: 'HYD CAMPUS',
    ...overrides,
  };
}

describe('createOrderServer transaction', () => {
  beforeEach(() => {
    fake.documents.clear();
    seedBase();
  });

  it('uses canonical price, name and station', async () => {
    const result = await createOrderServer(command());
    expect(result.gross_amount).toBe(405);
    expect(result.points_redeemed).toBe(0);
    expect(result.items).toEqual([
      expect.objectContaining({
        name: 'Canonical Coffee',
        station: 'BARISTA',
        unit_price: 200,
        quantity: 2,
      }),
    ]);
  });

  it('resolves an outlet by its canonical outlet ID as well as its display name', async () => {
    await expect(createOrderServer(command({ outlet: 'hyd_campus' }))).resolves.toMatchObject({
      outlet_id: 'hyd_campus',
    });
  });

  it('requires a pickup-point selection only when the outlet has pickup points', async () => {
    await expect(createOrderServer(command({ hatch: undefined })))
      .rejects.toMatchObject({ status: 400, publicMessage: 'Please select a pickup point' });

    fake.documents.set('outlets/hyd_campus', {
      ...fake.documents.get('outlets/hyd_campus'),
      hatches: [],
    });

    await expect(createOrderServer(command({ hatch: undefined }))).resolves.toMatchObject({
      order_type: 'pickup',
    });
  });

  it('rejects unavailable menu items without creating an order', async () => {
    fake.documents.set('menu/item1', {
      ...fake.documents.get('menu/item1'),
      is_available: false,
    });
    await expect(createOrderServer(command())).rejects.toMatchObject({ status: 409 });
    expect([...fake.documents.keys()].filter(path => path.startsWith('orders/'))).toHaveLength(0);
  });

  it('rejects points above the 20 percent cap', async () => {
    await expect(createOrderServer(command({ pointsRedeemed: 1000 })))
      .rejects.toBeInstanceOf(OrderCreationError);
    expect([...fake.documents.keys()].filter(path => path.startsWith('orders/'))).toHaveLength(0);
  });

  it('rejects insufficient active points atomically', async () => {
    fake.documents.set('point_ledger/credit-1', {
      user_id: 'test-user',
      amount: 10,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      is_expired: false,
    });
    await expect(createOrderServer(command({ pointsRedeemed: 20 })))
      .rejects.toMatchObject({ status: 409 });
    expect(fake.documents.get('point_ledger/credit-1')?.amount).toBe(10);
    expect([...fake.documents.keys()].filter(path => path.startsWith('orders/'))).toHaveLength(0);
  });

  it('debits points and creates the order in the same transaction', async () => {
    fake.documents.set('point_ledger/credit-1', {
      user_id: 'test-user',
      amount: 100,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      is_expired: false,
    });
    const result = await createOrderServer(command({ pointsRedeemed: 50 }));
    expect(result.gross_amount).toBe(355);
    expect(fake.documents.get('point_ledger/credit-1')?.amount).toBe(50);
    expect(fake.documents.get(`point_ledger/order_${result.order_id}_debit`)).toMatchObject({
      amount: -50,
      order_id: result.order_id,
    });
  });

  it('applies a valid promo using server category data', async () => {
    fake.documents.set('offers/save10', {
      code: 'SAVE10',
      isActive: true,
      expiryDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      discountPercent: 10,
      categoryScope: 'Beverages',
    });
    const result = await createOrderServer(command({ promoCode: 'SAVE10' }));
    expect(result.promo_discount).toBe(40);
    expect(result.gross_amount).toBe(365);
  });

  it('returns the original order for a replay and rejects key reuse with different input', async () => {
    const first = await createOrderServer(command());
    const replay = await createOrderServer(command());
    expect(replay.order_id).toBe(first.order_id);
    expect(replay.replayed).toBe(true);
    expect([...fake.documents.keys()].filter(path => path.startsWith('orders/'))).toHaveLength(1);

    await expect(createOrderServer(command({ items: [{ menuItemId: 'item1', quantity: 1 }] })))
      .rejects.toMatchObject({ status: 409 });
  });
});
