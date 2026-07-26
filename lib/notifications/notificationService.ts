import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { SALAH_NAMES, SALAH_DISPLAY_NAMES } from '@/types';
import type { SalahName, PrayerTimes } from '@/types';
import { getPatternForSalah } from '@/lib/patterns/patternEngine';
import { getReminderContent } from '@/lib/notifications/reminderContent';
import { db } from '@/db/database';
import { settings } from '@/db/schema';
import { selectIsPremium, useAppStore } from '@/store/appStore';

// Show notifications when app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('khushu', {
      name: 'Prayer Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
    });
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Schedule a pre-Salah reminder for every prayer that hasn't passed yet today.
 * Content is personalised based on the user's current pattern phase.
 * Call this once daily (on app open) after prayer times are loaded.
 */
export async function schedulePreSalahReminders(
  prayerTimes: PrayerTimes,
  minutesBefore: number
): Promise<void> {
  await cancelPreSalahReminders();
  const now = new Date();

  for (const salah of SALAH_NAMES) {
    const triggerTime = new Date(prayerTimes[salah].getTime() - minutesBefore * 60_000);
    if (triggerTime <= now) continue;

    const isPremium = selectIsPremium(useAppStore.getState());
    const pattern = await getPatternForSalah(salah, isPremium ? undefined : 7);
    const { text: body, type: reminderType } = getReminderContent(pattern);

    // Save pending reminder type so the log screen can record which style was shown
    db.insert(settings)
      .values({ key: `pending_reminder_type_${salah}`, value: reminderType })
      .onConflictDoUpdate({ target: settings.key, set: { value: reminderType } })
      .run();

    await Notifications.scheduleNotificationAsync({
      identifier: `pre_salah_${salah}`,
      content: {
        title: `${SALAH_DISPLAY_NAMES[salah]} in ${minutesBefore} min`,
        body,
        data: { type: 'pre_salah', salah },
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerTime,
      },
    });
  }
}

/**
 * Schedule a post-Salah prompt for each prayer.
 * Fires when the prayer window closes (= next prayer's start time).
 * For Isha, fires 90 minutes after Isha starts.
 * Cancel a specific one immediately after the user logs that Salah.
 */
export async function schedulePostSalahPrompts(
  prayerTimes: PrayerTimes
): Promise<void> {
  await cancelPostSalahReminders();
  const now = new Date();

  const windowClose: [SalahName, Date][] = [
    ['fajr',    prayerTimes.dhuhr],
    ['dhuhr',   prayerTimes.asr],
    ['asr',     prayerTimes.maghrib],
    ['maghrib', prayerTimes.isha],
    ['isha',    new Date(prayerTimes.isha.getTime() + 90 * 60_000)],
  ];

  for (const [salah, closeTime] of windowClose) {
    if (closeTime <= now) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: `post_salah_${salah}`,
      content: {
        title: `How was your ${SALAH_DISPLAY_NAMES[salah]}?`,
        body: 'Tap to reflect for a moment.',
        data: { type: 'post_salah', salah },
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: closeTime,
      },
    });
  }
}

export async function cancelPreSalahReminders(): Promise<void> {
  for (const salah of SALAH_NAMES) {
    await Notifications.cancelScheduledNotificationAsync(`pre_salah_${salah}`).catch(() => {});
  }
}

export async function cancelPostSalahReminders(): Promise<void> {
  for (const salah of SALAH_NAMES) {
    await Notifications.cancelScheduledNotificationAsync(`post_salah_${salah}`).catch(() => {});
  }
}

/** Call this right after the user successfully logs a Salah. */
export async function cancelPostSalahForSalah(salah: SalahName): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`post_salah_${salah}`).catch(() => {});
}

/**
 * Schedule a weekly summary notification for the following Monday at 9am.
 * logCount = number of prayers logged in the past 7 days (max 35).
 */
export async function scheduleWeeklySummaryNotification(logCount: number): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('weekly_summary').catch(() => {});

  const now = new Date();
  const nextMonday = new Date(now);
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7; // 1=Mon … 0=Sun
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(9, 0, 0, 0);

  let body: string;
  if (logCount === 0) {
    body = 'This week is a fresh start. Even one reflection makes a difference.';
  } else if (logCount < 21) {
    body = `You reflected on ${logCount} prayer${logCount === 1 ? '' : 's'} this week. Keep building the habit.`;
  } else {
    body = `You reflected on ${logCount} prayers this week. May Allah increase your khushu.`;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: 'weekly_summary',
    content: {
      title: 'Your week in reflection',
      body,
      data: { type: 'weekly_summary' },
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: nextMonday,
    },
  });
}

/**
 * Schedule a gentle re-engagement nudge 72 hours from now.
 * Call on app open when no log exists in the past 3 days.
 */
export async function scheduleReEngagementNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('re_engagement').catch(() => {});

  const fireAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  await Notifications.scheduleNotificationAsync({
    identifier: 're_engagement',
    content: {
      title: 'A moment of reflection',
      body: 'Even a brief reflection after Salah can make a difference.',
      data: { type: 're_engagement' },
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  });
}

export async function cancelReEngagementNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('re_engagement').catch(() => {});
}
