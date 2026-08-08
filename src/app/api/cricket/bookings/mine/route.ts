// [PUBLIC] User-scoped booking history
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { getAuthoritativeNow } from '@/features/cricket/cricketTime';

export async function GET(request: Request) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Database unavailable', code: 'DATABASE_UNAVAILABLE' }, { status: 503 });
    }

    const authHeader = request.headers.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const now = getAuthoritativeNow();
    const snap = await adminDb
      .collection('cricket_bookings')
      .where('user_id', '==', decodedToken.uid)
      .get();

    const allBookings = snap.docs.map((doc) => doc.data());

    const upcoming: any[] = [];
    const past: any[] = [];
    const cancelled: any[] = [];

    allBookings.forEach((b: any) => {
      if (b.status === 'cancelled') {
        cancelled.push(b);
      } else if (b.status === 'completed' || (b.status === 'confirmed' && b.end_at <= now)) {
        past.push({ ...b, derived_status: 'completed' });
      } else {
        upcoming.push(b);
      }
    });

    upcoming.sort((a, b) => a.start_at - b.start_at);
    past.sort((a, b) => b.start_at - a.start_at);
    cancelled.sort((a, b) => b.created_at - a.created_at);

    return NextResponse.json({
      success: true,
      serverNow: now,
      upcoming,
      past,
      cancelled,
      totalCount: allBookings.length,
    });
  } catch (error: any) {
    console.error('Failed to fetch user cricket bookings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bookings', code: 'FETCH_ERROR' },
      { status: 500 }
    );
  }
}
