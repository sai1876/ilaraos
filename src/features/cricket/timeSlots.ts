import { generateSlotsForDate, DEFAULT_CRICKET_CONFIG } from './cricketTime';

export function generateHourlyTimeSlots(): string[] {
  const slots = generateSlotsForDate('2026-08-08', DEFAULT_CRICKET_CONFIG);
  return slots.map((s) => `${s.displayStart} - ${s.displayEnd}`);
}
