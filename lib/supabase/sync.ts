import { supabase } from './client';
import { db } from '@/db/database';
import { salahLogs, settings } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

const QUEUE_KEY = 'salah_logs_cloud_sync_queue';
const ARCHIVE_KEY = 'deleted_custom_distractions';
const ACTIVE_DISTRACTIONS_KEY = 'custom_distractions';
const HIDDEN_DISTRACTIONS_KEY = 'hidden_distractions';
const LABEL_REGISTRY_KEY = 'custom_distraction_labels';
const HISTORICAL_LABELS_KEY = 'historical_custom_labels';
const DISTRACTION_SETTINGS_QUEUE_KEY = 'distraction_archive_cloud_sync_queue';
const DISTRACTION_SETTINGS_VERSION = 2;

export type ArchivedDistraction = {
  key: string;
  label: string;
};

type DistractionSettingsSnapshot = {
  activeDistractions: ArchivedDistraction[];
  archivedDistractions: ArchivedDistraction[];
  hiddenDistractions: string[];
  customLabelRegistry: ArchivedDistraction[];
  historicalCustomLabels: ArchivedDistraction[];
};

export type CloudSalahLog = {
  salahName: string;
  focusRating: number;
  distractions: string;
  reflectionText?: string | null;
  loggedAt: number;
  logDate: string;
  fromSalahMode?: boolean | null;
  reminderType?: string | null;
  classifiedCategory?: string | null;
};

type QueueOperation =
  | { type: 'upsert'; log: CloudSalahLog }
  | { type: 'delete'; salahName: string; logDate: string }
  | { type: 'delete-all' };
type SyncQueue = Record<string, QueueOperation[]>;
type DistractionSettingsSyncQueue = Record<
  string,
  DistractionSettingsSnapshot | ArchivedDistraction[]
>;

function normalizeArchivedDistractions(value: unknown): ArchivedDistraction[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ArchivedDistraction =>
    typeof item === 'object'
    && item !== null
    && typeof (item as ArchivedDistraction).key === 'string'
    && typeof (item as ArchivedDistraction).label === 'string'
  );
}

function normalizeHiddenDistractions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function readQueue(): SyncQueue {
  const value = db.select().from(settings).where(eq(settings.key, QUEUE_KEY)).get()?.value;
  if (!value) return {};
  try { return JSON.parse(value) as SyncQueue; } catch { return {}; }
}

function writeQueue(queue: SyncQueue): void {
  const value = JSON.stringify(queue);
  db.insert(settings)
    .values({ key: QUEUE_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

function readDistractionSettingsQueue(): DistractionSettingsSyncQueue {
  const value = db.select().from(settings)
    .where(eq(settings.key, DISTRACTION_SETTINGS_QUEUE_KEY))
    .get()?.value;
  if (!value) return {};
  try { return JSON.parse(value) as DistractionSettingsSyncQueue; } catch { return {}; }
}

function writeDistractionSettingsQueue(queue: DistractionSettingsSyncQueue): void {
  const value = JSON.stringify(queue);
  db.insert(settings)
    .values({ key: DISTRACTION_SETTINGS_QUEUE_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

function readLocalSetting(key: string): unknown {
  const value = db.select().from(settings).where(eq(settings.key, key)).get()?.value;
  if (!value) return [];
  try { return JSON.parse(value); } catch { return []; }
}

function writeLocalSetting(key: string, settingValue: unknown): void {
  const value = JSON.stringify(settingValue);
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

function readLocalDistractionSettings(): DistractionSettingsSnapshot {
  return {
    activeDistractions: normalizeArchivedDistractions(readLocalSetting(ACTIVE_DISTRACTIONS_KEY)),
    archivedDistractions: normalizeArchivedDistractions(readLocalSetting(ARCHIVE_KEY)),
    hiddenDistractions: normalizeHiddenDistractions(readLocalSetting(HIDDEN_DISTRACTIONS_KEY)),
    customLabelRegistry: normalizeArchivedDistractions(readLocalSetting(LABEL_REGISTRY_KEY)),
    historicalCustomLabels: normalizeArchivedDistractions(readLocalSetting(HISTORICAL_LABELS_KEY)),
  };
}

function writeLocalDistractionSettings(snapshot: DistractionSettingsSnapshot): void {
  writeLocalSetting(ACTIVE_DISTRACTIONS_KEY, snapshot.activeDistractions);
  writeLocalSetting(ARCHIVE_KEY, snapshot.archivedDistractions);
  writeLocalSetting(HIDDEN_DISTRACTIONS_KEY, snapshot.hiddenDistractions);
  writeLocalSetting(LABEL_REGISTRY_KEY, snapshot.customLabelRegistry);
  writeLocalSetting(HISTORICAL_LABELS_KEY, snapshot.historicalCustomLabels);
}

function normalizeDistractionSettingsSnapshot(
  value: DistractionSettingsSnapshot | ArchivedDistraction[],
): DistractionSettingsSnapshot {
  // Version 1 queues contained only the archived array. Preserve it while
  // filling the newly synced fields from their current local values.
  if (Array.isArray(value)) {
    return {
      ...readLocalDistractionSettings(),
      archivedDistractions: normalizeArchivedDistractions(value),
    };
  }

  return {
    activeDistractions: normalizeArchivedDistractions(value.activeDistractions),
    archivedDistractions: normalizeArchivedDistractions(value.archivedDistractions),
    hiddenDistractions: normalizeHiddenDistractions(value.hiddenDistractions),
    customLabelRegistry: normalizeArchivedDistractions(value.customLabelRegistry),
    historicalCustomLabels: normalizeArchivedDistractions(value.historicalCustomLabels),
  };
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) return user.id;
  } catch {}
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

function queueForUser(userId: string, operation: QueueOperation): void {
  const queue = readQueue();
  const operations = queue[userId] ?? [];

  if (operation.type === 'delete-all') {
    queue[userId] = [operation];
  } else {
    const salahName = operation.type === 'upsert' ? operation.log.salahName : operation.salahName;
    const logDate = operation.type === 'upsert' ? operation.log.logDate : operation.logDate;

    // Keep only the latest intent for a given prayer/day. A delete-all already
    // covers a later single-log delete, unless that log was subsequently queued
    // for re-creation (which the filter above removes).
    queue[userId] = operations.filter((item) => {
      if (item.type === 'delete-all') return true;
      const itemSalahName = item.type === 'upsert' ? item.log.salahName : item.salahName;
      const itemLogDate = item.type === 'upsert' ? item.log.logDate : item.logDate;
      return itemSalahName !== salahName || itemLogDate !== logDate;
    });
    if (operation.type !== 'delete' || !queue[userId].some((item) => item.type === 'delete-all')) {
      queue[userId].push(operation);
    }
  }
  writeQueue(queue);
}

async function sendUpsert(userId: string, log: CloudSalahLog): Promise<void> {
  const { error } = await supabase.from('salah_logs').upsert({
    user_id: userId,
    salah_name: log.salahName,
    focus_rating: log.focusRating,
    distractions: log.distractions,
    reflection_text: log.reflectionText ?? '',
    logged_at: log.loggedAt,
    log_date: log.logDate,
    from_salah_mode: log.fromSalahMode ?? false,
    reminder_type: log.reminderType ?? null,
    classified_category: log.classifiedCategory ?? null,
  }, { onConflict: 'user_id,salah_name,log_date' });
  if (error) throw error;
}

/** Queue a signed-in user's save, then attempt to send it immediately. */
export async function queueLogUpsert(log: CloudSalahLog, overrideUserId?: string): Promise<void> {
  const userId = overrideUserId ?? await currentUserId();
  if (!userId) return;
  queueForUser(userId, { type: 'upsert', log });
  await flushLogSyncQueue(userId);
}

/** Delete one local log and durably mirror that deletion to the signed-in user's cloud history. */
export async function deleteLogEverywhere(
  salahName: string,
  logDate: string,
  overrideUserId?: string,
): Promise<void> {
  db.delete(salahLogs)
    .where(and(eq(salahLogs.salahName, salahName), eq(salahLogs.logDate, logDate)))
    .run();

  const userId = overrideUserId ?? await currentUserId();
  if (!userId) return; // Guests intentionally remain local-only.
  queueForUser(userId, { type: 'delete', salahName, logDate });
  await flushLogSyncQueue(userId);
}

/** Clear local history and queue deletion of the signed-in user's cloud history. */
export async function clearLogsEverywhere(): Promise<void> {
  db.delete(salahLogs).run();
  const userId = await currentUserId();
  if (!userId) return; // Guests intentionally remain local-only.
  queueForUser(userId, { type: 'delete-all' });
  await flushLogSyncQueue(userId);
}

/** Retry queued operations for the currently authenticated user. */
export async function flushLogSyncQueue(overrideUserId?: string): Promise<void> {
  const userId = overrideUserId ?? await currentUserId();
  if (!userId) return;
  const queue = readQueue();
  const operations = queue[userId] ?? [];

  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    if (operation.type === 'delete-all') {
      const { error } = await supabase.from('salah_logs').delete().eq('user_id', userId);
      if (error) throw error;
    } else if (operation.type === 'delete') {
      const { error } = await supabase
        .from('salah_logs')
        .delete()
        .eq('user_id', userId)
        .eq('salah_name', operation.salahName)
        .eq('log_date', operation.logDate);
      if (error) throw error;
    } else {
      await sendUpsert(userId, operation.log);
    }
    queue[userId] = operations.slice(index + 1);
    writeQueue(queue);
  }
}

async function sendDistractionSettingsUpsert(
  userId: string,
  snapshot: DistractionSettingsSnapshot,
): Promise<void> {
  const { error } = await supabase.from('user_distraction_archives').upsert({
    user_id: userId,
    distractions: snapshot.archivedDistractions,
    active_distractions: snapshot.activeDistractions,
    hidden_distractions: snapshot.hiddenDistractions,
    custom_label_registry: snapshot.customLabelRegistry,
    historical_custom_labels: snapshot.historicalCustomLabels,
    settings_version: DISTRACTION_SETTINGS_VERSION,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

/** Queue all distraction preferences and mirror them to the signed-in user's cloud record. */
export async function queueDistractionSettingsSync(overrideUserId?: string): Promise<void> {
  const userId = overrideUserId ?? await currentUserId();
  if (!userId) return;

  const queue = readDistractionSettingsQueue();
  queue[userId] = readLocalDistractionSettings();
  writeDistractionSettingsQueue(queue);
  await flushDistractionSettingsSync(userId);
}

/** Retry the latest queued distraction preferences for the authenticated user. */
export async function flushDistractionSettingsSync(overrideUserId?: string): Promise<void> {
  const userId = overrideUserId ?? await currentUserId();
  if (!userId) return;

  const queue = readDistractionSettingsQueue();
  if (!Object.prototype.hasOwnProperty.call(queue, userId)) return;

  await sendDistractionSettingsUpsert(
    userId,
    normalizeDistractionSettingsSnapshot(queue[userId]),
  );

  delete queue[userId];
  writeDistractionSettingsQueue(queue);
}

async function syncDistractionSettingsFromCloud(userId: string): Promise<void> {
  await flushDistractionSettingsSync(userId);

  const { data, error } = await supabase
    .from('user_distraction_archives')
    .select(`
      distractions,
      active_distractions,
      hidden_distractions,
      custom_label_registry,
      historical_custom_labels,
      settings_version
    `)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;

  if (data) {
    const localSettings = readLocalDistractionSettings();
    const snapshot: DistractionSettingsSnapshot = data.settings_version >= DISTRACTION_SETTINGS_VERSION
      ? {
          activeDistractions: normalizeArchivedDistractions(data.active_distractions),
          archivedDistractions: normalizeArchivedDistractions(data.distractions),
          hiddenDistractions: normalizeHiddenDistractions(data.hidden_distractions),
          customLabelRegistry: normalizeArchivedDistractions(data.custom_label_registry),
          historicalCustomLabels: normalizeArchivedDistractions(data.historical_custom_labels),
        }
      : {
          // Upgrade archive-only records without losing settings already stored
          // on the user's device before full preference sync was introduced.
          ...localSettings,
          archivedDistractions: normalizeArchivedDistractions(data.distractions),
        };

    writeLocalDistractionSettings(snapshot);
    if (data.settings_version < DISTRACTION_SETTINGS_VERSION) {
      await sendDistractionSettingsUpsert(userId, snapshot);
    }
    return;
  }

  // First sync: seed the cloud from all distraction settings already on-device.
  await sendDistractionSettingsUpsert(userId, readLocalDistractionSettings());
}

/**
 * Refresh the signed-in user's SQLite cache from Supabase. Guest sessions do
 * not call this function, so their device-only history is never touched.
 */
export async function syncLogsFromCloud(overrideUserId?: string): Promise<void> {
  const userId = overrideUserId ?? await currentUserId();
  if (!userId) return;

  // Send local offline work first; only then make the local cache mirror cloud.
  await flushLogSyncQueue(userId);
  try {
    await syncDistractionSettingsFromCloud(userId);
  } catch (error) {
    // Preference sync should never prevent the user's core Salah history from loading.
    console.warn('[supabase] distraction settings sync failed:', error);
  }
  const { data: rows, error } = await supabase
    .from('salah_logs')
    .select('salah_name, focus_rating, distractions, reflection_text, logged_at, log_date, from_salah_mode, reminder_type, classified_category')
    .eq('user_id', userId)
    .order('logged_at', { ascending: true });
  if (error) throw error;

  db.delete(salahLogs).run();
  for (const row of rows ?? []) {
    db.insert(salahLogs).values({
      salahName: row.salah_name,
      focusRating: row.focus_rating,
      distractions: row.distractions ?? '',
      reflectionText: row.reflection_text ?? '',
      loggedAt: row.logged_at,
      logDate: row.log_date,
      fromSalahMode: row.from_salah_mode ?? false,
      reminderType: row.reminder_type,
      classifiedCategory: row.classified_category,
    }).run();
  }
}

/** Queue the asynchronous classification update using the same durable path. */
export async function queueClassificationUpdate(
  log: CloudSalahLog,
  classifiedCategory: string,
  overrideUserId?: string,
): Promise<void> {
  // Classification is asynchronous. Do not let a late result recreate a log
  // the user deleted while classification was still running.
  const localLog = db.select({ id: salahLogs.id })
    .from(salahLogs)
    .where(and(
      eq(salahLogs.salahName, log.salahName),
      eq(salahLogs.logDate, log.logDate),
      eq(salahLogs.loggedAt, log.loggedAt),
    ))
    .get();
  if (!localLog) return;

  await queueLogUpsert({ ...log, classifiedCategory }, overrideUserId);
}
