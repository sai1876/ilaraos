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
    const docRef = adminDb.collection('ai_insights').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ detail: 'AI insight record not found' }, { status: 404 });
    }

    await docRef.update({
      status: 'acknowledged',
      acknowledged_by: authResult.uid,
      acknowledged_at: new Date().toISOString()
    });

    await logBusinessEvent({
      event_type: 'ai_insight_acknowledged',
      actor_type: authResult.role as any,
      actor_id: authResult.uid,
      target_type: 'ai_insight',
      target_id: id,
      outlet_id: 'main',
      severity: 'info',
      source: 'api'
    });

    return NextResponse.json({ ok: true, id, status: 'acknowledged' });
  } catch (error) {
    console.error('Error acknowledging AI insight:', error);
    return NextResponse.json({ detail: 'Failed to acknowledge AI insight' }, { status: 500 });
  }
}
