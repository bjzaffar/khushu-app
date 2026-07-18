import { supabase } from './client';
import { db } from '@/db/database';
import { salahLogs, settings } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

const QUEUE_KEY = 'salah_logs_cloud_sync_queue';

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
  | { type: 'delete-all' };
type SyncQueue = Record<string, QueueOperation[]>;

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
    // A later re-log replaces an earlier queued version of the same prayer.
    queue[userId] = operations.filter((item) =>
      item.type !== 'upsert'
      || item.log.salahName !== operation.log.salahName
      || item.log.logDate !== operation.log.logDate,
    );
    queue[userId].push(operation);
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
    } else {
      await sendUpsert(userId, operation.log);
    }
    queue[userId] = operations.slice(index + 1);
    writeQueue(queue);
  }
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
export async function queueClassificationUpdate(log: CloudSalahLog, classifiedCategory: string): Promise<void> {
  await queueLogUpsert({ ...log, classifiedCategory });
}
