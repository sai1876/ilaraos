// [INTERNAL]
import { NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { ulid } from 'ulid';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager']);
    if (actor.role !== 'owner' && actor.role !== 'admin' && actor.role !== 'manager') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { range_from_utc_ms, range_to_utc_ms, source_timezone } = body;

    const archiveId = `ARC-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${ulid().slice(-6)}`;

    await adminDb!.collection('archive_jobs').doc(archiveId).set({
      archive_id: archiveId,
      archive_no: archiveId,
      type: 'CHAT_RANGE',
      status: 'DRAFT',
      outlet_id: 'main',
      range_from_utc_ms,
      range_to_utc_ms,
      source_timezone,
      conversations_exported: 0,
      messages_exported: 0,
      files_created: 0,
      bytes_exported: 0,
      messages_purged: 0,
      created_by: actor.uid,
      created_at: FieldValue.serverTimestamp(),
      attempt_count: 0
    });

    return NextResponse.json({ archive_id: archiveId, status: 'DRAFT' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
