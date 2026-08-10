import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createEvidenceRecord, CreateEvidenceParams } from './evidenceService';
import { adminDb } from '@/lib/firebaseAdmin';

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    runTransaction: vi.fn(),
  },
}));

vi.mock('../events/logBusinessEvent', () => ({
  logBusinessEvent: vi.fn(),
}));

describe('Evidence Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (adminDb!.runTransaction as any).mockImplementation(async (cb: any) => {
      const mockT = {
        get: vi.fn().mockResolvedValue({ exists: false, data: () => ({ seq: 0 }) }),
        set: vi.fn(),
      };
      return cb(mockT);
    });
  });

  const baseParams: CreateEvidenceParams = {
    category: 'REFUND',
    evidence_type: 'IMAGE',
    importance: 'NORMAL',
    storage_policy: 'ACTIVE_THEN_ARCHIVE',
    original_file_name: 'test.jpg',
    declared_size_bytes: 1024,
    related_entities: [{ type: 'ORDER', id: 'ORD-123' }],
    created_by_type: 'USER',
    created_by_id: 'manager1',
    outlet_id: 'main',
    source: 'MANAGER_UPLOAD',
  };

  it('creates an evidence record with atomic sequence', async () => {
    const record = await createEvidenceRecord(baseParams);
    expect(record.id).toBeDefined();
    expect(record.evidence_no).toMatch(/^EV-\d{8}-000001$/);
    expect(record.archive_file_name).toMatch(/^EV-\d{8}-000001_REFUND_ORDER-ORD-123\.jpg$/);
    expect(record.storage_state).toBe('UPLOADING');
    expect(record.activated_at).toBeUndefined(); // Absent while uploading
    expect(record.archive_due_at).toBeUndefined(); // Absent while uploading
  });

  it('sanitizes filename and prevents PII', async () => {
    const piiParams = {
      ...baseParams,
      original_file_name: 'photo_9876543210_test@gmail.com.png'
    };
    const record = await createEvidenceRecord(piiParams);
    expect(record.original_file_name).not.toContain('9876543210');
    expect(record.original_file_name).not.toContain('test@gmail.com');
    expect(record.original_file_name).toContain('REDACTED');
  });

  it('generates proper storage path for ACTIVE_THEN_ARCHIVE', async () => {
    const record = await createEvidenceRecord(baseParams);
    expect(record.supabase_path).toMatch(/^evidence\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9-]+\/EV-.+\.jpg$/);
  });

  it('nullifies supabase_path for DIRECT_ARCHIVE', async () => {
    const record = await createEvidenceRecord({
      ...baseParams,
      importance: 'IMPORTANT',
      storage_policy: 'DIRECT_ARCHIVE',
      direct_archive_reason: 'High value refund',
      importance_selected_by: 'owner1'
    });
    expect(record.supabase_path).toBeNull();
    expect(record.importance).toBe('IMPORTANT');
    expect(record.direct_archive_reason).toBe('High value refund');
  });
});
