import { create } from 'zustand';
import type { Location, PrayerTimes, SalahName, CalculationMethodKey, AsrMadhab } from '@/types';

export type PremiumStatus = 'unknown' | 'free' | 'premium';

interface AppState {
  // ── Hydration ──────────────────────────────────────────────────────────────
  isHydrated: boolean;
  setIsHydrated: (val: boolean) => void;

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

  // Incremented when the already-focused Home tab is pressed again.
  homeTabReselectionVersion: number;
  requestHomeTabReselection: () => void;
  // Incremented when the already-focused Log tab is pressed again.
  logTabReselectionVersion: number;
  requestLogTabReselection: () => void;

  // One-time confirmation shown after an explicit sign-in reaches Home.
  showSignInSuccessNotice: boolean;
  requestSignInSuccessNotice: () => void;
  clearSignInSuccessNotice: () => void;

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

  // ── General settings ────────────────────────────────────────────────────────
  use24HourTime: boolean;
  setUse24HourTime: (val: boolean) => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;

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
  premiumStatus: PremiumStatus;
  setPremiumStatus: (status: PremiumStatus) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Hydration
  isHydrated: false,
  setIsHydrated: (val) => set({ isHydrated: val }),

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
  homeTabReselectionVersion: 0,
  requestHomeTabReselection: () => set((state) => ({
    homeTabReselectionVersion: state.homeTabReselectionVersion + 1,
  })),
  logTabReselectionVersion: 0,
  requestLogTabReselection: () => set((state) => ({
    logTabReselectionVersion: state.logTabReselectionVersion + 1,
  })),
  showSignInSuccessNotice: false,
  requestSignInSuccessNotice: () => set({ showSignInSuccessNotice: true }),
  clearSignInSuccessNotice: () => set({ showSignInSuccessNotice: false }),

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

  // General
  use24HourTime: false,
  setUse24HourTime: (val) => set({ use24HourTime: val }),
  darkMode: false,
  setDarkMode: (val) => set({ darkMode: val }),

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
  premiumStatus: 'unknown',
  setPremiumStatus: (premiumStatus) => set({ premiumStatus }),
}));

/** Premium access is granted only by an active RevenueCat entitlement. */
export const selectIsPremium = (state: Pick<AppState, 'premiumStatus'>): boolean =>
  state.premiumStatus === 'premium';
