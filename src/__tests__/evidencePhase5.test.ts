import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminDb } from '@/lib/firebaseAdmin';
import { requestEvidenceArchive, markImportantAndRequestArchive } from '@/server/evidence/archiveService';
import { processArchiveJob } from '@/server/archive/chatArchiveService';

vi.mock('server-only', () => ({}));
vi.mock('@/server/supabase/storageAdmin', () => ({}));

// Mock dependencies
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({})) })),
    runTransaction: vi.fn(),
    batch: vi.fn(),
    FieldValue: {
      serverTimestamp: vi.fn(() => ({ toMillis: () => Date.now() })),
      increment: vi.fn((n) => n),
      delete: vi.fn()
    }
  }
}));

describe('Phase 5 Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_URL', 'mock-url');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'mock-key');
  });

  describe('Part A: Manual Evidence Archive', () => {
    it('requestEvidenceArchive prevents lease theft', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          storage_policy: 'ACTIVE_THEN_ARCHIVE',
          storage_state: 'ACTIVE',
          archive_due_at: { toMillis: () => Date.now() + 100000 },
          archive_lease_owner: 'worker1',
          archive_lease_expires_at: { toMillis: () => Date.now() + 100000 }
        })
      });

      const mockTransaction = {
        get: mockGet,
        update: vi.fn()
      };

      (adminDb!.runTransaction as any).mockImplementation(async (cb: any) => cb(mockTransaction));

      const res = await requestEvidenceArchive({
        evidenceId: 'EV-123',
        trigger: 'MANUAL',
        actorId: 'usr1',
        allowBeforeDue: true
      });

      expect(res).toBe('LOCKED');
      expect(mockTransaction.update).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
        archive_trigger: 'MANUAL',
        archive_requested_by: 'usr1'
      }));
    });

    it('markImportantAndRequestArchive preserves ACTIVE_THEN_ARCHIVE', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          storage_policy: 'ACTIVE_THEN_ARCHIVE',
          storage_state: 'ACTIVE',
        })
      });

      const mockTransaction = {
        get: mockGet,
        update: vi.fn()
      };

      (adminDb!.runTransaction as any).mockImplementation(async (cb: any) => cb(mockTransaction));

      const res = await markImportantAndRequestArchive({
        evidenceId: 'EV-123',
        actorId: 'usr1',
        reason: 'test'
      });

      expect(res).toBe('QUEUED');
      expect(mockTransaction.update).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
        importance: 'IMPORTANT',
        archive_trigger: 'MARKED_IMPORTANT',
        storage_state: 'ARCHIVING'
      }));
    });
  });

  describe('Part B: Chat Archive', () => {
    it('processArchiveJob gracefully fails on bad scan', async () => {
      const jobRefMock = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            status: 'SCANNING'
          })
        }),
        update: vi.fn()
      };

      (adminDb!.collection as any).mockReturnValue({
        doc: vi.fn().mockReturnValue(jobRefMock)
      });

      await processArchiveJob('ARC-123', 'worker1');
      // Should handle empty implementation safely or move to next phase
      // Based on our implementation, SCANNING executes runExportPhase
      expect(jobRefMock.update).toHaveBeenCalled();
    });
  });
});
