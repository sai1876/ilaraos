// [INTERNAL]
import { NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { createEvidenceRecord } from '@/server/evidence/evidenceService';
import { getOrCreateCategoryFolder, getPreGeneratedFileId, createResumableUploadSession } from '@/server/google/driveAdmin';
import { MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

export async function POST(request: Request) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager']);
    const isManagement = MANAGEMENT_ROLES.has(actor.role);

    if (!isManagement) {
      return NextResponse.json({ error: 'Unauthorized to mark evidence as Important.' }, { status: 403 });
    }

    const body = await request.json();
    const {
      category,
      evidence_type,
      original_file_name,
      mime_type,
      declared_size_bytes,
      related_entities = [],
      importance,
      reason
    } = body;

    if (importance !== 'IMPORTANT' && importance !== 'CRITICAL') {
      return NextResponse.json({ error: 'This endpoint is strictly for IMPORTANT or CRITICAL evidence.' }, { status: 400 });
    }

    if (!reason) {
      return NextResponse.json({ error: 'reason is required for IMPORTANT evidence.' }, { status: 400 });
    }

    // 1. Get Drive Expected ID & Folder
    const expectedDriveFileId = await getPreGeneratedFileId();
    const folderId = await getOrCreateCategoryFolder(new Date(), category);

    // 2. Create Canonical Metadata
    const record = await createEvidenceRecord({
      category,
      evidence_type,
      importance,
      storage_policy: 'DIRECT_ARCHIVE',
      original_file_name,
      mime_type,
      declared_size_bytes,
      expected_drive_file_id: expectedDriveFileId,
      related_entities,
      created_by_type: 'USER',
      created_by_id: actor.uid,
      outlet_id: actor.outletId || 'main',
      source: actor.role === 'owner' ? 'OWNER_UPLOAD' : 'MANAGER_UPLOAD',
      importance_selected_by: actor.uid,
      direct_archive_reason: reason
    });

    // 3. Create Resumable Session URI using the bound ID
    const sessionUri = await createResumableUploadSession(
      folderId,
      record.archive_file_name,
      mime_type || 'application/octet-stream',
      expectedDriveFileId,
      declared_size_bytes
    );

    await logBusinessEvent({
      event_type: 'evidence_direct_archive_intent_created',
      actor_type: 'manager',
      actor_id: actor.uid,
      target_type: 'evidence',
      target_id: record.id,
      outlet_id: actor.outletId || 'main',
      severity: 'info',
      source: 'api',
      metadata: { evidence_no: record.evidence_no }
    });

    return NextResponse.json({
      evidence_id: record.id,
      evidence_no: record.evidence_no,
      storage_policy: record.storage_policy,
      upload_url: sessionUri // Return the Drive URI to the client securely
    });

  } catch (error: any) {
    console.error('[EVIDENCE] Direct archive intent failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: error.status || 500 });
  }
}
