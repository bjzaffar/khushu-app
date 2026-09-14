import { NativeModules, Platform } from 'react-native';

type ExactAlarmNativeModule = {
  canScheduleExactAlarms(): Promise<boolean>;
  openExactAlarmSettings(): Promise<void>;
};

function getExactAlarmModule(): ExactAlarmNativeModule | null {
  if (Platform.OS !== 'android') return null;
  return NativeModules.ExactAlarmModule ?? null;
}

/**
 * Returns true outside Android, false when Android needs special access, and
 * null when this build predates the native exact-alarm bridge (for example
 * Expo Go). A missing bridge must never trigger a settings prompt it cannot
 * complete.
 */
export async function canScheduleExactPrayerNotifications(): Promise<boolean | null> {
  if (Platform.OS !== 'android') return true;
  const exactAlarmModule = getExactAlarmModule();
  if (!exactAlarmModule) return null;
  return Boolean(await exactAlarmModule.canScheduleExactAlarms());
}

export async function openExactAlarmSettings(): Promise<void> {
  const exactAlarmModule = getExactAlarmModule();
  if (!exactAlarmModule) {
    throw new Error('Exact-alarm settings are unavailable in this build');
  }
  await exactAlarmModule.openExactAlarmSettings();
}
