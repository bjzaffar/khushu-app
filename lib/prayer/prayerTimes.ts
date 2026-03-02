import { Coordinates, PrayerTimes as AdhanPrayerTimes, CalculationMethod, Madhab } from 'adhan';
import type { SalahName, PrayerTimes, Location } from '@/types';

/**
 * Calculate prayer times for a given date and location using Adhan.js.
 * Fully offline — no network required.
 *
 * Calculation method: Muslim World League (widely accepted default).
 * Users can extend this to select their preferred method in Settings.
 */
export function calculatePrayerTimes(location: Location, date: Date = new Date()): PrayerTimes {
  const coords = new Coordinates(location.latitude, location.longitude);
  const params = CalculationMethod.MuslimWorldLeague();
  params.madhab = Madhab.Shafi;

  const adhan = new AdhanPrayerTimes(coords, date, params);

  return {
    fajr: adhan.fajr,
    dhuhr: adhan.dhuhr,
    asr: adhan.asr,
    maghrib: adhan.maghrib,
    isha: adhan.isha,
  };
}

/**
 * Given the current time, determine which Salah window we're in.
 * Returns null if between Isha end and Fajr (late night).
 */
export function getCurrentSalahWindow(
  prayerTimes: PrayerTimes,
  now: Date = new Date()
): SalahName | null {
  const entries: [SalahName, Date][] = [
    ['fajr', prayerTimes.fajr],
    ['dhuhr', prayerTimes.dhuhr],
    ['asr', prayerTimes.asr],
    ['maghrib', prayerTimes.maghrib],
    ['isha', prayerTimes.isha],
  ];

  for (let i = 0; i < entries.length - 1; i++) {
    const [name, start] = entries[i];
    const [, next] = entries[i + 1];
    if (now >= start && now < next) return name;
  }

  // After Isha starts
  if (now >= prayerTimes.isha) return 'isha';

  return null;
}

/**
 * Returns the next upcoming Salah from now.
 * Returns null if all have passed for today.
 */
export function getNextSalah(
  prayerTimes: PrayerTimes,
  now: Date = new Date()
): { name: SalahName; time: Date } | null {
  const entries: [SalahName, Date][] = [
    ['fajr', prayerTimes.fajr],
    ['dhuhr', prayerTimes.dhuhr],
    ['asr', prayerTimes.asr],
    ['maghrib', prayerTimes.maghrib],
    ['isha', prayerTimes.isha],
  ];

  for (const [name, time] of entries) {
    if (time > now) return { name, time };
  }
  return null;
}

/**
 * Format a prayer time for display, e.g. "5:32 AM"
 */
export function formatPrayerTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Minutes until a given time from now. Negative means it's passed.
 */
export function minutesUntil(target: Date, now: Date = new Date()): number {
  return Math.round((target.getTime() - now.getTime()) / 60000);
}
