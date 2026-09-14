import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { SALAH_NAMES, SALAH_DISPLAY_NAMES } from '@/types';
import type { SalahName, PrayerTimes } from '@/types';
import { getPatternForSalah } from '@/lib/patterns/patternEngine';
import { getReminderContent } from '@/lib/notifications/reminderContent';
import { db } from '@/db/database';
import { salahLogs, settings } from '@/db/schema';
import { toLocalDateKey } from '@/lib/date';
import { eq } from 'drizzle-orm';
import { canScheduleExactPrayerNotifications } from '@/lib/notifications/exactAlarm';

export const PRE_SALAH_REMINDERS_DISABLED = -1;
const POST_SALAH_STALE_AFTER_MS = 15 * 60_000;

function getMidnightAfter(date: Date): Date {
  const midnight = new Date(date);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  return midnight;
}

// Rebuilding post-Salah alarms touches five shared identifiers. Calls can
// arrive together from startup, Home, Settings, and an AppState foreground
// refresh. Serialize the whole cancel-and-rebuild transaction so an older pass
// cannot finish after a newer one and leave stale trigger times behind.
let postSalahOperationQueue: Promise<void> = Promise.resolve();

function enqueuePostSalahOperation(operation: () => Promise<void>): Promise<void> {
  const result = postSalahOperationQueue.then(operation, operation);
  postSalahOperationQueue = result.catch(() => {});
  return result;
}

function isExpiredPrayerNotification(data: Record<string, unknown> | undefined): boolean {
  const expiresAt = data?.expiresAt;
  return typeof expiresAt === 'number' && expiresAt < Date.now();
}

// Show notifications when app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const expired = isExpiredPrayerNotification(
      notification.request.content.data as Record<string, unknown> | undefined,
    );
    return {
      shouldShowAlert: !expired,
      shouldShowBanner: !expired,
      shouldShowList: !expired,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  },
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

  if (minutesBefore === PRE_SALAH_REMINDERS_DISABLED) {
    for (const salah of SALAH_NAMES) {
      db.delete(settings).where(eq(settings.key, `pending_reminder_type_${salah}`)).run();
    }
    return;
  }

  const exactAlarmAccess = await canScheduleExactPrayerNotifications();
  const canClaimRelativeTiming = Platform.OS !== 'android' || exactAlarmAccess === true;
  for (const salah of SALAH_NAMES) {
    await schedulePreSalahReminder(
      salah,
      prayerTimes[salah],
      minutesBefore,
      canClaimRelativeTiming,
    );
  }
}

async function schedulePreSalahReminder(
  salah: SalahName,
  prayerTime: Date,
  minutesBefore: number,
  canClaimRelativeTiming?: boolean,
): Promise<void> {
  const pendingTypeKey = `pending_reminder_type_${salah}`;
  if (minutesBefore === PRE_SALAH_REMINDERS_DISABLED) {
    db.delete(settings).where(eq(settings.key, pendingTypeKey)).run();
    return;
  }

  const triggerTime = new Date(prayerTime.getTime() - minutesBefore * 60_000);
  if (triggerTime <= new Date()) return;

  const preciseTiming = canClaimRelativeTiming ?? (
    Platform.OS !== 'android'
    || await canScheduleExactPrayerNotifications() === true
  );

  const pattern = await getPatternForSalah(salah);
  const { text: body, type: reminderType } = getReminderContent(pattern);

  // Cold-start reminders are intentionally untyped: they must not affect the
  // "What works for you" effectiveness insight. Clear a stale type from an
  // earlier schedule instead of writing one for this reminder.
  if (reminderType) {
    db.insert(settings)
      .values({ key: pendingTypeKey, value: reminderType })
      .onConflictDoUpdate({ target: settings.key, set: { value: reminderType } })
      .run();
  } else {
    db.delete(settings).where(eq(settings.key, pendingTypeKey)).run();
  }

  await Notifications.scheduleNotificationAsync({
    identifier: `pre_salah_${salah}`,
    content: {
      // If Android exact-alarm access is denied, the OS may legally deliver an
      // inexact fallback late. Avoid making a relative claim that could then be
      // plainly wrong while still delivering the useful reminder content.
      title: preciseTiming
        ? minutesBefore === 0
          ? `${SALAH_DISPLAY_NAMES[salah]} starts now`
          : `${SALAH_DISPLAY_NAMES[salah]} in ${minutesBefore} min`
        : `${SALAH_DISPLAY_NAMES[salah]} reminder`,
      body,
      data: {
        type: 'pre_salah',
        salah,
        scheduledFor: triggerTime.getTime(),
        // Once the prayer has started, relative wording such as "in 5 min"
        // is no longer valid and must not be presented by the foreground handler.
        expiresAt: prayerTime.getTime(),
      },
      sound: false,
      interruptionLevel: 'timeSensitive',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerTime,
    },
  });
}

/** Reschedule one pre-Salah reminder without disturbing the others. */
export async function reschedulePreSalahReminder(
  salah: SalahName,
  prayerTime: Date,
  minutesBefore: number,
): Promise<void> {
  const identifier = `pre_salah_${salah}`;
  // Read the already-prepared notification while cancelling it. A time-only
  // change must not pick a new reminder or recompute its pattern.
  const [scheduled] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync(),
    Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {}),
  ]);

  const existing = scheduled.find((notification) => notification.identifier === identifier);
  const triggerTime = new Date(prayerTime.getTime() - minutesBefore * 60_000);
  if (existing && minutesBefore !== PRE_SALAH_REMINDERS_DISABLED && triggerTime > new Date()) {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: existing.content.title,
        subtitle: existing.content.subtitle,
        body: existing.content.body,
        data: {
          ...existing.content.data,
          scheduledFor: triggerTime.getTime(),
          expiresAt: prayerTime.getTime(),
        },
        sound: false,
        interruptionLevel: 'timeSensitive',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerTime,
      },
    });
    return;
  }

  await schedulePreSalahReminder(salah, prayerTime, minutesBefore);
}

/**
 * Schedule a post-Salah prompt for each prayer.
 * Fires when the prayer window closes (= the next prayer's start time, except
 * Fajr, which ends at sunrise).
 * For Isha, fires at the following local midnight.
 * Cancel a specific one immediately after the user logs that Salah.
 */
export function schedulePostSalahPrompts(
  prayerTimes: PrayerTimes
): Promise<void> {
  return enqueuePostSalahOperation(() => schedulePostSalahPromptsNow(prayerTimes));
}

async function schedulePostSalahPromptsNow(prayerTimes: PrayerTimes): Promise<void> {
  await cancelPostSalahRemindersNow();
  const now = new Date();
  const today = toLocalDateKey(now);

  const getLoggedToday = () => new Set(
    db
      .select({ salahName: salahLogs.salahName })
      .from(salahLogs)
      .where(eq(salahLogs.logDate, today))
      .all()
      .map((row) => row.salahName as SalahName)
  );

  const alreadyLogged = getLoggedToday();

  const windowClose: [SalahName, Date][] = [
    ['fajr',    prayerTimes.sunrise],
    ['dhuhr',   prayerTimes.asr],
    ['asr',     prayerTimes.maghrib],
    ['maghrib', prayerTimes.isha],
    ['isha',    getMidnightAfter(prayerTimes.isha)],
  ];

  for (const [salah, closeTime] of windowClose) {
    if (alreadyLogged.has(salah)) continue;
    await schedulePostSalahPrompt(salah, closeTime);
  }

  // A log can be saved while the asynchronous scheduling loop is running.
  // Reconcile once more so a late schedule can never recreate that prompt.
  for (const salah of getLoggedToday()) {
    await cancelPostSalahForSalahNow(salah);
  }
}

async function schedulePostSalahPrompt(salah: SalahName, closeTime: Date): Promise<void> {
  if (closeTime <= new Date()) return;

  await Notifications.scheduleNotificationAsync({
    identifier: `post_salah_${salah}`,
    content: {
      title: `How was your ${SALAH_DISPLAY_NAMES[salah]}?`,
      body: 'Tap to reflect for a moment.',
      data: {
        type: 'post_salah',
        salah,
        // Isha's prompt arrives at midnight, after its calendar day has ended.
        // Preserve the date the prayer belongs to when the notification is tapped.
        logDay: salah === 'isha' ? 'yesterday' : 'today',
        scheduledFor: closeTime.getTime(),
        expiresAt: closeTime.getTime() + POST_SALAH_STALE_AFTER_MS,
      },
      sound: false,
      interruptionLevel: 'timeSensitive',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: closeTime,
    },
  });
}

/** Reschedule one post-Salah prompt without disturbing the others. */
export async function reschedulePostSalahPrompt(
  salah: SalahName,
  closeTime: Date,
): Promise<void> {
  return enqueuePostSalahOperation(async () => {
    await cancelPostSalahForSalahNow(salah);

    const today = toLocalDateKey(new Date());
    const alreadyLogged = db
      .select({ salahName: salahLogs.salahName })
      .from(salahLogs)
      .where(eq(salahLogs.logDate, today))
      .all()
      .some((row) => row.salahName === salah);
    if (alreadyLogged) return;

    await schedulePostSalahPrompt(salah, closeTime);
  });
}

export async function cancelPreSalahReminders(): Promise<void> {
  for (const salah of SALAH_NAMES) {
    await Notifications.cancelScheduledNotificationAsync(`pre_salah_${salah}`).catch(() => {});
  }
}

export function cancelPostSalahReminders(): Promise<void> {
  return enqueuePostSalahOperation(cancelPostSalahRemindersNow);
}

async function cancelPostSalahRemindersNow(): Promise<void> {
  for (const salah of SALAH_NAMES) {
    await Notifications.cancelScheduledNotificationAsync(`post_salah_${salah}`).catch(() => {});
  }
}

/** Call this right after the user successfully logs a Salah. */
export function cancelPostSalahForSalah(salah: SalahName): Promise<void> {
  return enqueuePostSalahOperation(() => cancelPostSalahForSalahNow(salah));
}

async function cancelPostSalahForSalahNow(salah: SalahName): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`post_salah_${salah}`).catch(() => {});
}

/** Remove prayer alerts that the OS delivered after their useful window. */
export async function dismissExpiredPrayerNotifications(): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter((notification) => isExpiredPrayerNotification(
          notification.request.content.data as Record<string, unknown> | undefined,
        ))
        .map((notification) => Notifications.dismissNotificationAsync(notification.request.identifier)),
    );
  } catch (error) {
    // Notification-centre cleanup is best effort and must never block startup.
    console.warn('[notifications] Could not dismiss expired prayer alerts:', error);
  }
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
    body = `You reflected on ${logCount} prayer${logCount === 1 ? '' : 's'} last week. Keep building the habit.`;
  } else {
    body = `You reflected on ${logCount} prayers last week. May Allah increase your khushu.`;
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
