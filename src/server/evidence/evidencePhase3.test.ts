import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET as archiveWorker } from '@/app/api/internal/evidence/archive-worker/route';

vi.mock('@/lib/firebaseAdmin', () => {
  return {
    adminDb: {
      collection: vi.fn().mockReturnThis(),
      doc: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [] }),
      update: vi.fn(),
      runTransaction: vi.fn()
    }
  };
});

vi.mock('@/server/google/driveAdmin', () => ({
  getPreGeneratedFileId: vi.fn().mockResolvedValue('pre_123'),
  getOrCreateCategoryFolder: vi.fn().mockResolvedValue('folder_123'),
  streamToDrive: vi.fn(),
  verifyDriveObject: vi.fn().mockResolvedValue({
    id: 'pre_123',
    name: 'test.jpg',
    size: '1024',
    mimeType: 'image/jpeg',
    parents: ['folder_123'],
    trashed: false,
    sha256Checksum: 'deadbeef'
  })
}));

vi.mock('@/server/supabase/storageAdmin', () => ({
  getStreamForTransfer: vi.fn().mockResolvedValue({
    res: {
      ok: true,
      body: {
        getReader: vi.fn().mockReturnValue({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: Buffer.from('data') })
            .mockResolvedValueOnce({ done: true })
        })
      }
    },
    controller: { abort: vi.fn() }
  }),
  deleteObject: vi.fn()
}));

vi.mock('@/server/events/logBusinessEvent', () => ({
  logBusinessEvent: vi.fn()
}));

describe('Phase 3: Archive Worker', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret' };
  });

  it('rejects missing Authorization header', async () => {
    const req = new Request('http://localhost', { method: 'GET' });
    const res = await archiveWorker(req);
    expect(res.status).toBe(401);
  });

  it('rejects invalid Authorization header', async () => {
    const req = new Request('http://localhost', { 
      method: 'GET',
      headers: { 'Authorization': 'Bearer wrong-secret' }
    });
    const res = await archiveWorker(req);
    expect(res.status).toBe(401);
  });

  it('fails safely if CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const req = new Request('http://localhost', { 
      method: 'GET',
      headers: { 'Authorization': 'Bearer any' }
    });
    const res = await archiveWorker(req);
    expect(res.status).toBe(500);
  });

  it('accepts correct Authorization header and processes no items if empty', async () => {
    const req = new Request('http://localhost', { 
      method: 'GET',
      headers: { 'Authorization': 'Bearer test-secret' }
    });
    const res = await archiveWorker(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.claimed).toBe(0);
  });
});
