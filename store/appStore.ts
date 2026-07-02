import { create } from 'zustand';
import type { Location, PrayerTimes, SalahName, CalculationMethodKey, AsrMadhab } from '@/types';

interface AppState {
  // ── Onboarding ──────────────────────────────────────────────────────────────
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (val: boolean) => void;

  // ── Database ─────────────────────────────────────────────────────────────────
  isDbReady: boolean;
  setDbReady: (val: boolean) => void;

  // ── Location & Prayer Times ──────────────────────────────────────────────────
  location: Location | null;
  setLocation: (loc: Location) => void;

  todaysPrayerTimes: PrayerTimes | null;
  setTodaysPrayerTimes: (times: PrayerTimes) => void;

  // ── Salah Mode ───────────────────────────────────────────────────────────────
  salahModeActive: boolean;
  activeSalah: SalahName | null;
  startSalahMode: (salah: SalahName) => void;
  endSalahMode: () => void;

  // ── Notification settings ────────────────────────────────────────────────────
  reminderMinutesBefore: number;
  setReminderMinutesBefore: (mins: number) => void;
  postSalahPromptEnabled: boolean;
  setPostSalahPromptEnabled: (val: boolean) => void;

  // ── Prayer calculation settings ───────────────────────────────────────────────
  calculationMethod: CalculationMethodKey;
  setCalculationMethod: (method: CalculationMethodKey) => void;
  asrMadhab: AsrMadhab;
  setAsrMadhab: (madhab: AsrMadhab) => void;

  // ── DND preference ────────────────────────────────────────────────────────────
  dndDuringSalah: boolean;
  setDndDuringSalah: (val: boolean) => void;

  // ── Auth & Premium ────────────────────────────────────────────────────────────
  userId: string | null;
  setUserId: (id: string | null) => void;
  isPremium: boolean;
  setIsPremium: (val: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Onboarding
  hasCompletedOnboarding: false,
  setHasCompletedOnboarding: (val) => set({ hasCompletedOnboarding: val }),

  // DB
  isDbReady: false,
  setDbReady: (val) => set({ isDbReady: val }),

  // Location & prayer times
  location: null,
  setLocation: (loc) => set({ location: loc }),
  todaysPrayerTimes: null,
  setTodaysPrayerTimes: (times) => set({ todaysPrayerTimes: times }),

  // Salah Mode
  salahModeActive: false,
  activeSalah: null,
  startSalahMode: (salah) => set({ salahModeActive: true, activeSalah: salah }),
  endSalahMode: () => set({ salahModeActive: false }),

  // Notifications
  reminderMinutesBefore: 10,
  setReminderMinutesBefore: (mins) => set({ reminderMinutesBefore: mins }),
  postSalahPromptEnabled: true,
  setPostSalahPromptEnabled: (val) => set({ postSalahPromptEnabled: val }),

  // Prayer calculation
  calculationMethod: 'MuslimWorldLeague',
  setCalculationMethod: (method) => set({ calculationMethod: method }),
  asrMadhab: 'Shafi',
  setAsrMadhab: (madhab) => set({ asrMadhab: madhab }),

  // DND
  dndDuringSalah: false,
  setDndDuringSalah: (val) => set({ dndDuringSalah: val }),

  // Auth & Premium
  userId: null,
  setUserId: (id) => set({ userId: id }),
  isPremium: true,
  setIsPremium: (val) => set({ isPremium: val }),
}));
