import { describe, it, expect } from 'vitest';
import {
  getKolkataDateString,
  getKolkataTimestamp,
  generateSlotsForDate,
  evaluateSlotStatus,
  getBookingHorizonDates,
  DEFAULT_CRICKET_CONFIG,
  CricketConfigData,
} from '../features/cricket/cricketTime';

describe('Box Cricket — Canonical Time & Slot Engine (Asia/Kolkata)', () => {
  it('correctly calculates Asia/Kolkata date string YYYY-MM-DD', () => {
    // 2026-08-08 14:25 Asia/Kolkata is UTC 2026-08-08 08:55:00
    const testTimestamp = new Date('2026-08-08T08:55:00Z').getTime();
    const dateStr = getKolkataDateString(testTimestamp);
    expect(dateStr).toBe('2026-08-08');
  });

  it('correctly parses date and time into Asia/Kolkata epoch timestamp', () => {
    const timestamp = getKolkataTimestamp('2026-08-08', '14:00');
    const isoString = new Date(timestamp).toISOString();
    // 14:00 IST (+05:30) is 08:30 UTC
    expect(isoString).toBe('2026-08-08T08:30:00.000Z');
  });

  it('generates slots based on opening and closing times', () => {
    const customConfig: CricketConfigData = {
      ...DEFAULT_CRICKET_CONFIG,
      opening_time: '08:00',
      closing_time: '12:00',
      slot_duration_minutes: 60,
    };

    const slots = generateSlotsForDate('2026-08-08', customConfig);
    expect(slots.length).toBe(4);
    expect(slots[0].timeStr).toBe('08:00');
    expect(slots[0].slotKey).toBe('box-main_2026-08-08_0800');
    expect(slots[3].timeStr).toBe('11:00');
    expect(slots[3].slotKey).toBe('box-main_2026-08-08_1100');
  });

  it('evaluates past slots as unavailable (startAt <= now)', () => {
    // Current time: 14:25 IST
    const now = getKolkataTimestamp('2026-08-08', '14:25');
    const slots = generateSlotsForDate('2026-08-08', DEFAULT_CRICKET_CONFIG);

    const slot0900 = slots.find((s) => s.timeStr === '09:00')!;
    const eval0900 = evaluateSlotStatus(slot0900, now, DEFAULT_CRICKET_CONFIG, new Set(), new Set(), new Set());
    expect(eval0900.status).toBe('past');
    expect(eval0900.bookable).toBe(false);

    // 14:00 - 15:00 slot (started at 14:00, now is 14:25) -> past/started -> unavailable
    const slot1400 = slots.find((s) => s.timeStr === '14:00')!;
    const eval1400 = evaluateSlotStatus(slot1400, now, DEFAULT_CRICKET_CONFIG, new Set(), new Set(), new Set());
    expect(eval1400.status).toBe('past');
    expect(eval1400.bookable).toBe(false);
  });

  it('enforces minimum lead time rule (15 minutes default)', () => {
    // Current time: 14:50 IST. Lead time cutoff: 15:05 IST.
    const now = getKolkataTimestamp('2026-08-08', '14:50');
    const slots = generateSlotsForDate('2026-08-08', DEFAULT_CRICKET_CONFIG);

    // 15:00 slot starts in 10 mins (< 15 mins lead time) -> lead_time -> unavailable
    const slot1500 = slots.find((s) => s.timeStr === '15:00')!;
    const eval1500 = evaluateSlotStatus(slot1500, now, DEFAULT_CRICKET_CONFIG, new Set(), new Set(), new Set());
    expect(eval1500.status).toBe('lead_time');
    expect(eval1500.bookable).toBe(false);

    // 16:00 slot starts in 70 mins (>= 15 mins lead time) -> available
    const slot1600 = slots.find((s) => s.timeStr === '16:00')!;
    const eval1600 = evaluateSlotStatus(slot1600, now, DEFAULT_CRICKET_CONFIG, new Set(), new Set(), new Set());
    expect(eval1600.status).toBe('available');
    expect(eval1600.bookable).toBe(true);
  });

  it('generates exactly 8 booking horizon dates (Today + 7 days)', () => {
    const horizon = getBookingHorizonDates(7, getKolkataTimestamp('2026-08-08', '14:00'));
    expect(horizon.length).toBe(8);
    expect(horizon[0].dateStr).toBe('2026-08-08');
    expect(horizon[0].label).toBe('Today');
    expect(horizon[1].dateStr).toBe('2026-08-09');
    expect(horizon[1].label).toBe('Tomorrow');
    expect(horizon[7].dateStr).toBe('2026-08-15');
  });

  it('handles midnight, month boundary, and year boundary rollovers cleanly', () => {
    // Midnight boundary: Aug 31 -> Sep 1
    const aug31 = getKolkataTimestamp('2026-08-31', '23:59');
    const sep1Date = getKolkataDateString(aug31 + 2 * 60 * 1000);
    expect(sep1Date).toBe('2026-09-01');

    // Year boundary: Dec 31 -> Jan 1
    const dec31 = getKolkataTimestamp('2026-12-31', '23:59');
    const jan1Date = getKolkataDateString(dec31 + 2 * 60 * 1000);
    expect(jan1Date).toBe('2027-01-01');
  });
});
