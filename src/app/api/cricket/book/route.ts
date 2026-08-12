// [PUBLIC] Customer booking confirmation endpoint
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { createHmac } from 'crypto';
import {
  getAuthoritativeNow,
  getKolkataDateString,
  generateSlotsForDate,
  DEFAULT_CRICKET_CONFIG,
  CricketConfigData,
  GeneratedSlot,
} from '@/features/cricket/cricketTime';

function generateTicketToken(bookingId: string, reference: string, uid: string): string {
  const payload = { bookingId, reference, uid, issuedAt: Date.now() };
  const base64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmacSecret = process.env.CRICKET_TICKET_HMAC_KEY;
  if (!hmacSecret || hmacSecret.length < 32) {
    throw new Error('System configuration error: Missing ticket signing key');
  }
  const sig = createHmac('sha256', hmacSecret).update(base64).digest('base64url');
  return `${base64}.${sig}`;
}

export async function POST(request: Request) {
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

    const body = await request.json();
    const {
      slot_keys,
      date: dateStr,
      customer_name,
      customer_phone,
      payment_option = 'pay_at_venue',
      is_student = false,
    } = body;

    if (!Array.isArray(slot_keys) || slot_keys.length === 0) {
      return NextResponse.json({ error: 'At least one slot must be selected', code: 'INVALID_SLOTS' }, { status: 400 });
    }

    const now = getAuthoritativeNow();
    const validDateStr = dateStr || getKolkataDateString(now);

    // Read config
    let config: CricketConfigData = DEFAULT_CRICKET_CONFIG;
    const configDoc = await adminDb.collection('config').doc('cricket_settings').get();
    if (configDoc.exists) {
      config = { ...DEFAULT_CRICKET_CONFIG, ...configDoc.data() };
    }

    // Generate & validate slots
    const allSlots = generateSlotsForDate(validDateStr, config);
    const slotMap = new Map(allSlots.map((s) => [s.slotKey, s]));
    const selectedSlots: GeneratedSlot[] = [];

    for (const key of slot_keys) {
      const found = slotMap.get(key);
      if (!found) {
        return NextResponse.json({ error: `Slot key ${key} is invalid for date ${validDateStr}`, code: 'INVALID_SLOTS' }, { status: 400 });
      }
      selectedSlots.push(found);
    }

    selectedSlots.sort((a, b) => a.startAt - b.startAt);

    // Verify consecutive
    for (let i = 0; i < selectedSlots.length - 1; i++) {
      if (selectedSlots[i + 1].startAt !== selectedSlots[i].endAt) {
        return NextResponse.json(
          { error: 'Selected time slots must be consecutive.', code: 'NON_CONSECUTIVE_SLOTS' },
          { status: 400 }
        );
      }
    }

    const startAt = selectedSlots[0].startAt;
    const endAt = selectedSlots[selectedSlots.length - 1].endAt;

    // Check past & lead time
    const leadTimeCutoff = now + config.minimum_lead_minutes * 60 * 1000;
    if (startAt <= now) {
      return NextResponse.json({ error: 'Slot has already passed or started.', code: 'SLOT_PAST' }, { status: 409 });
    }
    if (startAt < leadTimeCutoff) {
      return NextResponse.json({ error: 'Slot requires minimum lead time.', code: 'SLOT_TOO_SOON' }, { status: 409 });
    }

    // Server-Authoritative Price Calculation (Integer Paise)
    const basePricePaise = selectedSlots.length * config.base_price_paise;
    let discountPaise = 0;

    // Student Discount Rule: 15% discount for verified student on weekday morning slots (starts before 14:00)
    const dayOfWeek = new Date(startAt).getDay(); // 0 = Sun, 6 = Sat
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const startHour = new Date(startAt).getHours();

    if (is_student && isWeekday && startHour < 14) {
      discountPaise = Math.round(basePricePaise * 0.15);
    }

    const totalPaise = basePricePaise - discountPaise;
    const isDemoOnline = payment_option === 'demo_online';
    const paymentStatus = isDemoOnline ? 'demo' : 'pending_at_venue';
    const paidPaise = isDemoOnline ? totalPaise : 0;

    // Generate Unique Public Reference: ILARA-CRIC-8F2K91
    const randRef = Math.random().toString(36).substring(2, 8).toUpperCase();
    const reference = `ILARA-CRIC-${randRef}`;
    const bookingId = `cric_${now}_${randRef}`;
    const ticketToken = generateTicketToken(bookingId, reference, decodedToken.uid);

    const bookingDocData = {
      booking_id: bookingId,
      booking_reference: reference,
      user_id: decodedToken.uid,
      customer_name: customer_name?.trim() || decodedToken.email?.split('@')[0] || 'Patron',
      customer_phone: customer_phone?.trim() || '',
      business_date: validDateStr,
      venue_id: config.venue_id,
      slot_keys: selectedSlots.map((s) => s.slotKey),
      display_time: `${selectedSlots[0].displayStart} - ${selectedSlots[selectedSlots.length - 1].displayEnd}`,
      start_at: startAt,
      end_at: endAt,
      status: 'confirmed',
      payment_status: paymentStatus,
      base_price_paise: basePricePaise,
      discount_paise: discountPaise,
      total_paise: totalPaise,
      paid_paise: paidPaise,
      ticket_token: ticketToken,
      created_at: now,
      updated_at: now,
    };

    // Atomic Transactional Booking & Lock Confirmation
    try {
      await adminDb.runTransaction(async (transaction) => {
        const locksRef = adminDb!.collection('cricket_slot_locks');
        for (const slot of selectedSlots) {
          const lockDocRef = locksRef.doc(slot.slotKey);
          const lockDoc = await transaction.get(lockDocRef);
          if (lockDoc.exists) {
            const lData = lockDoc.data();
            // If lock exists and belongs to someone else (and unexpired)
            if (lData && lData.expires_at > now && lData.user_id !== decodedToken.uid) {
              throw new Error('SLOT_CONFLICT');
            }
          }
        }

        // Write Booking Document
        const bookingRef = adminDb!.collection('cricket_bookings').doc(bookingId);
        transaction.set(bookingRef, bookingDocData);

        // Update Slot Locks to permanent booking lock (until endAt)
        for (const slot of selectedSlots) {
          const lockDocRef = locksRef.doc(slot.slotKey);
          transaction.set(lockDocRef, {
            booking_id: bookingId,
            slot_key: slot.slotKey,
            venue_id: config.venue_id,
            business_date: validDateStr,
            user_id: decodedToken.uid,
            expires_at: endAt,
            created_at: now,
          });
        }
      });
    } catch (err: any) {
      if (err.message === 'SLOT_CONFLICT') {
        return NextResponse.json(
          { error: 'That slot was just booked by another user.', code: 'SLOT_CONFLICT' },
          { status: 409 }
        );
      }
      throw err;
    }

    return NextResponse.json({
      success: true,
      bookingId,
      bookingReference: reference,
      redirectUrl: '/social/cricket/my-activities',
      ticketToken,
      booking: bookingDocData,
    });
  } catch (error: any) {
    console.error('Cricket booking failed:', error);
    return NextResponse.json(
      { error: 'Failed to complete booking', code: 'BOOKING_ERROR' },
      { status: 500 }
    );
  }
}
