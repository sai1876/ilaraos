import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole } from '@/server/auth/requireRole';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireRole(req, ['manager', 'admin', 'owner']);
    if (actor instanceof NextResponse) return actor;
    if (!adminDb) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    const { id } = params;
    const body = await req.json();
    const { closing_cash, expected_cash, cash_note } = body;
    if (closing_cash === undefined || expected_cash === undefined) {
      return NextResponse.json({ success: false, error: 'closing_cash and expected_cash required' }, { status: 400 });
    }
    await adminDb.collection('cash_register_sessions').doc(id).update({
      closing_cash: Number(closing_cash),
      expected_cash: Number(expected_cash),
      cash_note: cash_note || '',
      closed_at: new Date().toISOString(),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[CASH SESSIONS PATCH]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}