// [INTERNAL] Protected via requireBIAccess
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireBIAccess } from '@/server/auth/requireBIAccess';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { z } from 'zod';

const bodySchema = z.object({
  ca_note: z.string().min(1)
});

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
    const json = await req.json();
    const parseResult = bodySchema.safeParse(json);
    if (!parseResult.success) {
      return NextResponse.json({ detail: 'Invalid body: ca_note string required' }, { status: 400 });
    }

    const { id } = params;
    const docRef = adminDb.collection('ca_reviews').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ detail: 'CA review record not found' }, { status: 404 });
    }

    await docRef.update({
      ca_note: parseResult.data.ca_note,
      reviewed_by: authResult.uid,
      reviewed_at: new Date().toISOString()
    });

    await logBusinessEvent({
      event_type: 'ca_note_added',
      actor_type: authResult.role as any,
      actor_id: authResult.uid,
      target_type: 'ca_review',
      target_id: id,
      outlet_id: 'main',
      severity: 'info',
      source: 'api',
      metadata: { ca_note: parseResult.data.ca_note }
    });

    return NextResponse.json({ ok: true, id, ca_note: parseResult.data.ca_note });
  } catch (error) {
    console.error('Error adding CA note:', error);
    return NextResponse.json({ detail: 'Failed to add CA note' }, { status: 500 });
  }
}
