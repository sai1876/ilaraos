// [INTERNAL]
import { NextRequest, NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { adminDb } from '@/lib/firebaseAdmin';
import { EvidenceRecord } from '@/server/evidence/types';
import { EVIDENCE_COL } from '@/server/evidence/evidenceService';
import { createPrivateSignedUrl } from '@/server/supabase/storageAdmin';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import * as crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager', 'staff']);
    const evidenceId = params.id;
    const { searchParams } = new URL(request.url);
    const purpose = (searchParams.get('purpose') || 'VIEW').toUpperCase() as 'VIEW' | 'DOWNLOAD';

    const doc = await adminDb!.collection(EVIDENCE_COL).doc(evidenceId).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Evidence not found' }, { status: 404 });
    }

    const record = doc.data() as EvidenceRecord;

    // Optional: add strict outlet boundaries based on user's outletId (if they are not owner/admin).
    if (actor.role !== 'owner' && actor.role !== 'admin' && record.outlet_id !== actor.outletId) {
      return NextResponse.json({ error: 'Unauthorized outlet' }, { status: 403 });
    }

    // Log the logical access ONCE
    await logBusinessEvent({
      event_type: purpose === 'DOWNLOAD' ? 'evidence_downloaded' : 'evidence_viewed',
      actor_type: actor.role as any,
      actor_id: actor.uid,
      target_type: 'evidence',
      target_id: evidenceId,
      outlet_id: record.outlet_id,
      severity: 'info',
      source: 'api',
      metadata: { evidence_no: record.evidence_no, purpose }
    });

    const fileName = record.archive_file_name || record.original_file_name;

    // Route 1: ACTIVE (Supabase)
    // If it's in ACTIVE or VERIFYING state, we assume Supabase is the primary source.
    if ((record.storage_state === 'ACTIVE' || record.storage_state === 'VERIFYING' || record.storage_state === 'ARCHIVING') && record.supabase_path && record.supabase_bucket) {
      const expiresInSeconds = 5 * 60; // 5 minutes
      const signedUrl = await createPrivateSignedUrl(record.supabase_bucket, record.supabase_path, expiresInSeconds);
      
      return NextResponse.json({
        mode: 'DIRECT_SIGNED_URL',
        url: signedUrl,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
        fileName,
        mimeType: record.mime_type
      });
    }

    // Route 2: ARCHIVED (Drive)
    // If it's ARCHIVED, or if it's a DIRECT_ARCHIVE that failed somewhere but has a drive file, 
    // we use the Ilara stream approach.
    if (record.drive_file_id) {
      // Mint a short-lived access token.
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour for streaming
      
      await adminDb!.collection('evidence_access_sessions').doc(token).set({
        token,
        evidence_id: evidenceId,
        actor_id: actor.uid,
        purpose,
        expires_at: expiresAt
      });

      return NextResponse.json({
        mode: 'ILARA_STREAM',
        url: `/api/evidence/${evidenceId}/content?access=${token}`,
        fileName,
        mimeType: record.mime_type,
        sizeBytes: record.declared_size_bytes
      });
    }

    // If neither is available, it might be an upload failure.
    return NextResponse.json({ error: 'Evidence binary is not currently available for access.' }, { status: 404 });
  } catch (error: any) {
    console.error('Evidence access error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
