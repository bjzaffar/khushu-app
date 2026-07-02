import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase/client';
import templates from '@/content/reminders/distraction_templates.json';
import type { PatternResult, DistractionKey, SalahName, ReminderType } from '@/types';

interface TemplateEntry { text: string; type: ReminderType; }

// ── Cache layer (expo-secure-store) ─────────────────────────────────────────

interface CachedReminder { text: string; timestamp: number; }

function cacheKey(customKey: string): string {
  return `ai_cache_${customKey}`;
}

export function getCachedReminder(customKey: string): string | null {
  const raw = SecureStore.getItem(cacheKey(customKey));
  if (!raw) return null;
  try {
    const cached: CachedReminder = JSON.parse(raw);
    return cached.text;
  } catch { return null; }
}

function setCachedReminder(customKey: string, reminder: string): void {
  SecureStore.setItem(cacheKey(customKey), JSON.stringify({
    text: reminder, timestamp: Date.now(),
  }));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── AI classification (fire-and-forget at log time) ────────────────────────

export async function classifyDistraction(
  text: string
): Promise<DistractionKey | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

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
    if (!res.ok) return null;
    const { category } = await res.json();
    return (category as DistractionKey | null) ?? null;
  } catch { return null; }
}

// ── AI reminder generation (fire-and-forget at log time) ───────────────────

export async function generateAIReminder(
  text: string,
  customKey: string,
  closestCategory: DistractionKey | null,
  prayerName: SalahName
): Promise<string | null> {
  const cached = getCachedReminder(customKey);
  if (cached) return cached;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const allDistractions = templates.distractions as Record<
      string,
      { llm_guidance: { theme: string; avoid: string; tone: string }; established: { text: string; type: string }[] }
    >;

    // Use 'random' guidance when category is null
    const guidanceKey = closestCategory ?? 'random';
    const guidance = allDistractions[guidanceKey]?.llm_guidance;
    if (!guidance) return null;

    // Gather established texts for the AI to build off of
    let establishedTexts: string[] = [];
    if (closestCategory) {
      // Classified as a specific category → feed only that category's established texts
      establishedTexts = (allDistractions[closestCategory]?.established ?? []).map((e) => e.text);
    } else {
      // Unclassified → feed ALL categories' established texts so AI can pick the best fit
      for (const cat of Object.values(allDistractions)) {
        for (const e of cat.established ?? []) {
          establishedTexts.push(e.text);
        }
      }
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
          text, closestCategory, prayerName, llmGuidance: guidance, establishedTexts,
        }),
      }
    );
    if (!res.ok) return null;
    const { reminder } = await res.json();
    if (typeof reminder === 'string' && reminder.length > 0) {
      setCachedReminder(customKey, reminder);
      return reminder;
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
 * custom key  → cached AI reminder (or cold_start fallback)
 */
export function getReminderContent(pattern: PatternResult): { text: string; type: ReminderType } {
  const coldPool = templates.cold_start as TemplateEntry[];

  if (pattern.phase === 'cold_start' || !pattern.topDistraction) {
    return pick(coldPool);
  }

  const topKey = pattern.topDistraction;

  // Custom key → use cached AI reminder
  if (topKey.startsWith('custom_')) {
    const cached = getCachedReminder(topKey);
    if (cached) return { text: cached, type: 'ai' };
    return pick(coldPool); // fallback if cache expired
  }

  // Built-in key → use template
  const allDistractions = templates.distractions as Record<string, { established: TemplateEntry[] }>;
  const entry = allDistractions[topKey];
  if (!entry) return pick(coldPool);
  return pick(entry.established);
}
