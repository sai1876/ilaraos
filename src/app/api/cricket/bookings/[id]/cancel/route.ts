// [PUBLIC] Customer or manager cancellation endpoint
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { getAuthoritativeNow } from '@/features/cricket/cricketTime';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
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

    const bookingId = params.id;
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || 'User cancelled booking';

    const bookingRef = adminDb.collection('cricket_bookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return NextResponse.json({ error: 'Booking not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const data = bookingDoc.data();
    if (data?.user_id !== decodedToken.uid) {
      // Check if user is staff/manager
      const staffAccessDoc = await adminDb.collection('staff_access').doc(decodedToken.uid).get();
      if (!staffAccessDoc.exists) {
        return NextResponse.json({ error: 'You can only cancel your own booking', code: 'UNAUTHORIZED' }, { status: 403 });
      }
    }

    const now = getAuthoritativeNow();

    // Check cancellation lead time (e.g. up to 2 hours before start)
    if (data?.start_at && data.start_at <= now) {
      return NextResponse.json({ error: 'Past or active bookings cannot be cancelled.', code: 'CANCELLATION_EXPIRED' }, { status: 400 });
    }

    await adminDb.runTransaction(async (transaction) => {
      // 1. Update status to cancelled
      transaction.update(bookingRef, {
        status: 'cancelled',
        cancelled_at: now,
        cancelled_by: decodedToken.uid,
        cancellation_reason: reason,
        updated_at: now,
      });

      // 2. Release slot locks
      if (Array.isArray(data?.slot_keys)) {
        for (const slotKey of data.slot_keys) {
          const lockRef = adminDb!.collection('cricket_slot_locks').doc(slotKey);
          transaction.delete(lockRef);
        }
      }
    });

    return NextResponse.json({
      success: true,
      bookingId,
      status: 'cancelled',
      message: 'Booking cancelled successfully and slot released.',
    });
  } catch (error: any) {
    console.error('Failed to cancel cricket booking:', error);
    return NextResponse.json(
      { error: 'Failed to cancel booking', code: 'CANCEL_ERROR' },
      { status: 500 }
    );
  }
}
