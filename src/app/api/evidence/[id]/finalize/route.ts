import { NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { adminDb } from '@/lib/firebaseAdmin';
import { EVIDENCE_COL } from '@/server/evidence/evidenceService';
import { EvidenceRecord } from '@/server/evidence/types';
import { streamAndHashObject } from '@/server/supabase/storageAdmin';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const BUCKET = 'evidence_bucket';
const LIMITS = {
  IMAGE: 10 * 1024 * 1024,
  PDF: 20 * 1024 * 1024,
  DOCUMENT: 20 * 1024 * 1024,
  AUDIO: 20 * 1024 * 1024,
  VOICE_NOTE: 20 * 1024 * 1024,
  OTHER: 5 * 1024 * 1024,
  SCREENSHOT: 10 * 1024 * 1024,
  INVOICE: 20 * 1024 * 1024
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager', 'staff']);
    const evidenceId = params.id;

    const docRef = adminDb!.collection(EVIDENCE_COL).doc(evidenceId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Evidence not found' }, { status: 404 });
    }

    const record = docSnap.data() as EvidenceRecord;

    // Idempotency check
    if (record.storage_state === 'ACTIVE') {
      return NextResponse.json({
        message: 'Already finalized',
        storage_state: record.storage_state
      });
    }

    if (record.storage_policy !== 'ACTIVE_THEN_ARCHIVE') {
      return NextResponse.json({ error: 'Evidence is not ACTIVE_THEN_ARCHIVE policy' }, { status: 400 });
    }
    
    if (record.storage_state !== 'UPLOADING') {
      return NextResponse.json({ error: 'Invalid state for finalize' }, { status: 400 });
    }

    if (!record.supabase_path) {
      return NextResponse.json({ error: 'No supabase path assigned' }, { status: 400 });
    }

    const limitBytes = (LIMITS as any)[record.evidence_type] ?? LIMITS.OTHER;

    // Stream and hash (this acts as verification of existence and size bounds)
    let streamResult;
    try {
      streamResult = await streamAndHashObject(BUCKET, record.supabase_path, limitBytes);
    } catch (err: any) {
      // Rejection or size limit exceeded during stream
      if (err.message.includes('FILE_TOO_LARGE_DURING_STREAM')) {
        await logBusinessEvent({
          event_type: 'evidence_upload_rejected_size',
          actor_type: actor.role === 'customer' ? 'customer' : 'staff', // simplistic mapping
          actor_id: actor.uid,
          target_type: 'evidence',
          target_id: evidenceId,
          outlet_id: actor.outletId || 'main',
          severity: 'warning',
          source: 'api',
          metadata: { limitBytes, reason: 'exceeded_during_stream' }
        });
        return NextResponse.json({ error: 'Uploaded file actually exceeds max allowed bytes.' }, { status: 400 });
      }
      throw err;
    }

    const now = new Date();
    const plus72h = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    const updatePayload: Partial<EvidenceRecord> = {
      storage_state: 'ACTIVE',
      sha256: streamResult.sha256,
      integrity_status: 'SHA256_VERIFIED',
      size_bytes: streamResult.sizeBytes,
      mime_type: streamResult.mimeType,
      activated_at: FieldValue.serverTimestamp() as any,
      archive_due_at: Timestamp.fromDate(plus72h) as any,
      updated_at: FieldValue.serverTimestamp() as any
    };

    await docRef.update(updatePayload);

    await logBusinessEvent({
      event_type: 'evidence_upload_completed',
      actor_type: actor.role === 'customer' ? 'customer' : 'staff',
      actor_id: actor.uid,
      target_type: 'evidence',
      target_id: evidenceId,
      outlet_id: actor.outletId || 'main',
      severity: 'info',
      source: 'api',
      metadata: { sha256: streamResult.sha256, sizeBytes: streamResult.sizeBytes }
    });

    return NextResponse.json({
      message: 'Finalized successfully',
      storage_state: 'ACTIVE'
    });

  } catch (error: any) {
    console.error('[EVIDENCE] Finalize normal failed:', error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
