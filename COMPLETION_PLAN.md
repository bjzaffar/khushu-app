# Khushu AI — Completion Plan

> Living document. Last updated: 2026-07-02.

---

## Current Status

The app is **feature-complete for core free-tier functionality**. All 8 screens, local database, prayer calculation, pattern engine, notification system, insights dashboard, and cloud sync are implemented and working.

**What's missing:** AI-powered premium reminders, home screen widget, monetization (IAP), testing, and production build configuration.

---

## Stage 1: AI-Powered Distraction Classification & Personalized Reminders (Premium Feature)

**Priority:** Medium — differentiator for premium tier
**Effort:** Large
**Depends on:** Supabase Edge Functions

### Goal

When a premium user logs a custom distraction, use AI to classify it into one of the existing template categories and generate a personalized reminder. Custom distractions are **independent, first-class categories** — they count in pattern detection on their own, can become `topDistraction`, and do NOT merge into the pattern of their classified category. `classifiedCategory` is stored as metadata only.

### Core Design Principle

Custom distractions (`custom_<timestamp>` keys) behave identically to built-in categories:

- **Pattern detection:** Custom keys are counted independently. A custom distraction can become `topDistraction`.
- **Insights:** Custom distractions display with their user-given labels. They are NOT grouped under their classified category.
- **Notifications:** When a custom key becomes `topDistraction`, the notification uses the cached AI reminder (generated at log time). No API call at notification time.
- **Classification metadata:** `classifiedCategory` is stored but NOT used for pattern detection, insights, or notification selection. It exists for potential future use (e.g., "similar to Work" in insights).

### How it works

1. User logs a custom distraction (free text, e.g. "thinking about food", key: `custom_1719900000000`)
2. At log time (fire-and-forget, doesn't block save):
   a. AI classifies it → `classifiedCategory` stored as metadata
   b. AI generates a personalized reminder → cached locally under the custom key (24h TTL)
3. Pattern engine counts custom keys as independent categories alongside built-in keys
4. If a custom key becomes `topDistraction`, `reminderContent.ts` reads the cached AI reminder
5. If no cache exists (expired or generation failed), falls back to `cold_start` templates

### Architecture

```
User logs custom distraction "thinking about food"
  → log.tsx handleSave()
    → classifyDistraction("thinking about food")        [fire-and-forget]
      → POST Supabase Edge Function "classify-distraction"
        → Claude Haiku returns "random"
      → Store classifiedCategory = "random" (metadata only)
    → generateAIReminder("thinking about food", "custom_1719...", "random", "fajr")
      → POST Supabase Edge Function "generate-reminder"
        → Claude Haiku returns personalized reminder text
      → Cache: SecureStore["ai_cache_custom_1719..."] = { text, timestamp }

...time passes...

Pre-Salah notification fires for Fajr
  → notificationService calls getReminderContent(pattern)
    → pattern.topDistraction = "custom_1719..."  (it became top!)
    → topKey.startsWith('custom_') → true
    → getCachedReminder("custom_1719...") → cached text
    → Returns { text: "...", type: 'ai' }
```

### Implementation Details

#### 1. Supabase Edge Function — `classify-distraction`

**Purpose:** Classify free-text distraction into one of 7 built-in categories. Lightweight — small prompt, short response, minimal token cost.

**Request:** `{ "text": "thinking about food" }`
**Response:** `{ "category": "random" }` or `{ "category": null }`

**Full prompt:**
```
You are a distraction classifier for a Muslim prayer focus app.

The user logged this distraction before salah:
"{text}"

Classify it into EXACTLY one of these categories:
- work (job tasks, deadlines, work emails, colleagues)
- financial (money, bills, debt, provision, rizq)
- anxiety (future worry, fear, uncertainty, what-ifs)
- tired (fatigue, sleepiness, low energy)
- guilt (past sins, regret, remorse)
- rushing (hurry, running late, time pressure)
- random (wandering mind, unrelated thoughts, daydreaming)

Return ONLY the category key as a single word. If the text does not clearly fit any category, return nothing.
```

**Config:**
- Model: `claude-3-5-haiku-20241022` (cheapest, fastest)
- Max tokens: 10
- Temperature: 0 (deterministic)
- Auth: Verify Supabase JWT from `Authorization` header, use `SUPABASE_SERVICE_ROLE_KEY` for internal operations

**Edge Function skeleton:**
```typescript
// supabase/functions/classify-distraction/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.length > 200) {
      return new Response(JSON.stringify({ error: "text is required and must be under 200 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit check
    if (isRateLimited(user.id)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 10,
        temperature: 0,
        messages: [{ role: "user", content: /* prompt above */ }],
      }),
    });

    const data = await response.json();
    const raw = (data.content?.[0]?.text ?? "").trim().toLowerCase();
    const validKeys = ["work", "financial", "anxiety", "tired", "guilt", "rushing", "random"];
    const category = validKeys.includes(raw) ? raw : null;

    return new Response(JSON.stringify({ category }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

#### 2. Supabase Edge Function — `generate-reminder`

**Purpose:** Generate a personalized reminder for custom distractions. Called at log time, result cached for notification time.

**Request:**
```json
{
  "text": "my cat is sick",
  "closestCategory": "anxiety",
  "prayerName": "fajr",
  "llmGuidance": {
    "theme": "Allah as the direct answer to fear of the unknown",
    "avoid": "telling them anxiety is irrational, minimising their fears",
    "tone": "calming, direct, making Allah the shelter not just a concept"
  }
}
```

**Response:** `{ "reminder": "Your cat's wellbeing is in the hands of Al-Hafeez..." }`

**Full prompt:**
```
You write pre-salah reminder notifications for a Muslim prayer focus app.

The user is about to pray {prayerName}. Their specific distraction:
"{text}"

Closest category: {closestCategory}
Theme: {llmGuidance.theme}
Tone: {llmGuidance.tone}
Avoid: {llmGuidance.avoid}

Write ONE sentence (max 25 words) that:
1. Names the specific distraction briefly
2. Connects it to a relevant Divine Attribute or the theme
3. Gently redirects attention to the prayer
4. Matches the tone and avoids what's listed

Return ONLY the reminder text, no quotes or formatting.
```

**Config:**
- Model: `claude-3-5-haiku-20241022` (short generation, still cheap)
- Max tokens: 60
- Temperature: 0.7 (slight creativity for variety)
- Auth: Same as classification function

**Edge Function skeleton:**
```typescript
// supabase/functions/generate-reminder/index.ts
// Same auth/CORS structure as classify-distraction
// Body: { text, closestCategory, prayerName, llmGuidance }
// Calls Claude API with the prompt above
// Returns { reminder: string }
```

#### 3. `types/index.ts` — Type Changes

```typescript
// line 35 — add 'ai' to ReminderType:
export type ReminderType = 'short' | 'attribute' | 'ayah' | 'hadith' | 'ai';

// lines 37-42 — add label:
export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  short:     'Brief grounding',
  attribute: 'Divine Attribute',
  ayah:      'Quranic verse',
  hadith:    'Hadith',
  ai:        'AI Personalized',
};

// line 49 — widen topDistraction to accept custom keys:
export interface PatternResult {
  phase: ReminderPhase;
  topDistraction: string | null;  // was DistractionKey | null
  frequency: number;
  logCount: number;
  totalLogs: number;
}
```

#### 4. `lib/patterns/patternEngine.ts` — Accept Custom Keys

```typescript
// line 49 — widen counts type:
const counts: Record<string, number> = {};  // was Partial<Record<DistractionKey, number>>

// lines 51, 60 — remove 'as DistractionKey[]' cast:
const keys = (log.distractions ?? '').split(',').filter(Boolean);
// ...
for (const [key, n] of Object.entries(counts)) {
```

Everything else in the pattern engine works as-is — it splits the CSV, counts each key, and picks the max. Custom keys like `custom_1719900000000` will be counted and can become `topDistraction`.

#### 5. `lib/notifications/reminderContent.ts` — Cache + AI Paths

**New cache layer** (uses `expo-secure-store`):

```typescript
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase/client';
import type { DistractionKey, SalahName } from '@/types';

interface CachedReminder { text: string; timestamp: number; }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheKey(customKey: string): string {
  return `ai_cache_${customKey}`;
}

function getCachedReminder(customKey: string): string | null {
  const raw = SecureStore.getItem(cacheKey(customKey));
  if (!raw) return null;
  try {
    const cached: CachedReminder = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      SecureStore.deleteItem(cacheKey(customKey));
      return null;
    }
    return cached.text;
  } catch { return null; }
}

function setCachedReminder(customKey: string, reminder: string): void {
  SecureStore.setItem(cacheKey(customKey), JSON.stringify({
    text: reminder, timestamp: Date.now(),
  }));
}
```

**New exports:**

```typescript
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
    return category as DistractionKey | null;
  } catch { return null; }
}

export async function generateAIReminder(
  text: string,
  customKey: string,
  closestCategory: DistractionKey,
  prayerName: SalahName
): Promise<string | null> {
  const cached = getCachedReminder(customKey);
  if (cached) return cached;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const allDistractions = templates.distractions as Record<
      string,
      { llm_guidance: { theme: string; avoid: string; tone: string } }
    >;
    const guidance = allDistractions[closestCategory]?.llm_guidance;
    if (!guidance) return null;

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
          text, closestCategory, prayerName, llmGuidance: guidance,
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
```

**Modified `getReminderContent()`:**

```typescript
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
```

#### 6. `app/(tabs)/log.tsx` — `handleSave()` Modification

Insert classification + caching after DB insert. **Fire-and-forget** — does not block the save.

```typescript
async function handleSave() {
  if (focusRating === 0 || selectedDistractions.length === 0) return;
  const now = new Date();

  const pendingKey = `pending_reminder_type_${selectedSalah}`;
  const pendingRow = db.select().from(settings).where(eq(settings.key, pendingKey)).get();
  const reminderType = pendingRow?.value ?? null;

  await db.insert(salahLogs).values({
    salahName: selectedSalah,
    focusRating,
    distractions: selectedDistractions.join(','),
    loggedAt: now.getTime(),
    logDate: now.toISOString().split('T')[0],
    fromSalahMode: params.fromSalahMode === '1',
    reminderType,
  });

  if (pendingRow) {
    db.delete(settings).where(eq(settings.key, pendingKey)).run();
  }

  // ── AI for custom distractions (premium only, fire-and-forget) ───────
  if (isPremium) {
    const customEntries = selectedDistractions
      .filter((k) => k.startsWith('custom_'))
      .map((key) => ({
        key,
        label: customDistractions.find((d) => d.key === key)?.label ?? key,
      }));

    if (customEntries.length > 0) {
      (async () => {
        for (const { key, label } of customEntries) {
          // Classify (metadata only — doesn't affect pattern/insights)
          const category = await classifyDistraction(label);
          if (category) {
            db.update(salahLogs)
              .set({ classifiedCategory: category })
              .where(eq(salahLogs.loggedAt, now.getTime()))
              .run();
          }

          // Generate + cache AI reminder for when this key becomes topDistraction
          const closestCategory = category ?? 'random';
          await generateAIReminder(label, key, closestCategory, selectedSalah);
        }
      })();
    }
  }

  // Cloud sync (fire-and-forget)
  if (userId) {
    supabase.from('salah_logs').insert({
      user_id: userId,
      salah_name: selectedSalah,
      focus_rating: focusRating,
      distractions: selectedDistractions.join(','),
      logged_at: now.getTime(),
      log_date: now.toISOString().split('T')[0],
      from_salah_mode: params.fromSalahMode === '1',
      reminder_type: reminderType,
    }).then(({ error }) => {
      if (error) console.warn('[sync] salah_logs insert failed:', error.message);
    });
  }

  await cancelPostSalahForSalah(selectedSalah);
  await cancelReEngagementNotification();
  setSavedSalahName(selectedSalah);
  setSaved(true);
}
```

**Imports to add to log.tsx:**
```typescript
import { classifyDistraction, generateAIReminder } from '@/lib/notifications/reminderContent';
```

**TextInput change (add `maxLength` and slice guard):**
```tsx
<TextInput
  value={otherInputText}
  onChangeText={(t) => setOtherInputText(t.slice(0, 100))}
  maxLength={100}
  placeholder="e.g. Hunger, Noise…"
  // ... rest unchanged
/>
```

**`handleAddCustomDistraction()` — add hard cap:**
```typescript
function handleAddCustomDistraction() {
  const label = otherInputText.trim().slice(0, 100);
  if (!label) return;
  // ... rest unchanged
}
```

#### 7. `lib/supabase/sync.ts` — Add `classified_category`

```typescript
// line 16 — add to select:
.select('salah_name, focus_rating, distractions, logged_at, log_date, from_salah_mode, reminder_type, classified_category')

// line 32-40 — add to insert:
db.insert(salahLogs).values({
  salahName: row.salah_name,
  focusRating: row.focus_rating,
  distractions: row.distractions ?? '',
  loggedAt: row.logged_at,
  logDate: row.log_date,
  fromSalahMode: row.from_salah_mode ?? false,
  reminderType: row.reminder_type,
  classifiedCategory: row.classified_category,
}).run();
```

#### 8. `lib/notifications/notificationService.ts` — No Changes Needed

The notification service calls `getReminderContent(pattern)` which now handles custom keys internally. When a custom key is `topDistraction`, the function checks the cache and returns `{ text, type: 'ai' }`. The pending type save (lines 57-60) stores whatever `reminderType` is returned, so `'ai'` flows through automatically.

### Cache Strategy

| Aspect | Detail |
|---|---|
| **Storage** | `expo-secure-store` (already a dependency) |
| **Key** | `ai_cache_{customKey}` (e.g., `ai_cache_custom_1719900000000`) |
| **Value** | JSON: `{ "text": "reminder text", "timestamp": 1234567890 }` |
| **TTL** | 24 hours. Expired entries deleted on read. |
| **Write** | After `generateAIReminder()` returns successfully (at log time) |
| **Read** | In `getReminderContent()` when `topDistraction` starts with `custom_` |
| **Why secure-store** | Already used by Supabase auth. Simple key-value. No new dependencies. |

### Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Network failure on classification | Log saved. Next time same custom distraction is logged, classification retries. No user-facing error. |
| Edge Function returns unexpected JSON | Parse defensively. Invalid/empty → `null` (treated as unclassified). |
| User not authenticated | Classification requires auth. No session → skip silently. |
| Cache expired before notification fires | `getReminderContent()` falls back to `cold_start` templates. |
| Multiple custom distractions in one log | Each classified independently. `classifiedCategory` stores the first one's classification (single column). Cache stores a reminder for each custom key. |
| Claude API rate limiting | Haiku has generous limits. At launch scale (~10-100 users), not a concern. Add rate limiter on Edge Function if needed later. |
| `classifiedCategory` column already exists | Schema migration already in `db/database.ts` line 34. No new migration needed. |

### Abuse Prevention & Cost Protection

Three layers prevent a user from typing malicious/extremely long text to inflate API costs:

#### Layer 1: Client-side (log.tsx)

**TextInput `maxLength`:** Cap the input at 100 characters. This is the primary gate — a distraction label like "thinking about food" is naturally short. 100 chars covers generous descriptions.

```tsx
<TextInput
  value={otherInputText}
  onChangeText={(t) => setOtherInputText(t.slice(0, 100))}
  maxLength={100}
  placeholder="e.g. Hunger, Noise…"
  // ...
/>
```

**Guard in `handleAddCustomDistraction()`:**

```typescript
function handleAddCustomDistraction() {
  const label = otherInputText.trim().slice(0, 100); // hard cap
  if (!label) return;
  // ... rest unchanged
}
```

#### Layer 2: Server-side (Edge Functions)

Both Edge Functions validate input length **before** calling Claude. Reject with 400 if too long.

```typescript
// At the top of both Edge Functions, after parsing body:
const { text } = await req.json();
if (!text || typeof text !== "string" || text.length > 200) {
  return new Response(
    JSON.stringify({ error: "text is required and must be under 200 characters" }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

200 chars is the server-side limit (2× the client limit) — a safety margin for edge cases, while still keeping token costs negligible.

#### Layer 3: Per-user Rate Limiting (Edge Functions)

Cap API calls per user to prevent abuse. Use a simple in-memory sliding window (resets on Edge Function cold start, which is fine for abuse prevention — not security-critical).

```typescript
// Per-Edge-Function, at module scope:
const rateLimits = new Map<string, number[]>(); // userId → timestamps
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 30; // 30 calls per hour per user

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimits.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) return true;
  recent.push(now);
  rateLimits.set(userId, recent);
  return false;
}

// In the handler, after auth:
if (isRateLimited(user.id)) {
  return new Response(
    JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

**Why in-memory is acceptable:** Edge Functions run on Deno Deploy with automatic scaling. Each instance has its own memory, so the limit is per-instance, not global. This is intentional — it prevents runaway costs from a single user while allowing legitimate use across instances. At MVP scale, this is sufficient. If needed later, replace with a Supabase `rate_limits` table for a global limit.

#### Cost Analysis With Limits

| Constraint | Value |
|---|---|
| Client max input | 100 chars |
| Server max input | 200 chars |
| Max per user per hour | 30 calls |
| Claude Haiku input cost | $0.25 / 1M tokens (~750 tokens per 200 chars) |
| **Worst-case cost per user per hour** | 30 × $0.0002 = **$0.006** |
| **Worst-case cost per 100 users per hour** | **$0.60** |
| **Monthly cap (100 users, 24h active)** | **~$430** (theoretical max; real usage is ~$6) |

In practice, most users will log 1-5 custom distractions per day, not 30 per hour. The real cost remains ~$6/month for 100 users.

### Deleted Custom Distractions — Archive & Reactivation

#### Problem

When a user deletes a custom distraction, it's removed from the `custom_distractions` setting. But past log entries in `salahLogs` still reference the `custom_*` key. The insights page resolves labels via `customLabelMap` (line 650 of `insights.tsx`), which only reads active custom distractions. The fallback is the raw key string — so deleted distractions display as `custom_1719900000000` in insights and per-salah breakdowns.

#### Solution: Archive Deleted Labels

Store deleted custom distractions in a separate `deleted_custom_distractions` setting. This preserves labels for historical display without polluting the active list.

**Settings keys:**
| Key | Value | Purpose |
|---|---|---|
| `custom_distractions` | `[{ key, label }, ...]` | Active custom distractions (shown in chip list) |
| `deleted_custom_distractions` | `[{ key, label }, ...]` | Archived labels (used by insights for historical display) |

#### How it works

**On delete (log.tsx `handleDeleteCustom`):**
1. Remove from `custom_distractions` (existing behavior)
2. Append to `deleted_custom_distractions` (new)

**On insights render (insights.tsx):**
1. Build `customLabelMap` from `custom_distractions` (existing)
2. Build `deletedLabelMap` from `deleted_custom_distractions` (new)
3. Resolve label: `DISTRACTION_LABELS[key] ?? customLabelMap[key] ?? deletedLabelMap[key] ?? "Deleted distraction"`

**On reactivation (log.tsx):**
1. New "Reactivate" section in edit mode shows archived distractions
2. User taps one → moves from `deleted_custom_distractions` back to `custom_distractions`
3. Key is preserved, so existing logs now resolve to the restored label

#### Implementation

**`app/(tabs)/log.tsx` — `handleDeleteCustom()`:**

```typescript
function handleDeleteCustom(key: string) {
  // Remove from active list
  const deleted = customDistractions.find((d) => d.key === key);
  const newList = customDistractions.filter((d) => d.key !== key);
  setCustomDistractions(newList);
  saveSettingJSON('custom_distractions', newList);
  setSelectedDistractions((prev) => prev.filter((k) => k !== key));

  // Archive the label
  if (deleted) {
    const archive = getSettingJSON('deleted_custom_distractions') as { key: string; label: string }[];
    archive.push({ key: deleted.key, label: deleted.label });
    saveSettingJSON('deleted_custom_distractions', archive);
  }
}
```

**New: `getSettingJSON()` helper** (extract from existing inline logic):
```typescript
function getSettingJSON(key: string): unknown[] {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return [];
  try { return JSON.parse(row.value); } catch { return []; }
}
```

**New: `handleReactivate(key)` in log.tsx:**
```typescript
function handleReactivate(key: string) {
  const archive = getSettingJSON('deleted_custom_distractions') as { key: string; label: string }[];
  const found = archive.find((d) => d.key === key);
  if (!found) return;

  // Move from archive to active
  const newActive = [...customDistractions, found];
  setCustomDistractions(newActive);
  saveSettingJSON('custom_distractions', newActive);

  const newArchive = archive.filter((d) => d.key !== key);
  saveSettingJSON('deleted_custom_distractions', newArchive);
}
```

**UI: Reactivation section in edit mode** (log.tsx, after custom chips in edit mode):
```tsx
{editMode && (() => {
  const archive = getSettingJSON('deleted_custom_distractions') as { key: string; label: string }[];
  if (archive.length === 0) return null;
  return (
    <View className="mt-3">
      <Text className="text-xs text-ink-300 mb-2">Deleted — tap to reactivate:</Text>
      <View className="flex-row flex-wrap gap-2">
        {archive.map(({ key, label }) => (
          <Pressable
            key={key}
            onPress={() => handleReactivate(key)}
            className="py-2 px-3 rounded-xl bg-sand-100 border border-dashed border-sand-300 flex-row items-center"
          >
            <Text className="text-ink-400 text-sm">{label}</Text>
            <Text className="text-sage-600 text-xs ml-1.5">↻</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
})()}
```

**`app/(tabs)/insights.tsx` — Label resolution (lines 632-650):**

```typescript
// Build active label map (existing)
const customLabelMap: Record<string, string> = {};
const customRow = db.select().from(settings).where(eq(settings.key, 'custom_distractions')).get();
if (customRow) {
  try {
    const list = JSON.parse(customRow.value) as { key: string; label: string }[];
    for (const d of list) customLabelMap[d.key] = d.label;
  } catch {}
}

// Build deleted label map (new)
const deletedLabelMap: Record<string, string> = {};
const deletedRow = db.select().from(settings).where(eq(settings.key, 'deleted_custom_distractions')).get();
if (deletedRow) {
  try {
    const list = JSON.parse(deletedRow.value) as { key: string; label: string }[];
    for (const d of list) deletedLabelMap[d.key] = d.label;
  } catch {}
}

// Updated label resolution chain (line 650):
label: DISTRACTION_LABELS[key as DistractionKey]
  ?? customLabelMap[key]
  ?? deletedLabelMap[key]
  ?? 'Deleted distraction',
```

Same change in `computeSalahInsights()` — pass `deletedLabelMap` alongside `customLabelMap`, update the resolution chain at line 191.

#### Pattern Engine Impact

Deleted custom distractions continue to work in pattern detection — the `distractions` column still contains the `custom_*` key, and the pattern engine counts all keys (including `custom_*`) as independent categories. No changes needed to `patternEngine.ts`.

#### Edge Function Impact

Classification and generation Edge Functions are unaffected — they operate on the distraction text at log time, before any deletion happens.

#### Files Summary (Updated)

| File | Action | What Changes |
|---|---|---|
| `app/(tabs)/log.tsx` | MODIFY | `handleDeleteCustom()` archives label. New `handleReactivate()`. New reactivation UI in edit mode. Add `getSettingJSON()` helper. |
| `app/(tabs)/insights.tsx` | MODIFY | Build `deletedLabelMap`. Update label resolution chain in both global and per-salah sections. |

### Cost Estimation

| Operation | Tokens | Cost per call |
|---|---|---|
| Classification (Haiku) | ~100 in + 1 out | ~$0.0001 |
| Generation (Haiku) | ~200 in + 30 out | ~$0.0002 |
| **10 custom distractions/day** | | **~$0.002/day (~$0.06/month)** |
| **100 users × 10 distractions** | | **~$0.20/day (~$6/month)** |

### Setup Steps (Manual — One-Time)

1. Install Supabase CLI: `npm i -g supabase`
2. Initialize: `supabase init` (creates `supabase/` directory)
3. Link to project: `supabase link --project-ref nlxerxxchinetzxjbmju`
4. Set Anthropic API key as secret: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`
5. Deploy functions: `supabase functions deploy classify-distraction` and `supabase functions deploy generate-reminder`
6. Test: `supabase functions invoke classify-distraction --body '{"text":"thinking about work deadlines"}'`

### Implementation Order

1. `types/index.ts` — Add `'ai'` to `ReminderType`, widen `topDistraction` to `string | null`
2. `lib/patterns/patternEngine.ts` — Widen `counts` type to `Record<string, number>`
3. `supabase/functions/classify-distraction/index.ts` — Create Edge Function
4. `supabase/functions/generate-reminder/index.ts` — Create Edge Function
5. `lib/notifications/reminderContent.ts` — Add cache layer, `classifyDistraction()`, `generateAIReminder()`, update `getReminderContent()`
6. `app/(tabs)/log.tsx` — Wire classification + caching into `handleSave()`. Add `handleDeleteCustom()` archive logic, `handleReactivate()`, reactivation UI, `getSettingJSON()` helper. Add `maxLength` to TextInput.
7. `app/(tabs)/insights.tsx` — Build `deletedLabelMap`, update label resolution chain
8. `lib/supabase/sync.ts` — Add `classified_category` to cloud sync
9. Deploy Edge Functions to Supabase
10. Test end-to-end

### Files Summary

| File | Action | What Changes |
|---|---|---|
| `types/index.ts` | MODIFY | Add `'ai'` to `ReminderType`. Widen `topDistraction: string \| null`. |
| `lib/patterns/patternEngine.ts` | MODIFY | `counts` type: `Record<string, number>`. Remove `DistractionKey` casts. |
| `lib/notifications/reminderContent.ts` | MODIFY | Add cache layer, `classifyDistraction()`, `generateAIReminder()`. Update `getReminderContent()` for custom keys. |
| `app/(tabs)/log.tsx` | MODIFY | Add classification + cache generation in `handleSave()`. Add imports. Archive deleted labels on delete. New `handleReactivate()`, reactivation UI in edit mode. Add `getSettingJSON()` helper. Add `maxLength` to TextInput. |
| `app/(tabs)/insights.tsx` | MODIFY | Build `deletedLabelMap` from `deleted_custom_distractions` setting. Update label resolution chain in global and per-salah sections. |
| `lib/supabase/sync.ts` | MODIFY | Add `classified_category` to cloud sync pull + insert. |
| `supabase/functions/classify-distraction/index.ts` | CREATE | Edge Function: classify text → category key or null. |
| `supabase/functions/generate-reminder/index.ts` | CREATE | Edge Function: generate personalized reminder. |
| `db/schema.ts` | NO CHANGE | `classifiedCategory` column already exists (line 24). |
| `db/database.ts` | NO CHANGE | Migration already present (line 34). |
| `lib/notifications/notificationService.ts` | NO CHANGE | `getReminderContent()` handles custom keys internally. |
| `content/reminders/distraction_templates.json` | NO CHANGE | `llm_guidance` already present, used by generation prompt. |

---

## Stage 2: Home Screen Widget (Heatmap)

**Priority:** Medium — nice-to-have visual feature
**Effort:** Large
**Depends on:** None (independent of other stages)

### Goal

A native home screen widget displaying a weekly prayer heatmap: 7 columns (Monday → Sunday of the current week) × 5 rows (Fajr → Isha). Each cell is a rounded square — grey for unlogged prayers, jade green with saturation mapped to focus rating (1 = 20% opacity, 5 = 100%) for logged prayers. Friday Dhuhr cell gets a gold underline to denote Jumu'ah.

### Design

```
      M    T    W    T    F    S    S
Fajr  [■]  [■]  [■]  [■]  [■]  [■]  [■]
Dhuhr [■]  [■]  [■]  [■]  [■̲]  [■]  [■]
Asr   [■]  [■]  [■]  [■]  [■]  [■]  [■]
Mghrb [■]  [■]  [■]  [■]  [■]  [■]  [■]
Isha  [■]  [■]  [■]  [■]  [■]  [■]  [■]
```

**Widget container**
- Size: 637×259pt (iOS medium widget / Android 4×2)
- Background: white (`#FFFFFF`)
- Border radius: 20pt
- No shadow, no border — flat white card

**Typography**
- Font: Inter Semi-Bold, 20pt — used for both row labels and column headers
- Color: dark charcoal (`#1A1917`)
- Row labels: left-aligned, vertically centered with each row
- Column headers: centered above each cell column

**Grid layout**
- Cell size: 20×20pt, 4pt border-radius
- Horizontal gap between cells: ~55pt (distributes evenly across remaining width after row labels)
- Vertical gap between cells: 18pt
- Row labels column: fixed width on left, grid fills remaining width
- Grid is left-aligned with padding (not centered in widget)

**Cell colors**
- Unlogged: `#C5B9A8` (warm taupe)
- Logged — green scale by focus rating:
  - Rating 1: `#E5EDE5`
  - Rating 2: `#C0D8C0`
  - Rating 3: `#9BC29B`
  - Rating 4: `#75AC75`
  - Rating 5: `#5A7A5A`

**Jumu'ah indicator**
- Friday Dhuhr cell: gold underline (`#C9A84C`)
- Underline width: 20pt (= cell width)
- Underline height: 3pt
- Positioned directly below the cell

**Data rules**
- Columns always represent Monday–Sunday of the current week (not a rolling 7-day window)

### Data sharing

Native widgets cannot read the app's SQLite database directly. A shared data layer is needed:

| Platform | Approach |
|---|---|
| **iOS** | App Group shared container — app writes a JSON summary after each log, widget extension reads it |
| **Android** | ContentProvider or shared SharedPreferences with world-readable mode |

**Shared format**: JSON array of 35 entries `{ day: string, salah: string, rating: number | null }` representing 7 days (Mon–Sun of current week) × 5 prayers.

### Steps

1. **Shared data writer (`lib/widget/widgetData.ts`)** ✅
   - Build heatmap JSON for the current week (Monday 00:00 → Sunday 23:59)
   - Query `salahLogs` for the date range of the current week
   - Write to platform-specific shared storage (App Group on iOS, SharedPreferences on Android via native module)
   - Call after each `handleSave()` in `log.tsx`

2. **iOS WidgetKit extension** ✅ (files created, Xcode config needed)
   - `ios/SalahHeatmapWidget/` — SwiftUI widget with `TimelineProvider`
   - Reads JSON from App Group container (`UserDefaults(suiteName: "group.com.khushuai.app")`)
   - Renders grid using proportional layout via `GeometryReader`
   - Widget size: medium (637×259pt)
   - Container: white, 20pt corner radius, no shadow
   - **Manual Xcode steps required:**
     1. Open `.xcworkspace` in Xcode
     2. File → New → Target → iOS → Widget Extension
     3. Name: `SalahHeatmapWidget`, Bundle ID: `com.khushuai.app.widget`
     4. Replace generated files with `ios/SalahHeatmapWidget/*.swift` + `Info.plist`
     5. Add App Group capability: target → Signing & Capabilities → + App Group → `group.com.khushuai.app`
     6. Enable App Group on main app target too
     7. Set `USER_SCRIPT_SANITIZATION = NO` in build settings if needed

3. **Android App Widget** ✅
   - `SalahHeatmapWidgetProvider.kt` — reads JSON from SharedPreferences, maps cells to drawable resources
   - `widget_heatmap.xml` — LinearLayout grid with 35 `ImageView` cells, row labels, column headers
   - Cell drawables: `cell_unlogged.xml`, `cell_rating_{1-5}.xml`, `cell_jumuah.xml`, `cell_jumuah_{1-5}.xml`
   - Registered in `AndroidManifest.xml` as `<receiver>`
   - `WidgetDataModule.kt` — React Native bridge that writes to SharedPreferences + refreshes widgets
   - `WidgetDataPackage.kt` — registered in `MainApplication.kt`

4. **Update trigger** ✅
   - After `handleSave()` in `app/(tabs)/log.tsx`, calls `writeWidgetData()` (fire-and-forget)
   - On app startup in `app/_layout.tsx`, calls `refreshWidgetIfWeekChanged()` (handles Monday rollover)
   - Android: `WidgetDataModule.writeHeatmapData()` triggers `AppWidgetManager` refresh
   - iOS: Timeline policy `.after(nextMonday)` auto-refreshes at week boundary

### Files created/modified

| File | Status | Change |
|---|---|---|
| `lib/widget/widgetData.ts` | ✅ | Heatmap JSON builder + platform write (AsyncStorage + native module bridge) |
| `app/(tabs)/log.tsx` | ✅ | Calls `writeWidgetData()` after `handleSave()` |
| `app/_layout.tsx` | ✅ | Calls `refreshWidgetIfWeekChanged()` on startup |
| `app.json` | ✅ | Added `expo-widget` plugin config |
| `ios/SalahHeatmapWidget/SalahHeatmapEntry.swift` | ✅ | Timeline entry + Codable types |
| `ios/SalahHeatmapWidget/SalahHeatmapView.swift` | ✅ | SwiftUI view with proportional GeometryReader layout |
| `ios/SalahHeatmapWidget/SalahHeatmapWidget.swift` | ✅ | Widget entry + TimelineProvider (reads App Group UserDefaults) |
| `ios/SalahHeatmapWidget/Info.plist` | ✅ | Extension bundle config |
| `android/.../widget/SalahHeatmapWidgetProvider.kt` | ✅ | AppWidgetProvider — reads SharedPreferences, maps cells to drawables |
| `android/.../modules/WidgetDataModule.kt` | ✅ | React Native bridge — writes to SharedPreferences + refreshes widgets |
| `android/.../modules/WidgetDataPackage.kt` | ✅ | ReactPackage registration |
| `android/.../MainApplication.kt` | ✅ | Registered WidgetDataPackage |
| `android/.../AndroidManifest.xml` | ✅ | Registered widget receiver |
| `android/.../res/xml/salah_heatmap_widget_info.xml` | ✅ | Widget provider info (4×2 cells) |
| `android/.../res/layout/widget_heatmap.xml` | ✅ | LinearLayout grid — 35 ImageView cells + labels |
| `android/.../res/drawable/widget_background.xml` | ✅ | White rounded rectangle |
| `android/.../res/drawable/cell_unlogged.xml` | ✅ | Taupe cell |
| `android/.../res/drawable/cell_rating_{1-5}.xml` | ✅ | Green scale cells |
| `android/.../res/drawable/cell_jumuah.xml` | ✅ | Taupe + gold underline |
| `android/.../res/drawable/cell_jumuah_{1-5}.xml` | ✅ | Green + gold underline variants |

---

## Stage 3: In-App Purchase Integration (RevenueCat)

**Priority:** High - gates all premium features
**Effort:** Large
**Depends on:** App Store Connect and Google Play Console accounts, plus Stage 1 feature flags remaining intact
**Status:** Implementation-ready plan - execute in the order below. The first code change must remove the current unconditional Premium grant before any RevenueCat or paywall work begins.

### Goal

Make RevenueCat's `premium` entitlement the sole source of truth for paid access. A signed-in user remains free unless RevenueCat reports an active entitlement. Premium features are AI reminders, unlimited trends, custom-distraction editing, and cloud sync.

### Required implementation order

Stage 3 is complete only when every step below has been implemented and verified. Do not begin with the paywall: access must be locked before purchase UI exists.

1. **Remove the unconditional grant.** Change `store/appStore.ts` first: replace `isPremium: true` and `setIsPremium(boolean)` with the `premiumStatus` state described in section 1. Remove `setIsPremium(true)` from `app/onboarding/account.tsx`; update sign-out/account-deletion paths to clear status instead. Until RevenueCat is connected, every premium gate must resolve to locked/free.
2. **Add the entitlement boundary.** Create the mapper and RevenueCat service, with no direct SDK imports in screens. Unit-test the mapper before wiring lifecycle code.
3. **Configure native products and SDK keys.** Complete both stores, RevenueCat offerings, native capabilities, and build-time public-key configuration. Use development/sandbox builds for all purchase validation.
4. **Wire identity and lifecycle.** Configure once, identify after Supabase session restoration, serialize auth changes, refresh on foreground and CustomerInfo updates, and clear the previous entitlement before account changes.
5. **Replace purchase surfaces and gates.** Implement the paywall, restore/manage actions, guest return flow, and shared selectors for all listed premium features.
6. **Run the full verification matrix.** Do not mark Stage 3 complete on a local mock alone; both native sandbox flows and account-switching tests must pass.

### Current-state audit (must be resolved)

The implementation must account for every existing premium reference, not just the store default:

| Current location | Current issue | Required outcome |
|---|---|---|
| `store/appStore.ts` | `isPremium` defaults to `true` and exposes a mutable boolean setter | `premiumStatus` defaults to `unknown`; screens consume a derived read-only entitlement |
| `app/onboarding/account.tsx` | Successful sign-in calls `setIsPremium(true)` | Remove the grant; shared auth lifecycle resolves RevenueCat |
| `app/(tabs)/settings.tsx` | Sign-out/delete paths call the old setter; manage/upgrade branches use local state | Clear RevenueCat identity and route through the authenticated paywall/Customer Center guard |
| `app/(tabs)/log.tsx` | AI/custom-distraction gates read the mutable boolean | Use the shared derived selector; unknown remains locked |
| `app/(tabs)/insights.tsx` | Time-range and all-time queries read the mutable boolean | Use the shared selector and preserve the free seven-day limit |
| `app/salah-mode.tsx` and `lib/notifications/notificationService.ts` | Pattern/AI depth is selected from the mutable boolean | Use the same selector; entitlement loss locks the next action |

No compatibility shim may allow a screen to call `setIsPremium(true)`, infer Premium from `userId`, or persist a second entitlement flag.

### Decisions locked for this stage

| Area | Decision |
|---|---|
| Entitlement | Use one RevenueCat entitlement: `premium`. No UI or feature may infer access from a Supabase session, an email address, or a successful checkout alone. |
| Products | Create `khushu_premium_monthly` and `khushu_premium_annual` on both stores; attach both to `premium`; expose them through the current default offering. Product identifiers and prices must match the corresponding store records. |
| Identity | Require a Supabase account before purchase. Configure RevenueCat once on launch, then identify the customer with the Supabase `user.id`; this makes a subscription available on the user's other signed-in devices. |
| Guest behaviour | Guests are always free. An upgrade tap sends a guest to sign in/create an account and resumes the paywall afterwards; it must not purchase against an anonymous RevenueCat ID. |
| Store state | `isPremium` is derived from the latest `CustomerInfo` (`entitlements.active.premium`), not independently persisted state. While entitlement resolution is pending or fails without a usable RevenueCat cache, access is free/locked. |
| Account changes | On sign-in, call `Purchases.logIn(user.id)` and apply its returned `CustomerInfo`. On sign-out and account deletion, call `Purchases.logOut()` and set the app state to free before another user can access the app. Do not transfer or restore purchases automatically. |
| Restore and management | Keep an explicit Restore purchases action. Use RevenueCat Customer Center for Manage subscription where available; otherwise show the platform's subscription-management link. |
| Web | This stage covers native iOS and Android subscriptions only. Web remains a non-purchase surface unless a separate RevenueCat Billing scope is approved. |

### 1. Replace the current `isPremium` implementation first

The current app has two invalid grants: `store/appStore.ts` defaults `isPremium` to `true`, and `app/onboarding/account.tsx` sets it to `true` on every successful sign-in. Remove both before connecting any purchase UI.

1. In `store/appStore.ts`, replace the stored `isPremium: boolean` with a premium-resolution state, for example `premiumStatus: 'unknown' | 'free' | 'premium'`, plus one setter.
2. Expose `isPremium` through a selector/helper derived only from `premiumStatus === 'premium'`; do not offer a general-purpose `setIsPremium(true)` API to screens.
3. Initialise to `unknown`, not premium. Screens needing a decision treat `unknown` as locked and may show a small loading state, avoiding a brief paid-content flash.
4. Add one entitlement mapper, e.g. `lib/revenuecat/entitlements.ts`, that returns `customerInfo.entitlements.active.premium != null`. All purchase, restore, lifecycle, and CustomerInfo-listener paths call that same mapper/setter.
5. Do not store an entitlement boolean in SQLite, AsyncStorage, or Supabase. RevenueCat's CustomerInfo cache is the only offline source permitted; a refresh failure must never promote a free user to premium.

### 2. Configure stores and RevenueCat before app code

1. Create the App Store Connect and Google Play Console apps using the existing identifier `com.khushuai.app`; complete tax, banking, agreements, and internal-test setup.
2. Add the monthly and annual auto-renewable subscription products, localized names/descriptions, review metadata, pricing, and any introductory offer in each store. Configure an App Store subscription group.
3. Create a RevenueCat project with separate iOS and Android apps, import/connect both stores through the required store credentials, create entitlement `premium`, attach both products, and create the `default` offering with monthly and annual packages.
4. Set RevenueCat's restore/transfer behaviour deliberately and document it in project settings. The app must never call `syncPurchases()` on every launch: it can transfer/alias customers and adds unnecessary latency. Use user-triggered `restorePurchases()` instead.
5. Store only the public, platform-specific RevenueCat SDK keys in build-time Expo configuration/environment variables, e.g. `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`. Never commit RevenueCat secret API keys or store-service credentials.
6. Add `react-native-purchases` and `react-native-purchases-ui`. Because this Expo app already contains native projects, rebuild native development/release clients after installation; Expo Go must not validate real purchases.
7. Enable In-App Purchase on the iOS target. Add Android Billing permission and change `MainActivity` from `singleTask` to a store-compatible `singleTop` or `standard` launch mode so external payment verification can return correctly.

### 3. Add one RevenueCat service boundary

Create `lib/revenuecat/` rather than importing `react-native-purchases` directly from screens.

1. `configureRevenueCat()` configures the SDK once, early in `app/_layout.tsx`, with the correct public key for iOS/Android and no hard-coded key. It is a no-op on unsupported web builds.
2. `identifyRevenueCatUser(userId)` calls `Purchases.logIn(userId)`, maps the returned CustomerInfo, and updates the store. On app startup, obtain the restored Supabase session first, then identify that `user.id`; do not configure every user under one shared ID.
3. `refreshPremiumStatus()` calls `Purchases.getCustomerInfo()` and maps entitlement state. Invoke it after configuration/identity resolution, when the app returns to the foreground, after purchase/restore, and before a premium-only action when state is stale. Register the SDK CustomerInfo update listener so renewals, cancellations, refunds, and expiration updates reach the store.
4. `clearRevenueCatUser()` calls `Purchases.logOut()` during Supabase sign-out/account deletion and immediately sets `premiumStatus` to `free` (or `unknown` while a new session is being resolved). Failure must be logged and must not leave the previous user's entitlement visible.
5. Keep Supabase log sync and RevenueCat entitlement sync separate. Supabase authentication controls cloud-log access; RevenueCat controls premium access. Signing in must not unlock paid features, and purchasing must not imply a change to Supabase auth.

### 4. Wire auth and lifecycle correctly

1. In `app/_layout.tsx`, configure RevenueCat once, subscribe to the existing Supabase auth-state changes, and serialize identity changes so an older async result cannot overwrite a newer session's premium state.
2. For `INITIAL_SESSION` and `SIGNED_IN`, set `userId`, call `identifyRevenueCatUser(session.user.id)`, then run existing cloud-log sync independently. For `SIGNED_OUT`, clear the store's user and premium state and call `clearRevenueCatUser()`.
3. In `app/onboarding/account.tsx`, remove `setIsPremium(true)` from `onAuthSuccess()`. After Supabase sign-in/sign-up/OAuth callback, wait for the shared lifecycle/auth helper to resolve RevenueCat; navigate normally, with premium locked until entitlement resolution arrives.
4. Preserve the existing Google OAuth callback (`khushuai://auth/callback`) and test it on Android and iOS. A completed OAuth login must produce the same RevenueCat identity path as email/password login.
5. Guard every entry to `/paywall`: a guest routes to account auth with a return-to-paywall parameter; authenticated free users see packages; active premium users see subscription management rather than a second purchase CTA.

### 5. Replace the paywall stub and settings actions

1. In `app/paywall.tsx`, fetch `Purchases.getOfferings()` after authenticated premium state resolves. Render only available packages from `current`; render localized store price strings and package terms, never a hard-coded price.
2. Provide monthly and annual choices, a clear selected state, trial/introductory-offer copy only when supplied by the package, Terms of Use and Privacy Policy links, and required subscription disclosure.
3. On purchase, disable duplicate taps, call `Purchases.purchasePackage(selectedPackage)`, and unlock only if returned CustomerInfo has active `premium`. Handle cancellation silently, show recoverable network/store errors, and show pending state where reported.
4. Restore purchases from an explicit button using `Purchases.restorePurchases()`, map returned CustomerInfo, and tell the user whether Premium was restored. Do not automatically restore during launch or sign-in.
5. Replace Settings' Manage subscription navigation to the paywall with Customer Center (or the appropriate store subscription-management surface). Refresh CustomerInfo after it closes. Retain an Upgrade entry for free users and route it through the authenticated paywall guard.
6. Ensure all existing feature gates use the shared derived entitlement state: custom-distraction creation/editing and AI classification in `log.tsx`; time-range/detail gates in `insights.tsx`; AI pattern/reminder calls in `salah-mode.tsx` and `notificationService.ts`; and Premium/settings labels. No screen may keep a local premium boolean or use `userId` as a proxy.

### 6. Verify access changes and release readiness

1. Add unit tests for the CustomerInfo-to-premium mapper: active entitlement, absent entitlement, expired entitlement, malformed/empty CustomerInfo, and unknown/error states all resolve deterministically.
2. Add integration tests with a mocked RevenueCat service for cold launch as guest, authenticated free user, active premium user, sign-out/sign-in as another user, and stale async responses.
3. Test native sandbox flows on both platforms: new monthly purchase, annual purchase, cancellation, pending payment, restore after reinstall, expiration/refund, and a subscription bought on device A becoming available on device B after both use the same Supabase account.
4. Test store-return behaviour on Android after external payment verification and verify the iOS In-App Purchase capability in an archive/TestFlight build. Confirm no real purchase is attempted in Expo Go.
5. Test all gate transitions: free users cannot invoke AI/unlimited-insights paths; premium users can; entitlement loss locks future premium actions without deleting local logs; reactivation restores access.
6. Before release, verify RevenueCat dashboard entitlement assignment for each product, App Store review metadata, Play closed-test track, privacy/terms links, cancellation management, and production public SDK keys. Enable verbose RevenueCat logs only for development builds.

### Definition of done

- A fresh install starts locked/free, never Premium by default.
- Signing in does not alter premium access unless RevenueCat reports active `premium`.
- An active entitlement unlocks every listed premium feature across supported native devices signed into the same Supabase account.
- Purchase, restore, subscription management, expiration/refund, sign-out, and account switching all update visible gates from the shared CustomerInfo mapper.
- The release build completes sandbox purchases and restores on both iOS and Android; no secret keys are in the repository; and the full Stage 3 verification list passes.

### Files to modify

| File | Change |
|---|---|
| `lib/revenuecat/entitlements.ts` | Add the single CustomerInfo-to-premium-state mapper and entitlement ID constant. |
| `lib/revenuecat/service.ts` | Configure, identify/logout, refresh, offerings, purchase, restore, and CustomerInfo-listener boundary. |
| `store/appStore.ts` | Replace the default-true mutable boolean with `premiumStatus` and derived selectors. |
| `app/_layout.tsx` | Configure RevenueCat once; coordinate Supabase identity, CustomerInfo updates, foreground refresh, and sign-out reset. |
| `app/onboarding/account.tsx` | Remove the sign-in premium grant; use the shared lifecycle path and preserve return-to-paywall destination. |
| `app/paywall.tsx` | Replace the stub with offering, package selection, purchase, restore, loading, and error states. |
| `app/(tabs)/settings.tsx` | Route free/guest upgrades correctly and open Customer Center or store management for active subscribers. |
| `app/(tabs)/log.tsx`, `app/(tabs)/insights.tsx`, `app/salah-mode.tsx`, `lib/notifications/notificationService.ts` | Use the shared derived entitlement selector for every existing premium gate. |
| `app.json`, `.env.example`, build environment | Add public platform SDK-key configuration and required native/build configuration; do not add secrets to source control. |
| `android/app/src/main/AndroidManifest.xml` | Add Billing permission and use a store-compatible `MainActivity` launch mode. |
| iOS project/capabilities | Enable In-App Purchase and ensure native builds link the RevenueCat packages. |
| `package.json`, lockfile | Add `react-native-purchases` and `react-native-purchases-ui`; add relevant test commands/dependencies if needed. |
| Stage 4 test suites | Add entitlement, auth-lifecycle, and paywall integration coverage specified above. |

---

## Stage 4: Testing

**Priority:** High — required before production release
**Effort:** Medium-Large
**Depends on:** Stages 1-3 complete

### Goal

Establish a test suite covering core logic, integration flows, and E2E user journeys.

### Steps

1. **Choose frameworks**
   - Unit/Integration: `Jest` (already included with Expo) + `React Native Testing Library`
   - E2E: `Maestro` (recommended for React Native — simpler than Detox)

2. **Unit tests for core logic**
   - `lib/prayer/prayerTimes.ts` — test calculation with known locations/dates
   - `lib/patterns/patternEngine.ts` — test phase classification with mock DB data
   - `lib/notifications/reminderContent.ts` — test content selection for each phase/distraction
   - `lib/notifications/notificationService.ts` — test scheduling logic (mock expo-notifications)

3. **Integration tests**
   - Database operations (insert, query, update settings)
   - Zustand store state transitions
   - Auth flow (mock Supabase)

4. **E2E tests (Maestro)**
   - Onboarding flow → location → account → main tabs
   - Log a prayer → verify in insights
   - Settings changes → verify notifications reschedule

5. **Add test scripts to `package.json`**

### Files to create

| Path | Purpose |
|---|---|
| `__tests__/` | Unit and integration test files |
| `jest.config.js` | Jest configuration (if customization needed) |
| `.maestro/` | E2E flow definitions |

---

## Stage 5: Production Build & Store Submission

**Priority:** High — launch requirement
**Effort:** Medium
**Depends on:** Stages 1-4

### Goal

Build signed binaries, configure store listings, and submit to App Store + Google Play.

### Steps

1. **Production signing**
   - Android: Generate proper keystore (currently using debug keystore at `android/app/build.gradle:115`)
   - iOS: Set up Apple Developer certificates, provisioning profiles

2. **EAS Submit configuration (`eas.json`)**
   - Fill `submit` section with App Store Connect and Google Play credentials
   - Configure app metadata, screenshots, descriptions

3. **App Store assets**
   - Screenshots for all device sizes
   - App description, keywords, categories
   - Privacy policy URL
   - App icon (already exists)

4. **Build**
   ```bash
   eas build --platform ios --profile production
   eas build --platform android --profile production
   ```

5. **Submit**
   ```bash
   eas submit --platform ios
   eas submit --platform android
   ```

6. **Post-submission**
   - Monitor crash reports (Expo has built-in crash reporting)
   - Respond to app review feedback
   - Plan iterative updates based on user feedback

---

## Stage 6: Post-Launch Enhancements (Optional)

Lower priority, can be tackled iteratively after launch.

| Enhancement | Effort | Notes |
|---|---|---|
| Reflection text field | Small | Schema field exists (`reflectionText`) but no UI. Add optional text input to log screen. |
| Extracted Salah components | Small | `components/salah/` is empty. Extract reusable pieces from `salah-mode.tsx`. |
| Haptics | Small | Add subtle haptic feedback on star rating, chip selection, save |
| Localization | Large | Arabic, Urdu, Malay, Turkish, etc. |
| Onboarding tooltips | Small | In-app guidance overlays for first-time users |
| Dark mode | Medium | Extend the sand/sage/ink palette with dark variants |
| Data export | Small | Let users export their logs as CSV |

---

## Execution Order

```
Stage 1 (AI reminders)
    │
    ▼
Stage 2 (Home screen widget)
    │
    ▼
Stage 3 (RevenueCat IAP)
    │
    ▼
Stage 4 (Testing)
    │
    ▼
Stage 5 (Production build & submission)
    │
    ▼
Stage 6 (Post-launch polish)
```
