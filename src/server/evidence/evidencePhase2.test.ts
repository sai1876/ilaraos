import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST as finalizeNormal } from '@/app/api/evidence/[id]/finalize/route';
import { POST as finalizeDrive } from '@/app/api/evidence/[id]/finalize-direct-archive/route';
import { adminDb } from '@/lib/firebaseAdmin';

vi.mock('@/server/auth/requireSessionActor', () => ({
  requireSessionActor: vi.fn().mockResolvedValue({
    uid: 'manager1',
    role: 'manager',
    outletId: 'main'
  })
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    get: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock('@/server/supabase/storageAdmin', () => ({
  streamAndHashObject: vi.fn().mockResolvedValue({
    sha256: 'deadbeef',
    sizeBytes: 1024,
    mimeType: 'image/jpeg'
  })
}));

vi.mock('@/server/google/driveAdmin', () => ({
  verifyDriveObject: vi.fn().mockResolvedValue({
    id: 'drive_123',
    name: 'EV-20260810-000184_REFUND.jpg',
    trashed: false,
    sha256Checksum: 'deadbeef',
    size: '1024',
    mimeType: 'image/jpeg',
    parents: ['folder_123']
  })
}));

vi.mock('@/server/events/logBusinessEvent', () => ({
  logBusinessEvent: vi.fn()
}));

const makeRequest = () => new Request('http://localhost');

describe('Phase 2: Finalize Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finalizes NORMAL evidence correctly', async () => {
    const mockDoc = {
      exists: true,
      data: () => ({
        storage_state: 'UPLOADING',
        storage_policy: 'ACTIVE_THEN_ARCHIVE',
        supabase_path: 'evidence/2026/08/10/id/file.jpg',
        evidence_type: 'IMAGE'
      })
    };
    (adminDb.doc as any)().get.mockResolvedValue(mockDoc);
    
    const res = await finalizeNormal(makeRequest(), { params: { id: 'test_id' } });
    expect(res.status).toBe(200);
    
    const updateCall = (adminDb.doc as any)().update.mock.calls[0][0];
    expect(updateCall.storage_state).toBe('ACTIVE');
    expect(updateCall.sha256).toBe('deadbeef');
    expect(updateCall.integrity_status).toBe('SHA256_VERIFIED');
    expect(updateCall.activated_at).toBeDefined();
    expect(updateCall.archive_due_at).toBeDefined();
  });

  it('rejects finalize for DIRECT_ARCHIVE on NORMAL endpoint', async () => {
    const mockDoc = {
      exists: true,
      data: () => ({
        storage_state: 'UPLOADING',
        storage_policy: 'DIRECT_ARCHIVE',
        expected_drive_file_id: 'drive_123'
      })
    };
    (adminDb.doc as any)().get.mockResolvedValue(mockDoc);
    
    const res = await finalizeNormal(makeRequest(), { params: { id: 'test_id' } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('is not ACTIVE_THEN_ARCHIVE');
  });

  it('finalizes DIRECT_ARCHIVE evidence correctly', async () => {
    const mockDoc = {
      exists: true,
      data: () => ({
        storage_state: 'UPLOADING',
        storage_policy: 'DIRECT_ARCHIVE',
        expected_drive_file_id: 'drive_123',
        archive_file_name: 'EV-20260810-000184_REFUND.jpg'
      })
    };
    (adminDb.doc as any)().get.mockResolvedValue(mockDoc);

    const res = await finalizeDrive(makeRequest(), { params: { id: 'test_id' } });
    expect(res.status).toBe(200);

    const updateCall = (adminDb.doc as any)().update.mock.calls[0][0];
    expect(updateCall.storage_state).toBe('ARCHIVED');
    expect(updateCall.drive_file_id).toBe('drive_123');
    expect(updateCall.sha256).toBe('deadbeef');
    expect(updateCall.provider_checksum_algorithm).toBe('SHA256');
    expect(updateCall.integrity_status).toBe('SHA256_VERIFIED');
    expect(updateCall.archived_at).toBeDefined();
    expect(updateCall.archive_verified).toBe(true);
  });
});
