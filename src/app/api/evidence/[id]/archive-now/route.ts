// [INTERNAL]
import { NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { requestEvidenceArchive } from '@/server/evidence/archiveService';
import { logBusinessEvent, type ActorType } from '@/server/events/logBusinessEvent';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager']);
    
    if (actor.role !== 'owner' && actor.role !== 'admin' && actor.role !== 'manager') {
      return NextResponse.json({ error: 'Unauthorized. Archive Now requires Manager or above.' }, { status: 403 });
    }

    const { id } = context.params;

    const result = await requestEvidenceArchive({
      evidenceId: id,
      trigger: 'MANUAL',
      actorId: actor.uid,
      allowBeforeDue: true
    });

    if (result === 'NOT_ELIGIBLE') {
      return NextResponse.json({ error: 'Evidence is not eligible for manual archival.' }, { status: 400 });
    }

    if (result === 'ALREADY_ARCHIVED') {
      return NextResponse.json({ error: 'Evidence is already archived.' }, { status: 400 });
    }

    await logBusinessEvent({
      event_type: 'evidence_manual_archive_requested',
      actor_type: actor.role as ActorType,
      actor_id: actor.uid,
      target_type: 'evidence',
      target_id: id,
      outlet_id: 'main',
      severity: 'info',
      source: 'api',
      metadata: { result }
    });

    // We return 202 Accepted because the actual work happens asynchronously via cron/worker
    return NextResponse.json({ message: 'Archive requested', state: 'ARCHIVING' }, { status: 202 });

  } catch (error: any) {
    console.error('Archive Now Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
