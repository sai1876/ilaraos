import { describe, it, expect, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { resolveActorContext } from '@/server/auth/resolveActor';
import { getDefaultPermissionsForRole, PERMISSIONS } from '@/lib/auth/permissions';
import { requireBatchExecutionAccess, SessionAuthorizationError, requirePermission, requireOutletAccess } from '@/server/auth/requireSessionActor';
import { adminDb } from '@/lib/firebaseAdmin';

vi.mock('next/headers', () => ({
  cookies: vi.fn()
}));

// Mock everything needed for unit testing authorization behavior
vi.mock('@/lib/firebaseAdmin', () => {
  return {
    adminAuth: {
      verifySessionCookie: vi.fn(),
      revokeRefreshTokens: vi.fn(),
      getUserByEmail: vi.fn(),
      updateUser: vi.fn(),
      deleteUser: vi.fn()
    },
    adminDb: {
      collection: vi.fn(),
      runTransaction: vi.fn(),
      batch: vi.fn(() => ({ set: vi.fn(), delete: vi.fn(), commit: vi.fn(), update: vi.fn() }))
    }
  };
});

vi.mock('@/server/auth/requireSessionActor', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    requireSessionActor: vi.fn().mockImplementation(actual.requireSessionActor),
    requireSessionActorApi: vi.fn().mockImplementation(actual.requireSessionActorApi),
  };
});

describe('AUTH-03 Acceptance Tests', () => {

  describe('A. MANAGER PERMISSIONS', () => {
    it('provides correct default permissions for legacy manager', async () => {
      const defaults = getDefaultPermissionsForRole('manager');
      expect(defaults).toContain(PERMISSIONS.CASH_SESSIONS_READ);
      expect(defaults).toContain(PERMISSIONS.CASH_SESSIONS_CREATE);
      expect(defaults).toContain(PERMISSIONS.CASH_SESSIONS_CLOSE);
      expect(defaults).toContain(PERMISSIONS.EXPENSES_READ);
      expect(defaults).toContain(PERMISSIONS.EXPENSES_CREATE);

      expect(defaults).not.toContain(PERMISSIONS.INVENTORY_ADJUST);
      expect(defaults).not.toContain(PERMISSIONS.INVENTORY_DELETE);
      expect(defaults).not.toContain(PERMISSIONS.INVENTORY_MANAGE);
    });

    it('uses legacy default permissions if staff_access.permissions is missing', async () => {
      (adminDb!.collection as any).mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({ role: 'manager', outlet_id: 'O1', status: 'active' }) // no permissions array
          })
        })
      });

      const res = await resolveActorContext(adminDb as any, { uid: 'u1' } as any);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.actor.permissions).toContain(PERMISSIONS.CASH_SESSIONS_READ);
      }
    });

    it('retains empty permissions array if explicitly set to []', async () => {
      (adminDb!.collection as any).mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({ role: 'manager', outlet_id: 'O1', status: 'active', permissions: [] })
          })
        })
      });

      const res = await resolveActorContext(adminDb as any, { uid: 'u2' } as any);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.actor.permissions).toEqual([]);
      }
    });
  });

  describe('B. ROLE CHANGE', () => {
    it('computes new defaults for role change', () => {
      const oldRole = 'manager';
      const newRole = 'kitchen';
      
      const oldPermissions = getDefaultPermissionsForRole(oldRole);
      expect(oldPermissions.length).toBeGreaterThan(0);
      
      const newPermissions = getDefaultPermissionsForRole(newRole);
      expect(newPermissions.length).toBe(0);
    });
  });

  describe('C. MANAGER INVENTORY', () => {
    it('direct secureSaveStockItem throws forbidden for manager', async () => {
       const actor = { role: 'manager', permissions: getDefaultPermissionsForRole('manager') };
       expect(() => requirePermission(actor as any, 'inventory.manage')).toThrow(SessionAuthorizationError);
    });
  });

  describe('D. KITCHEN INVENTORY', () => {
    it('kitchen cannot direct secureSaveStockItem or delete', () => {
       const actor = { role: 'kitchen', permissions: getDefaultPermissionsForRole('kitchen') };
       expect(() => requirePermission(actor as any, 'inventory.manage')).toThrow(SessionAuthorizationError);
       expect(() => requirePermission(actor as any, 'inventory.delete')).toThrow(SessionAuthorizationError);
    });
  });

  describe('E. BATCH AUTHORIZATION', () => {
    it('kitchen can start legitimate batch but rider cannot', () => {
       expect(() => requireBatchExecutionAccess({ role: 'kitchen' } as any)).not.toThrow();
       expect(() => requireBatchExecutionAccess({ role: 'rider' } as any)).toThrow(SessionAuthorizationError);
       expect(() => requireBatchExecutionAccess({ role: 'staff' } as any)).toThrow(SessionAuthorizationError);
    });
    
    it('kitchen Outlet A cannot start batch with Outlet B stock', () => {
       const actor = { role: 'kitchen', allowedOutletIds: ['A'] };
       expect(() => requireOutletAccess(actor as any, 'A')).not.toThrow();
       expect(() => requireOutletAccess(actor as any, 'B')).toThrow(SessionAuthorizationError);
    });
  });



  describe('6. REAL CATALOG ROUTE TESTS', () => {
    it('restricts catalog direct mutation to owner/admin only', async () => {
      const { POST: postCatalog } = await import('@/app/api/operations/catalog/route');
      const { requireSessionActor } = await import('@/server/auth/requireSessionActor');

      const mockRequire = vi.mocked(requireSessionActor);
      const req = { json: async () => ({}) } as any;

      // Unauthenticated
      mockRequire.mockRejectedValueOnce(new SessionAuthorizationError('Unauthorized', 401));
      let res = await postCatalog(req);
      expect(res.status).toBe(401);

      // Manager (403)
      mockRequire.mockRejectedValueOnce(new SessionAuthorizationError('Insufficient permissions', 403));
      res = await postCatalog(req);
      expect(res.status).toBe(403);

      // Kitchen / Rider (403)
      mockRequire.mockRejectedValueOnce(new SessionAuthorizationError('Insufficient permissions', 403));
      res = await postCatalog(req);
      expect(res.status).toBe(403);

      // Unexpected DB error
      mockRequire.mockRejectedValueOnce(new Error('Internal DB Crash'));
      res = await postCatalog(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).not.toContain('Internal DB Crash');

      // Owner/Admin valid request -> success
      mockRequire.mockResolvedValueOnce({ uid: '1', role: 'admin' } as any);
      (adminDb!.collection as any).mockReturnValue({
         doc: vi.fn().mockReturnValue({
            set: vi.fn(),
            update: vi.fn()
         })
      });
      const validReq = { json: async () => ({ action: 'save', item: { item_id: '1', name: 'Test', price: 10, category: 'Test' } }) } as any;
      res = await postCatalog(validReq);
      expect(res.status).toBe(200);
    });
  });

  describe('7. REAL MORNING HUD TESTS', () => {
    it('restricts and filters morning hud by role', async () => {
      const { GET: getMorningHud } = await import('@/app/api/admin/morning-hud/route');
      const { requireSessionActorApi } = await import('@/server/auth/requireSessionActor');

      const mockApi = vi.mocked(requireSessionActorApi);

      // Unauthenticated
      mockApi.mockResolvedValueOnce(NextResponse.json({}, { status: 401 }));
      let res = await getMorningHud();
      expect(res.status).toBe(401);

      // owner
      mockApi.mockResolvedValueOnce({ role: 'owner' } as any);
      const mockQuery = { where: vi.fn().mockReturnThis(), get: vi.fn().mockResolvedValue({ docs: [] }) };
      (adminDb!.collection as any).mockReturnValue(mockQuery);
      res = await getMorningHud();
      expect(res.status).toBe(200);
      expect(mockQuery.where).not.toHaveBeenCalledWith('outlet_id', 'in', expect.anything());

      // manager Outlet A
      mockApi.mockResolvedValueOnce({ role: 'manager', allowedOutletIds: ['A'] } as any);
      mockQuery.where.mockClear();
      res = await getMorningHud();
      expect(res.status).toBe(200);
      expect(mockQuery.where).toHaveBeenCalledWith('outlet_id', 'in', ['A']);
    });
  });

  describe('8. CASH SESSION ATTACK TESTS', () => {
    it('enforces exact cash session permissions', async () => {
      const { POST: postCashSession } = await import('@/app/api/cash-sessions/route');
      const { PATCH: patchCashSession } = await import('@/app/api/cash-sessions/[id]/route');
      const { requireSessionActorApi } = await import('@/server/auth/requireSessionActor');
      const mockApi = vi.mocked(requireSessionActorApi);

      (adminDb!.collection as any).mockReturnValue({
        get: vi.fn().mockResolvedValue({ docs: [
          { id: 'A', data: () => ({ name: 'Outlet A' }) },
          { id: 'B', data: () => ({ name: 'Outlet B' }) }
        ] }),
        add: vi.fn().mockResolvedValue({ id: 'session1' }),
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ outlet_id: 'B' }) }),
          update: vi.fn()
        })
      });

      mockApi.mockResolvedValueOnce({ uid: '1', role: 'manager', permissions: [], allowedOutletIds: ['A'] } as any);
      let res = await postCashSession({ json: async () => ({ outlet: 'A', opening_cash: 100 }) } as any);
      expect(res.status).toBe(403); 

      const actor = { uid: '1', role: 'manager', permissions: ['cash_sessions.create', 'cash_sessions.close'], allowedOutletIds: ['A'] };
      mockApi.mockResolvedValue(actor as any);

      res = await postCashSession({ json: async () => ({ outlet: 'A', opening_cash: 100 }) } as any);
      expect(res.status).toBe(201);

      res = await postCashSession({ json: async () => ({ outlet: 'Outlet A', opening_cash: 100 }) } as any);
      expect(res.status).toBe(201);

      res = await postCashSession({ json: async () => ({ outlet: 'B', opening_cash: 100 }) } as any);
      expect(res.status).toBe(403); 

      res = await postCashSession({ json: async () => ({ outlet: 'Outlet B', opening_cash: 100 }) } as any);
      expect(res.status).toBe(403); 

      res = await patchCashSession({ json: async () => ({ expected_cash: 100, closing_cash: 100 }) } as any, { params: { id: 's1' } });
      expect(res.status).toBe(403);
    });
  });

  describe('9. EXPENSE ATTACK TESTS', () => {
    it('enforces expense permissions and outlet isolation', async () => {
      const { POST: postExpense } = await import('@/app/api/expenses/route');
      const { requireSessionActorApi } = await import('@/server/auth/requireSessionActor');
      const mockApi = vi.mocked(requireSessionActorApi);

      (adminDb!.collection as any).mockReturnValue({
        get: vi.fn().mockResolvedValue({ docs: [
          { id: 'A', data: () => ({ name: 'Outlet A' }) },
          { id: 'B', data: () => ({ name: 'Outlet B' }) }
        ] }),
      });
      (adminDb!.runTransaction as any).mockResolvedValue('1234567890');

      const actorNoPerms = { uid: '1', role: 'manager', permissions: [], allowedOutletIds: ['A'] };
      mockApi.mockResolvedValueOnce(actorNoPerms as any);
      let res = await postExpense({ json: async () => ({ expense_id: '1234567890', outlet: 'A', category: 'x', amount: 10, description: 'y', status: 'draft' }) } as any);
      expect(res.status).toBe(403);

      const actorWithPerms = { uid: '1', role: 'manager', permissions: ['expenses.create'], allowedOutletIds: ['A'] };
      mockApi.mockReturnValue(actorWithPerms as any);

      res = await postExpense({ json: async () => ({ expense_id: '1234567890', outlet: 'A', category: 'x', amount: 10, description: 'y', status: 'draft' }) } as any);
      expect(res.status).toBe(201);

      res = await postExpense({ json: async () => ({ expense_id: '1234567891', outlet: 'B', category: 'x', amount: 10, description: 'y', status: 'draft' }) } as any);
      expect(res.status).toBe(403);

      res = await postExpense({ json: async () => ({ expense_id: '1234567891', outlet: 'Outlet B', category: 'x', amount: 10, description: 'y', status: 'draft' }) } as any);
      expect(res.status).toBe(403);
    });
  });

  describe('10. SESSION REVOCATION ACCEPTANCE TEST', () => {
    it('clears session correctly and blocks revoked cookies', async () => {
      // Setup deterministic logout replay test
      const { adminAuth } = await import('@/lib/firebaseAdmin');
      
      const mockReq = { headers: new Headers({ cookie: '__session=OLD_SESSION;' }) } as any;
      (adminAuth!.verifySessionCookie as any).mockResolvedValueOnce({ uid: 'user1' });

      // Action: Logout
      const { DELETE: logout } = await import('@/app/api/auth/session/route');
      const res = await logout(mockReq);
      
      // Assert Revocation
      expect(adminAuth!.revokeRefreshTokens).toHaveBeenCalledWith('user1');
      
      // Assert all cookies cleared
      const cookies = res.headers.get('set-cookie');
      expect(cookies).toContain('__session=;');
      expect(cookies).toContain('__staff_pre_auth=;');
      expect(cookies).toContain('__elevation_inventory_sensitive_action=;');
      expect(cookies).toContain('__elevation_admin_action=;');

      // Assert requireSessionActor blocks revoked session correctly
      (adminAuth!.verifySessionCookie as any).mockRejectedValueOnce(new Error('auth/session-cookie-revoked'));
      vi.resetModules();
      
      const nextHeaders = await import('next/headers');
      (nextHeaders.cookies as any).mockReturnValue({ get: () => ({ value: 'OLD_SESSION' }) });
      
      const { requireSessionActor } = await import('@/server/auth/requireSessionActor');
      
      let error: any;
      try {
        await requireSessionActor(['staff']);
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('SessionAuthorizationError');
      expect(error.status).toBe(401);
    });
  });

  describe('11. ELEVATION TESTS', () => {
    const crypto = require('crypto');
    
    it('COPIED-ELEVATION ATTACK: prevents elevation copying between sessions', async () => {
      const { requireSessionActor } = await import('@/server/auth/requireSessionActor');
      const mockRequire = vi.mocked(requireSessionActor);
      mockRequire.mockResolvedValue({ uid: 'user1', role: 'manager', permissions: ['inventory.delete'], allowedOutletIds: ['A'] } as any);
      
      (adminDb!.collection as any).mockImplementation((col: string) => {
        if (col === 'inventory') {
          return {
             doc: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ outlet_id: 'A' }) }),
                delete: vi.fn()
             })
          }
        }
        if (col === 'actor_elevations') {
          return {
             doc: vi.fn().mockImplementation((id: string) => {
               if (id === 'elev_A') {
                 return {
                   get: vi.fn().mockResolvedValue({
                     exists: true,
                     data: () => ({
                       elevationId: 'elev_A',
                       userId: 'user1',
                       sessionBinding: crypto.createHash('sha256').update('SESSION_A_VALUE').digest('hex'),
                       purpose: 'inventory_sensitive_action',
                       outletId: 'A',
                       verifiedAt: Date.now(),
                       expiresAt: Date.now() + 60000
                     })
                   })
                 }
               }
               return { get: vi.fn().mockResolvedValue({ exists: false }) }
             })
          }
        }
      });

      const { cookies } = await import('next/headers');
      (cookies as any).mockReturnValue({
         get: (name: string) => {
             if (name === '__session') return { value: 'SESSION_B_VALUE' }; // Different session!
             if (name === '__elevation_inventory_sensitive_action') return { value: 'elev_A' };
             return undefined;
         }
      });

      // Await import to ensure mock is picked up
      const dbActions = await import('@/app/_actions/secureDbActions');
      await expect(dbActions.secureDeleteStockItem('stock-A', 'SESSION_BYPASS')).rejects.toThrow();
    });

    it('VALID SAME-SESSION POSITIVE TEST', async () => {
      const { requireSessionActor } = await import('@/server/auth/requireSessionActor');
      const mockRequire = vi.mocked(requireSessionActor);
      mockRequire.mockResolvedValue({ uid: 'user1', role: 'manager', permissions: ['inventory.delete'], allowedOutletIds: ['A'] } as any);
      
      const mockDelete = vi.fn();
      (adminDb!.collection as any).mockImplementation((col: string) => {
        if (col === 'inventory') {
          return {
             doc: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ outlet_id: 'A' }) }),
                delete: mockDelete
             })
          }
        }
        if (col === 'actor_elevations') {
          return {
             doc: vi.fn().mockImplementation((id: string) => {
               if (id === 'elev_A') {
                 return {
                   get: vi.fn().mockResolvedValue({
                     exists: true,
                     data: () => ({
                       elevationId: 'elev_A',
                       userId: 'user1',
                       sessionBinding: crypto.createHash('sha256').update('SESSION_A_VALUE').digest('hex'),
                       purpose: 'inventory_sensitive_action',
                       outletId: 'A',
                       verifiedAt: Date.now(),
                       expiresAt: Date.now() + 60000
                     })
                   })
                 }
               }
               return { get: vi.fn().mockResolvedValue({ exists: false }) }
             })
          }
        }
      });

      const { cookies } = await import('next/headers');
      (cookies as any).mockReturnValue({
         get: (name: string) => {
             if (name === '__session') return { value: 'SESSION_A_VALUE' };
             if (name === '__elevation_inventory_sensitive_action') return { value: 'elev_A' };
             return undefined;
         }
      });

      const dbActions = await import('@/app/_actions/secureDbActions');
      await dbActions.secureDeleteStockItem('stock-A', 'SESSION_BYPASS');
      expect(mockDelete).toHaveBeenCalledTimes(1);
    });

    it('EXPIRED ELEVATION', async () => {
      const { requireSessionActor } = await import('@/server/auth/requireSessionActor');
      const mockRequire = vi.mocked(requireSessionActor);
      mockRequire.mockResolvedValue({ uid: 'user1', role: 'manager', permissions: ['inventory.delete'], allowedOutletIds: ['A'] } as any);
      
      const mockDelete = vi.fn();
      (adminDb!.collection as any).mockImplementation((col: string) => {
        if (col === 'inventory') {
          return {
             doc: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ outlet_id: 'A' }) }),
                delete: mockDelete
             })
          }
        }
        if (col === 'actor_elevations') {
          return {
             doc: vi.fn().mockImplementation((id: string) => {
               if (id === 'elev_A') {
                 return {
                   get: vi.fn().mockResolvedValue({
                     exists: true,
                     data: () => ({
                       elevationId: 'elev_A',
                       userId: 'user1',
                       sessionBinding: crypto.createHash('sha256').update('SESSION_A_VALUE').digest('hex'),
                       purpose: 'inventory_sensitive_action',
                       outletId: 'A',
                       verifiedAt: Date.now(),
                       expiresAt: Date.now() - 1000 // Expired
                     })
                   })
                 }
               }
               return { get: vi.fn().mockResolvedValue({ exists: false }) }
             })
          }
        }
      });

      const { cookies } = await import('next/headers');
      (cookies as any).mockReturnValue({
         get: (name: string) => {
             if (name === '__session') return { value: 'SESSION_A_VALUE' };
             if (name === '__elevation_inventory_sensitive_action') return { value: 'elev_A' };
             return undefined;
         }
      });

      const dbActions = await import('@/app/_actions/secureDbActions');
      await expect(dbActions.secureDeleteStockItem('stock-A', 'SESSION_BYPASS')).rejects.toThrow();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('WRONG PURPOSE', async () => {
      const { requireSessionActor } = await import('@/server/auth/requireSessionActor');
      const mockRequire = vi.mocked(requireSessionActor);
      mockRequire.mockResolvedValue({ uid: 'user1', role: 'manager', permissions: ['inventory.delete'], allowedOutletIds: ['A'] } as any);
      
      const mockDelete = vi.fn();
      (adminDb!.collection as any).mockImplementation((col: string) => {
        if (col === 'inventory') {
          return {
             doc: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ outlet_id: 'A' }) }),
                delete: mockDelete
             })
          }
        }
        if (col === 'actor_elevations') {
          return {
             doc: vi.fn().mockImplementation((id: string) => {
               if (id === 'elev_A') {
                 return {
                   get: vi.fn().mockResolvedValue({
                     exists: true,
                     data: () => ({
                       elevationId: 'elev_A',
                       userId: 'user1',
                       sessionBinding: crypto.createHash('sha256').update('SESSION_A_VALUE').digest('hex'),
                       purpose: 'admin_action', // Wrong purpose
                       outletId: 'A',
                       verifiedAt: Date.now(),
                       expiresAt: Date.now() + 60000
                     })
                   })
                 }
               }
               return { get: vi.fn().mockResolvedValue({ exists: false }) }
             })
          }
        }
      });

      const { cookies } = await import('next/headers');
      (cookies as any).mockReturnValue({
         get: (name: string) => {
             if (name === '__session') return { value: 'SESSION_A_VALUE' };
             if (name === '__elevation_inventory_sensitive_action') return { value: 'elev_A' };
             return undefined;
         }
      });

      const dbActions = await import('@/app/_actions/secureDbActions');
      await expect(dbActions.secureDeleteStockItem('stock-A', 'SESSION_BYPASS')).rejects.toThrow();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('WRONG OUTLET', async () => {
      const { requireSessionActor } = await import('@/server/auth/requireSessionActor');
      const mockRequire = vi.mocked(requireSessionActor);
      mockRequire.mockResolvedValue({ uid: 'user1', role: 'admin', permissions: ['inventory.delete'], allowedOutletIds: ['A', 'B'] } as any);
      
      const mockDelete = vi.fn();
      (adminDb!.collection as any).mockImplementation((col: string) => {
        if (col === 'inventory') {
          return {
             doc: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ outlet_id: 'B' }) }), // Item is in outlet B
                delete: mockDelete
             })
          }
        }
        if (col === 'actor_elevations') {
          return {
             doc: vi.fn().mockImplementation((id: string) => {
               if (id === 'elev_A') {
                 return {
                   get: vi.fn().mockResolvedValue({
                     exists: true,
                     data: () => ({
                       elevationId: 'elev_A',
                       userId: 'user1',
                       sessionBinding: crypto.createHash('sha256').update('SESSION_A_VALUE').digest('hex'),
                       purpose: 'inventory_sensitive_action',
                       outletId: 'A', // Elevation is for outlet A
                       verifiedAt: Date.now(),
                       expiresAt: Date.now() + 60000
                     })
                   })
                 }
               }
               return { get: vi.fn().mockResolvedValue({ exists: false }) }
             })
          }
        }
      });

      const { cookies } = await import('next/headers');
      (cookies as any).mockReturnValue({
         get: (name: string) => {
             if (name === '__session') return { value: 'SESSION_A_VALUE' };
             if (name === '__elevation_inventory_sensitive_action') return { value: 'elev_A' };
             return undefined;
         }
      });

      const dbActions = await import('@/app/_actions/secureDbActions');
      await expect(dbActions.secureDeleteStockItem('stock-B', 'SESSION_BYPASS')).rejects.toThrow();
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe('12. CROSS-OUTLET BATCH TEST', () => {
    it('prevents cross-outlet batches in secureStartDoughBatch', async () => {
      const { secureStartDoughBatch } = await import('@/app/_actions/secureDbActions');
      const { requireSessionActor } = await import('@/server/auth/requireSessionActor');
      const mockRequire = vi.mocked(requireSessionActor);
      
      mockRequire.mockResolvedValueOnce({ uid: '1', role: 'kitchen', permissions: [], allowedOutletIds: ['A'] } as any);
      
      const mockWhere = vi.fn().mockReturnThis();
      (adminDb!.collection as any).mockReturnValue({
         where: mockWhere,
         doc: vi.fn().mockImplementation((docId) => ({
            id: docId,
            get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ outlet_id: 'A' }) }),
            delete: vi.fn()
         }))
      });
      const mockTransaction = {
         get: vi.fn().mockImplementation((queryRef) => {
            if (queryRef === undefined || queryRef.id === undefined) {
               // This is the activeQuery which has no .id
               return Promise.resolve({ empty: true });
            }
            if (queryRef.id === 'STOCK_B') {
               return Promise.resolve({ exists: true, data: () => ({ stock_id: 'STOCK_B', outlet_id: 'B', current_quantity: 100 }) });
            }
            return Promise.resolve({ empty: true });
         }),
         update: vi.fn(),
         set: vi.fn()
      };
      
      (adminDb!.runTransaction as any).mockImplementation((cb: any) => cb(mockTransaction));

      await expect(secureStartDoughBatch('STOCK_B', 10, 'A')).rejects.toThrow('Forbidden: Stock item belongs to a different outlet');
      expect(mockTransaction.update).not.toHaveBeenCalled();
      expect(mockTransaction.set).not.toHaveBeenCalled();
    });
  });
});
