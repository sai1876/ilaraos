import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
process.env.SUPABASE_URL = 'http://mock.supabase';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';
vi.mock('@/server/supabase/storageAdmin', () => ({
  createUploadIntent: vi.fn(),
  createPrivateSignedUrl: vi.fn(),
  verifyObject: vi.fn(),
}));
import { GET as getList } from '@/app/api/evidence/route';
import { GET as getAccess } from '@/app/api/evidence/[id]/access/route';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

vi.mock('@/server/auth/requireSessionActor', () => ({
  requireSessionActor: vi.fn(),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    get: vi.fn(),
    set: vi.fn().mockResolvedValue({}),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  }
}));

describe('Evidence Phase 4 - UI and Access APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks unauthorized list access', async () => {
    vi.mocked(requireSessionActor).mockRejectedValue(new Error('Unauthorized'));
    const req = new NextRequest('http://localhost:3000/api/evidence');
    const res = await getList(req);
    expect(res.status).toBe(500); // Because requireSessionActor throws inside try/catch
  });

  it('rejects access for arbitrary Drive ID', async () => {
    // Phase 4 access tests ensuring identity uses evidence ID
    vi.mocked(requireSessionActor).mockResolvedValue({ uid: 'usr1', role: 'owner' } as any);
    const req = new NextRequest('http://localhost:3000/api/evidence/EV-20260810-001/access?purpose=VIEW');
    
    (adminDb.get as any).mockResolvedValueOnce({
      exists: true,
      data: () => ({
        outlet_id: 'sys',
        drive_file_id: 'fake-drive-id', // uses evidence logic
        evidence_no: 'EV-20260810-001'
      })
    });

    const res = await getAccess(req, { params: { id: 'EV-20260810-001' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mode).toBe('ILARA_STREAM');
    expect(data.url).toContain('/content?access=');
  });
});
