import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { db } from '@/db/database';
import { salahLogs } from '@/db/schema';
import { useAppStore } from '@/store/appStore';
import {
  SALAH_NAMES,
  SALAH_DISPLAY_NAMES,
  DISTRACTION_LABELS,
  type SalahName,
  type DistractionKey,
} from '@/types';
import { getCurrentSalahWindow } from '@/lib/prayer/prayerTimes';

const DISTRACTION_KEYS = Object.keys(DISTRACTION_LABELS) as DistractionKey[];

const RATING_LABELS: Record<number, string> = {
  1: 'Heavily distracted',
  2: 'Somewhat distracted',
  3: 'Partially present',
  4: 'Mostly present',
  5: 'Fully present',
};

export default function LogScreen() {
  const params = useLocalSearchParams<{ salah?: string; fromSalahMode?: string }>();
  const { todaysPrayerTimes } = useAppStore();

  function resolveInitialSalah(): SalahName {
    if (params.salah && SALAH_NAMES.includes(params.salah as SalahName)) {
      return params.salah as SalahName;
    }
    if (todaysPrayerTimes) {
      return getCurrentSalahWindow(todaysPrayerTimes) ?? 'fajr';
    }
    return 'fajr';
  }

  const [selectedSalah, setSelectedSalah] = useState<SalahName>(resolveInitialSalah);
  const [focusRating, setFocusRating] = useState(0);
  const [selectedDistractions, setSelectedDistractions] = useState<DistractionKey[]>([]);
  const [reflectionText, setReflectionText] = useState('');
  const [saved, setSaved] = useState(false);
  const [savedSalahName, setSavedSalahName] = useState<SalahName>('fajr');

  // When arriving from Salah Mode, reset and pre-select that Salah
  useFocusEffect(
    useCallback(() => {
      if (params.fromSalahMode === '1' && params.salah) {
        setSelectedSalah(params.salah as SalahName);
        setFocusRating(0);
        setSelectedDistractions([]);
        setReflectionText('');
        setSaved(false);
      }
    }, [params.fromSalahMode, params.salah])
  );

  function toggleDistraction(key: DistractionKey) {
    setSelectedDistractions((prev) =>
      prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]
    );
  }

  async function handleSave() {
    if (focusRating === 0) return;
    const now = new Date();
    await db.insert(salahLogs).values({
      salahName: selectedSalah,
      focusRating,
      distractions: selectedDistractions.join(','),
      reflectionText: reflectionText.trim(),
      loggedAt: now.getTime(),
      logDate: now.toISOString().split('T')[0],
      fromSalahMode: params.fromSalahMode === '1',
    });
    setSavedSalahName(selectedSalah);
    setSaved(true);
  }

  function handleLogAnother() {
    setFocusRating(0);
    setSelectedDistractions([]);
    setReflectionText('');
    setSaved(false);
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
          <Text className="text-ink-300 text-sm text-center leading-relaxed">
            May your next prayer be full of presence.
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
              {SALAH_NAMES.map((name) => (
                <Pressable
                  key={name}
                  onPress={() => setSelectedSalah(name)}
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
              ))}
            </View>
          </View>

          {/* ── Focus Rating ───────────────────────────────────────────────── */}
          <View className="mb-6">
            <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
              Focus Level
            </Text>
            <View className="bg-white rounded-2xl border border-sand-200 p-5">
              <View className="flex-row justify-around">
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
            <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
              What distracted you?{' '}
              <Text className="normal-case font-normal">(optional)</Text>
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {DISTRACTION_KEYS.map((key) => {
                const active = selectedDistractions.includes(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() => toggleDistraction(key)}
                    className={`py-2 px-4 rounded-xl ${active ? 'bg-sage-600' : 'bg-sand-200'}`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        active ? 'text-white' : 'text-ink-700'
                      }`}
                    >
                      {DISTRACTION_LABELS[key]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Reflection Text ───────────────────────────────────────────── */}
          <View className="mb-8">
            <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
              Reflection{' '}
              <Text className="normal-case font-normal">(optional)</Text>
            </Text>
            <View className="bg-white rounded-2xl border border-sand-200 px-4 py-3">
              <TextInput
                value={reflectionText}
                onChangeText={(t) => setReflectionText(t.slice(0, 150))}
                placeholder="A thought, intention, or what you noticed…"
                placeholderTextColor="#9B9189"
                multiline
                className="text-ink-700 text-sm leading-relaxed"
                style={{ minHeight: 72, textAlignVertical: 'top' }}
              />
              <Text className="text-ink-300 text-xs text-right mt-1">
                {reflectionText.length}/150
              </Text>
            </View>
          </View>

          {/* ── Save Button ───────────────────────────────────────────────── */}
          <Pressable
            onPress={handleSave}
            disabled={focusRating === 0}
            className={`py-4 rounded-2xl items-center ${
              focusRating > 0 ? 'bg-sage-600 active:bg-sage-700' : 'bg-sand-200'
            }`}
          >
            <Text
              className={`font-semibold text-base ${
                focusRating > 0 ? 'text-white' : 'text-ink-300'
              }`}
            >
              Save Reflection
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
