// [INTERNAL] Protected via requireBIAccess
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireBIAccess } from '@/server/auth/requireBIAccess';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { z } from 'zod';

const bodySchema = z.object({
  document_title: z.string().optional()
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
    const docRef = adminDb.collection('ca_reviews').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ detail: 'CA review record not found' }, { status: 404 });
    }

    const reqId = `req-${Date.now()}`;
    const docTitle = parseResult.data?.document_title || 'Supporting Invoice / Receipt';

    await adminDb.collection('ca_document_requests').doc(reqId).set({
      id: reqId,
      ca_review_id: id,
      document_title: docTitle,
      status: 'pending',
      requested_by: authResult.uid,
      requested_at: new Date().toISOString(),
      outlet_id: 'main',
      is_demo: true,
      demo_seed_id: 'ilara-single-restaurant-v1'
    });

    await docRef.update({
      status: 'document_requested',
      reviewed_by: authResult.uid,
      reviewed_at: new Date().toISOString()
    });

    await logBusinessEvent({
      event_type: 'ca_document_requested',
      actor_type: authResult.role as any,
      actor_id: authResult.uid,
      target_type: 'ca_review',
      target_id: id,
      outlet_id: 'main',
      severity: 'info',
      source: 'api',
      metadata: { document_title: docTitle }
    });

    return NextResponse.json({ ok: true, id, status: 'document_requested', requestId: reqId });
  } catch (error) {
    console.error('Error requesting document:', error);
    return NextResponse.json({ detail: 'Failed to request document' }, { status: 500 });
  }
}
