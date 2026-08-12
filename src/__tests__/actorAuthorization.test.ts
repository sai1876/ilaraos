import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isRoleAllowed,
  resolveActorContext,
} from '@/server/auth/resolveActor';

type RecordMap = Record<string, Record<string, unknown>>;

function fakeDb(seed: { users?: RecordMap; staff?: RecordMap }) {
  const collections: Record<string, RecordMap> = {
    users: seed.users || {},
    staff: seed.staff || {},
  };

  const snapshot = (id: string, data?: Record<string, unknown>) => ({
    id,
    exists: Boolean(data),
    data: () => data,
  });

  return {
    collection: vi.fn((name: string) => ({
      doc: (id: string) => ({
        get: vi.fn(async () => snapshot(id, collections[name]?.[id])),
      }),
      where: (field: string, _operator: string, value: unknown) => ({
        limit: () => ({
          get: vi.fn(async () => {
            const match = Object.entries(collections[name] || {}).find(
              ([, data]) => data[field] === value,
            );
            return {
              empty: !match,
              docs: match ? [snapshot(match[0], match[1])] : [],
            };
          }),
        }),
      }),
    })),
  };
}

const authMocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  createSessionCookie: vi.fn(),
  db: { current: null as any },
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminAuth: {
    verifyIdToken: authMocks.verifyIdToken,
    createSessionCookie: authMocks.createSessionCookie,
  },
  adminDb: {
    collection: (...args: any[]) => authMocks.db.current.collection(...args),
  },
}));

import { POST as sessionPost } from '@/app/api/auth/session/route';

describe('server-authoritative actor resolution', () => {
  it('ignores a forged owner token claim for a customer profile', async () => {
    const db = fakeDb({
      users: { customer1: { role: 'customer', account_status: 'active' } },
    });

    const result = await resolveActorContext(db as any, {
      uid: 'customer1',
      email: 'customer@example.test',
      role: 'owner',
    } as any);

    expect(result).toMatchObject({ ok: true, actor: { role: 'customer' } });
    if (result.ok) expect(isRoleAllowed(result.actor.role, ['owner'])).toBe(false);
  });

  it('resolves an active manager and outlet from the staff record', async () => {
    const db = fakeDb({
      users: { manager1: { role: 'customer', account_status: 'active' } },
      staff: {
        manager1: { role: 'manager', status: 'offline', outlet_id: 'outlet-a' },
      },
    });

    const result = await resolveActorContext(db as any, {
      uid: 'manager1',
      email: 'manager@example.test',
    } as any);

    expect(result).toEqual({
      ok: true,
      actor: {
        uid: 'manager1',
        email: 'manager@example.test',
        role: 'manager',
        staffId: 'manager1',
        outletId: 'outlet-a',
        tenantId: 'main',
        permissions: [
          'cash_sessions.read',
          'cash_sessions.create',
          'cash_sessions.close',
          'expenses.read',
          'expenses.create',
        ],
        allowedOutletIds: ['outlet-a'],
        tokenVersion: undefined,
      },
    });
  });

  it('denies suspended staff and stale token versions', async () => {
    const suspended = fakeDb({
      staff: { staff1: { role: 'manager', status: 'suspended', outlet_id: 'outlet-a' } },
    });
    await expect(
      resolveActorContext(suspended as any, { uid: 'staff1' } as any),
    ).resolves.toEqual({ ok: false, reason: 'staff_inactive' });

    const stale = fakeDb({
      staff: {
        staff2: { role: 'manager', status: 'active', outlet_id: 'outlet-a', token_version: 2 },
      },
    });
    await expect(
      resolveActorContext(stale as any, { uid: 'staff2', token_version: 1 } as any),
    ).resolves.toEqual({ ok: false, reason: 'stale_token' });
  });

  it('requires a staff record for a server-side staff role', async () => {
    const db = fakeDb({
      users: { manager2: { role: 'manager', account_status: 'active' } },
    });

    await expect(
      resolveActorContext(db as any, { uid: 'manager2' } as any),
    ).resolves.toEqual({ ok: false, reason: 'staff_record_required' });
  });

  it('maps concrete kitchen roles to staff and kitchen permissions', () => {
    expect(isRoleAllowed('brewer', ['staff'])).toBe(true);
    expect(isRoleAllowed('brewer', ['kitchen'])).toBe(true);
    expect(isRoleAllowed('brewer', ['owner'])).toBe(false);
  });
});

describe('staff session endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies a customer even when their token contains an owner claim', async () => {
    authMocks.db.current = fakeDb({
      users: { customer2: { role: 'customer', account_status: 'active' } },
    });
    authMocks.verifyIdToken.mockResolvedValue({
      uid: 'customer2',
      email: 'customer@example.test',
      role: 'owner',
    });

    const response = await sessionPost(new Request('http://localhost/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'init', idToken: 'fixture-token' }),
    }));

    expect(response.status).toBe(403);
    expect(authMocks.verifyIdToken).toHaveBeenCalledWith('fixture-token', true);
    expect(authMocks.db.current.collection).not.toHaveBeenCalledWith('admin_secrets');
  });

  it('clears the session cookie without requiring an ID token', async () => {
    const response = await sessionPost(new Request('http://localhost/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('__session=');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(authMocks.verifyIdToken).not.toHaveBeenCalled();
  });
});
