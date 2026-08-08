/**
 * Phase 24 — Authoritative Time Module for Ilara Box Cricket
 * Timezone: Asia/Kolkata
 */

export const CRICKET_TIMEZONE = 'Asia/Kolkata';

export interface CricketConfigData {
  venue_id: string;
  time_zone: string;
  opening_time: string; // e.g. "06:00"
  closing_time: string; // e.g. "23:00"
  slot_duration_minutes: number; // e.g. 60
  minimum_lead_minutes: number; // e.g. 15
  booking_horizon_days: number; // e.g. 7
  base_price_paise: number; // e.g. 80000 (₹800)
  enabled: boolean;
}

export const DEFAULT_CRICKET_CONFIG: CricketConfigData = {
  venue_id: 'box-main',
  time_zone: CRICKET_TIMEZONE,
  opening_time: '06:00',
  closing_time: '23:00',
  slot_duration_minutes: 60,
  minimum_lead_minutes: 15,
  booking_horizon_days: 7,
  base_price_paise: 80000,
  enabled: true,
};

/**
 * Returns current timestamp in milliseconds
 */
export function getAuthoritativeNow(): number {
  return Date.now();
}

/**
 * Returns canonical business date YYYY-MM-DD in Asia/Kolkata
 */
export function getKolkataDateString(timestamp: number = Date.now()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CRICKET_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date(timestamp));
}

/**
 * Parses YYYY-MM-DD and HH:mm into epoch milliseconds in Asia/Kolkata
 */
export function getKolkataTimestamp(dateStr: string, timeStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);

  // Construct ISO string with explicit +05:30 offset
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00.000+05:30`;
  return new Date(iso).getTime();
}

/**
 * Generates slot key: box-main_YYYY-MM-DD_HHMM
 */
export function generateSlotKey(venueId: string, dateStr: string, timeStr: string): string {
  const hhmm = timeStr.replace(':', '');
  return `${venueId}_${dateStr}_${hhmm}`;
}

export interface GeneratedSlot {
  slotKey: string;
  venueId: string;
  dateStr: string;
  timeStr: string;
  startAt: number;
  endAt: number;
  displayStart: string;
  displayEnd: string;
}

/**
 * Formats timestamp to 12-hour display string (e.g., "09:00 AM")
 */
export function formatDisplayTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CRICKET_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(timestamp));
}

/**
 * Generates all time slots for a given date based on CricketConfigData
 */
export function generateSlotsForDate(
  dateStr: string,
  config: CricketConfigData = DEFAULT_CRICKET_CONFIG
): GeneratedSlot[] {
  const slots: GeneratedSlot[] = [];

  let currentStart = getKolkataTimestamp(dateStr, config.opening_time);
  const closingTime = getKolkataTimestamp(dateStr, config.closing_time);
  const durationMs = config.slot_duration_minutes * 60 * 1000;

  while (currentStart + durationMs <= closingTime) {
    const endAt = currentStart + durationMs;
    const startDate = new Date(currentStart);
    const startHH = String(startDate.toLocaleTimeString('en-US', { timeZone: CRICKET_TIMEZONE, hour12: false, hour: '2-digit' })).padStart(2, '0');
    const startMM = String(startDate.toLocaleTimeString('en-US', { timeZone: CRICKET_TIMEZONE, hour12: false, minute: '2-digit' })).padStart(2, '0');
    const timeStr = `${startHH}:${startMM}`;

    const slotKey = generateSlotKey(config.venue_id, dateStr, timeStr);

    slots.push({
      slotKey,
      venueId: config.venue_id,
      dateStr,
      timeStr,
      startAt: currentStart,
      endAt,
      displayStart: formatDisplayTime(currentStart),
      displayEnd: formatDisplayTime(endAt),
    });

    currentStart += durationMs;
  }

  return slots;
}

/**
 * Evaluates slot status given current time, locks, and blocks
 */
export function evaluateSlotStatus(
  slot: GeneratedSlot,
  now: number,
  config: CricketConfigData,
  bookedSlotKeys: Set<string>,
  heldSlotKeys: Set<string>,
  blockedSlotKeys: Set<string>
): {
  status: 'available' | 'past' | 'lead_time' | 'booked' | 'held' | 'blocked' | 'closed';
  bookable: boolean;
  reason: string | null;
} {
  if (!config.enabled) {
    return { status: 'closed', bookable: false, reason: 'Venue is currently closed.' };
  }

  if (slot.startAt <= now) {
    return { status: 'past', bookable: false, reason: 'This slot has already passed or started.' };
  }

  const leadTimeCutoff = now + config.minimum_lead_minutes * 60 * 1000;
  if (slot.startAt < leadTimeCutoff) {
    return {
      status: 'lead_time',
      bookable: false,
      reason: `Requires at least ${config.minimum_lead_minutes} minutes advance notice.`,
    };
  }

  if (blockedSlotKeys.has(slot.slotKey)) {
    return { status: 'blocked', bookable: false, reason: 'Slot unavailable due to maintenance or event.' };
  }

  if (bookedSlotKeys.has(slot.slotKey)) {
    return { status: 'booked', bookable: false, reason: 'Slot is already booked.' };
  }

  if (heldSlotKeys.has(slot.slotKey)) {
    return { status: 'held', bookable: false, reason: 'Slot is currently on checkout hold.' };
  }

  return { status: 'available', bookable: true, reason: null };
}

/**
 * Generates next 8 canonical business dates (Today + next 7 days)
 */
export function getBookingHorizonDates(
  horizonDays: number = 7,
  now: number = Date.now()
): { dateStr: string; label: string; isToday: boolean }[] {
  const dates: { dateStr: string; label: string; isToday: boolean }[] = [];
  const todayStr = getKolkataDateString(now);

  for (let i = 0; i <= horizonDays; i++) {
    const targetMs = now + i * 24 * 60 * 60 * 1000;
    const dateStr = getKolkataDateString(targetMs);
    const dateObj = new Date(targetMs);

    let label = '';
    if (i === 0) label = 'Today';
    else if (i === 1) label = 'Tomorrow';
    else {
      label = new Intl.DateTimeFormat('en-US', {
        timeZone: CRICKET_TIMEZONE,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(dateObj);
    }

    dates.push({
      dateStr,
      label,
      isToday: dateStr === todayStr,
    });
  }

  return dates;
}
