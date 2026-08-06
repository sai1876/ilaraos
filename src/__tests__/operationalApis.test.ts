import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as cashPost, GET as cashGet } from '@/app/api/operations/cash-sessions/route';
import { POST as expensePost } from '@/app/api/operations/expenses/route';
import { POST as attendancePost, GET as attendanceGet } from '@/app/api/operations/attendance/route';
import { POST as shiftPost, GET as shiftGet } from '@/app/api/operations/shifts/route';
import { GET as kdsGet } from '@/app/api/operations/kds-tickets/route';
import { POST as deliveryPost, GET as deliveryGet } from '@/app/api/operations/delivery/route';
import { GET as customerRouteGet } from '@/app/api/customer/active-route/route';

import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { requireRole } from '@/server/auth/requireRole';

const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, any>>() }));

vi.mock('@/server/auth/requireSessionActor', () => ({
  requireSessionActor: vi.fn(),
  SessionAuthorizationError: class SessionAuthorizationError extends Error {
    status: number;
    constructor(message: string, status = 401) {
      super(message);
      this.status = status;
    }
  }
}));

vi.mock('@/server/auth/requireRole', () => ({
  requireRole: vi.fn()
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimitDurable: vi.fn(async () => ({ success: true, source: 'memory', retryAfterMs: 0 })),
}));

vi.mock('@/server/events/logBusinessEvent', () => ({
  logBusinessEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/firebaseAdmin', () => {
  type Filter = [string, string, any];
  type Ref = {
    kind: 'doc' | 'query'; path: string; id?: string; group?: string; filters: Filter[];
    sortField?: string; sortDirection?: string; max?: number;
  };
  type QueryRef = Ref & {
    where: (field: string, operator: string, value: any) => QueryRef;
    orderBy: (field: string, direction?: string) => QueryRef;
    limit: (value: number) => QueryRef;
    get: () => Promise<any>;
  };
  const makeDoc = (path: string): Ref => ({ kind: 'doc', path, id: path.split('/').at(-1), filters: [] });
  const compare = (actual: any, operator: string, expected: any) => {
    if (operator === '==') return actual === expected;
    if (operator === '>=') return Number(actual) >= Number(expected);
    if (operator === '<=') return Number(actual) <= Number(expected);
    if (operator === '<') return Number(actual) < Number(expected);
    if (operator === '>') return Number(actual) > Number(expected);
    if (operator === 'in') return Array.isArray(expected) && expected.includes(actual);
    return false;
  };
  const docSnapshot = (ref: Ref) => {
    const value = state.docs.get(ref.path);
    return {
      exists: Boolean(value),
      id: ref.id,
      ref: { path: ref.path, delete: async () => state.docs.delete(ref.path) },
      data: () => value
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
  const makeQuery = (path: string, options: Partial<Ref> = {}): QueryRef => {
    const ref: Ref & Record<string, any> = { kind: 'query', path, filters: options.filters || [], ...options };
    ref.where = (field: string, operator: string, value: any) => makeQuery(path, { ...ref, filters: [...ref.filters, [field, operator, value]] });
    ref.orderBy = (field: string, direction = 'asc') => makeQuery(path, { ...ref, sortField: field, sortDirection: direction });
    ref.limit = (value: number) => makeQuery(path, { ...ref, max: value });
    ref.get = async () => querySnapshot(ref as Ref);
    return ref as QueryRef;
  };
  const db = {
    collection: vi.fn((name: string) => {
      const query = makeQuery(name);
      return {
        ...query,
        doc: (id: string) => ({
          ...makeDoc(`${name}/${id}`),
          get: async () => docSnapshot(makeDoc(`${name}/${id}`)),
          set: async (data: any) => state.docs.set(`${name}/${id}`, data),
          update: async (data: any) => state.docs.set(`${name}/${id}`, { ...(state.docs.get(`${name}/${id}`) || {}), ...data }),
          delete: async () => { state.docs.delete(`${name}/${id}`); }
        })
      };
    }),
    collectionGroup: vi.fn((name: string) => makeQuery('', { group: name })),
    runTransaction: vi.fn(async (callback: (transaction: any) => Promise<any>) => callback({
      get: vi.fn(async (ref: Ref) => ref.kind === 'doc' ? docSnapshot(ref) : querySnapshot(ref)),
      set: vi.fn((ref: Ref, data: any) => state.docs.set(ref.path, data)),
      create: vi.fn((ref: Ref, data: any) => state.docs.set(ref.path, data)),
      update: vi.fn((ref: Ref, data: any) => state.docs.set(ref.path, { ...(state.docs.get(ref.path) || {}), ...data })),
      delete: vi.fn((ref: Ref) => { state.docs.delete(ref.path); }),
    })),
  };
  return { adminDb: db };
});

const req = (body?: Record<string, any>, method = 'POST', queryParams = '') => {
  return new Request(`http://localhost${queryParams}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
};

describe('Operational APIs and Security Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.docs.clear();

    // Setup default mock outlet
    state.docs.set('outlets/outlet-a', {
      id: 'outlet-a',
      outlet_id: 'outlet-a',
      name: 'geetanjali collage of engineering',
      timezone: 'Asia/Kolkata',
      hatches: ['OASIS']
    });

    // Setup staff directory mapping
    state.docs.set('staff_directory/staff-1', {
      employee_id: 'staff-1',
      name: 'Manager Bob',
      role: 'manager',
      status: 'active',
      outlet_id: 'outlet-a'
    });
  });

  describe('Cash sessions & expected balance', () => {
    it('allows manager to open and close cash sessions', async () => {
      vi.mocked(requireSessionActor).mockResolvedValue({
        uid: 'user-manager',
        role: 'manager',
        staffId: 'staff-1',
        outletId: 'outlet-a'
      } as any);

      // Open cash session
      const openRes = await cashPost(req({
        action: 'open',
        opening_cash: 1000,
        shift: 'morning',
        staff_id: 'staff-1'
      }));
      expect(openRes.status).toBe(201);
      const openBody = await openRes.json();
      expect(openBody.success).toBe(true);

      // Check cash active sentinel created in state
      expect(state.docs.has(`active_cash_sessions/outlet-a_morning`)).toBe(true);

      // Get cash sessions
      const getRes = await cashGet(req(undefined, 'GET', '?outlet_id=outlet-a'));
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.sessions.length).toBe(1);

      // Close cash session
      const sessionId = openBody.shift_id || openBody.session_id || [...state.docs.keys()].find(k => k.startsWith('cash_sessions/'))?.split('/')?.at(-1);
      const closeRes = await cashPost(req({
        action: 'close',
        session_id: sessionId!,
        closing_cash: 1200
      }));
      expect(closeRes.status).toBe(200);
    });
  });

  describe('Expense idempotency', () => {
    it('creates expense on first try and returns replay on duplicate key', async () => {
      vi.mocked(requireSessionActor).mockResolvedValue({
        uid: 'user-manager',
        role: 'manager',
        staffId: 'staff-1',
        outletId: 'outlet-a'
      } as any);

      const payload = {
        idempotency_key: 'unique_expense_key_1234567890',
        category: 'Supplies',
        amount: 250.50,
        description: 'Milk purchase',
        payment_method: 'cash',
        staff_id: 'staff-1'
      };

      const firstRes = await expensePost(req(payload));
      expect(firstRes.status).toBe(201);
      const firstBody = await firstRes.json();
      expect(firstBody.idempotent_replay).toBe(false);

      // Second try with same key
      const secondRes = await expensePost(req(payload));
      expect(secondRes.status).toBe(200);
      const secondBody = await secondRes.json();
      expect(secondBody.idempotent_replay).toBe(true);
    });
  });

  describe('Attendance Sentinels & Shifts', () => {
    it('enforces active attendance sentinels and shift scheduling', async () => {
      vi.mocked(requireSessionActor).mockResolvedValue({
        uid: 'user-manager',
        role: 'manager',
        staffId: 'staff-1',
        outletId: 'outlet-a'
      } as any);

      // 1. Attendance Clock-in
      const clockInRes = await attendancePost(req({
        action: 'clock_in',
        staff_id: 'staff-1',
        outlet_id: 'outlet-a'
      }));
      expect(clockInRes.status).toBe(201);
      const clockInBody = await clockInRes.json();
      expect(clockInBody.success).toBe(true);

      // Sentinel active_attendance created
      expect(state.docs.has('active_attendance/staff-1')).toBe(true);

      // Retrieve dated attendance
      const getAttRes = await attendanceGet(req(undefined, 'GET', '?outlet_id=outlet-a&date=2026-07-14'));
      expect(getAttRes.status).toBe(200);

      // 2. Shifts configuration
      const shiftRes = await shiftPost(req({
        staff_id: 'staff-1',
        start_time: '09:00',
        end_time: '17:00',
        role: 'barista',
        hatch: 'OASIS',
        date: '2026-07-14'
      }));
      expect(shiftRes.status).toBe(201);

      // Get shifts
      const getShiftRes = await shiftGet(req(undefined, 'GET', '?outlet_id=outlet-a&date=2026-07-14'));
      expect(getShiftRes.status).toBe(200);
    });
  });

  describe('KDS ticket projection and rider availability', () => {
    it('projects KDS ticket items by station without customer details', async () => {
      vi.mocked(requireSessionActor).mockResolvedValue({
        uid: 'kitchen-staff',
        role: 'brewer',
        outletId: 'outlet-a'
      } as any);

      state.docs.set('orders/order-123', {
        outlet_id: 'outlet-a',
        status: 'confirmed',
        created_at: Date.now(),
        display_order_code: 'O-123',
        token_number: '001',
        order_type: 'dine-in',
        user_id: 'customer-1',
        customer_phone: '1234567890', // private field
        items: [
          { item_id: 'i1', menu_item_id: 'm1', name: 'Filter Coffee', quantity: 2, station: 'BREWER', item_status: 'ordered' },
          { item_id: 'i2', menu_item_id: 'm2', name: 'Fries', quantity: 1, station: 'FRYER', item_status: 'ordered' }
        ]
      });

      const res = await kdsGet();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tickets.length).toBe(1);
      const ticket = body.tickets[0];
      // Only BREWER items should be returned to the brewer role
      expect(ticket.items.length).toBe(1);
      expect(ticket.items[0].station).toBe('BREWER');
      // Verify customer details are absent
      expect(ticket.customer_phone).toBeUndefined();
    });

    it('manages rider availability and retrieves assignments', async () => {
      vi.mocked(requireSessionActor).mockResolvedValue({
        uid: 'rider-staff',
        role: 'rider',
        staffId: 'rider-1',
        outletId: 'outlet-a'
      } as any);

      // Set availability
      const availRes = await deliveryPost(req({
        action: 'availability',
        status: 'active'
      }));
      expect(availRes.status).toBe(200);

      // Get delivery assignments
      const getDeliveryRes = await deliveryGet();
      expect(getDeliveryRes.status).toBe(200);
    });

    it('resolves customer location projection from expiring rider location', async () => {
      // Mock customer requireRole
      vi.mocked(requireRole).mockResolvedValue({
        uid: 'customer-1',
        role: 'customer'
      } as any);

      state.docs.set('orders/order-456', {
        user_id: 'customer-1',
        status: 'out_for_delivery',
        rider_id: 'rider-1',
        outlet_id: 'outlet-a',
        created_at: Date.now()
      });

      // Rider location not expired
      state.docs.set('delivery_locations/rider-1', {
        rider_id: 'rider-1',
        outlet_id: 'outlet-a',
        expires_at: Date.now() + 60_000,
        location: { lat: 17.5, lng: 78.5, updated_at: Date.now() }
      });

      const res = await customerRouteGet(req(undefined, 'GET', '?order_id=order-456'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.rider_location).not.toBeNull();
      expect(body.rider_location.lat).toBe(17.5);
    });
  });
});
