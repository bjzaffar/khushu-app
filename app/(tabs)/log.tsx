import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { useState, useCallback, useEffect, useRef } from 'react';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db/database';
import { salahLogs, settings } from '@/db/schema';
import { useAppStore } from '@/store/appStore';
import { queueClassificationUpdate, queueLogUpsert } from '@/lib/supabase/sync';
import {
  SALAH_NAMES,
  SALAH_DISPLAY_NAMES,
  DISTRACTION_LABELS,
  type SalahName,
  type DistractionKey,
} from '@/types';
import { getCurrentSalahWindow } from '@/lib/prayer/prayerTimes';
import { cancelPostSalahForSalah, cancelReEngagementNotification } from '@/lib/notifications/notificationService';
import { classifyDistraction, generateAIReminder } from '@/lib/notifications/reminderContent';
import { writeWidgetData } from '@/lib/widget/widgetData';

// Built-in keys excluding 'other' (rendered separately)
const BUILTIN_DISTRACTION_KEYS = Object.keys(DISTRACTION_LABELS).filter(
  (k) => k !== 'other'
) as DistractionKey[];

const RATING_LABELS: Record<number, string> = {
  1: 'Heavily distracted',
  2: 'Somewhat distracted',
  3: 'Partially present',
  4: 'Mostly present',
  5: 'Fully present',
};

function saveSettingJSON(key: string, value: unknown) {
  const str = JSON.stringify(value);
  db.insert(settings)
    .values({ key, value: str })
    .onConflictDoUpdate({ target: settings.key, set: { value: str } })
    .run();
}

function getSettingJSON(key: string): unknown[] {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return [];
  try { return JSON.parse(row.value); } catch { return []; }
}

export default function LogScreen() {
  const params = useLocalSearchParams<{ salah?: string; fromSalahMode?: string }>();
  const { todaysPrayerTimes, isPremium, userId } = useAppStore();

  function resolveInitialSalah(): SalahName {
    if (params.salah && SALAH_NAMES.includes(params.salah as SalahName)) {
      return params.salah as SalahName;
    }
    // Auto-select first unlogged salah of the day
    const today = new Date().toISOString().split('T')[0];
    const logs = db
      .select()
      .from(salahLogs)
      .where(eq(salahLogs.logDate, today))
      .all();
    const loggedSet = new Set(logs.map((l) => l.salahName));
    const firstUnlogged = SALAH_NAMES.find((name) => !loggedSet.has(name));
    if (firstUnlogged) return firstUnlogged;
    // All logged — fall back to current window or first salah
    if (todaysPrayerTimes) {
      return getCurrentSalahWindow(todaysPrayerTimes) ?? 'fajr';
    }
    return 'fajr';
  }

  const [selectedSalah, setSelectedSalah] = useState<SalahName>(resolveInitialSalah);
  const lastIntentSalahRef = useRef<SalahName | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const [focusRating, setFocusRating] = useState(0);
  const [selectedDistractions, setSelectedDistractions] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [savedSalahName, setSavedSalahName] = useState<SalahName>('fajr');
  const [relogSalah, setRelogSalah] = useState<SalahName | null>(null);
  const [deleteArchived, setDeleteArchived] = useState<{ key: string; label: string } | null>(null);
  const [todaysLogs, setTodaysLogs] = useState<Record<string, number>>({});

  // Custom distraction state
  const [customDistractions, setCustomDistractions] = useState<{ key: string; label: string }[]>([]);
  const [hiddenBuiltins, setHiddenBuiltins] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherInputText, setOtherInputText] = useState('');
  const starsContainerRef = useRef<View>(null);
  const starsContainerXRef = useRef(0);
  const starsContainerWidthRef = useRef(0);

  // Load custom/hidden from SQLite once on mount
  useEffect(() => {
    const customRow = db.select().from(settings).where(eq(settings.key, 'custom_distractions')).get();
    if (customRow) {
      try { setCustomDistractions(JSON.parse(customRow.value)); } catch {}
    }
    const hiddenRow = db.select().from(settings).where(eq(settings.key, 'hidden_distractions')).get();
    if (hiddenRow) {
      try { setHiddenBuiltins(JSON.parse(hiddenRow.value)); } catch {}
    }
  }, []);

  // When screen gains focus, always open on first unlogged salah.
  // If navigation params carry a new intent (salah mode / notification),
  // consume it once and then clear so stale params don't override on tab re-open.
  useFocusEffect(
    useCallback(() => {
      setSaved(false);
      setEditMode(false);
      setShowOtherInput(false);
      setOtherInputText('');
      setFocusRating(0);
      setSelectedDistractions([]);

      // Load today's logs
      const today = new Date().toISOString().split('T')[0];
      const logs = db
        .select()
        .from(salahLogs)
        .where(eq(salahLogs.logDate, today))
        .all();
      const map: Record<string, number> = {};
      for (const log of logs) {
        map[log.salahName] = log.focusRating;
      }
      setTodaysLogs(map);

      const loggedSet = new Set(logs.map((l) => l.salahName));
      const firstUnlogged = SALAH_NAMES.find((name) => !loggedSet.has(name));

      const intentSalah =
        params.salah && SALAH_NAMES.includes(params.salah as SalahName)
          ? (params.salah as SalahName)
          : null;

      // New navigation intent (different from last consumed) — use it
      if (intentSalah && lastIntentSalahRef.current !== intentSalah) {
        setSelectedSalah(intentSalah);
        lastIntentSalahRef.current = intentSalah;
      } else if (firstUnlogged) {
        setSelectedSalah(firstUnlogged);
      }
    }, [params.fromSalahMode, params.salah])
  );

  function toggleDistraction(key: string) {
    setSelectedDistractions((prev) =>
      prev.includes(key) ? [] : [key]
    );
  }

  function rememberCustomLabel(distraction: { key: string; label: string }) {
    const labels = getSettingJSON('custom_distraction_labels') as { key: string; label: string }[];
    if (labels.some((entry) => entry.key === distraction.key)) return;
    saveSettingJSON('custom_distraction_labels', [...labels, distraction]);
  }

  function handleAddCustomDistraction() {
    const label = otherInputText.trim().slice(0, 100);
    if (!label) return;
    const key = `custom_${Date.now()}`;
    const newList = [...customDistractions, { key, label }];
    setCustomDistractions(newList);
    saveSettingJSON('custom_distractions', newList);
    rememberCustomLabel({ key, label });
    setSelectedDistractions([key]);
    setOtherInputText('');
    setShowOtherInput(false);
  }

  function handleHideBuiltin(key: string) {
    const newHidden = [...hiddenBuiltins, key];
    setHiddenBuiltins(newHidden);
    saveSettingJSON('hidden_distractions', newHidden);
    setSelectedDistractions((prev) => prev.filter((k) => k !== key));
  }

  function handleDeleteCustom(key: string) {
    const deleted = customDistractions.find((d) => d.key === key);
    const newList = customDistractions.filter((d) => d.key !== key);
    setCustomDistractions(newList);
    saveSettingJSON('custom_distractions', newList);
    setSelectedDistractions((prev) => prev.filter((k) => k !== key));

    if (deleted) {
      rememberCustomLabel(deleted);
      const archive = getSettingJSON('deleted_custom_distractions') as { key: string; label: string }[];
      archive.push({ key: deleted.key, label: deleted.label });
      saveSettingJSON('deleted_custom_distractions', archive);
    }
  }

  function handleRestoreDefaults() {
    setHiddenBuiltins([]);
    saveSettingJSON('hidden_distractions', []);
  }

  function handleReactivate(key: string) {
    const archive = getSettingJSON('deleted_custom_distractions') as { key: string; label: string }[];
    const found = archive.find((d) => d.key === key);
    if (!found) return;

    rememberCustomLabel(found);
    const newActive = [...customDistractions, found];
    setCustomDistractions(newActive);
    saveSettingJSON('custom_distractions', newActive);

    const newArchive = archive.filter((d) => d.key !== key);
    saveSettingJSON('deleted_custom_distractions', newArchive);
  }

  function handlePermanentDelete(key: string) {
    const archive = getSettingJSON('deleted_custom_distractions') as { key: string; label: string }[];
    const found = archive.find((d) => d.key === key);
    const newArchive = archive.filter((d) => d.key !== key);
    saveSettingJSON('deleted_custom_distractions', newArchive);

    if (found) {
      rememberCustomLabel(found);
      const historical = getSettingJSON('historical_custom_labels') as { key: string; label: string }[];
      historical.push({ key: found.key, label: found.label });
      saveSettingJSON('historical_custom_labels', historical);
    }
  }

  async function handleSave() {
    if (focusRating === 0 || selectedDistractions.length === 0) return;
    const now = new Date();

    // Read which reminder style was shown before this Salah (if any)
    const pendingKey = `pending_reminder_type_${selectedSalah}`;
    const pendingRow = db.select().from(settings).where(eq(settings.key, pendingKey)).get();
    const reminderType = pendingRow?.value ?? null;

    // Delete any existing log for this Salah today (re-log replaces previous)
    const logDate = now.toISOString().split('T')[0];
    db.delete(salahLogs)
      .where(and(eq(salahLogs.salahName, selectedSalah), eq(salahLogs.logDate, logDate)))
      .run();

    await db.insert(salahLogs).values({
      salahName: selectedSalah,
      focusRating,
      distractions: selectedDistractions.join(','),
      loggedAt: now.getTime(),
      logDate,
      fromSalahMode: params.fromSalahMode === '1',
      reminderType,
    });

    const cloudLog = {
      salahName: selectedSalah,
      focusRating,
      distractions: selectedDistractions.join(','),
      loggedAt: now.getTime(),
      logDate,
      fromSalahMode: params.fromSalahMode === '1',
      reminderType,
    };

    // Clear pending reminder type after it's been consumed
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
            const category = await classifyDistraction(label);
            if (category) {
              db.update(salahLogs)
                .set({ classifiedCategory: category })
                .where(eq(salahLogs.loggedAt, now.getTime()))
                .run();
              queueClassificationUpdate(cloudLog, category).catch((error) =>
                console.warn('[sync] salah_logs classification update failed:', error)
              );
            }

            await generateAIReminder(label, key, category, selectedSalah);
          }
        })();
      }
    }

    // Fire-and-forget cloud sync (best-effort; local save already succeeded)
    queueLogUpsert(cloudLog, userId).catch((error) =>
      console.warn('[sync] salah_logs upsert queued for retry:', error)
    );

    // Fire-and-forget widget data update
    writeWidgetData().catch((err) =>
      console.warn('[widget] writeWidgetData failed:', err)
    );

    await cancelPostSalahForSalah(selectedSalah);
    await cancelReEngagementNotification();
    setSavedSalahName(selectedSalah);
    setSaved(true);
  }

  function handleLogAnother() {
    const today = new Date().toISOString().split('T')[0];
    const logs = db
      .select()
      .from(salahLogs)
      .where(eq(salahLogs.logDate, today))
      .all();
    const map: Record<string, number> = {};
    for (const log of logs) {
      map[log.salahName] = log.focusRating;
    }
    setTodaysLogs(map);

    const loggedSet = new Set(logs.map((l) => l.salahName));
    const firstUnlogged = SALAH_NAMES.find((name) => !loggedSet.has(name));

    setFocusRating(0);
    setSelectedDistractions([]);
    setSaved(false);
    if (firstUnlogged) {
      setSelectedSalah(firstUnlogged);
    }
  }

  // ── Acknowledgement ────────────────────────────────────────────────────────
  if (saved) {
    return (
      <SafeAreaView className="flex-1 bg-sand-100 items-center justify-center px-8">
        <View className="items-center gap-y-6">
          <View className="w-16 h-16 rounded-full bg-sage-600 items-center justify-center">
            <Text className="text-white text-2xl font-semibold">✓</Text>
          </View>
          <Text className="text-ink-900 text-xl font-semibold text-center">
            {SALAH_DISPLAY_NAMES[savedSalahName]} logged.
          </Text>
          <View className="flex-row gap-x-3 mt-4">
            <Pressable
              className="border border-sand-300 py-3 px-6 rounded-2xl active:bg-sand-200"
              onPress={handleLogAnother}
            >
              <Text className="text-ink-500 font-medium">Log Another</Text>
            </Pressable>
            <Pressable
              className="bg-sage-600 py-3 px-6 rounded-2xl active:bg-sage-700"
              onPress={() => router.replace('/(tabs)')}
            >
              <Text className="text-white font-medium">Done</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Logging Form ───────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1"
    >
      <SafeAreaView className="flex-1 bg-sand-100">
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-2xl font-semibold text-ink-900 mb-6">Log Salah</Text>

          {/* ── Salah Selector ─────────────────────────────────────────────── */}
          <View className="mb-6">
            <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
              Which Salah?
            </Text>
            <View className="flex-row gap-x-2">
              {SALAH_NAMES.map((name) => {
                const isLogged = name in todaysLogs;
                return (
                  <Pressable
                    key={name}
                    onPress={() => {
                      if (isLogged) {
                        setRelogSalah(name);
                      } else {
                        setSelectedSalah(name);
                      }
                    }}
                    className={`flex-1 py-2 rounded-xl items-center ${
                      selectedSalah === name ? 'bg-sage-600' : 'bg-sand-200'
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        selectedSalah === name ? 'text-white' : 'text-ink-700'
                      }`}
                    >
                      {SALAH_DISPLAY_NAMES[name]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Focus Rating ───────────────────────────────────────────────── */}
          <View className="mb-6">
            <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
              Focus Rating
            </Text>
            <View className="bg-white rounded-2xl border border-sand-200 p-5">
              <View
                ref={starsContainerRef}
                className="flex-row justify-around"
                onLayout={() => {
                  starsContainerRef.current?.measure((_fx, _fy, width, _height, pageX) => {
                    starsContainerXRef.current = pageX;
                    starsContainerWidthRef.current = width;
                  });
                }}
                onTouchStart={(e) => {
                  const w = starsContainerWidthRef.current;
                  if (w === 0) return;
                  const relX = e.nativeEvent.pageX - starsContainerXRef.current;
                  const segWidth = w / 5;
                  const idx = Math.min(5, Math.max(1, Math.ceil(relX / segWidth)));
                  setFocusRating(idx);
                }}
                onTouchMove={(e) => {
                  const w = starsContainerWidthRef.current;
                  if (w === 0) return;
                  const relX = e.nativeEvent.pageX - starsContainerXRef.current;
                  const segWidth = w / 5;
                  const idx = Math.min(5, Math.max(1, Math.ceil(relX / segWidth)));
                  setFocusRating(idx);
                }}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setFocusRating(n)}
                    className="items-center gap-y-1"
                  >
                    <Text
                      className={`text-3xl ${
                        n <= focusRating ? 'text-sage-600' : 'text-sand-300'
                      }`}
                    >
                      ★
                    </Text>
                    <Text className="text-ink-300 text-xs">{n}</Text>
                  </Pressable>
                ))}
              </View>
              {focusRating > 0 && (
                <Text className="text-center text-ink-300 text-xs mt-3">
                  {RATING_LABELS[focusRating]}
                </Text>
              )}
            </View>
          </View>

          {/* ── Distraction Chips ─────────────────────────────────────────── */}
          <View className="mb-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest">
                What distracted you?
              </Text>
              {isPremium ? (
                <Pressable
                  onPress={() => {
                    setEditMode((v) => !v);
                    setShowOtherInput(false);
                  }}
                >
                  <Text className="text-sage-600 text-xs font-medium">
                    {editMode ? 'Done' : 'Edit'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => router.push('/paywall')}>
                  <Text className="text-ink-300 text-xs font-medium">Edit 🔒</Text>
                </Pressable>
              )}
            </View>

            <View className="flex-row flex-wrap gap-2">
              {/* Built-in chips (excluding 'other') */}
              {BUILTIN_DISTRACTION_KEYS
                .filter((key) => !hiddenBuiltins.includes(key))
                .map((key) => {
                  const label = DISTRACTION_LABELS[key];
                  const active = !editMode && selectedDistractions.includes(key);
                  if (editMode) {
                    return (
                      <View key={key} className="py-2 px-3 rounded-xl bg-sand-200 flex-row items-center">
                        <Text className="text-ink-700 text-sm font-medium">{label}</Text>
                        <Pressable onPress={() => handleHideBuiltin(key)} hitSlop={8} className="ml-1.5">
                          <Text className="text-ink-400 text-xs">✕</Text>
                        </Pressable>
                      </View>
                    );
                  }
                  return (
                    <Pressable
                      key={key}
                      onPress={() => toggleDistraction(key)}
                      className={`py-2 px-4 rounded-xl ${active ? 'bg-sage-600' : 'bg-sand-200'}`}
                    >
                      <Text className={`text-sm font-medium ${active ? 'text-white' : 'text-ink-700'}`}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}

              {/* Custom chips */}
              {customDistractions.map(({ key, label }) => {
                const active = !editMode && selectedDistractions.includes(key);
                if (editMode) {
                  return (
                    <View key={key} className="py-2 px-3 rounded-xl bg-sand-200 flex-row items-center">
                      <Text className="text-ink-700 text-sm font-medium">{label}</Text>
                      <Pressable onPress={() => handleDeleteCustom(key)} hitSlop={8} className="ml-1.5">
                        <Text className="text-red-400 text-xs">✕</Text>
                      </Pressable>
                    </View>
                  );
                }
                return (
                  <Pressable
                    key={key}
                    onPress={() => toggleDistraction(key)}
                    className={`py-2 px-4 rounded-xl ${active ? 'bg-sage-600' : 'bg-sand-200'}`}
                  >
                    <Text className={`text-sm font-medium ${active ? 'text-white' : 'text-ink-700'}`}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}

              {/* Other chip — hidden in edit mode */}
              {!hiddenBuiltins.includes('other') && !editMode && (
                <Pressable
                  onPress={() => {
                    setSelectedDistractions(['other']);
                    setShowOtherInput(true);
                  }}
                  className={`py-2 px-4 rounded-xl ${
                    selectedDistractions.includes('other') ? 'bg-sage-600' : 'bg-sand-200'
                  }`}
                >
                  <Text className={`text-sm font-medium ${
                    selectedDistractions.includes('other') ? 'text-white' : 'text-ink-700'
                  }`}>Other</Text>
                </Pressable>
              )}
            </View>

            {/* Archived custom distractions — tap to reactivate or permanently delete */}
            {editMode && (() => {
              const archive = getSettingJSON('deleted_custom_distractions') as { key: string; label: string }[];
              if (archive.length === 0) return null;
              return (
                <View className="mt-3">
                  <Text className="text-xs text-ink-300 mb-2">Archived — tap to reactivate:</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {archive.map(({ key, label }) => (
                      <View
                        key={key}
                        className="py-2 px-3 rounded-xl bg-sand-100 border border-dashed border-sand-300 flex-row items-center"
                      >
                        <Pressable onPress={() => handleReactivate(key)} className="flex-row items-center">
                          <Text className="text-ink-400 text-sm">{label}</Text>
                          <Text className="text-sage-600 text-xs ml-1.5">↻</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setDeleteArchived({ key, label })}
                          hitSlop={8}
                          className="ml-1"
                        >
                          <Text className="text-red-400 text-xs">✕</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}

            {/* "Other" inline add input */}
            {showOtherInput && !editMode && (
              <View className="mt-2 bg-white rounded-2xl border border-sand-200 px-4 py-3">
                <Text className="text-ink-500 text-xs mb-2">Name this distraction:</Text>
                <TextInput
                  value={otherInputText}
                  onChangeText={(t) => setOtherInputText(t.slice(0, 100))}
                  maxLength={100}
                  placeholder="e.g. Hunger, Noise…"
                  placeholderTextColor="#9B9189"
                  autoFocus
                  className="text-ink-700 text-sm"
                  onSubmitEditing={handleAddCustomDistraction}
                />
                <View className="flex-row gap-x-2 mt-3">
                  <Pressable
                    onPress={() => {
                      setSelectedDistractions([]);
                      setShowOtherInput(false);
                      setOtherInputText('');
                    }}
                    className="flex-1 py-2 rounded-xl bg-sand-100 items-center"
                  >
                    <Text className="text-ink-500 text-sm">Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={isPremium ? handleAddCustomDistraction : () => router.push('/paywall')}
                    disabled={!otherInputText.trim()}
                    className={`flex-1 py-2 rounded-xl items-center ${
                      otherInputText.trim() ? 'bg-sage-600' : 'bg-sand-200'
                    }`}
                  >
                    <Text className={`text-sm font-medium ${
                      otherInputText.trim() ? 'text-white' : 'text-ink-300'
                    }`}>
                      Add
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Restore defaults — visible in edit mode when built-ins are hidden */}
            {editMode && hiddenBuiltins.length > 0 && (
              <Pressable onPress={handleRestoreDefaults} className="mt-2">
                <Text className="text-sage-600 text-xs">Restore defaults</Text>
              </Pressable>
            )}
          </View>

          {isPremium && (
            <Text className="text-ink-300 text-xs text-center mb-4">
              Connect to the internet for AI reminders
            </Text>
          )}

          {/* ── Save Button ───────────────────────────────────────────────── */}
          <Pressable
            onPress={handleSave}
            disabled={focusRating === 0 || selectedDistractions.length === 0}
            className={`py-4 rounded-2xl items-center ${
              focusRating > 0 && selectedDistractions.length > 0 ? 'bg-sage-600 active:bg-sage-700' : 'bg-sand-200'
            }`}
          >
            <Text
              className={`font-semibold text-base ${
                focusRating > 0 && selectedDistractions.length > 0 ? 'text-white' : 'text-ink-300'
              }`}
            >
              Save Reflection
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      {/* ── Relog Confirmation Modal ──────────────────────────────────── */}
      <Modal visible={relogSalah !== null} transparent animationType="fade">
        <Pressable className="flex-1 bg-black/30 items-center justify-center px-8" onPress={() => setRelogSalah(null)}>
          <Pressable className="bg-white rounded-2xl p-6 w-full max-w-sm" onPress={(e) => e.stopPropagation()}>
            <Text className="text-ink-900 text-base font-semibold text-center mb-2">
              Relog Salah?
            </Text>
            <Text className="text-ink-400 text-sm text-center mb-6">
              {relogSalah ? `${SALAH_DISPLAY_NAMES[relogSalah]} has already been logged today.` : ''}
              {'\n'}Would you like to relog it?
            </Text>
            <View className="flex-row gap-x-3">
              <Pressable
                onPress={() => setRelogSalah(null)}
                className="flex-1 py-3 rounded-2xl bg-sand-200 items-center"
              >
                <Text className="text-ink-700 font-medium">No</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (relogSalah) setSelectedSalah(relogSalah);
                  setRelogSalah(null);
                }}
                className="flex-1 py-3 rounded-2xl bg-sage-600 items-center"
              >
                <Text className="text-white font-medium">Yes</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Permanent Delete Confirmation Modal ───────────────────────── */}
      <Modal visible={deleteArchived !== null} transparent animationType="fade">
        <Pressable className="flex-1 bg-black/30 items-center justify-center px-8" onPress={() => setDeleteArchived(null)}>
          <Pressable className="bg-white rounded-2xl p-6 w-full max-w-sm" onPress={(e) => e.stopPropagation()}>
            <Text className="text-ink-900 text-base font-semibold text-center mb-2">
              Delete Distraction?
            </Text>
            <Text className="text-ink-400 text-sm text-center mb-6">
              {deleteArchived ? `"${deleteArchived.label}" will be permanently deleted.` : ''}
              {'\n'}It won't be available when logging new reflections.
            </Text>
            <View className="flex-row gap-x-3">
              <Pressable
                onPress={() => setDeleteArchived(null)}
                className="flex-1 py-3 rounded-2xl bg-sand-200 items-center"
              >
                <Text className="text-ink-700 font-medium">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (deleteArchived) handlePermanentDelete(deleteArchived.key);
                  setDeleteArchived(null);
                }}
                className="flex-1 py-3 rounded-2xl bg-red-500 items-center"
              >
                <Text className="text-white font-medium">Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}
