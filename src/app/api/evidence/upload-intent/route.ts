import { NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { createEvidenceRecord } from '@/server/evidence/evidenceService';
import { createUploadIntent } from '@/server/supabase/storageAdmin';
import { MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

const LIMITS = {
  IMAGE: 10 * 1024 * 1024,
  PDF: 20 * 1024 * 1024,
  DOCUMENT: 20 * 1024 * 1024,
  AUDIO: 20 * 1024 * 1024,
  VOICE_NOTE: 20 * 1024 * 1024,
  VIDEO: 0, // Disabled for NORMAL uploads
  OTHER: 5 * 1024 * 1024, // Fallback
  SCREENSHOT: 10 * 1024 * 1024,
  INVOICE: 20 * 1024 * 1024
};

const BUCKET = 'evidence_bucket'; // Adjust if a specific bucket name is desired

export async function POST(request: Request) {
  try {
    // 1. Authenticate Actor
    const actor = await requireSessionActor(['owner', 'admin', 'manager', 'staff']);
    const isManagement = MANAGEMENT_ROLES.has(actor.role);

    const body = await request.json();
    const {
      category,
      evidence_type,
      original_file_name,
      mime_type,
      declared_size_bytes: size_bytes,
      related_entities = [],
      request_importance,
      direct_archive_reason
    } = body;

    // 2. Validate Size against Normal Limits
    const limitBytes = (LIMITS as any)[evidence_type] ?? LIMITS.OTHER;
    
    if (size_bytes > limitBytes) {
      if (request_importance !== 'IMPORTANT') {
        // Log rejection
        await logBusinessEvent({
          event_type: 'evidence_upload_rejected_size',
          actor_type: isManagement ? 'manager' : 'staff',
          actor_id: actor.uid,
          target_type: 'evidence',
          target_id: 'rejected',
          outlet_id: actor.outletId || 'main',
          severity: 'warning',
          source: 'api',
          metadata: { size_bytes, limitBytes, evidence_type }
        });

        return NextResponse.json({
          code: 'FILE_TOO_LARGE_FOR_ACTIVE_STORAGE',
          message: 'This file exceeds the active-storage limit.',
          fileSizeBytes: size_bytes,
          normalLimitBytes: limitBytes,
          importantUploadAllowed: isManagement
        }, { status: 400 });
      }
    }

    // 3. Determine Final Policy & Importance
    let importance: 'NORMAL' | 'IMPORTANT' = 'NORMAL';
    let storage_policy: 'ACTIVE_THEN_ARCHIVE' | 'DIRECT_ARCHIVE' = 'ACTIVE_THEN_ARCHIVE';

    if (request_importance === 'IMPORTANT') {
      if (!isManagement) {
        return NextResponse.json({ error: 'Unauthorized to mark evidence as Important.' }, { status: 403 });
      }
      if (!direct_archive_reason) {
        return NextResponse.json({ error: 'direct_archive_reason is required for IMPORTANT evidence.' }, { status: 400 });
      }
      importance = 'IMPORTANT';
      storage_policy = 'DIRECT_ARCHIVE';
    }

    // 4. Phase 1 Hard-Block for DIRECT_ARCHIVE
    if (storage_policy === 'DIRECT_ARCHIVE') {
      return NextResponse.json({
        code: 'FEATURE_NOT_AVAILABLE_IN_PHASE_1',
        message: 'Direct Google Drive archive is not available in Phase 1.'
      }, { status: 501 });
    }

    // 5. Create Canonical Metadata
    const record = await createEvidenceRecord({
      category,
      evidence_type,
      importance,
      storage_policy,
      original_file_name,
      mime_type,
      declared_size_bytes: size_bytes,
      related_entities,
      created_by_type: 'USER',
      created_by_id: actor.uid,
      outlet_id: actor.outletId || 'main',
      source: isManagement ? (actor.role === 'owner' ? 'OWNER_UPLOAD' : 'MANAGER_UPLOAD') : 'STAFF_UPLOAD',
      importance_selected_by: importance === 'IMPORTANT' ? actor.uid : undefined,
      direct_archive_reason
    });

    // 6. Generate Supabase Upload Intent (only for ACTIVE_THEN_ARCHIVE)
    let uploadUrl = undefined;
    if (record.storage_policy === 'ACTIVE_THEN_ARCHIVE' && record.supabase_path) {
      try {
        const intent = await createUploadIntent(BUCKET, record.supabase_path);
        uploadUrl = intent.signedUrl;
      } catch (err: any) {
        // We log error but don't delete record. It will remain UPLOADING and eventually stall.
        await logBusinessEvent({
          event_type: 'evidence_upload_failed',
          actor_type: isManagement ? 'manager' : 'staff',
          actor_id: actor.uid,
          target_type: 'evidence',
          target_id: record.id,
          outlet_id: actor.outletId || 'main',
          severity: 'warning',
          source: 'api',
          metadata: { error: err.message }
        });
        return NextResponse.json({ error: 'Failed to create upload intent.' }, { status: 500 });
      }
    }

    return NextResponse.json({
      evidence_id: record.id,
      evidence_no: record.evidence_no,
      storage_policy: record.storage_policy,
      upload_url: uploadUrl,
      supabase_path: record.supabase_path
    });

  } catch (error: any) {
    console.error('[EVIDENCE] Upload intent failed:', error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
