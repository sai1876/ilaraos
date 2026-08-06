import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireRole } from '@/server/auth/requireRole';
import { logBusinessEvent, type ActorType } from '@/server/events/logBusinessEvent';

const CASH_DIFFERENCE_ESCALATION_THRESHOLD = 500;
const schema = z.object({
  closing_id: z.string().trim().min(1).max(180),
  decision: z.enum(['approved', 'rejected']),
  founder_review_note: z.string().trim().min(3).max(1000).optional(),
}).strict();

class ReviewError extends Error {
  constructor(public status: number, public publicMessage: string) { super(publicMessage); }
}

export async function POST(req: Request) {
  try {
    const actor = await requireRole(req, ['admin', 'owner']);
    if (actor instanceof NextResponse) return actor;
    if (!['admin', 'owner'].includes(actor.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    if (parsed.data.decision === 'approved' && actor.role !== 'owner') {
      return NextResponse.json({ success: false, error: 'Only owner can approve and lock daily closings' }, { status: 403 });
    }
    const limit = await rateLimitDurable(`daily-closing-review:${actor.uid}`, 20, 15 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: limit.source === 'unavailable' ? 503 : 429 });
    }
    const input = parsed.data;
    const closingRef = adminDb.collection('daily_closings').doc(input.closing_id);
    const result = await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(closingRef);
      if (!snapshot.exists) throw new ReviewError(404, 'Daily closing not found');
      const closing = snapshot.data()!;
      if (closing.status !== 'submitted') throw new ReviewError(409, 'Only submitted closings can be reviewed');
      const cashDifference = Math.abs(Number(closing.cash_reconciliation?.cash_difference || 0));
      if (input.decision === 'approved'
          && cashDifference > CASH_DIFFERENCE_ESCALATION_THRESHOLD
          && !input.founder_review_note) {
        throw new ReviewError(400, 'Explicit owner note is required for this cash difference');
      }
      const now = Date.now();
      const status = input.decision === 'approved' ? 'locked' : 'rejected';
      const update = {
        status,
        reviewed_by: actor.uid,
        reviewed_at: now,
        ...(input.decision === 'approved' ? { locked_at: now, approved_by: actor.uid, approved_at: now } : {}),
        ...(input.founder_review_note ? { founder_review_note: input.founder_review_note } : {}),
        updated_at: now,
      };
      transaction.update(closingRef, update);
      return { status, update, outletId: String(closing.outlet_id) };
    });
    await logBusinessEvent({
      event_type: result.status === 'locked' ? 'daily_closing_locked' : 'daily_closing_rejected',
      actor_type: actor.role as ActorType,
      actor_id: actor.uid,
      target_type: 'daily_closing',
      target_id: input.closing_id,
      outlet_id: result.outletId,
      severity: 'info',
      source: 'admin_panel',
      metadata: {},
    });
    return NextResponse.json({ success: true, status: result.status, updated: result.update });
  } catch (error) {
    if (error instanceof ReviewError) {
      return NextResponse.json({ success: false, error: error.publicMessage }, { status: error.status });
    }
    console.error('[DAILY CLOSING REVIEW ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
