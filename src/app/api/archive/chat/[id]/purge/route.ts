// [INTERNAL]
import { NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const actor = await requireSessionActor(['owner', 'admin']);
    if (actor.role !== 'owner' && actor.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Only Owner or Admin can purge.' }, { status: 403 });
    }

    const jobRef = adminDb!.collection('archive_jobs').doc(context.params.id);
    const doc = await jobRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = doc.data()!;
    if (data.status !== 'READY_TO_PURGE' && data.status !== 'FAILED_PURGE') {
      return NextResponse.json({ error: 'Job is not ready for purge.' }, { status: 400 });
    }

    await jobRef.update({
      status: 'PURGING',
      purge_confirmed_by: actor.uid,
      purge_confirmed_at: FieldValue.serverTimestamp()
    });

    return NextResponse.json({ status: 'PURGING' }, { status: 202 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
