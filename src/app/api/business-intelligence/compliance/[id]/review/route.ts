// [INTERNAL] Protected via requireBIAccess
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireBIAccess } from '@/server/auth/requireBIAccess';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { z } from 'zod';

const bodySchema = z.object({
  review_note: z.string().optional()
}).optional();

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
    const json = await req.json().catch(() => ({}));
    const parseResult = bodySchema.safeParse(json);
    if (!parseResult.success) {
      return NextResponse.json({ detail: 'Invalid body' }, { status: 400 });
    }

    const { id } = params;
    const docRef = adminDb.collection('compliance_tasks').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ detail: 'Compliance task not found' }, { status: 404 });
    }

    const updatePayload = {
      status: 'reviewed',
      reviewed_by: authResult.uid,
      reviewed_at: new Date().toISOString(),
      ...(parseResult.data?.review_note && { review_note: parseResult.data.review_note })
    };

    await docRef.update(updatePayload);

    await logBusinessEvent({
      event_type: 'compliance_task_reviewed',
      actor_type: authResult.role as any,
      actor_id: authResult.uid,
      target_type: 'compliance_task',
      target_id: id,
      outlet_id: 'main',
      severity: 'info',
      source: 'api',
      metadata: { review_note: parseResult.data?.review_note }
    });

    return NextResponse.json({ ok: true, id, status: 'reviewed' });
  } catch (error) {
    console.error('Error reviewing compliance task:', error);
    return NextResponse.json({ detail: 'Failed to review compliance task' }, { status: 500 });
  }
}
