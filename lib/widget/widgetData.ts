import { and, gte, lte } from 'drizzle-orm';
import { db } from '@/db/database';
import { salahLogs } from '@/db/schema';
import { type SalahName } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';

// ─── Constants ────────────────────────────────────────────────────────────────

const WIDGET_DATA_KEY = 'widget_heatmap_data';
const WIDGET_WEEK_KEY = 'widget_week_start';

const SALAH_ORDER: SalahName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HeatmapCell {
  day: string;       // 'M' | 'T' | 'W' | 'T' | 'F' | 'S' | 'S'
  salah: string;     // 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'
  rating: number | null;
}

export interface HeatmapData {
  cells: HeatmapCell[];
  weekStart: string; // ISO date YYYY-MM-DD of Monday
  weekEnd: string;   // ISO date YYYY-MM-DD of Sunday
}

// ─── Week helpers ─────────────────────────────────────────────────────────────

/** Get Monday 00:00 of the current week */
function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day; // offset to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Get Sunday 23:59:59.999 of the current week */
function getWeekEnd(): Date {
  const monday = getWeekStart();
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

/** Format Date → YYYY-MM-DD */
function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ─── Data builder ─────────────────────────────────────────────────────────────

/**
 * Build the 35-cell heatmap data for the current week (Mon–Sun).
 * Queries SQLite for salah_logs in the week's date range.
 */
export function buildHeatmapData(): HeatmapData {
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd();
  const weekStartStr = toISODate(weekStart);
  const weekEndStr = toISODate(weekEnd);

  // Query all logs for this week
  const logs = db
    .select()
    .from(salahLogs)
    .where(
      and(
        gte(salahLogs.logDate, weekStartStr),
        lte(salahLogs.logDate, weekEndStr)
      )
    )
    .all();

  // Build a lookup: key = "YYYY-MM-DD|salahName" → rating
  const lookup = new Map<string, number>();
  for (const log of logs) {
    lookup.set(`${log.logDate}|${log.salahName}`, log.focusRating);
  }

  // Build 35 cells: 7 days × 5 prayers
  const cells: HeatmapCell[] = [];
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const dayDate = new Date(weekStart);
    dayDate.setDate(weekStart.getDate() + dayIdx);
    const dateStr = toISODate(dayDate);
    const dayLabel = DAY_LABELS[dayIdx];

    for (const salah of SALAH_ORDER) {
      const key = `${dateStr}|${salah}`;
      const rating = lookup.get(key) ?? null;
      cells.push({ day: dayLabel, salah, rating });
    }
  }

  return {
    cells,
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
  };
}

// ─── Platform storage ─────────────────────────────────────────────────────────

/**
 * Write heatmap data to shared storage.
 * - Android: Writes to SharedPreferences via native module, then refreshes widget
 * - iOS: Writes to AsyncStorage (App Group bridge TBD when extension is configured)
 * - Fallback: AsyncStorage for Expo Go / development
 */
export async function writeWidgetData(): Promise<void> {
  const data = buildHeatmapData();
  const json = JSON.stringify(data);

  // Always persist to AsyncStorage for in-app reads
  await AsyncStorage.setItem(WIDGET_DATA_KEY, json);

  // Platform-specific native widget storage
  if (Platform.OS === 'android') {
    try {
      const { WidgetDataModule } = NativeModules;
      if (WidgetDataModule?.writeHeatmapData) {
        WidgetDataModule.writeHeatmapData(json);
      }
    } catch {
      // Native module not available (Expo Go) — widget won't update
    }
  } else if (Platform.OS === 'ios') {
    try {
      // TODO: Write to App Group shared container when extension is configured
      // const { WidgetBridge } = NativeModules;
      // if (WidgetBridge?.writeToAppGroup) {
      //   WidgetBridge.writeToAppGroup(WIDGET_DATA_KEY, json);
      // }
    } catch {
      // Native module not available
    }
  }
}

/**
 * Read heatmap data from shared storage (for in-app preview or debugging).
 */
export async function readWidgetData(): Promise<HeatmapData | null> {
  const json = await AsyncStorage.getItem(WIDGET_DATA_KEY);
  if (!json) return null;
  try {
    return JSON.parse(json) as HeatmapData;
  } catch {
    return null;
  }
}

// ─── Week rollover refresh ────────────────────────────────────────────────────

/**
 * Check if the current week differs from the last written week.
 * If so, rebuild and write fresh widget data.
 * Call on app startup to handle Monday rollover.
 */
export async function refreshWidgetIfWeekChanged(): Promise<void> {
  const currentWeekStart = toISODate(getWeekStart());
  const lastWeekStart = await AsyncStorage.getItem(WIDGET_WEEK_KEY);

  if (lastWeekStart === currentWeekStart) return;

  // New week (or first run) — rebuild and write
  await writeWidgetData();
  await AsyncStorage.setItem(WIDGET_WEEK_KEY, currentWeekStart);
}
