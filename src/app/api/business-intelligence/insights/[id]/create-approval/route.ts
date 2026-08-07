// [INTERNAL] Protected via requireBIAccess
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireBIAccess } from '@/server/auth/requireBIAccess';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { z } from 'zod';

const bodySchema = z.object({
  title: z.string().optional(),
  amount_paise: z.number().optional()
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
    const docRef = adminDb.collection('ai_insights').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ detail: 'AI insight record not found' }, { status: 404 });
    }

    const insightData = docSnap.data();
    const approvalId = `approval-${Date.now()}`;
    const approvalTitle = parseResult.data?.title || `Approval Request: ${insightData?.agent_name || 'AI Action'}`;

    await adminDb.collection('approvals').doc(approvalId).set({
      id: approvalId,
      ai_insight_id: id,
      title: approvalTitle,
      status: 'pending',
      requested_by: authResult.uid,
      amount_paise: parseResult.data?.amount_paise || 0,
      created_at: new Date().toISOString(),
      outlet_id: 'main',
      is_demo: true,
      demo_seed_id: 'ilara-single-restaurant-v1'
    });

    await docRef.update({
      status: 'action_taken',
      action_taken: 'approval_requested',
      approval_id: approvalId,
      updated_at: new Date().toISOString()
    });

    await logBusinessEvent({
      event_type: 'ai_approval_requested',
      actor_type: authResult.role as any,
      actor_id: authResult.uid,
      target_type: 'ai_insight',
      target_id: id,
      outlet_id: 'main',
      severity: 'info',
      source: 'api',
      metadata: { approval_id: approvalId, title: approvalTitle }
    });

    return NextResponse.json({ ok: true, id, approvalId, status: 'action_taken' });
  } catch (error) {
    console.error('Error creating approval request from AI insight:', error);
    return NextResponse.json({ detail: 'Failed to create approval request' }, { status: 500 });
  }
}
