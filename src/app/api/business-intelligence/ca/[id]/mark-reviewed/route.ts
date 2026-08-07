// [INTERNAL] Protected via requireBIAccess
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireBIAccess } from '@/server/auth/requireBIAccess';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const authResult = await requireBIAccess(req);
  if (authResult instanceof NextResponse) return authResult;

  if (!adminDb) {
    return NextResponse.json({ detail: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { id } = params;
    const docRef = adminDb.collection('ca_reviews').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ detail: 'CA review record not found' }, { status: 404 });
    }

    await docRef.update({
      status: 'reviewed',
      reviewed_by: authResult.uid,
      reviewed_at: new Date().toISOString()
    });

    await logBusinessEvent({
      event_type: 'ca_review_completed',
      actor_type: authResult.role as any,
      actor_id: authResult.uid,
      target_type: 'ca_review',
      target_id: id,
      outlet_id: 'main',
      severity: 'info',
      source: 'api'
    });

    return NextResponse.json({ ok: true, id, status: 'reviewed' });
  } catch (error) {
    console.error('Error completing CA review:', error);
    return NextResponse.json({ detail: 'Failed to complete CA review' }, { status: 500 });
  }
}
