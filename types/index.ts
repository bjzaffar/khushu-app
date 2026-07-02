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
  | 'anxiety'
  | 'tired'
  | 'guilt'
  | 'rushing'
  | 'random';

export const DISTRACTION_LABELS: Record<DistractionKey, string> = {
  work: 'Work',
  financial: 'Financial Worries',
  anxiety: 'Future Anxiety',
  tired: 'Tired',
  guilt: 'Guilt',
  rushing: 'Rushing',
  random: 'Random Thoughts',
};

// ─── Reminder Types ────────────────────────────────────────────────────────────
export type ReminderType = 'short' | 'attribute' | 'ayah' | 'hadith' | 'ai';

export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  short:     'Brief grounding',
  attribute: 'Divine Attribute',
  ayah:      'Quranic verse',
  hadith:    'Hadith',
  ai:        'AI Personalized',
};

// ─── Pattern Detection ─────────────────────────────────────────────────────────
export type ReminderPhase = 'cold_start' | 'emerging' | 'established';

export interface PatternResult {
  phase: ReminderPhase;
  topDistraction: string | null;
  frequency: number; // 0–1 ratio
  logCount: number;  // logs for this specific Salah
  totalLogs: number;
}

// ─── Prayer Calculation Settings ──────────────────────────────────────────────
export type CalculationMethodKey =
  | 'MuslimWorldLeague'
  | 'Egyptian'
  | 'Karachi'
  | 'UmmAlQura'
  | 'Dubai'
  | 'MoonsightingCommittee'
  | 'NorthAmerica'
  | 'Kuwait'
  | 'Qatar'
  | 'Singapore'
  | 'Turkey';

export const CALCULATION_METHODS: {
  key: CalculationMethodKey;
  label: string;
  region: string;
}[] = [
  { key: 'MuslimWorldLeague',      label: 'Muslim World League',              region: 'Global (default)' },
  { key: 'Egyptian',               label: 'Egyptian General Authority',       region: 'Egypt, Africa, Syria' },
  { key: 'Karachi',                label: 'Univ. of Islamic Sciences',        region: 'Pakistan, Bangladesh, India' },
  { key: 'UmmAlQura',              label: 'Umm al-Qura',                      region: 'Saudi Arabia' },
  { key: 'Dubai',                  label: 'Dubai',                            region: 'UAE' },
  { key: 'MoonsightingCommittee',  label: 'Moonsighting Committee',           region: 'UK, North America' },
  { key: 'NorthAmerica',           label: 'ISNA',                             region: 'North America' },
  { key: 'Kuwait',                 label: 'Kuwait',                           region: 'Kuwait' },
  { key: 'Qatar',                  label: 'Qatar',                            region: 'Qatar' },
  { key: 'Singapore',              label: 'Singapore',                        region: 'Singapore, Malaysia' },
  { key: 'Turkey',                 label: 'Presidency of Religious Affairs',  region: 'Turkey' },
];

export type AsrMadhab = 'Shafi' | 'Hanafi';

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
