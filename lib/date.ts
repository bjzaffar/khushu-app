/** Format a Date as a local calendar date without converting it through UTC. */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Return the first local calendar date in an inclusive rolling-day window. */
export function rollingWindowStart(days: number, now: Date): string {
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return toLocalDateKey(start);
}
