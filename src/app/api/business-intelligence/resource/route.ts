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
    const resourceSnapDoc = await adminDb.collection('resource_snapshots').doc('2026-08-07').get();
    const snapshot = resourceSnapDoc.exists ? resourceSnapDoc.data() : null;

    const stationSnap = await adminDb.collection('resource_station_load')
      .where('outlet_id', '==', 'main')
      .get();
    const stations = stationSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const utilitySnapDoc = await adminDb.collection('resource_utility_usage').doc('2026-08-07').get();
    const utilities = utilitySnapDoc.exists ? utilitySnapDoc.data() : null;

    return NextResponse.json({
      ok: true,
      snapshot,
      stations,
      utilities
    });
  } catch (error) {
    console.error('Error fetching BI resource:', error);
    return NextResponse.json({ detail: 'Failed to load resource data' }, { status: 500 });
  }
}
