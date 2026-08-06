function formatHour(hour: number): string {
  const normalized = hour % 24;
  const period = normalized < 12 ? 'AM' : 'PM';
  const twelveHour = normalized % 12 || 12;
  return `${String(twelveHour).padStart(2, '0')}:00 ${period}`;
}

export function generateHourlyTimeSlots(openingHour = 6, closingHour = 23): string[] {
  return Array.from({ length: closingHour - openingHour }, (_, index) => {
    const startHour = openingHour + index;
    return `${formatHour(startHour)} - ${formatHour(startHour + 1)}`;
  });
}
