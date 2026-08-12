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
    const snapDoc = await adminDb.collection('finance_snapshots').doc('2026-08-07').get();
    const snapshot = snapDoc.exists ? snapDoc.data() : null;

    const paymentsSnap = await adminDb.collection('finance_supplier_payments')
      .where('outlet_id', '==', 'main')
      .get();
    const payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({
      ok: true,
      snapshot,
      payments
    });
  } catch (error) {
    console.error('Error fetching BI finance:', error);
    return NextResponse.json({ detail: 'Failed to load finance data' }, { status: 500 });
  }
}
