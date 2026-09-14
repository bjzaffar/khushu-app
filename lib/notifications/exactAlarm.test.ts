import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: 'android',
  nativeModule: undefined as undefined | {
    canScheduleExactAlarms: ReturnType<typeof vi.fn>;
    openExactAlarmSettings: ReturnType<typeof vi.fn>;
  },
}));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mocks.platform;
    },
  },
  NativeModules: {
    get ExactAlarmModule() {
      return mocks.nativeModule;
    },
  },
}));

import {
  canScheduleExactPrayerNotifications,
  openExactAlarmSettings,
} from './exactAlarm';

describe('Android exact-alarm bridge', () => {
  beforeEach(() => {
    mocks.platform = 'android';
    mocks.nativeModule = undefined;
  });

  it('does not prompt when the native bridge is unavailable', async () => {
    await expect(canScheduleExactPrayerNotifications()).resolves.toBeNull();
  });

  it('reports the real Android special-access state', async () => {
    mocks.nativeModule = {
      canScheduleExactAlarms: vi.fn().mockResolvedValue(false),
      openExactAlarmSettings: vi.fn(),
    };

    await expect(canScheduleExactPrayerNotifications()).resolves.toBe(false);
  });

  it('delegates opening the Android settings screen', async () => {
    const openSettings = vi.fn().mockResolvedValue(undefined);
    mocks.nativeModule = {
      canScheduleExactAlarms: vi.fn().mockResolvedValue(true),
      openExactAlarmSettings: openSettings,
    };

    await openExactAlarmSettings();

    expect(openSettings).toHaveBeenCalledOnce();
  });

  it('requires no exact-alarm special access outside Android', async () => {
    mocks.platform = 'ios';
    await expect(canScheduleExactPrayerNotifications()).resolves.toBe(true);
  });
});
