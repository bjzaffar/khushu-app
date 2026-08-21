import { useAppStore } from '@/store/appStore';
import type { PrayerTimes } from '@/types';

const lightColors = {
  background: '#F9F5EE',
  backgroundAlt: '#FAF7F2',
  surface: '#FFFFFF',
  surfaceMuted: '#EFE8D8',
  border: '#EFE8D8',
  borderStrong: '#DDD0BA',
  text: '#1A1917',
  textSecondary: '#3D3A37',
  grey: '#9B9189',
  greyDark: '#6B6360',
  sage: '#5A7A5A',
  white: '#FFFFFF',
} as const;

export type ThemeColors = { [Key in keyof typeof lightColors]: string };

const darkColors: ThemeColors = {
  background: '#121512',
  backgroundAlt: '#171A17',
  surface: '#1B201B',
  surfaceMuted: '#292F29',
  border: '#292F29',
  borderStrong: '#3D453D',
  text: '#FFFFFF',
  textSecondary: '#FFFFFF',
  grey: '#9B9189',
  greyDark: '#6B6360',
  sage: '#5A7A5A',
  white: '#FFFFFF',
};

export function getThemeColors(darkMode: boolean): ThemeColors {
  return darkMode ? darkColors : lightColors;
}

/** Auto theme is dark from Maghrib until sunrise, and light during daylight. */
export function shouldUseDarkAutoTheme(prayerTimes: PrayerTimes, now: Date = new Date()): boolean {
  return now >= prayerTimes.maghrib || now < prayerTimes.sunrise;
}

export function useThemeColors(): ThemeColors {
  return getThemeColors(useAppStore((state) => state.darkMode));
}
