// [INTERNAL] Protected via requireBIAccess
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireBIAccess } from '@/server/auth/requireBIAccess';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { z } from 'zod';

const bodySchema = z.object({
  title: z.string().optional(),
  category: z.string().optional()
}).optional();

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const authResult = await requireBIAccess();
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
    const taskId = `task-${Date.now()}`;
    const taskTitle = parseResult.data?.title || `Corrective Action for ${insightData?.agent_name || 'AI Insight'}`;

    await adminDb.collection('corrective_tasks').doc(taskId).set({
      id: taskId,
      ai_insight_id: id,
      title: taskTitle,
      category: parseResult.data?.category || 'AI Recommendation',
      status: 'open',
      created_by: authResult.uid,
      created_at: new Date().toISOString(),
      outlet_id: 'main',
      is_demo: true,
      demo_seed_id: 'ilara-single-restaurant-v1'
    });

    await docRef.update({
      status: 'action_taken',
      action_taken: 'corrective_task_created',
      corrective_task_id: taskId,
      updated_at: new Date().toISOString()
    });

    await logBusinessEvent({
      event_type: 'ai_corrective_task_created',
      actor_type: authResult.role as any,
      actor_id: authResult.uid,
      target_type: 'ai_insight',
      target_id: id,
      outlet_id: 'main',
      severity: 'info',
      source: 'api',
      metadata: { task_id: taskId, title: taskTitle }
    });

    return NextResponse.json({ ok: true, id, taskId, status: 'action_taken' });
  } catch (error) {
    console.error('Error creating corrective task from AI insight:', error);
    return NextResponse.json({ detail: 'Failed to create corrective task' }, { status: 500 });
  }
}
