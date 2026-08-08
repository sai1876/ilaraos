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

interface StageTiming {
  stage: string;
  durationMs: number;
  success: boolean;
  errorName?: string;
  errorCode?: string;
}

export async function GET(request: Request) {
  const startTime = Date.now();
  const timings: StageTiming[] = [];

  const recordTiming = (
    stage: string,
    stageStart: number,
    success: boolean,
    err?: any
  ) => {
    const durationMs = Date.now() - stageStart;
    const timing: StageTiming = { stage, durationMs, success };
    if (err) {
      timing.errorName = err.name || 'Error';
      timing.errorCode = err.code ? String(err.code) : undefined;
    }
    timings.push(timing);
    if (!success) {
      console.error(`[CRICKET_AVAIL_STAGE_ERROR] ${stage} failed in ${durationMs}ms:`, {
        errorName: timing.errorName,
        errorCode: timing.errorCode,
      });
    }
  };

  try {
    const { searchParams } = new URL(request.url);
    const now = getAuthoritativeNow();
    const todayStr = getKolkataDateString(now);
    const rawDate = searchParams.get('date');
    const dateStr = rawDate || todayStr;

    // A. Load venue configuration
    const configStart = Date.now();
    let config: CricketConfigData = DEFAULT_CRICKET_CONFIG;
    if (!adminDb) {
      recordTiming('CRICKET_AVAIL_CONFIG', configStart, false, { name: 'DATABASE_UNAVAILABLE', code: 503 });
      return NextResponse.json(
        { error: 'Unable to load live availability', code: 'AVAILABILITY_TEMPORARILY_UNAVAILABLE' },
        { status: 503 }
      );
    }

    try {
      const configDoc = await adminDb.collection('config').doc('cricket_settings').get();
      if (configDoc.exists) {
        config = { ...DEFAULT_CRICKET_CONFIG, ...configDoc.data() };
      }
      recordTiming('CRICKET_AVAIL_CONFIG', configStart, true);
    } catch (err: any) {
      recordTiming('CRICKET_AVAIL_CONFIG', configStart, false, err);
      // FAIL CLOSED on database config read error
      return NextResponse.json(
        { error: 'Unable to load live availability', code: 'AVAILABILITY_TEMPORARILY_UNAVAILABLE' },
        { status: 503 }
      );
    }

    // B. Validate requested date
    if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return NextResponse.json(
        { error: 'Invalid date format. Expected YYYY-MM-DD.', code: 'INVALID_BOOKING_DATE' },
        { status: 400 }
      );
    }

    const horizonDays = config.booking_horizon_days || 7;
    const maxHorizonMs = now + horizonDays * 24 * 60 * 60 * 1000;
    const maxDateStr = getKolkataDateString(maxHorizonMs);

    if (dateStr < todayStr || dateStr > maxDateStr) {
      return NextResponse.json(
        { error: 'Date is outside valid booking horizon.', code: 'OUTSIDE_BOOKING_HORIZON' },
        { status: 400 }
      );
    }

    // C. Generate slots first
    const generateStart = Date.now();
    const generatedSlots = generateSlotsForDate(dateStr, config);
    recordTiming('CRICKET_AVAIL_GENERATE', generateStart, true);

    const bookedSlotKeys = new Set<string>();
    const heldSlotKeys = new Set<string>();
    const blockedSlotKeys = new Set<string>();

    // D & F. Parallelize authoritative database reads
    try {
      await Promise.all([
        // 1. Fetch non-cancelled bookings
        (async () => {
          const bStart = Date.now();
          try {
            const bookingsSnap = await adminDb!
              .collection('cricket_bookings')
              .where('business_date', '==', dateStr)
              .get();

            bookingsSnap.docs.forEach((docSnap) => {
              const data = docSnap.data();
              if (data.status !== 'cancelled' && Array.isArray(data.slot_keys)) {
                data.slot_keys.forEach((key: string) => bookedSlotKeys.add(key));
              }
            });
            recordTiming('CRICKET_AVAIL_BOOKINGS', bStart, true);
          } catch (err: any) {
            recordTiming('CRICKET_AVAIL_BOOKINGS', bStart, false, err);
            throw err;
          }
        })(),

        // 2. Fetch direct deterministic locks (NO range query)
        (async () => {
          const lStart = Date.now();
          try {
            const lockRefs = generatedSlots.map((slot) =>
              adminDb!.collection('cricket_slot_locks').doc(slot.slotKey)
            );
            const lockDocs = await adminDb!.getAll(...lockRefs);

            lockDocs.forEach((lockDoc) => {
              if (lockDoc.exists) {
                const data = lockDoc.data();
                if (data && typeof data.slot_key === 'string' && data.expires_at > now) {
                  heldSlotKeys.add(data.slot_key);
                }
              }
            });
            recordTiming('CRICKET_AVAIL_LOCKS', lStart, true);
          } catch (err: any) {
            recordTiming('CRICKET_AVAIL_LOCKS', lStart, false, err);
            throw err;
          }
        })(),

        // 3. Fetch active slot blocks
        (async () => {
          const blStart = Date.now();
          try {
            const blocksSnap = await adminDb!
              .collection('cricket_slot_blocks')
              .where('business_date', '==', dateStr)
              .get();

            blocksSnap.docs.forEach((docSnap) => {
              const data = docSnap.data();
              if (data.active !== false && typeof data.slot_key === 'string') {
                blockedSlotKeys.add(data.slot_key);
              }
            });
            recordTiming('CRICKET_AVAIL_BLOCKS', blStart, true);
          } catch (err: any) {
            recordTiming('CRICKET_AVAIL_BLOCKS', blStart, false, err);
            throw err;
          }
        })(),
      ]);
    } catch (err: any) {
      // FAIL CLOSED if any availability-critical read fails
      return NextResponse.json(
        { error: 'Unable to load live availability', code: 'AVAILABILITY_TEMPORARILY_UNAVAILABLE' },
        { status: 503 }
      );
    }

    // I. Evaluate slot availability
    const evalStart = Date.now();
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
    recordTiming('CRICKET_AVAIL_EVALUATE', evalStart, true);

    recordTiming('CRICKET_AVAIL_TOTAL', startTime, true);

    // Build Server-Timing header string
    const serverTimingHeader = timings
      .map((t) => `${t.stage.toLowerCase().replace('cricket_avail_', '')};dur=${t.durationMs}`)
      .join(', ');

    return NextResponse.json(
      {
        date: dateStr,
        timeZone: config.time_zone,
        serverNow: now,
        config,
        slotsLeft,
        slots,
      },
      {
        headers: {
          'Server-Timing': serverTimingHeader,
        },
      }
    );
  } catch (error: any) {
    console.error('Cricket availability pipeline error:', error);
    return NextResponse.json(
      { error: 'Unable to load live availability', code: 'AVAILABILITY_TEMPORARILY_UNAVAILABLE' },
      { status: 503 }
    );
  }
}

