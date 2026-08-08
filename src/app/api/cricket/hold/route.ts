// [PUBLIC] Customer slot hold endpoint
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import {
  getAuthoritativeNow,
  getKolkataDateString,
  generateSlotsForDate,
  DEFAULT_CRICKET_CONFIG,
  CricketConfigData,
  GeneratedSlot,
} from '@/features/cricket/cricketTime';

const HOLD_TTL_MS = 5 * 60 * 1000; // 5 minutes hold

export async function POST(request: Request) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Database unavailable', code: 'DATABASE_UNAVAILABLE' }, { status: 503 });
    }

    // Authenticate customer user
    const authHeader = request.headers.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const body = await request.json();
    const { slot_keys, date: dateStr } = body;

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

    // Generate valid slots for date
    const allSlots = generateSlotsForDate(validDateStr, config);
    const slotMap = new Map(allSlots.map((s) => [s.slotKey, s]));

    // Validate that selected slot_keys exist for this date and are consecutive
    const selectedSlots: GeneratedSlot[] = [];
    for (const key of slot_keys) {
      const found = slotMap.get(key);
      if (!found) {
        return NextResponse.json({ error: `Slot key ${key} is invalid for date ${validDateStr}`, code: 'INVALID_SLOTS' }, { status: 400 });
      }
      selectedSlots.push(found);
    }

    // Sort by startAt
    selectedSlots.sort((a, b) => a.startAt - b.startAt);

    // Check consecutive constraint
    for (let i = 0; i < selectedSlots.length - 1; i++) {
      if (selectedSlots[i + 1].startAt !== selectedSlots[i].endAt) {
        return NextResponse.json(
          { error: 'Selected time slots must be consecutive for a single booking session.', code: 'NON_CONSECUTIVE_SLOTS' },
          { status: 400 }
        );
      }
    }

    // Check past & lead time
    const leadTimeCutoff = now + config.minimum_lead_minutes * 60 * 1000;
    for (const slot of selectedSlots) {
      if (slot.startAt <= now) {
        return NextResponse.json({ error: 'That slot has already passed or started.', code: 'SLOT_PAST' }, { status: 409 });
      }
      if (slot.startAt < leadTimeCutoff) {
        return NextResponse.json(
          { error: `Slot requires at least ${config.minimum_lead_minutes} minutes lead time.`, code: 'SLOT_TOO_SOON' },
          { status: 409 }
        );
      }
    }

    const holdId = `hold_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const expiresAt = now + HOLD_TTL_MS;

    // Transactional Slot Lock Check
    try {
      await adminDb.runTransaction(async (transaction) => {
        // 1. Check existing locks
        const locksRef = adminDb!.collection('cricket_slot_locks');
        for (const slot of selectedSlots) {
          const lockDocRef = locksRef.doc(slot.slotKey);
          const lockDoc = await transaction.get(lockDocRef);
          if (lockDoc.exists) {
            const data = lockDoc.data();
            if (data && data.expires_at > now && data.user_id !== decodedToken.uid) {
              throw new Error('SLOT_CONFLICT');
            }
          }
        }

        // 2. Check existing non-cancelled bookings
        const bookingsSnap = await transaction.get(
          adminDb!.collection('cricket_bookings').where('business_date', '==', validDateStr)
        );

        for (const docSnap of bookingsSnap.docs) {
          const data = docSnap.data();
          if (data.status !== 'cancelled' && Array.isArray(data.slot_keys)) {
            for (const slot of selectedSlots) {
              if (data.slot_keys.includes(slot.slotKey)) {
                throw new Error('SLOT_CONFLICT');
              }
            }
          }
        }

        // 3. Write lock records
        for (const slot of selectedSlots) {
          const lockDocRef = locksRef.doc(slot.slotKey);
          transaction.set(lockDocRef, {
            hold_id: holdId,
            slot_key: slot.slotKey,
            venue_id: config.venue_id,
            business_date: validDateStr,
            user_id: decodedToken.uid,
            expires_at: expiresAt,
            created_at: now,
          });
        }
      });
    } catch (err: any) {
      if (err.message === 'SLOT_CONFLICT') {
        return NextResponse.json(
          { error: 'That slot was just reserved or booked by another user. Please choose another slot.', code: 'SLOT_CONFLICT' },
          { status: 409 }
        );
      }
      throw err;
    }

    const totalPaise = selectedSlots.length * config.base_price_paise;

    return NextResponse.json({
      success: true,
      holdId,
      expiresAt,
      businessDate: validDateStr,
      slotKeys: selectedSlots.map((s) => s.slotKey),
      displayTimes: selectedSlots.map((s) => `${s.displayStart} - ${s.displayEnd}`),
      totalPaise,
    });
  } catch (error: any) {
    console.error('Cricket hold creation failed:', error);
    return NextResponse.json(
      { error: 'Failed to create slot hold', code: 'HOLD_ERROR' },
      { status: 500 }
    );
  }
}
