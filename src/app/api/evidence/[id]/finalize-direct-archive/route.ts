import { NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { adminDb } from '@/lib/firebaseAdmin';
import { EVIDENCE_COL } from '@/server/evidence/evidenceService';
import { EvidenceRecord, IntegrityStatus } from '@/server/evidence/types';
import { verifyDriveObject } from '@/server/google/driveAdmin';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { FieldValue } from 'firebase-admin/firestore';
import { MANAGEMENT_ROLES } from '@/lib/auth/roles';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager']);
    if (!MANAGEMENT_ROLES.has(actor.role)) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const evidenceId = params.id;
    const docRef = adminDb!.collection(EVIDENCE_COL).doc(evidenceId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Evidence not found' }, { status: 404 });
    }

    const record = docSnap.data() as EvidenceRecord;

    // Idempotency check
    if (record.storage_state === 'ARCHIVED') {
      return NextResponse.json({
        message: 'Already finalized',
        storage_state: record.storage_state
      });
    }

    if (record.storage_policy !== 'DIRECT_ARCHIVE') {
      return NextResponse.json({ error: 'Evidence is not DIRECT_ARCHIVE policy' }, { status: 400 });
    }
    
    if (record.storage_state !== 'UPLOADING') {
      return NextResponse.json({ error: 'Invalid state for finalize' }, { status: 400 });
    }

    if (!record.expected_drive_file_id) {
      return NextResponse.json({ error: 'No expected_drive_file_id on record' }, { status: 400 });
    }

    // Call Google Drive API independently to verify the file
    let driveMeta;
    try {
      driveMeta = await verifyDriveObject(record.expected_drive_file_id);
    } catch (e: any) {
      await logBusinessEvent({
        event_type: 'evidence_direct_archive_failed',
        actor_type: 'manager',
        actor_id: actor.uid,
        target_type: 'evidence',
        target_id: evidenceId,
        outlet_id: actor.outletId || 'main',
        severity: 'critical',
        source: 'api',
        metadata: { reason: 'Verify API failed', error: e.message }
      });
      return NextResponse.json({ error: 'Failed to verify file on Google Drive' }, { status: 400 });
    }

    if (driveMeta.trashed) {
      return NextResponse.json({ error: 'File is trashed in Drive' }, { status: 400 });
    }
    if (driveMeta.name !== record.archive_file_name) {
      return NextResponse.json({ error: 'Drive filename mismatch' }, { status: 400 });
    }

    // Determine Integrity State safely
    let sha256 = undefined;
    let provider_checksum = undefined;
    let provider_checksum_algorithm: 'SHA256' | 'MD5' | undefined = undefined;
    let integrity_status: IntegrityStatus = 'METADATA_VERIFIED';

    if (driveMeta.sha256Checksum) {
      sha256 = driveMeta.sha256Checksum;
      provider_checksum = sha256;
      provider_checksum_algorithm = 'SHA256';
      integrity_status = 'SHA256_VERIFIED';
    } else if (driveMeta.md5Checksum) {
      provider_checksum = driveMeta.md5Checksum;
      provider_checksum_algorithm = 'MD5';
      integrity_status = 'PROVIDER_CHECKSUM_VERIFIED';
    }

    const driveFolderId = driveMeta.parents && driveMeta.parents.length > 0 ? driveMeta.parents[0] : null;

    const updatePayload: Partial<EvidenceRecord> = {
      storage_state: 'ARCHIVED',
      drive_file_id: record.expected_drive_file_id,
      drive_folder_id: driveFolderId,
      size_bytes: parseInt(driveMeta.size || '0', 10),
      mime_type: driveMeta.mimeType ?? undefined,
      sha256,
      provider_checksum,
      provider_checksum_algorithm,
      integrity_status,
      archived_at: FieldValue.serverTimestamp() as any,
      archive_verified: true, // we verified it against the Drive API
      updated_at: FieldValue.serverTimestamp() as any
    };

    await docRef.update(updatePayload);

    await logBusinessEvent({
      event_type: 'evidence_direct_archive_completed',
      actor_type: 'manager',
      actor_id: actor.uid,
      target_type: 'evidence',
      target_id: evidenceId,
      outlet_id: actor.outletId || 'main',
      severity: 'info',
      source: 'api',
      metadata: { expected_drive_file_id: record.expected_drive_file_id }
    });

    return NextResponse.json({
      message: 'Finalized successfully',
      storage_state: 'ARCHIVED'
    });

  } catch (error: any) {
    console.error('[EVIDENCE] Finalize direct archive failed:', error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
