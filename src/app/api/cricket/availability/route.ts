// [PUBLIC] Public cricket slot availability lookup
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  getAuthoritativeNow,
  getKolkataDateString,
  generateSlotsForDate,
  evaluateSlotStatus,
  DEFAULT_CRICKET_CONFIG,
  CricketConfigData,
} from '@/features/cricket/cricketTime';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const now = getAuthoritativeNow();
    const defaultDateStr = getKolkataDateString(now);
    const dateStr = searchParams.get('date') || defaultDateStr;

    // Load venue configuration
    let config: CricketConfigData = DEFAULT_CRICKET_CONFIG;
    if (adminDb) {
      try {
        const configDoc = await adminDb.collection('config').doc('cricket_settings').get();
        if (configDoc.exists) {
          config = { ...DEFAULT_CRICKET_CONFIG, ...configDoc.data() };
        }
      } catch (e) {
        console.warn('Failed to read cricket_settings, using defaults:', e);
      }
    }

    const bookedSlotKeys = new Set<string>();
    const heldSlotKeys = new Set<string>();
    const blockedSlotKeys = new Set<string>();

    if (adminDb) {
      // 1. Fetch non-cancelled bookings for this date
      const bookingsSnap = await adminDb
        .collection('cricket_bookings')
        .where('business_date', '==', dateStr)
        .get();

      bookingsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.status !== 'cancelled' && Array.isArray(data.slot_keys)) {
          data.slot_keys.forEach((key: string) => bookedSlotKeys.add(key));
        }
      });

      // 2. Fetch active checkout holds
      const holdsSnap = await adminDb
        .collection('cricket_slot_locks')
        .where('business_date', '==', dateStr)
        .where('expires_at', '>', now)
        .get();

      holdsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (Array.isArray(data.slot_keys)) {
          data.slot_keys.forEach((key: string) => heldSlotKeys.add(key));
        }
      });

      // 3. Fetch active slot blocks
      const blocksSnap = await adminDb
        .collection('cricket_slot_blocks')
        .where('business_date', '==', dateStr)
        .get();

      blocksSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.active !== false && data.slot_key) {
          blockedSlotKeys.add(data.slot_key);
        }
      });
    }

    const generatedSlots = generateSlotsForDate(dateStr, config);

    let slotsLeft = 0;
    const slots = generatedSlots.map((slot) => {
      const evaluation = evaluateSlotStatus(
        slot,
        now,
        config,
        bookedSlotKeys,
        heldSlotKeys,
        blockedSlotKeys
      );

      if (evaluation.status === 'available') {
        slotsLeft++;
      }

      return {
        ...slot,
        status: evaluation.status,
        bookable: evaluation.bookable,
        reason: evaluation.reason,
        pricePaise: config.base_price_paise,
      };
    });

    return NextResponse.json({
      date: dateStr,
      timeZone: config.time_zone,
      serverNow: now,
      config,
      slotsLeft,
      slots,
    });
  } catch (error: any) {
    console.error('Cricket availability fetch failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cricket availability', code: 'AVAILABILITY_ERROR' },
      { status: 500 }
    );
  }
}
