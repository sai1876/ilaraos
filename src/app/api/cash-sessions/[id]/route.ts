import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActorApi } from '@/server/auth/requireSessionActor';

import { ServerTiming } from '@/lib/performance/serverTiming';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const timing = new ServerTiming();
  try {
    const actor = await requireSessionActorApi(['manager', 'admin', 'owner']);
    if (actor instanceof NextResponse) return actor;
    if (!adminDb) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    const { id } = params;
    const body = await req.json();
    const { closing_cash, expected_cash, cash_note } = body;
    if (closing_cash === undefined || expected_cash === undefined) {
      return NextResponse.json({ success: false, error: 'closing_cash and expected_cash required' }, { status: 400 });
    }

    const closedAt = new Date().toISOString();
    const updateData = {
      closing_cash: Number(closing_cash),
      expected_cash: Number(expected_cash),
      cash_note: cash_note || '',
      closed_at: closedAt,
    };

    const sessionRef = adminDb.collection('cash_register_sessions').doc(id);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }
    const sessionData = sessionSnap.data()!;
    if (sessionData.tenantId !== actor.tenantId) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    const t0 = Date.now();
    await sessionRef.update(updateData);
    timing.mark('db_write', Date.now() - t0);

    const docSnap = await adminDb.collection('cash_register_sessions').doc(id).get();
    const updatedSession = docSnap.exists ? { id, ...docSnap.data() } : { id, ...updateData };

    const res = NextResponse.json({ success: true, session: updatedSession });
    return timing.applyToResponse(res);
  } catch (error) {
    console.error('[CASH SESSIONS PATCH]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}