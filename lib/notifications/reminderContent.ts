import * as SecureStore from 'expo-secure-store';
import { eq } from 'drizzle-orm';
import { db } from '@/db/database';
import { settings } from '@/db/schema';
import { supabase } from '@/lib/supabase/client';
import templates from '@/content/reminders/distraction_templates.json';
import type { PatternResult, DistractionKey, SalahName, ReminderType } from '@/types';

interface TemplateEntry { text: string; type: ReminderType; }

// ── Cache layer (expo-secure-store) ─────────────────────────────────────────

export interface GeneratedReminder { text: string; type: ReminderType; }

interface CachedReminder extends GeneratedReminder { timestamp: number; }

function cacheKey(customKey: string): string {
  return `ai_cache_${customKey}`;
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
  await SecureStore.deleteItemAsync(key);
}

function setCachedReminder(customKey: string, reminder: GeneratedReminder): void {
  SecureStore.setItem(cacheKey(customKey), JSON.stringify({
    ...reminder, timestamp: Date.now(),
  }));
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
  return {
    text: `You've been struggling with "${label}". Take a deep breath and refocus on Allah before you begin.`,
    type: 'short',
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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
  const cached = getCachedReminder(customKey);
  if (cached) return cached;

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
          prayerName,
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
      const generated = { text: reminder, type: reminderType as ReminderType };
      setCachedReminder(customKey, generated);
      return generated;
    }
    return null;
  } catch { return null; }
}

// ── Reminder content selection ─────────────────────────────────────────────

/**
 * Returns the reminder text and its style type.
 * cold_start  → random short grounding reminder
 * emerging    → soft observational text for the top distraction
 * established → distraction → Divine Attribute reminder (random from pool)
 * custom key  → cached Premium AI reminder, or the same label-aware local
 *               fallback used for free users and when AI is unavailable
 */
export function getReminderContent(pattern: PatternResult): { text: string; type: ReminderType } {
  const coldPool = templates.cold_start as TemplateEntry[];

  if (pattern.phase === 'cold_start' || !pattern.topDistraction) {
    return pick(coldPool);
  }

  const topKey = pattern.topDistraction;

  // Free users never generate AI reminders. They, and Premium users whose
  // reminder is not cached yet, receive this same local fallback.
  if (topKey.startsWith('custom_')) {
    const cached = getCachedReminder(topKey);
    if (cached) return cached;
    return getCustomFallbackReminder(topKey);
  }

  // Built-in key → use template
  const allDistractions = templates.distractions as Record<string, { established: TemplateEntry[] }>;
  const entry = allDistractions[topKey];
  if (!entry) return pick(coldPool);
  return pick(entry.established);
}
