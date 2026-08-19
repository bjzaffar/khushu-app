/** Format a Date as a local calendar date without converting it through UTC. */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Return a stable local-calendar date, normalized to noon to avoid DST edges. */
export function localCalendarDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

/** Shift a date by local calendar days without relying on 24-hour durations. */
export function shiftLocalDate(date: Date, days: number): Date {
  const shifted = localCalendarDate(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

/** Format a local date as "Wednesday August 19". */
export function formatLongLocalDate(date: Date): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  return `${weekday} ${month} ${date.getDate()}`;
}

/** Return the first local calendar date in an inclusive rolling-day window. */
export function rollingWindowStart(days: number, now: Date): string {
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return toLocalDateKey(start);
}
