import { Coordinates, PrayerTimes as AdhanPrayerTimes, CalculationMethod, Madhab } from 'adhan';
import type { SalahName, PrayerTimes, Location, CalculationMethodKey, AsrMadhab } from '@/types';

/**
 * Calculate prayer times for a given date and location using Adhan.js.
 * Fully offline — no network required.
 */
export function calculatePrayerTimes(
  location: Location,
  date: Date = new Date(),
  methodKey: CalculationMethodKey = 'MuslimWorldLeague',
  asrMadhab: AsrMadhab = 'Shafi'
): PrayerTimes {
  const coords = new Coordinates(location.latitude, location.longitude);
  const methodFn = CalculationMethod[methodKey as keyof typeof CalculationMethod] as () => ReturnType<typeof CalculationMethod.MuslimWorldLeague>;
  const params = methodFn();
  params.madhab = asrMadhab === 'Hanafi' ? Madhab.Hanafi : Madhab.Shafi;

  const adhan = new AdhanPrayerTimes(coords, date, params);

  return {
    fajr: adhan.fajr,
    sunrise: adhan.sunrise,
    dhuhr: adhan.dhuhr,
    asr: adhan.asr,
    maghrib: adhan.maghrib,
    isha: adhan.isha,
  };
}

/**
 * Given the current time, determine which Salah window we're in.
 * Returns null outside a Salah window, including the time between sunrise and
 * Dhuhr when no Salah is active.
 */
export function getCurrentSalahWindow(
  prayerTimes: PrayerTimes,
  now: Date = new Date()
): SalahName | null {
  if (now >= prayerTimes.fajr && now < prayerTimes.sunrise) return 'fajr';
  if (now >= prayerTimes.dhuhr && now < prayerTimes.asr) return 'dhuhr';
  if (now >= prayerTimes.asr && now < prayerTimes.maghrib) return 'asr';
  if (now >= prayerTimes.maghrib && now < prayerTimes.isha) return 'maghrib';
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

/** Format a prayer time for display, e.g. "5:32 AM" or "17:32". */
export function formatPrayerTime(date: Date, use24HourTime = false): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');

  if (use24HourTime) return `${String(hours).padStart(2, '0')}:${minutes}`;

  const period = hours >= 12 ? 'PM' : 'AM';
  const twelveHour = hours % 12 || 12;
  return `${twelveHour}:${minutes} ${period}`;
}

/**
 * Minutes until a given time from now. Negative means it's passed.
 */
export function minutesUntil(target: Date, now: Date = new Date()): number {
  return Math.round((target.getTime() - now.getTime()) / 60000);
}
