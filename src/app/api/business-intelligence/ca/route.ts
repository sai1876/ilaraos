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
    const reviewsSnap = await adminDb.collection('ca_reviews')
      .where('outlet_id', '==', 'main')
      .get();
    const reviews = reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({
      ok: true,
      reviews
    });
  } catch (error) {
    console.error('Error fetching CA reviews:', error);
    return NextResponse.json({ detail: 'Failed to load CA workspace data' }, { status: 500 });
  }
}
