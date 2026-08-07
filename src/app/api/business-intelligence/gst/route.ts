// [INTERNAL] Protected via requireBIAccess
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireBIAccess } from '@/server/auth/requireBIAccess';

export async function GET(req: Request) {
  const authResult = await requireBIAccess(req);
  if (authResult instanceof NextResponse) return authResult;

  if (!adminDb) {
    return NextResponse.json({ detail: 'Database unavailable' }, { status: 500 });
  }

  try {
    const gstSnap = await adminDb.collection('gst_snapshots').doc('2026-08').get();
    const gstData = gstSnap.exists ? gstSnap.data() : null;

    const reconciliationsSnap = await adminDb.collection('gst_reconciliations')
      .where('outlet_id', '==', 'main')
      .get();

    const reconciliations = reconciliationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({
      ok: true,
      snapshot: gstData,
      reconciliations
    });
  } catch (error) {
    console.error('Error fetching GST data:', error);
    return NextResponse.json({ detail: 'Failed to load GST data' }, { status: 500 });
  }
}
