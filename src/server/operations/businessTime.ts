function dateParts(timestamp: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(timestamp))
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function assertCalendarDate(date: string): { year: number; month: number; day: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid calendar date');
  const [year, month, day] = date.split('-').map(Number);
  const canonical = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  if (canonical !== date) throw new Error('Invalid calendar date');
  return { year, month, day };
}

function zonedMidnightUtc(date: string, timeZone: string): number {
  const { year, month, day } = assertCalendarDate(date);
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = dateParts(guess, timeZone);
    const represented = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute,
      current.second,
    );
    guess += target - represented;
  }
  return guess;
}

export function normalizeTimeZone(value: unknown): string {
  const candidate = typeof value === 'string' && value.trim() ? value.trim() : 'Asia/Kolkata';
  try {
    new Intl.DateTimeFormat('en', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return 'Asia/Kolkata';
  }
}

export function businessDayUtcBounds(date: string, timeZone: string): { start: number; end: number } {
  const { year, month, day } = assertCalendarDate(date);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  return {
    start: zonedMidnightUtc(date, timeZone),
    end: zonedMidnightUtc(nextDate, timeZone),
  };
}

export function businessDate(timestamp: number, timeZone: string): string {
  const parts = dateParts(timestamp, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
