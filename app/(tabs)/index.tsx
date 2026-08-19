import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { Text, TextInput } from '@/components/ui/Typography';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  StarIcon,
} from 'react-native-heroicons/outline';
import {
  BookmarkIcon as BookmarkSolidIcon,
  StarIcon as StarSolidIcon,
} from 'react-native-heroicons/solid';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import {
  DISTRACTION_LABELS,
  SALAH_DISPLAY_NAMES,
  SALAH_NAMES,
  type DistractionKey,
  type SalahName,
  type PrayerTimes,
} from '@/types';
import {
  calculatePrayerTimes,
  formatPrayerTime,
  getCurrentSalahWindow,
} from '@/lib/prayer/prayerTimes';
import {
  formatLongLocalDate,
  localCalendarDate,
  shiftLocalDate,
  toLocalDateKey,
} from '@/lib/date';
import { db } from '@/db/database';
import { salahLogs, settings } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import {
  requestNotificationPermissions,
  schedulePostSalahPrompts,
  schedulePreSalahReminders,
  setupNotificationChannel,
} from '@/lib/notifications/notificationService';
import { updateLogNoteEverywhere } from '@/lib/supabase/sync';

type SalahStatus = 'logged' | 'current' | 'upcoming' | 'past' | 'historical';

type HomeSalahLog = {
  rating: number;
  distraction?: string;
  note?: string;
};

type OpenNote = {
  salahName: SalahName;
  note: string;
  logDate: string;
};

const NOTE_MAX_LENGTH = 200;

const CUSTOM_DISTRACTION_SETTING_KEYS = [
  'custom_distraction_labels',
  'historical_custom_labels',
  'deleted_custom_distractions',
  'custom_distractions',
];

function getCustomDistractionLabels(rows: { key: string; value: string }[]) {
  const rowsByKey = new Map(rows.map((row) => [row.key, row.value]));
  const labels: Record<string, string> = {};

  for (const settingKey of CUSTOM_DISTRACTION_SETTING_KEYS) {
    const value = rowsByKey.get(settingKey);
    if (!value) continue;

    try {
      const distractions = JSON.parse(value) as { key: string; label: string }[];
      for (const distraction of distractions) labels[distraction.key] = distraction.label;
    } catch {}
  }

  return labels;
}

function getDistractionTitle(distractions: string, customLabels: Record<string, string>) {
  const labels = distractions
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
    .map((key) =>
      DISTRACTION_LABELS[key as DistractionKey]
      ?? customLabels[key]
      ?? (key === 'other' ? 'Other' : 'Deleted distraction')
    );

  return labels.length > 0 ? labels.join(', ') : undefined;
}

function getSalahStatus(
  name: SalahName,
  prayerTimes: PrayerTimes,
  loggedSet: Set<string>,
  now: Date
): SalahStatus {
  if (loggedSet.has(name)) return 'logged';
  const currentWindow = getCurrentSalahWindow(prayerTimes, now);
  if (currentWindow === name) return 'current';
  if (prayerTimes[name] > now) return 'upcoming';
  return 'past';
}

function loadHomeLogs(dateKey: string): Record<string, HomeSalahLog> {
  const logs = db
    .select()
    .from(salahLogs)
    .where(eq(salahLogs.logDate, dateKey))
    .all();
  const customLabelRows = db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, CUSTOM_DISTRACTION_SETTING_KEYS))
    .all();
  const customLabels = getCustomDistractionLabels(customLabelRows);
  const map: Record<string, HomeSalahLog> = {};

  for (const log of logs) {
    map[log.salahName] = {
      rating: log.focusRating,
      distraction: getDistractionTitle(log.distractions, customLabels),
      note: log.reflectionText?.trim() || undefined,
    };
  }

  return map;
}

export default function HomeScreen() {
  const {
    isDbReady,
    todaysPrayerTimes,
    location,
    calculationMethod,
    asrMadhab,
    reminderMinutesBefore,
    postSalahPromptEnabled,
    startSalahMode,
    homeTabReselectionVersion,
  } = useAppStore();
  const [selectedDate, setSelectedDate] = useState(() => localCalendarDate(new Date()));
  const [selectedLogs, setSelectedLogs] = useState<Record<string, HomeSalahLog>>({});
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [openNote, setOpenNote] = useState<OpenNote | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const hasRequestedNotifications = useRef(false);
  const hasScheduledInitialReminders = useRef(false);
  const dayTransition = useRef(new Animated.Value(1)).current;
  const [dayTransitionDirection, setDayTransitionDirection] = useState(0);
  const lastHomeTabReselection = useRef(homeTabReselectionVersion);

  const now = new Date();
  const today = localCalendarDate(now);
  const selectedDateKey = toLocalDateKey(selectedDate);
  const isToday = selectedDateKey === toLocalDateKey(today);
  const selectedPrayerTimes = useMemo(() => {
    if (isToday && todaysPrayerTimes) return todaysPrayerTimes;
    if (!location) return null;
    return calculatePrayerTimes(location, selectedDate, calculationMethod, asrMadhab);
  }, [asrMadhab, calculationMethod, isToday, location, selectedDate, todaysPrayerTimes]);

  // Home is the first screen after the user finishes onboarding, so ask here
  // rather than interrupting the location or account steps.
  useEffect(() => {
    if (!isDbReady || hasRequestedNotifications.current) return;
    hasRequestedNotifications.current = true;

    async function requestInitialNotificationPermission() {
      await setupNotificationChannel();
      setNotificationsGranted(await requestNotificationPermissions());
    }

    requestInitialNotificationPermission().catch((error) =>
      console.warn('[notifications] initial permission request failed:', error)
    );
  }, [isDbReady]);

  useEffect(() => {
    if (!notificationsGranted || !todaysPrayerTimes || hasScheduledInitialReminders.current) return;
    hasScheduledInitialReminders.current = true;
    const prayerTimes = todaysPrayerTimes;

    async function scheduleInitialReminders() {
      await schedulePreSalahReminders(prayerTimes, reminderMinutesBefore);
      if (postSalahPromptEnabled) await schedulePostSalahPrompts(prayerTimes);
    }

    scheduleInitialReminders().catch((error) =>
      console.warn('[notifications] initial reminder scheduling failed:', error)
    );
  }, [notificationsGranted, postSalahPromptEnabled, reminderMinutesBefore, todaysPrayerTimes]);

  const transitionToDate = useCallback((nextDate: Date) => {
    const normalizedDate = localCalendarDate(nextDate);
    const nextDateKey = toLocalDateKey(normalizedDate);
    if (nextDateKey === selectedDateKey) return;

    setDayTransitionDirection(nextDateKey < selectedDateKey ? -1 : 1);
    dayTransition.stopAnimation();
    dayTransition.setValue(0);
    setSelectedLogs(loadHomeLogs(nextDateKey));
    setSelectedDate(normalizedDate);

    Animated.timing(dayTransition, {
      toValue: 1,
      duration: 360,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [dayTransition, selectedDateKey]);

  // Refresh today's data on entry. Reset the selected day on blur so Home is
  // already on today before it becomes visible again, avoiding an entry flicker.
  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      const todayOnFocus = localCalendarDate(new Date());
      setSelectedLogs(loadHomeLogs(toLocalDateKey(todayOnFocus)));
      dayTransition.stopAnimation();
      dayTransition.setValue(1);
      setDayTransitionDirection(0);

      return () => {
        const todayOnBlur = localCalendarDate(new Date());
        setSelectedDate(todayOnBlur);
        setSelectedLogs(loadHomeLogs(toLocalDateKey(todayOnBlur)));
        dayTransition.stopAnimation();
        dayTransition.setValue(1);
        setDayTransitionDirection(0);
      };
    }, [dayTransition])
  );

  // A focused Home-tab press scrolls to the top. It changes the day only when
  // viewing history; pressing Home again on today intentionally does not animate.
  useEffect(() => {
    if (lastHomeTabReselection.current === homeTabReselectionVersion) return;
    lastHomeTabReselection.current = homeTabReselectionVersion;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    if (!isToday) transitionToDate(localCalendarDate(new Date()));
  }, [homeTabReselectionVersion, isToday, transitionToDate]);

  const loggedSet = new Set(Object.keys(selectedLogs));

  function handleSalahPress(name: SalahName, status: SalahStatus) {
    if (isToday && status !== 'logged') {
      startSalahMode(name);
      router.push('/salah-mode');
    }
  }

  function showNote(salahName: SalahName, note: string) {
    setOpenNote({ salahName, note, logDate: selectedDateKey });
    setNoteDraft(note);
    setIsEditingNote(false);
  }

  function closeNote() {
    setOpenNote(null);
    setNoteDraft('');
    setIsEditingNote(false);
  }

  function cancelNoteEdit() {
    setNoteDraft(openNote?.note ?? '');
    setIsEditingNote(false);
  }

  function saveNoteEdit() {
    if (!openNote) return;
    const normalizedNote = noteDraft.trim().slice(0, NOTE_MAX_LENGTH);
    if (!normalizedNote) return;

    updateLogNoteEverywhere(
      openNote.salahName,
      openNote.logDate,
      normalizedNote,
      useAppStore.getState().userId ?? undefined,
    ).catch((error) =>
      console.warn('[sync] note update queued for retry:', error)
    );

    setSelectedLogs((current) => ({
      ...current,
      [openNote.salahName]: {
        ...current[openNote.salahName],
        note: normalizedNote,
      },
    }));
    setOpenNote({ ...openNote, note: normalizedNote });
    setNoteDraft(normalizedNote);
    setIsEditingNote(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }}
      >
        <View className="mb-6">
          <Text className="text-2xl font-semibold text-ink-900">Today</Text>
          <Text className="text-ink-300 text-sm mt-1">{formatLongLocalDate(now)}</Text>
        </View>

        <View className="mb-7">
          <View className="relative w-full h-10 items-center justify-center">
            <Animated.View
              style={{
                opacity: dayTransition,
                transform: [{
                  translateX: dayTransition.interpolate({
                    inputRange: [0, 1],
                    outputRange: [dayTransitionDirection * 12, 0],
                  }),
                }],
              }}
            >
              <Text className="text-lg font-semibold text-ink-900 text-center">
                {isToday ? 'Today' : formatLongLocalDate(selectedDate)}
              </Text>
            </Animated.View>
            <Pressable
              onPress={() => transitionToDate(shiftLocalDate(selectedDate, -1))}
              className="absolute left-0 top-0 w-10 h-10 rounded-full bg-white items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Show previous day"
            >
              <ChevronLeftIcon size={16} color="#6F675F" />
            </Pressable>
            {!isToday && (
              <Pressable
                onPress={() => transitionToDate(shiftLocalDate(selectedDate, 1))}
                className="absolute right-0 top-0 w-10 h-10 rounded-full bg-white items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel="Show next day"
              >
                <ChevronRightIcon size={16} color="#6F675F" />
              </Pressable>
            )}
          </View>
        </View>

        {selectedPrayerTimes ? (
          <View className="gap-y-3">
            {SALAH_NAMES.map((name) => {
              const status: SalahStatus = isToday
                ? getSalahStatus(name, selectedPrayerTimes, loggedSet, now)
                : loggedSet.has(name) ? 'logged' : 'historical';
              const log = selectedLogs[name];
              return (
                <SalahCard
                  key={name}
                  name={name}
                  time={formatPrayerTime(selectedPrayerTimes[name])}
                  status={status}
                  rating={log?.rating}
                  distraction={log?.distraction}
                  note={log?.note}
                  onPress={() => handleSalahPress(name, status)}
                  onNotePress={log?.note ? () => showNote(name, log.note!) : undefined}
                />
              );
            })}
          </View>
        ) : (
          <View className="bg-sand-200 rounded-2xl p-5 items-center">
            <Text className="text-ink-300 text-sm text-center">
              Enable location in Settings to see prayer times.
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={openNote !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={isEditingNote ? cancelNoteEdit : closeNote}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
        >
          <Pressable
            accessibilityRole="none"
            className="flex-1 bg-black/40 items-center justify-center px-6"
            onPress={isEditingNote ? cancelNoteEdit : closeNote}
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
              <Text className="text-ink-900 text-lg font-semibold text-center mb-5">
                Note
              </Text>

              <View className="relative bg-white rounded-2xl border border-yellow-500 px-4 pt-4 pb-11 min-h-32">
                <TextInput
                  value={isEditingNote ? noteDraft : openNote?.note ?? ''}
                  onChangeText={(text) => setNoteDraft(text.slice(0, NOTE_MAX_LENGTH))}
                  maxLength={NOTE_MAX_LENGTH}
                  editable={isEditingNote}
                  multiline
                  textAlignVertical="top"
                  className="text-ink-700 text-sm leading-relaxed min-h-20"
                />
                {isEditingNote ? (
                  <Text className="absolute right-3 bottom-3 text-ink-300 text-xs">
                    {noteDraft.length}/{NOTE_MAX_LENGTH}
                  </Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit note"
                    onPress={() => {
                      setNoteDraft(openNote?.note ?? '');
                      setIsEditingNote(true);
                    }}
                    hitSlop={8}
                    className="absolute right-3 bottom-3"
                  >
                    <PencilIcon size={20} color="#EAB308" />
                  </Pressable>
                )}
              </View>

              {isEditingNote ? (
                <View className="mt-5" style={{ flexDirection: 'row', width: '100%' }}>
                  <View style={{ width: '50%', paddingRight: 6 }}>
                    <Pressable
                      onPress={cancelNoteEdit}
                      className="min-h-12 py-3 rounded-2xl bg-sand-200 items-center justify-center"
                      style={{ width: '100%' }}
                    >
                      <Text className="text-ink-700 text-sm font-semibold">Cancel</Text>
                    </Pressable>
                  </View>
                  <View style={{ width: '50%', paddingLeft: 6 }}>
                    <Pressable
                      onPress={saveNoteEdit}
                      disabled={!noteDraft.trim()}
                      className={`min-h-12 py-3 rounded-2xl items-center justify-center ${
                        noteDraft.trim()
                          ? 'bg-yellow-500 active:bg-yellow-600'
                          : 'bg-sand-200'
                      }`}
                      style={{ width: '100%' }}
                    >
                      <Text className={`text-sm font-semibold ${
                        noteDraft.trim() ? 'text-white' : 'text-ink-300'
                      }`}>
                        Save note
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View className="mt-5">
                  <Pressable
                    onPress={closeNote}
                    className="w-full min-h-12 py-3 rounded-2xl bg-sand-200 items-center justify-center"
                  >
                    <Text className="text-ink-700 text-sm font-semibold">Back</Text>
                  </Pressable>
                </View>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function SalahCard({
  name,
  time,
  status,
  rating,
  distraction,
  note,
  onPress,
  onNotePress,
}: {
  name: SalahName;
  time: string;
  status: SalahStatus;
  rating?: number;
  distraction?: string;
  note?: string;
  onPress: () => void;
  onNotePress?: () => void;
}) {
  const isInteractive = status !== 'logged' && status !== 'historical';

  const borderColor = {
    logged: 'border-sage-500',
    current: 'border-sage-600',
    upcoming: 'border-sand-200',
    past: 'border-sand-200',
    historical: 'border-sand-200',
  }[status];

  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ disabled: !isInteractive }}
      className={`rounded-2xl px-5 py-4 flex-row justify-between items-center border bg-white ${borderColor} ${
        status === 'past' ? 'opacity-60' : ''
      }`}
    >
      <View className="flex-1">
        <View className="flex-row items-center gap-x-2">
          <Text className="font-medium text-base text-ink-700">
            {SALAH_DISPLAY_NAMES[name]}
          </Text>
          {note && onNotePress && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open note for ${SALAH_DISPLAY_NAMES[name]}`}
              onPress={onNotePress}
              hitSlop={8}
            >
              <BookmarkSolidIcon size={18} color="#EAB308" />
            </Pressable>
          )}
        </View>
        {status === 'current' && (
          <Text className="text-sage-600 text-xs font-medium mt-0.5">
            Now · Tap to enter Salah Mode
          </Text>
        )}
        {(status === 'upcoming' || status === 'past') && (
          <Text className="text-ink-300 text-xs mt-0.5">Tap to enter Salah Mode</Text>
        )}
      </View>

      <View className="items-end gap-y-1">
        <Text className="text-ink-300 text-sm">{time}</Text>
        {status === 'logged' && rating !== undefined && (
          <View className="flex-row items-center justify-end gap-x-2">
            {distraction && (
              <Text
                className="text-sage-600 text-xs font-medium"
                numberOfLines={1}
                style={{ maxWidth: 140 }}
              >
                {distraction}
              </Text>
            )}
            <View className="flex-row gap-x-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                n <= rating
                  ? <StarSolidIcon key={n} size={12} color="#5A7A5A" />
                  : <StarIcon key={n} size={12} color="#DDD0BA" />
              ))}
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}
