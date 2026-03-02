// ─── Salah ────────────────────────────────────────────────────────────────────
export type SalahName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export const SALAH_NAMES: SalahName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export const SALAH_DISPLAY_NAMES: Record<SalahName, string> = {
  fajr: 'Fajr',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

// ─── Distractions ─────────────────────────────────────────────────────────────
export type DistractionKey =
  | 'work'
  | 'financial'
  | 'family'
  | 'anxiety'
  | 'fatigue'
  | 'physical'
  | 'random'
  | 'other';

export const DISTRACTION_LABELS: Record<DistractionKey, string> = {
  work: 'Work / School',
  financial: 'Financial Worries',
  family: 'Family / Relationships',
  anxiety: 'Future Anxiety',
  fatigue: 'Fatigue',
  physical: 'Physical Discomfort',
  random: 'Random Thoughts',
  other: 'Other',
};

// ─── Pattern Detection ─────────────────────────────────────────────────────────
export type ReminderPhase = 'cold_start' | 'emerging' | 'established';

export interface PatternResult {
  phase: ReminderPhase;
  topDistraction: DistractionKey | null;
  frequency: number; // 0–1 ratio
  logCount: number;  // logs for this specific Salah
  totalLogs: number;
}

// ─── Prayer Times ──────────────────────────────────────────────────────────────
export interface PrayerTimes {
  fajr: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

export interface Location {
  latitude: number;
  longitude: number;
}
