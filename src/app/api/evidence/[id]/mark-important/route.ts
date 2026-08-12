// [INTERNAL]
import { NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { markImportantAndRequestArchive } from '@/server/evidence/archiveService';
import { logBusinessEvent, type ActorType } from '@/server/events/logBusinessEvent';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager']);
    
    if (actor.role !== 'owner' && actor.role !== 'admin' && actor.role !== 'manager') {
      return NextResponse.json({ error: 'Unauthorized. Mark Important requires Manager or above.' }, { status: 403 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { reason } = body;
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      return NextResponse.json({ error: 'A valid reason is required to mark evidence as important.' }, { status: 400 });
    }

    const { id } = context.params;

    const result = await markImportantAndRequestArchive({
      evidenceId: id,
      actorId: actor.uid,
      reason: reason.trim()
    });

    if (result === 'NOT_ELIGIBLE') {
      return NextResponse.json({ error: 'Evidence is not eligible for marking important.' }, { status: 400 });
    }

    if (result === 'ALREADY_ARCHIVED') {
      return NextResponse.json({ error: 'Evidence is already archived.' }, { status: 400 });
    }

    await logBusinessEvent({
      event_type: 'evidence_marked_important',
      actor_type: actor.role as ActorType,
      actor_id: actor.uid,
      target_type: 'evidence',
      target_id: id,
      outlet_id: 'main',
      severity: 'info',
      source: 'api',
      metadata: { reason: reason.trim(), result }
    });

    // We return 202 Accepted because the actual archive work happens asynchronously via cron/worker
    return NextResponse.json({ message: 'Marked important and archive requested', state: 'ARCHIVING' }, { status: 202 });

  } catch (error: any) {
    console.error('Mark Important Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
