import * as SecureStore from 'expo-secure-store';
import { eq } from 'drizzle-orm';
import { db } from '@/db/database';
import { salahLogs, settings } from '@/db/schema';
import { supabase } from '@/lib/supabase/client';
import { selectIsPremium, useAppStore } from '@/store/appStore';
import templates from '@/content/reminders/distraction_templates.json';
import {
  SALAH_DISPLAY_NAMES,
  type PatternResult,
  type DistractionKey,
  type SalahName,
  type ReminderType,
} from '@/types';

interface TemplateEntry { text: string; type: ReminderType; }

interface ColdStartTemplateEntry { text: string; }

interface DistractionTemplates {
  established: TemplateEntry[];
}

// ── Cache layer (expo-secure-store) ─────────────────────────────────────────

export interface GeneratedReminder { text: string; type: ReminderType; }

/** A reminder shown to the user. Cold-start reminders intentionally have no
 * type because their content is not part of the personalised effectiveness data. */
export interface ReminderContent { text: string; type: ReminderType | null; }

interface CachedReminder extends GeneratedReminder { timestamp: number; }

export interface PendingAIReminderGeneration {
  customKey: string;
  text: string;
  prayerName: SalahName;
  closestCategory: DistractionKey | null;
}

const AI_REMINDER_QUEUE_KEY = 'pending_ai_reminder_generations';
const AI_REMINDER_CACHE_INDEX_KEY = 'ai_cache_index';
let isFlushingAIReminderQueue = false;

function cacheKey(customKey: string): string {
  return `ai_cache_${customKey}`;
}

function readCachedReminderKeys(): string[] {
  const raw = SecureStore.getItem(AI_REMINDER_CACHE_INDEX_KEY);
  if (!raw) return [];
  try {
    const keys = JSON.parse(raw) as unknown[];
    return Array.isArray(keys)
      ? keys.filter((key): key is string => typeof key === 'string' && key.startsWith('custom_'))
      : [];
  } catch {
    return [];
  }
}

function writeCachedReminderKeys(keys: Iterable<string>): void {
  SecureStore.setItem(AI_REMINDER_CACHE_INDEX_KEY, JSON.stringify([...new Set(keys)]));
}

function readPendingAIReminderGenerations(): PendingAIReminderGeneration[] {
  const row = db.select().from(settings).where(eq(settings.key, AI_REMINDER_QUEUE_KEY)).get();
  if (!row) return [];
  try {
    const queue = JSON.parse(row.value) as PendingAIReminderGeneration[];
    return Array.isArray(queue)
      ? queue.filter((item) =>
        typeof item?.customKey === 'string' &&
        typeof item.text === 'string' &&
        typeof item.prayerName === 'string' &&
        (item.closestCategory === null || typeof item.closestCategory === 'string')
      )
      : [];
  } catch {
    return [];
  }
}

function writePendingAIReminderGenerations(queue: PendingAIReminderGeneration[]): void {
  const value = JSON.stringify(queue);
  db.insert(settings)
    .values({ key: AI_REMINDER_QUEUE_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

/**
 * Save custom-reminder work locally before its network requests begin. Repeated
 * logs for the same custom distraction are coalesced into one latest request.
 */
export function queueAIReminderGeneration(item: PendingAIReminderGeneration): void {
  if (!selectIsPremium(useAppStore.getState())) return;
  const queue = readPendingAIReminderGenerations();
  const nextQueue = [
    ...queue.filter((entry) => entry.customKey !== item.customKey),
    item,
  ];
  writePendingAIReminderGenerations(nextQueue);
}

function removeQueuedAIReminderGeneration(customKey: string): void {
  const queue = readPendingAIReminderGenerations();
  const nextQueue = queue.filter((entry) => entry.customKey !== customKey);
  if (nextQueue.length !== queue.length) writePendingAIReminderGenerations(nextQueue);
}

/** Mark a queued item complete once its generated reminder is cached. */
export function completeAIReminderGeneration(customKey: string): void {
  removeQueuedAIReminderGeneration(customKey);
}

export function getCachedReminder(customKey: string): GeneratedReminder | null {
  const key = cacheKey(customKey);
  const raw = SecureStore.getItem(key);
  if (!raw) return null;
  try {
    const cached: CachedReminder = JSON.parse(raw);
    if (!cached.text || !['short', 'attribute', 'ayah', 'hadith'].includes(cached.type)) return null;
    if (
      cached.text.startsWith('You\'ve been logging "') &&
      cached.text.includes('Take a deep breath and refocus on Allah before you begin.')
    ) {
      return null;
    }
    return { text: cached.text, type: cached.type };
  } catch { return null; }
}

export async function clearCachedReminder(customKey: string): Promise<void> {
  const key = cacheKey(customKey);
  // Invalidate synchronously so an immediate reactivation/log cannot reuse text
  // generated for the old label while the secure-store deletion is pending.
  SecureStore.setItem(key, '');
  writeCachedReminderKeys(readCachedReminderKeys().filter((cachedKey) => cachedKey !== customKey));
  await SecureStore.deleteItemAsync(key);
}

/**
 * Remove every locally persisted AI reminder when Premium access is no longer
 * active. Custom keys are gathered from both label settings and historical
 * Salah logs so deleted distractions cannot retain an inaccessible cache.
 * Pending work is discarded as well, preventing a later reconnect from
 * recreating reminders queued while the user was Premium.
 */
export async function clearAllCachedAIReminders(): Promise<void> {
  const customKeys = new Set<string>(readCachedReminderKeys());
  const labelSettingKeys = [
    'custom_distractions',
    'custom_distraction_labels',
    'deleted_custom_distractions',
    'historical_custom_labels',
  ];

  for (const settingKey of labelSettingKeys) {
    const row = db.select().from(settings).where(eq(settings.key, settingKey)).get();
    if (!row) continue;
    try {
      const distractions = JSON.parse(row.value) as { key?: unknown }[];
      if (!Array.isArray(distractions)) continue;
      for (const distraction of distractions) {
        if (typeof distraction?.key === 'string' && distraction.key.startsWith('custom_')) {
          customKeys.add(distraction.key);
        }
      }
    } catch {
      // Other sources below can still identify caches if one setting is malformed.
    }
  }

  for (const item of readPendingAIReminderGenerations()) {
    if (item.customKey.startsWith('custom_')) customKeys.add(item.customKey);
  }

  for (const log of db.select({ distractions: salahLogs.distractions }).from(salahLogs).all()) {
    for (const key of (log.distractions ?? '').split(',')) {
      if (key.startsWith('custom_')) customKeys.add(key);
    }
  }

  writePendingAIReminderGenerations([]);
  await Promise.all([...customKeys].map(clearCachedReminder));
  SecureStore.setItem(AI_REMINDER_CACHE_INDEX_KEY, '[]');
  await SecureStore.deleteItemAsync(AI_REMINDER_CACHE_INDEX_KEY);
}

function setCachedReminder(customKey: string, reminder: GeneratedReminder): void {
  SecureStore.setItem(cacheKey(customKey), JSON.stringify({
    ...reminder, timestamp: Date.now(),
  }));
  writeCachedReminderKeys([...readCachedReminderKeys(), customKey]);
}

interface CustomDistraction { key: string; label: string; }

function getCustomDistractionLabel(customKey: string): string | null {
  const settingKeys = [
    'custom_distractions',
    'custom_distraction_labels',
    'deleted_custom_distractions',
    'historical_custom_labels',
  ];

  for (const settingKey of settingKeys) {
    const row = db.select().from(settings).where(eq(settings.key, settingKey)).get();
    if (!row) continue;
    try {
      const distractions = JSON.parse(row.value) as CustomDistraction[];
      const label = distractions.find((distraction) => distraction.key === customKey)?.label?.trim();
      if (label) return label;
    } catch {
      // Ignore malformed historical label data and use the safe generic fallback below.
    }
  }

  return null;
}

function getCustomFallbackReminder(customKey: string): GeneratedReminder {
  const label = getCustomDistractionLabel(customKey) ?? 'this distraction';
  const coldReminder = pick(templates.cold_start as ColdStartTemplateEntry[]);
  return {
    text: `You've been struggling with "${label}". ${coldReminder.text}`,
    type: 'short',
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickBaseReminder(closestCategory: DistractionKey | null): GeneratedReminder {
  const allDistractions = templates.distractions as Record<string, DistractionTemplates>;
  const category = closestCategory ?? 'random';
  const entries = allDistractions[category]?.established;

  // All classified categories currently have established templates. Keep a
  // safe short-reminder fallback if the configuration is ever incomplete.
  return entries?.length
    ? pick(entries)
    : { text: 'Take a deep breath. Who are you about to stand before?', type: 'short' };
}

// ── AI classification (fire-and-forget at log time) ────────────────────────

export async function classifyDistraction(
  text: string
): Promise<DistractionKey | null> {
  console.log(`[classify] Called with text="${text}"`);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.log(`[classify] No session — returning null`);
      return null;
    }

    const res = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/classify-distraction`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ text }),
      }
    );
    const body = await res.json();
    console.log(`[classify] status=${res.status} body=${JSON.stringify(body)}`);
    if (!res.ok) return null;
    const { category } = body;
    return (category as DistractionKey | null) ?? null;
  } catch (e) {
    console.log(`[classify] error: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// ── AI reminder generation (fire-and-forget at log time) ───────────────────

export async function generateAIReminder(
  text: string,
  customKey: string,
  closestCategory: DistractionKey | null,
  prayerName: SalahName
): Promise<GeneratedReminder | null> {
  console.log(`[generate] Called text="${text}" category=${closestCategory} prayer=${prayerName}`);
  if (!selectIsPremium(useAppStore.getState())) return null;

  // Every newly logged occurrence gets fresh AI copy. The existing cache stays
  // available to notifications until this request succeeds and replaces it.

  // Pick once from the classified category, so an AI-generated custom reminder
  // has the same style attribution as the curated reminder it is based on.
  const baseReminder = pickBaseReminder(closestCategory);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.log(`[generate] No session — returning null`);
      return null;
    }

    const res = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-reminder`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({
          text,
          closestCategory: closestCategory ?? 'random',
          prayerName: SALAH_DISPLAY_NAMES[prayerName],
          baseReminder: baseReminder.text,
          reminderType: baseReminder.type,
        }),
      }
    );
    const body = await res.json();
    console.log(`[generate] status=${res.status} body=${JSON.stringify(body).substring(0, 200)}`);
    if (!res.ok) return null;
    const { reminder, reminderType } = body;
    if (
      typeof reminder === 'string' &&
      reminder.length > 0 &&
      ['short', 'attribute', 'ayah', 'hadith'].includes(reminderType)
    ) {
      // The entitlement can expire while the network request is in flight.
      // Never repopulate a cache after the Free-state cleanup has run.
      if (!selectIsPremium(useAppStore.getState())) return null;
      const generated = { text: reminder, type: reminderType as ReminderType };
      setCachedReminder(customKey, generated);
      return generated;
    }
    return null;
  } catch { return null; }
}

/** Retry queued custom reminders after the device reconnects. */
export async function flushQueuedAIReminderGenerations(): Promise<void> {
  if (isFlushingAIReminderQueue) return;
  isFlushingAIReminderQueue = true;

  try {
    for (const item of readPendingAIReminderGenerations()) {
      if (!selectIsPremium(useAppStore.getState())) return;

      // Use a renamed label when available, rather than generating a reminder
      // for the old wording that was saved while offline.
      const text = getCustomDistractionLabel(item.customKey) ?? item.text;
      const category = item.closestCategory ?? await classifyDistraction(text);

      // Access may have changed while classification was in flight.
      if (!selectIsPremium(useAppStore.getState())) return;

      // Keep this and later entries for the next reconnect if classification is
      // still unavailable. In particular, do not substitute an unrelated
      // random-category reminder for an unclassified custom distraction.
      if (!category) break;

      queueAIReminderGeneration({ ...item, text, closestCategory: category });
      const generated = await generateAIReminder(text, item.customKey, category, item.prayerName);
      if (!generated) break;

      removeQueuedAIReminderGeneration(item.customKey);
    }
  } finally {
    isFlushingAIReminderQueue = false;
  }
}

// ── Reminder content selection ─────────────────────────────────────────────

/**
 * Returns the reminder text and its style type.
 * cold_start  → random grounding reminder with no tracked type
 * emerging    → soft observational text for the top distraction
 * established → distraction → Divine Attribute reminder (random from pool)
 * custom key  → cached Premium AI reminder, or the same label-aware local
 *               fallback used for free users and when AI is unavailable
 */
export function getReminderContent(pattern: PatternResult): ReminderContent {
  const coldPool = templates.cold_start as ColdStartTemplateEntry[];

  if (pattern.phase === 'cold_start' || !pattern.topDistraction) {
    return { ...pick(coldPool), type: null };
  }

  const topKey = pattern.topDistraction;

  // Free users never generate AI reminders. They, and Premium users whose
  // reminder is not cached yet, receive this same local fallback.
  if (topKey.startsWith('custom_')) {
    if (selectIsPremium(useAppStore.getState())) {
      const cached = getCachedReminder(topKey);
      if (cached) return cached;
    }
    return getCustomFallbackReminder(topKey);
  }

  // Built-in key → use template
  const allDistractions = templates.distractions as Record<string, { established: TemplateEntry[] }>;
  const entry = allDistractions[topKey];
  if (!entry) return { ...pick(coldPool), type: null };
  return pick(entry.established);
}
