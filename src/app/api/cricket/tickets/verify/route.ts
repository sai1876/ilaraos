// [PUBLIC] Ticket QR verification endpoint
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { createHmac, timingSafeEqual } from 'crypto';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ valid: false, error: 'Missing ticket verification token' }, { status: 400 });
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return NextResponse.json({ valid: false, error: 'Invalid token structure' }, { status: 400 });
    }

    const [base64, sig] = parts;
    const hmacSecret = process.env.CRICKET_TICKET_HMAC_KEY;
    if (!hmacSecret || hmacSecret.length < 32) {
      return NextResponse.json({ valid: false, error: 'System configuration error' }, { status: 500 });
    }
    
    const expectedSig = createHmac('sha256', hmacSecret).update(base64).digest('base64url');

    const sigBuffer = Buffer.from(sig);
    const expBuffer = Buffer.from(expectedSig);

    if (sigBuffer.length !== expBuffer.length || !timingSafeEqual(sigBuffer, expBuffer)) {
      return NextResponse.json({ valid: false, error: 'Ticket token signature invalid' }, { status: 401 });
    }

    const payload = JSON.parse(Buffer.from(base64, 'base64url').toString('utf8'));
    const bookingId = payload.bookingId;

    if (!bookingId || !adminDb) {
      return NextResponse.json({ valid: false, error: 'Booking identifier unresolvable' }, { status: 400 });
    }

    const bookingDoc = await adminDb.collection('cricket_bookings').doc(bookingId).get();
    if (!bookingDoc.exists) {
      return NextResponse.json({ valid: false, error: 'Booking record not found' }, { status: 404 });
    }

    const b = bookingDoc.data();
    if (b?.status === 'cancelled') {
      return NextResponse.json({
        valid: false,
        error: 'This booking has been cancelled.',
        booking: {
          reference: b?.booking_reference,
          status: b?.status,
        },
      }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      booking: {
        reference: b?.booking_reference,
        customerName: b?.customer_name,
        date: b?.business_date,
        displayTime: b?.display_time,
        status: b?.status,
        paymentStatus: b?.payment_status,
        venueId: b?.venue_id || 'box-main',
      },
    });
  } catch (error: any) {
    console.error('Ticket verification error:', error);
    return NextResponse.json({ valid: false, error: 'Verification error' }, { status: 500 });
  }
}
