import {
  View,
  ScrollView,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Modal,
  TextInput as NativeTextInput,
  type FocusEvent,
} from 'react-native';
import { Text, TextInput } from '@/components/ui/Typography';
import { AppDialog } from '@/components/ui/AppDialog';
import {
  BookmarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  StarIcon,
  TrashIcon,
  XMarkIcon,
} from 'react-native-heroicons/outline';
import {
  BookmarkIcon as BookmarkSolidIcon,
  CheckCircleIcon as CheckCircleSolidIcon,
  StarIcon as StarSolidIcon,
} from 'react-native-heroicons/solid';

import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { useState, useCallback, useEffect, useRef } from 'react';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db/database';
import { salahLogs, settings } from '@/db/schema';
import { selectIsPremium, useAppStore } from '@/store/appStore';
import {
  deleteLogEverywhere,
  queueClassificationUpdate,
  queueDistractionSettingsSync,
  queueLogUpsert,
} from '@/lib/supabase/sync';
import { toLocalDateKey } from '@/lib/date';
import {
  SALAH_NAMES,
  SALAH_DISPLAY_NAMES,
  DISTRACTION_LABELS,
  type SalahName,
  type DistractionKey,
} from '@/types';
import { getCurrentSalahWindow } from '@/lib/prayer/prayerTimes';
import { cancelPostSalahForSalah, cancelReEngagementNotification } from '@/lib/notifications/notificationService';
import {
  classifyDistraction,
  clearCachedReminder,
  completeAIReminderGeneration,
  generateAIReminder,
  queueAIReminderGeneration,
} from '@/lib/notifications/reminderContent';
import { writeWidgetData } from '@/lib/widget/widgetData';
import { useThemeColors } from '@/lib/theme/colors';

// Built-in keys excluding 'other' (rendered separately)
const BUILTIN_DISTRACTION_KEYS = Object.keys(DISTRACTION_LABELS).filter(
  (k) => k !== 'other'
) as DistractionKey[];
const CUSTOM_DISTRACTION_MAX_LENGTH = 25;
const NOTE_MAX_LENGTH = 200;

const RATING_LABELS: Record<number, string> = {
  1: 'Heavily distracted',
  2: 'Somewhat distracted',
  3: 'Partially present',
  4: 'Mostly present',
  5: 'Fully present',
};

type LogDay = 'today' | 'yesterday';

const DAY_LABELS: Record<LogDay, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
};

function getLogDateForDay(day: LogDay): string {
  const date = new Date();
  if (day === 'yesterday') date.setDate(date.getDate() - 1);
  return toLocalDateKey(date);
}

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
  const theme = useThemeColors();
  const params = useLocalSearchParams<{ salah?: string; fromSalahMode?: string }>();
  const { todaysPrayerTimes, userId, logTabReselectionVersion } = useAppStore();
  const isPremium = useAppStore(selectIsPremium);

  const resolveInitialSalah = useCallback((day: LogDay, allowNavigationIntent = false): SalahName => {
    if (allowNavigationIntent && params.salah && SALAH_NAMES.includes(params.salah as SalahName)) {
      return params.salah as SalahName;
    }
    // Auto-select the first unlogged salah for the selected day.
    const logDate = getLogDateForDay(day);
    const logs = db
      .select()
      .from(salahLogs)
      .where(eq(salahLogs.logDate, logDate))
      .all();
    const loggedSet = new Set(logs.map((l) => l.salahName));
    const firstUnlogged = SALAH_NAMES.find((name) => !loggedSet.has(name));
    if (firstUnlogged) return firstUnlogged;
    // All logged — fall back to current window or first salah
    if (day === 'today' && todaysPrayerTimes) {
      return getCurrentSalahWindow(todaysPrayerTimes) ?? 'fajr';
    }
    return 'fajr';
  }, [params.salah, todaysPrayerTimes]);

  const [activeDay, setActiveDay] = useState<LogDay>('today');
  const [selectedSalah, setSelectedSalah] = useState<SalahName>(() => resolveInitialSalah('today', true));
  const lastIntentSalahRef = useRef<SalahName | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetYRef = useRef(0);
  const lastLogTabReselection = useRef(logTabReselectionVersion);
  const inputScrollStartYRef = useRef<number | null>(null);
  const inputScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherInputRef = useRef<NativeTextInput>(null);
  const noteInputRef = useRef<NativeTextInput>(null);
  useScrollToTop(scrollRef);
  const [focusRating, setFocusRating] = useState(0);
  const [isRatingGestureActive, setIsRatingGestureActive] = useState(false);
  const [selectedDistractions, setSelectedDistractions] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [savedSalahName, setSavedSalahName] = useState<SalahName>('fajr');
  const [relogSalah, setRelogSalah] = useState<SalahName | null>(null);
  const [deleteArchived, setDeleteArchived] = useState<{ key: string; label: string } | null>(null);
  const [editDistraction, setEditDistraction] = useState<{ key: string; label: string } | null>(null);
  const [distractionNameInput, setDistractionNameInput] = useState('');
  const [logsByDay, setLogsByDay] = useState<Record<LogDay, Record<string, number>>>({
    today: {},
    yesterday: {},
  });
  const [isRelogging, setIsRelogging] = useState(false);

  // Custom distraction state
  const [customDistractions, setCustomDistractions] = useState<{ key: string; label: string }[]>([]);
  const [hiddenBuiltins, setHiddenBuiltins] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherInputText, setOtherInputText] = useState('');
  const [note, setNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteInputText, setNoteInputText] = useState('');
  const starsContainerRef = useRef<View>(null);
  const starsContainerXRef = useRef(0);
  const starsContainerWidthRef = useRef(0);

  const scrollInputAboveKeyboard = useCallback((event: FocusEvent) => {
    const input = event.target;
    const startingOffset = inputScrollStartYRef.current ?? scrollOffsetYRef.current;
    const restoreStartingOffset = () => {
      scrollOffsetYRef.current = startingOffset;
      scrollRef.current?.scrollTo({ y: startingOffset, animated: false });
    };

    restoreStartingOffset();
    const scrollToInput = () => {
      const keyboardTop = Keyboard.metrics()?.screenY;
      if (!keyboardTop) return;

      restoreStartingOffset();
      input.measureInWindow((_x, inputY, _width, inputHeight) => {
        const additionalOffset = inputY + inputHeight + 24 - keyboardTop;
        if (additionalOffset <= 0) return;

        scrollRef.current?.scrollTo({
          y: scrollOffsetYRef.current + additionalOffset,
          animated: true,
        });
      });
    };

    if (inputScrollTimeoutRef.current) clearTimeout(inputScrollTimeoutRef.current);
    inputScrollTimeoutRef.current = setTimeout(scrollToInput, 300);
  }, []);

  useEffect(() => {
    const input = showOtherInput ? otherInputRef.current : showNoteInput ? noteInputRef.current : null;
    if (!input) return;

    const frame = requestAnimationFrame(() => {
      const startingOffset = inputScrollStartYRef.current;
      if (startingOffset !== null) {
        scrollOffsetYRef.current = startingOffset;
        scrollRef.current?.scrollTo({ y: startingOffset, animated: false });
      }
      input.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [showNoteInput, showOtherInput]);

  useEffect(() => () => {
    if (inputScrollTimeoutRef.current) clearTimeout(inputScrollTimeoutRef.current);
  }, []);

  const setRatingFromPointer = useCallback((pageX: number) => {
    const width = starsContainerWidthRef.current;
    if (width === 0) return;
    const relativeX = pageX - starsContainerXRef.current;
    const rating = Math.min(5, Math.max(1, Math.ceil(relativeX / (width / 5))));
    setFocusRating(rating);
  }, []);

  const resetReflectionInputs = useCallback(() => {
    setFocusRating(0);
    setIsRatingGestureActive(false);
    setSelectedDistractions([]);
    setEditMode(false);
    setShowOtherInput(false);
    setOtherInputText('');
    setNote('');
    setShowNoteInput(false);
    setNoteInputText('');
    setEditDistraction(null);
    setDistractionNameInput('');
    setDeleteArchived(null);
  }, []);

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

  const loadLogsForDay = useCallback((day: LogDay) => {
    const logs = db
      .select()
      .from(salahLogs)
      .where(eq(salahLogs.logDate, getLogDateForDay(day)))
      .all();
    const map: Record<string, number> = {};
    for (const log of logs) {
      map[log.salahName] = log.focusRating;
    }
    return { logs, map };
  }, []);

  const resetFormForDay = useCallback((day: LogDay, map?: Record<string, number>) => {
    const logsForDay = map ?? loadLogsForDay(day).map;
    const firstUnlogged = SALAH_NAMES.find((name) => !(name in logsForDay));
    setSelectedSalah(firstUnlogged ?? resolveInitialSalah(day));
    resetReflectionInputs();
    setSaved(false);
    setIsRelogging(false);
    setRelogSalah(null);
  }, [loadLogsForDay, resetReflectionInputs, resolveInitialSalah]);

  const handleDayChange = useCallback((day: LogDay) => {
    if (day === activeDay) return;
    try {
      const { map } = loadLogsForDay(day);
      setLogsByDay((current) => ({ ...current, [day]: map }));
      setActiveDay(day);
      resetFormForDay(day, map);
    } catch (error) {
      console.error(`[log] Failed to open ${day}:`, error);
    }
  }, [activeDay, loadLogsForDay, resetFormForDay]);

  const transitionToDay = useCallback((day: LogDay) => {
    if (day === activeDay) return;
    handleDayChange(day);
  }, [activeDay, handleDayChange]);

  // When screen gains focus, refresh its log data and target the first unlogged salah.
  // Reset the form on blur instead, so returning never briefly renders stale form state.
  // If navigation params carry a new intent (salah mode / notification),
  // consume it once and then clear so stale params don't override on tab re-open.
  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });

      const today = loadLogsForDay('today');
      const yesterday = loadLogsForDay('yesterday');
      setLogsByDay({ today: today.map, yesterday: yesterday.map });
      setActiveDay('today');
      const loggedSet = new Set(today.logs.map((l) => l.salahName));
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

      return () => {
        setActiveDay('today');
        resetFormForDay('today');
        setShowOtherInput(false);
        setOtherInputText('');
        setNote('');
        setShowNoteInput(false);
        setNoteInputText('');
        setIsRatingGestureActive(false);
        setRelogSalah(null);
        setDeleteArchived(null);
        setEditDistraction(null);
        setDistractionNameInput('');
      };
    }, [loadLogsForDay, params.salah, resetFormForDay])
  );

  // Pressing the focused Log tab starts a fresh entry for today's first
  // unlogged Salah, without requiring the user to leave the screen first.
  useEffect(() => {
    if (lastLogTabReselection.current === logTabReselectionVersion) return;
    lastLogTabReselection.current = logTabReselectionVersion;

    const { map } = loadLogsForDay('today');
    scrollOffsetYRef.current = 0;
    setLogsByDay((current) => ({ ...current, today: map }));
    setActiveDay('today');
    resetFormForDay('today', map);
  }, [loadLogsForDay, logTabReselectionVersion, resetFormForDay]);

  function toggleDistraction(key: string) {
    setShowOtherInput(false);
    setOtherInputText('');
    setSelectedDistractions((prev) =>
      prev.includes(key) ? [] : [key]
    );
  }

  function openNoteEditor() {
    inputScrollStartYRef.current = scrollOffsetYRef.current;
    setSelectedDistractions((current) => current.filter((key) => key !== 'other'));
    setShowOtherInput(false);
    setOtherInputText('');
    setNoteInputText(note);
    setShowNoteInput(true);
  }

  function closeNoteEditor() {
    setShowNoteInput(false);
    setNoteInputText(note);
  }

  function handleAddNote() {
    const normalizedNote = noteInputText.trim().slice(0, NOTE_MAX_LENGTH);
    if (!normalizedNote) return;
    setNote(normalizedNote);
    setNoteInputText(normalizedNote);
    setShowNoteInput(false);
  }

  function handleDeleteNote() {
    setNote('');
    setNoteInputText('');
    setShowNoteInput(false);
  }

  function rememberCustomLabel(distraction: { key: string; label: string }) {
    const labels = getSettingJSON('custom_distraction_labels') as { key: string; label: string }[];
    if (labels.some((entry) => entry.key === distraction.key)) return;
    saveSettingJSON('custom_distraction_labels', [...labels, distraction]);
  }

  function syncDistractionSettings() {
    queueDistractionSettingsSync(userId ?? undefined).catch((error) =>
      console.warn('[sync] distraction settings update queued for retry:', error)
    );
  }

  function saveArchivedDistractions(distractions: { key: string; label: string }[]) {
    saveSettingJSON('deleted_custom_distractions', distractions);
    syncDistractionSettings();
  }

  function handleAddCustomDistraction() {
    const label = otherInputText.trim().slice(0, CUSTOM_DISTRACTION_MAX_LENGTH);
    if (!label) return;
    const key = `custom_${Date.now()}`;
    const newList = [...customDistractions, { key, label }];
    setCustomDistractions(newList);
    saveSettingJSON('custom_distractions', newList);
    rememberCustomLabel({ key, label });
    syncDistractionSettings();
    setSelectedDistractions([key]);
    setOtherInputText('');
    setShowOtherInput(false);
  }

  function handleHideBuiltin(key: string) {
    const newHidden = [...hiddenBuiltins, key];
    setHiddenBuiltins(newHidden);
    saveSettingJSON('hidden_distractions', newHidden);
    syncDistractionSettings();
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
      saveArchivedDistractions([...archive, { key: deleted.key, label: deleted.label }]);
    }
  }

  function handleRestoreDefaults() {
    setHiddenBuiltins([]);
    saveSettingJSON('hidden_distractions', []);
    syncDistractionSettings();
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
    saveArchivedDistractions(newArchive);
  }

  function handlePermanentDelete(key: string) {
    const archive = getSettingJSON('deleted_custom_distractions') as { key: string; label: string }[];
    const found = archive.find((d) => d.key === key);
    const newArchive = archive.filter((d) => d.key !== key);

    if (found) {
      rememberCustomLabel(found);
      const historical = getSettingJSON('historical_custom_labels') as { key: string; label: string }[];
      historical.push({ key: found.key, label: found.label });
      saveSettingJSON('historical_custom_labels', historical);
    }
    saveArchivedDistractions(newArchive);
  }

  function openDistractionNameEditor(distraction: { key: string; label: string }) {
    setDistractionNameInput(distraction.label.slice(0, CUSTOM_DISTRACTION_MAX_LENGTH));
    setEditDistraction(distraction);
  }

  function closeDistractionNameEditor() {
    setEditDistraction(null);
    setDistractionNameInput('');
  }

  function handleSaveDistractionName() {
    if (!editDistraction) return;

    const label = distractionNameInput.trim().slice(0, CUSTOM_DISTRACTION_MAX_LENGTH);
    if (!label) return;

    const renamedDistractions = customDistractions.map((distraction) =>
      distraction.key === editDistraction.key ? { ...distraction, label } : distraction
    );
    setCustomDistractions(renamedDistractions);
    saveSettingJSON('custom_distractions', renamedDistractions);

    // Keep historical labels in sync so existing logs and reminders use the new name.
    for (const settingKey of ['custom_distraction_labels', 'historical_custom_labels']) {
      const labels = getSettingJSON(settingKey) as { key: string; label: string }[];
      if (labels.some((distraction) => distraction.key === editDistraction.key)) {
        saveSettingJSON(
          settingKey,
          labels.map((distraction) =>
            distraction.key === editDistraction.key ? { ...distraction, label } : distraction
          )
        );
      }
    }

    // The generated reminder may mention the old label. Force the next use of
    // this same distraction key to generate content for the renamed label.
    clearCachedReminder(editDistraction.key).catch((error) =>
      console.warn('[reminder] Failed to clear renamed distraction cache:', error)
    );
    syncDistractionSettings();

    closeDistractionNameEditor();
  }

  function handleDeleteSalahLog() {
    if (!relogSalah) return;

    const salahToDelete = relogSalah;
    const logDate = getLogDateForDay(activeDay);

    // The local delete runs synchronously inside this helper, while cloud
    // deletion is queued durably and retried by the normal sync flow.
    deleteLogEverywhere(salahToDelete, logDate, userId ?? undefined).catch((error) =>
      console.warn('[sync] salah_log deletion queued for retry:', error)
    );

    const nextLogs = { ...logsByDay[activeDay] };
    delete nextLogs[salahToDelete];
    setLogsByDay((current) => ({ ...current, [activeDay]: nextLogs }));
    setSelectedSalah(salahToDelete);
    setFocusRating(0);
    setSelectedDistractions([]);
    setSaved(false);
    setIsRelogging(false);
    setEditMode(false);
    setShowOtherInput(false);
    setOtherInputText('');
    setNote('');
    setShowNoteInput(false);
    setNoteInputText('');
    setRelogSalah(null);

    writeWidgetData(isPremium).catch((error) =>
      console.warn('[widget] writeWidgetData failed after log deletion:', error)
    );
  }

  const hasValidReflection = focusRating > 0 && (
    focusRating === 5 || selectedDistractions.length > 0
  );
  const canSave = hasValidReflection && !showOtherInput && !showNoteInput && !editMode;
  const activeLogs = logsByDay[activeDay] ?? {};
  const allSalahsLogged = SALAH_NAMES.every((name) => name in activeLogs);
  const showAllSalahsLogged = allSalahsLogged && !isRelogging;

  async function handleSave() {
    if (!canSave) return;
    const now = new Date();
    const logDate = getLogDateForDay(activeDay);

    // Read which reminder style was shown before this Salah (if any)
    const pendingKey = `pending_reminder_type_${selectedSalah}`;
    const pendingRow = activeDay === 'today'
      ? db.select().from(settings).where(eq(settings.key, pendingKey)).get()
      : null;
    const reminderType = pendingRow?.value ?? null;

    // Re-log replaces the existing entry for this Salah on the active day.
    db.delete(salahLogs)
      .where(and(eq(salahLogs.salahName, selectedSalah), eq(salahLogs.logDate, logDate)))
      .run();

    await db.insert(salahLogs).values({
      salahName: selectedSalah,
      focusRating,
      distractions: selectedDistractions.join(','),
      reflectionText: note,
      loggedAt: now.getTime(),
      logDate,
      fromSalahMode: activeDay === 'today' && params.fromSalahMode === '1',
      reminderType,
    });

    const cloudLog = {
      salahName: selectedSalah,
      focusRating,
      distractions: selectedDistractions.join(','),
      reflectionText: note,
      loggedAt: now.getTime(),
      logDate,
      fromSalahMode: activeDay === 'today' && params.fromSalahMode === '1',
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
            // Persist this before making network requests, so an offline save
            // can finish classification and cache its reminder after reconnect.
            queueAIReminderGeneration({
              customKey: key,
              text: label,
              prayerName: selectedSalah,
              closestCategory: null,
            });

            const category = await classifyDistraction(label);
            if (category) {
              queueAIReminderGeneration({
                customKey: key,
                text: label,
                prayerName: selectedSalah,
                closestCategory: category,
              });
              db.update(salahLogs)
                .set({ classifiedCategory: category })
                .where(eq(salahLogs.loggedAt, now.getTime()))
                .run();
              queueClassificationUpdate(cloudLog, category, userId ?? undefined).catch((error) =>
                console.warn('[sync] salah_logs classification update failed:', error)
              );
            }

            // A null result means classification was unavailable. Leave the
            // durable queue intact instead of generating from an arbitrary
            // fallback category; reconnect will retry classification first.
            if (!category) continue;

            const generated = await generateAIReminder(label, key, category, selectedSalah);
            if (generated) {
              // A successful generation has also populated the local cache.
              completeAIReminderGeneration(key);
            }
          }
        })();
      }
    }

    // Fire-and-forget cloud sync (best-effort; local save already succeeded)
    queueLogUpsert(cloudLog, userId ?? undefined).catch((error) =>
      console.warn('[sync] salah_logs upsert queued for retry:', error)
    );

    // Fire-and-forget widget data update
    writeWidgetData(isPremium).catch((err) =>
      console.warn('[widget] writeWidgetData failed:', err)
    );

    if (activeDay === 'today') {
      await cancelPostSalahForSalah(selectedSalah);
      await cancelReEngagementNotification();
    }
    setSavedSalahName(selectedSalah);
    setSaved(true);
  }

  function handleLogAnother() {
    const { map } = loadLogsForDay(activeDay);
    setLogsByDay((current) => ({ ...current, [activeDay]: map }));
    resetFormForDay(activeDay, map);
  }

  // ── Acknowledgement ────────────────────────────────────────────────────────
  if (saved) {
    return (
      <SafeAreaView className="flex-1 bg-sand-100 items-center justify-center px-8">
        <View className="items-center gap-y-6">
          <CheckCircleSolidIcon size={52} color="#5A7A5A" />
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
              <Text className="text-pure-white font-medium">Done</Text>
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
          scrollEnabled={!isRatingGestureActive}
          onScroll={(event) => {
            scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          <Text className="text-2xl font-semibold text-ink-900 mb-5">Log Salah</Text>

          <View className="mb-7">
            <View className="relative w-full h-10 items-center justify-center">
              <View>
                <Text className="text-lg font-semibold text-ink-900 text-center">
                  {DAY_LABELS[activeDay]}
                </Text>
              </View>
              {activeDay === 'today' && (
                <Pressable
                  onPress={() => transitionToDay('yesterday')}
                  className="absolute left-0 top-0 w-10 h-10 rounded-full bg-white items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="Show yesterday"
                >
                  <ChevronLeftIcon size={16} color="#6F675F" />
                </Pressable>
              )}
              {activeDay === 'yesterday' && (
                <Pressable
                  onPress={() => transitionToDay('today')}
                  className="absolute right-0 top-0 w-10 h-10 rounded-full bg-white items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="Show today"
                >
                  <ChevronRightIcon size={16} color="#6F675F" />
                </Pressable>
              )}
            </View>
          </View>

          {/* ── Salah Selector ─────────────────────────────────────────────── */}
          <View className="mb-6">
            <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
              Which Salah?
            </Text>
            <View className="flex-row gap-x-2">
              {SALAH_NAMES.map((name) => {
                const isLogged = name in activeLogs;
                const isSelected = !showAllSalahsLogged && selectedSalah === name;
                return (
                  <Pressable
                    key={name}
                    onPress={() => {
                      if (isLogged) {
                        setRelogSalah(name);
                      } else if (name !== selectedSalah) {
                        resetReflectionInputs();
                        setIsRelogging(false);
                        setSelectedSalah(name);
                      }
                    }}
                    className={`flex-1 py-2 rounded-xl items-center ${
                      isSelected ? 'bg-sage-600' : 'bg-sand-200'
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        isSelected ? 'text-pure-white' : 'text-ink-700'
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
          {showAllSalahsLogged ? (
            <View className="items-center py-10 gap-y-4">
              <CheckCircleSolidIcon size={52} color="#5A7A5A" />
              <Text className="text-ink-900 text-xl font-semibold text-center">
                All the Salahs for {activeDay} have been logged.
              </Text>
            </View>
          ) : (
            <>
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
                onStartShouldSetResponderCapture={() => true}
                onMoveShouldSetResponderCapture={() => true}
                onResponderGrant={(e) => {
                  setIsRatingGestureActive(true);
                  setRatingFromPointer(e.nativeEvent.pageX);
                }}
                onResponderMove={(e) => setRatingFromPointer(e.nativeEvent.pageX)}
                onResponderTerminationRequest={() => false}
                onResponderRelease={() => setIsRatingGestureActive(false)}
                onResponderTerminate={() => setIsRatingGestureActive(false)}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <View
                    key={n}
                    className="items-center gap-y-1"
                  >
                    {n <= focusRating
                      ? <StarSolidIcon size={30} color="#5A7A5A" />
                      : <StarIcon size={30} color={theme.borderStrong} />}
                    <Text className="text-ink-300 text-xs">{n}</Text>
                  </View>
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
              <Pressable
                onPress={() => {
                  setEditMode((v) => !v);
                  setSelectedDistractions((current) => current.filter((key) => key !== 'other'));
                  setShowOtherInput(false);
                  setOtherInputText('');
                  closeNoteEditor();
                }}
              >
                <Text className="text-sage-600 text-xs font-medium">
                  {editMode ? 'Done' : 'Edit'}
                </Text>
              </Pressable>
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
                          <XMarkIcon size={12} color="#9B9189" />
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
                      <Text className={`text-sm font-medium ${active ? 'text-pure-white' : 'text-ink-700'}`}>
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
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${label}`}
                        onPress={() => openDistractionNameEditor({ key, label })}
                        hitSlop={8}
                        className="ml-2"
                      >
                        <PencilIcon size={14} color="#EAB308" />
                      </Pressable>
                      <Pressable onPress={() => handleDeleteCustom(key)} hitSlop={8} className="ml-1">
                        <XMarkIcon size={12} color="#9B9189" />
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
                    <Text className={`text-sm font-medium ${active ? 'text-pure-white' : 'text-ink-700'}`}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}

              {/* Other chip — hidden in edit mode */}
              {!hiddenBuiltins.includes('other') && !editMode && (
                <Pressable
                  onPress={() => {
                    inputScrollStartYRef.current = scrollOffsetYRef.current;
                    setSelectedDistractions(['other']);
                    setShowOtherInput(true);
                    setShowNoteInput(false);
                    setNoteInputText(note);
                  }}
                  className={`py-2 px-4 rounded-xl ${
                    selectedDistractions.includes('other') ? 'bg-sage-600' : 'bg-sand-200'
                  }`}
                >
                  <Text className={`text-sm font-medium ${
                    selectedDistractions.includes('other') ? 'text-pure-white' : 'text-ink-700'
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
                        <Pressable onPress={() => handleReactivate(key)}>
                          <Text className="text-ink-400 text-sm">{label}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setDeleteArchived({ key, label })}
                          hitSlop={8}
                          className="ml-2"
                        >
                          <XMarkIcon size={12} color="#F87171" />
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
                  ref={otherInputRef}
                  value={otherInputText}
                  onChangeText={(t) => setOtherInputText(t.slice(0, CUSTOM_DISTRACTION_MAX_LENGTH))}
                  maxLength={CUSTOM_DISTRACTION_MAX_LENGTH}
                  placeholder="e.g. Exam Stress, Noise (clear and simple)"
                  placeholderTextColor="#9B9189"
                  onFocus={scrollInputAboveKeyboard}
                  className="text-ink-700 text-sm"
                  onSubmitEditing={handleAddCustomDistraction}
                />
                <Text className="text-ink-300 text-xs mt-1 text-right">
                  {otherInputText.length}/{CUSTOM_DISTRACTION_MAX_LENGTH}
                </Text>
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
                    onPress={handleAddCustomDistraction}
                    disabled={!otherInputText.trim()}
                    className={`flex-1 py-2 rounded-xl items-center ${
                      otherInputText.trim() ? 'bg-sage-600' : 'bg-sand-200'
                    }`}
                  >
                    <Text className={`text-sm font-medium ${
                      otherInputText.trim() ? 'text-pure-white' : 'text-ink-300'
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

            <View className="flex-row items-center justify-between mt-5 mb-2">
              <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest">
                Note
              </Text>
              {!note && !showNoteInput && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add a note"
                  disabled={editMode}
                  onPress={openNoteEditor}
                  hitSlop={8}
                  className={editMode ? 'opacity-40' : ''}
                >
                  <BookmarkIcon size={22} color="#EAB308" />
                </Pressable>
              )}
            </View>

            {showNoteInput && !editMode && (
              <View className="relative bg-white rounded-2xl border border-yellow-500 px-4 py-3">
                <BookmarkSolidIcon
                  size={20}
                  color="#EAB308"
                  style={{ position: 'absolute', right: 14, top: 12 }}
                />
                <Text className="text-ink-500 text-xs mb-2 pr-8">Add a note:</Text>
                <TextInput
                  ref={noteInputRef}
                  value={noteInputText}
                  onChangeText={(text) => setNoteInputText(text.slice(0, NOTE_MAX_LENGTH))}
                  maxLength={NOTE_MAX_LENGTH}
                  placeholder="e.g. Worried about maths exam tomorrow..."
                  placeholderTextColor="#9B9189"
                  onFocus={scrollInputAboveKeyboard}
                  multiline
                  textAlignVertical="top"
                  className="text-ink-700 text-sm min-h-20"
                />
                <Text className="text-ink-300 text-xs mt-1 text-right">
                  {noteInputText.length}/{NOTE_MAX_LENGTH}
                </Text>
                <View className="flex-row gap-x-2 mt-3">
                  <Pressable
                    onPress={closeNoteEditor}
                    className="flex-1 py-2 rounded-xl bg-sand-100 items-center"
                  >
                    <Text className="text-ink-500 text-sm">Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleAddNote}
                    disabled={!noteInputText.trim()}
                    className={`flex-1 py-2 rounded-xl items-center ${
                      noteInputText.trim() ? 'bg-yellow-500 active:bg-yellow-600' : 'bg-sand-200'
                    }`}
                  >
                    <Text className={`text-sm font-medium ${
                      noteInputText.trim() ? 'text-pure-white' : 'text-ink-300'
                    }`}>
                      Add
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {note && !showNoteInput && (
              <View className="relative bg-white rounded-2xl border border-yellow-500 px-4 pt-4 pb-12">
                <BookmarkSolidIcon
                  size={20}
                  color="#EAB308"
                  style={{ position: 'absolute', right: 14, top: 12 }}
                />
                <Text className="text-ink-700 text-sm leading-relaxed pr-8">{note}</Text>
                <View className="absolute right-3 bottom-3 flex-row items-center gap-x-3">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit note"
                    disabled={editMode}
                    onPress={openNoteEditor}
                    hitSlop={8}
                    className={editMode ? 'opacity-40' : ''}
                  >
                    <PencilIcon size={20} color="#EAB308" />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Delete note"
                    disabled={editMode}
                    onPress={handleDeleteNote}
                    hitSlop={8}
                    className={editMode ? 'opacity-40' : ''}
                  >
                    <TrashIcon size={20} color="#EF4444" />
                  </Pressable>
                </View>
              </View>
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
            disabled={!canSave}
            className={`py-4 rounded-2xl items-center ${
              canSave ? 'bg-sage-600 active:bg-sage-700' : 'bg-sand-200'
            }`}
          >
            <Text
              className={`font-semibold text-base ${
                canSave ? 'text-pure-white' : 'text-ink-300'
              }`}
            >
              Save Reflection
            </Text>
          </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Edit custom distraction name */}
      <Modal
        visible={editDistraction !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={closeDistractionNameEditor}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
        >
          <Pressable
            accessibilityRole="none"
            className="flex-1 bg-black/40 items-center justify-center px-6"
            onPress={closeDistractionNameEditor}
          >
            <Pressable
              accessibilityViewIsModal
              className="bg-white border border-sand-200 rounded-3xl px-6 pt-6 pb-5 w-full max-w-sm"
              style={{
                shadowColor: '#1A1917',
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.16,
                shadowRadius: 24,
                elevation: 12,
              }}
              onPress={(event) => event.stopPropagation()}
            >
              <Text className="text-ink-900 text-lg font-semibold text-center mb-6">
                Edit distraction name
              </Text>

              <Text className="text-ink-500 text-xs mb-2">Name this distraction:</Text>
              <TextInput
                value={distractionNameInput}
                onChangeText={(text) =>
                  setDistractionNameInput(text.slice(0, CUSTOM_DISTRACTION_MAX_LENGTH))
                }
                maxLength={CUSTOM_DISTRACTION_MAX_LENGTH}
                placeholder="e.g. Hunger, Noise... (clear and simple)"
                placeholderTextColor="#9B9189"
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                className="text-ink-700 text-sm"
                onSubmitEditing={handleSaveDistractionName}
              />
              <Text className="text-ink-300 text-xs mt-1 text-right">
                {distractionNameInput.length}/{CUSTOM_DISTRACTION_MAX_LENGTH}
              </Text>

              <View className="flex-row gap-x-3 mt-6">
                <Pressable
                  accessibilityRole="button"
                  onPress={closeDistractionNameEditor}
                  className="flex-1 min-h-12 px-3 py-3 rounded-2xl bg-sand-200 active:bg-sand-300 items-center justify-center"
                >
                  <Text className="text-ink-700 text-sm font-semibold">Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !distractionNameInput.trim() }}
                  onPress={handleSaveDistractionName}
                  disabled={!distractionNameInput.trim()}
                  className={`flex-1 min-h-12 px-3 py-3 rounded-2xl bg-yellow-500 active:bg-yellow-600 items-center justify-center ${
                    !distractionNameInput.trim() ? 'opacity-40' : ''
                  }`}
                >
                  <Text className="text-ink-900 text-sm font-semibold">Save name</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <AppDialog
        visible={relogSalah !== null}
        title="Relog Salah?"
        message={relogSalah
          ? `${SALAH_DISPLAY_NAMES[relogSalah]} has already been logged ${activeDay}. Would you like to relog it?`
          : ''}
        actionLayout="horizontal"
        showIcon={false}
        onDismiss={() => setRelogSalah(null)}
        actions={[
          { label: 'No', tone: 'secondary', onPress: () => setRelogSalah(null) },
          {
            label: 'Yes',
            onPress: () => {
              if (relogSalah) {
                resetReflectionInputs();
                setSelectedSalah(relogSalah);
                setIsRelogging(true);
              }
              setRelogSalah(null);
            },
          },
          {
            label: 'Delete log',
            tone: 'destructive',
            onPress: handleDeleteSalahLog,
          },
        ]}
      />

      {/* ── Permanent Delete Confirmation Modal ───────────────────────── */}
      <AppDialog
        visible={deleteArchived !== null}
        title="Delete distraction?"
        message={deleteArchived
          ? `"${deleteArchived.label}" will be permanently deleted. It won't be available when logging new reflections.`
          : ''}
        tone="destructive"
        onDismiss={() => setDeleteArchived(null)}
        actions={[
          { label: 'Cancel', tone: 'secondary', onPress: () => setDeleteArchived(null) },
          {
            label: 'Delete',
            tone: 'destructive',
            onPress: () => {
              if (deleteArchived) handlePermanentDelete(deleteArchived.key);
              setDeleteArchived(null);
            },
          },
        ]}
      />
    </KeyboardAvoidingView>
  );
}
