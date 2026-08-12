// [INTERNAL] Protected via requireBIAccess
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireBIAccess } from '@/server/auth/requireBIAccess';

export async function GET(req: Request) {
  const authResult = await requireBIAccess();
  if (authResult instanceof NextResponse) return authResult;

  if (!adminDb) {
    return NextResponse.json({ detail: 'Database unavailable' }, { status: 500 });
  }

  try {
    const revenueSnap = await adminDb.collection('bi_revenue_daily')
      .where('outlet_id', '==', 'main')
      .get();

    const revenue = revenueSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));

    return NextResponse.json({
      ok: true,
      revenue
    });
  } catch (error) {
    console.error('Error fetching BI revenue:', error);
    return NextResponse.json({ detail: 'Failed to load revenue data' }, { status: 500 });
  }
}
