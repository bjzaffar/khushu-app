import { View, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Text, TextInput } from '@/components/ui/Typography';
import { CheckCircleIcon as CheckCircleSolidIcon } from 'react-native-heroicons/solid';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { router } from 'expo-router';
import { eq, and, gte, count, like } from 'drizzle-orm';
import { db } from '@/db/database';
import { settings, salahLogs } from '@/db/schema';
import { selectIsPremium, useAppStore } from '@/store/appStore';
import { writeDebugPremiumOverride } from '@/lib/debug/premiumOverride';
import { classifyDistraction, generateAIReminder } from '@/lib/notifications/reminderContent';
import { queueLogUpsert } from '@/lib/supabase/sync';
import { schedulePreSalahReminders } from '@/lib/notifications/notificationService';
import {
  SALAH_NAMES,
  SALAH_DISPLAY_NAMES,
  DISTRACTION_LABELS,
  type SalahName,
  type DistractionKey,
} from '@/types';

const DAY = 86_400_000;
const DEFAULT_DISTRACTION_KEYS = Object.keys(DISTRACTION_LABELS) as DistractionKey[];
function saveSetting(key: string, value: string) {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

function getSettingJSON(key: string): unknown {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

function saveSettingJSON(key: string, value: unknown) {
  saveSetting(key, JSON.stringify(value));
}

type StatusStep = 'idle' | 'seeding' | 'classifying' | 'generating' | 'scheduling' | 'done' | 'error';

export default function DebugScreen() {
  return <DebugScreenContent />;
}

function DebugScreenContent() {

  const {
    todaysPrayerTimes,
    location,
    calculationMethod,
    asrMadhab,
    reminderMinutesBefore,
    userId,
    debugPremiumOverride,
    setDebugPremiumOverride,
  } = useAppStore();
  const isPremium = useAppStore(selectIsPremium);

  const [salah, setSalah] = useState<SalahName>('fajr');
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<StatusStep>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [showSalahPicker, setShowSalahPicker] = useState(false);
  const [defaultDistraction, setDefaultDistraction] = useState<DistractionKey>('work');

  function handlePremiumOverride() {
    const nextValue = !debugPremiumOverride;
    writeDebugPremiumOverride(userId, nextValue);
    setDebugPremiumOverride(nextValue);
  }

  async function handleSeedDefaultDistraction() {
    const now = Date.now();
    const debugMarker = `__debug_default_${defaultDistraction}_${now}`;
    const otherSalahs = SALAH_NAMES.filter((name) => name !== salah);

    try {
      setStatus('seeding');
      setStatusMsg('Inserting simulated logsâ€¦');

      // Six logs for the selected Salah, plus four for the remaining Salahs.
      // These are deliberately plain logs: no AI classification or reminder generation.
      for (let i = 1; i <= 10; i++) {
        const ts = now - i * DAY;
        const date = new Date(ts).toISOString().split('T')[0];
        await db.insert(salahLogs).values({
          salahName: i <= 6 ? salah : otherSalahs[(i - 7) % otherSalahs.length],
          focusRating: i <= 6 ? 2 : 3,
          distractions: defaultDistraction,
          loggedAt: ts,
          logDate: date,
          fromSalahMode: false,
          reminderType: 'short',
          reflectionText: debugMarker,
        });
      }

      // Startup refreshes the signed-in user's local cache from Supabase. Keep
      // simulated entries in that source of truth too, otherwise that refresh
      // removes them after the app is reopened.
      if (userId) {
        for (let i = 1; i <= 10; i++) {
          const ts = now - i * DAY;
          const date = new Date(ts).toISOString().split('T')[0];
          await queueLogUpsert({
            salahName: i <= 6 ? salah : otherSalahs[(i - 7) % otherSalahs.length],
            focusRating: i <= 6 ? 2 : 3,
            distractions: defaultDistraction,
            loggedAt: ts,
            logDate: date,
            fromSalahMode: false,
            reminderType: 'short',
            reflectionText: debugMarker,
          }, userId);
        }
      }

      const total = db.select({ total: count() }).from(salahLogs).get();
      setStatus('done');
      setStatusMsg(
        `Created 10 simulated logs for ${DISTRACTION_LABELS[defaultDistraction]}.\n` +
        `No AI reminder was generated.\n\n` +
        `Total logs: ${total?.total ?? 0}`
      );
    } catch (e) {
      setStatus('error');
      setStatusMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleSeed() {
    const trimmed = label.trim();
    if (!trimmed) {
      Alert.alert('Enter a label', 'Type a custom distraction label to seed.');
      return;
    }
    if (!todaysPrayerTimes || !location) {
      Alert.alert('Missing data', 'Make sure location is set and prayer times are loaded.');
      return;
    }

    const customKey = `custom_${Date.now()}`;
    const now = Date.now();

    try {
      // 1. Store custom distraction label
      setStatus('seeding');
      setStatusMsg('Storing custom distraction…');
      const existing = (getSettingJSON('custom_distractions') as { key: string; label: string }[]) ?? [];
      existing.push({ key: customKey, label: trimmed });
      saveSettingJSON('custom_distractions', existing);

      // 2. Insert 6 dummy logs spread across last 6 days (not today)
      setStatusMsg('Inserting 6 dummy logs…');
      const debugMarker = `__debug_${customKey}`;
      for (let i = 1; i <= 6; i++) {
        const ts = now - i * DAY;
        const date = new Date(ts).toISOString().split('T')[0];
        await db.insert(salahLogs).values({
          salahName: salah,
          focusRating: 2,
          distractions: customKey,
          loggedAt: ts,
          logDate: date,
          fromSalahMode: false,
          reminderType: 'short',
          reflectionText: debugMarker,
        });
      }

      // 3. Insert 4 extra logs for other salahs to hit totalLogs >= 10 (cold start threshold)
      setStatusMsg('Inserting extra logs to meet threshold…');
      const otherSalahs = SALAH_NAMES.filter((s) => s !== salah);
      for (let i = 0; i < 4; i++) {
        const ts = now - (i + 1) * DAY;
        const date = new Date(ts).toISOString().split('T')[0];
        await db.insert(salahLogs).values({
          salahName: otherSalahs[i % otherSalahs.length],
          focusRating: 3,
          distractions: 'work',
          loggedAt: ts,
          logDate: date,
          fromSalahMode: false,
          reminderType: 'short',
          reflectionText: debugMarker,
        });
      }

      // Sync seeded logs to cloud (best-effort, only if signed in)
      if (userId) {
        for (let i = 1; i <= 6; i++) {
          const ts = now - i * DAY;
          const date = new Date(ts).toISOString().split('T')[0];
          await queueLogUpsert({
            salahName: salah,
            focusRating: 2,
            distractions: customKey,
            loggedAt: ts,
            logDate: date,
            fromSalahMode: false,
            reminderType: 'short',
            reflectionText: debugMarker,
          }, userId).catch(() => {});
        }
        for (let i = 0; i < 4; i++) {
          const ts = now - (i + 1) * DAY;
          const date = new Date(ts).toISOString().split('T')[0];
          await queueLogUpsert({
            salahName: otherSalahs[i % otherSalahs.length],
            focusRating: 3,
            distractions: 'work',
            loggedAt: ts,
            logDate: date,
            fromSalahMode: false,
            reminderType: 'short',
            reflectionText: debugMarker,
          }, userId).catch(() => {});
        }
      }

      // 4. Classify
      setStatus('classifying');
      setStatusMsg('Classifying distraction with AI…');
      const category = await classifyDistraction(trimmed);

      // 4. Generate AI reminder (real edge function)
      setStatus('generating');
      setStatusMsg('Generating AI reminder…');
      const aiResult = await generateAIReminder(trimmed, customKey, category, salah);

      // Fallback: if edge function failed, write a test reminder directly to SecureStore
      if (!aiResult) {
        console.log(`[debug] generateAIReminder returned null — writing fallback to SecureStore`);
      } else {
        console.log(`[debug] generateAIReminder succeeded: ${aiResult.text.substring(0, 60)}`);
      }

      // 5. Re-schedule notifications
      setStatus('scheduling');
      setStatusMsg('Re-scheduling notifications…');
      await schedulePreSalahReminders(todaysPrayerTimes, reminderMinutesBefore);

      // Store debug key for cleanup
      saveSetting('debug_custom_key', customKey);

      // Verify inserts
      const verifyLogs = await db.select().from(salahLogs).where(eq(salahLogs.salahName, salah));
      const verifyTotal = await db.select({ total: count() }).from(salahLogs);
      console.log(`[debug] Verify: ${verifyLogs.length} ${salah} logs, ${verifyTotal[0].total} total`);

      setStatus('done');
      setStatusMsg(
        `Done!\n\n` +
        `Key: ${customKey}\n` +
        `Verified: ${verifyLogs.length} ${SALAH_DISPLAY_NAMES[salah]} logs, ${verifyTotal[0].total} total\n` +
        `Classification: ${category ?? 'null'}\n` +
        `AI reminder: ${aiResult ? 'cached' : 'generation failed; check Edge Function logs.'}\n` +
        `Notifications re-scheduled.\n\n` +
        `Tap ${SALAH_DISPLAY_NAMES[salah]} to test.`
      );
    } catch (e) {
      setStatus('error');
      setStatusMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function handleClear() {
    // Delete only logs created by the debug tools.
    const deleted = db.delete(salahLogs)
      .where(like(salahLogs.reflectionText, '__debug_%'))
      .run();

    // Remove ALL custom distractions from settings
    const existing = (getSettingJSON('custom_distractions') as { key: string; label: string }[]) ?? [];
    const realDistractions = existing.filter((d) => !d.key.startsWith('custom_'));
    saveSettingJSON('custom_distractions', realDistractions);

    // Remove debug key
    db.delete(settings).where(eq(settings.key, 'debug_custom_key')).run();

    // Verify
    const remaining = db.select({ total: count() }).from(salahLogs).all();
    setStatus('idle');
    setStatusMsg(`Cleared all debug logs.\nRemoved: ${deleted.changes}\nRemaining: ${remaining[0].total} real logs.`);
  }

  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <Text className="text-2xl font-semibold text-ink-900">Debug</Text>
          <Pressable onPress={() => router.back()} className="px-3 py-1">
            <Text className="text-sage-600 text-sm font-medium">Close</Text>
          </Pressable>
        </View>

        <View className="mb-5 bg-white rounded-2xl border border-sand-200 p-5">
          <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-2">
            Premium access
          </Text>
          <Text className="text-ink-700 text-sm mb-4">
            {debugPremiumOverride
              ? 'Debug override is enabled. RevenueCat remains unchanged.'
              : isPremium
                ? 'Active through RevenueCat.'
                : 'Inactive (RevenueCat is the source of truth).'}
          </Text>
          <Pressable
            onPress={handlePremiumOverride}
            className={`rounded-2xl px-5 py-4 items-center ${
              debugPremiumOverride ? 'bg-sand-200 active:bg-sand-300' : 'bg-sage-600 active:bg-sage-700'
            }`}
          >
            <Text className={`font-semibold text-sm ${debugPremiumOverride ? 'text-ink-700' : 'text-white'}`}>
              {debugPremiumOverride ? 'Disable Premium Override' : 'Enable Premium Override'}
            </Text>
          </Pressable>
        </View>

        {/* Salah Picker */}
        <View className="mb-5">
          <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
            Salah
          </Text>
          <View className="bg-white rounded-2xl border border-sand-200 overflow-hidden">
            <Pressable
              onPress={() => setShowSalahPicker(!showSalahPicker)}
              className="px-5 py-4 flex-row justify-between items-center active:bg-sand-100"
            >
              <Text className="text-ink-700 font-medium text-sm">
                {SALAH_DISPLAY_NAMES[salah]}
              </Text>
              <Text className="text-ink-300 text-xs">
                {showSalahPicker ? '▲' : '▼'}
              </Text>
            </Pressable>
            {showSalahPicker && (
              <View className="border-t border-sand-100">
                {SALAH_NAMES.map((name, i) => (
                  <Pressable
                    key={name}
                    onPress={() => { setSalah(name); setShowSalahPicker(false); }}
                    className={`px-5 py-4 flex-row justify-between items-center active:bg-sand-100 ${
                      i < SALAH_NAMES.length - 1 ? 'border-b border-sand-100' : ''
                    }`}
                  >
                    <Text className={`text-sm font-medium ${salah === name ? 'text-sage-600' : 'text-ink-700'}`}>
                      {SALAH_DISPLAY_NAMES[name]}
                    </Text>
                    {salah === name && (
                      <View className="w-5 h-5 rounded-full bg-sage-600 items-center justify-center">
                        <CheckCircleSolidIcon size={14} color="#FFFFFF" />
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Custom Distraction Label */}
        <View className="mb-5">
          <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
            Custom distraction label
          </Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. phone scrolling"
            placeholderTextColor="#B8AFA6"
            className="bg-white rounded-2xl border border-sand-200 px-5 py-4 text-ink-700 text-sm"
            autoCapitalize="none"
          />
        </View>

        {/* Default Distraction Simulator */}
        <View className="mb-5">
          <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
            Simulated default distraction
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-3">
            {DEFAULT_DISTRACTION_KEYS.map((key) => {
              const selected = defaultDistraction === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setDefaultDistraction(key)}
                  className={`rounded-full border px-3 py-2 ${
                    selected ? 'bg-sage-600 border-sage-600' : 'bg-white border-sand-200'
                  }`}
                >
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-ink-700'}`}>
                    {DISTRACTION_LABELS[key]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={handleSeedDefaultDistraction}
            disabled={status === 'seeding' || status === 'classifying' || status === 'generating' || status === 'scheduling'}
            className="bg-white rounded-2xl border border-sage-600 px-5 py-4 active:bg-sage-50"
          >
            <Text className="text-sage-600 font-medium text-sm">
              Create Simulated Logs (No AI Reminder)
            </Text>
          </Pressable>
        </View>

        {/* Seed Button */}
        <Pressable
          onPress={handleSeed}
          disabled={status === 'seeding' || status === 'classifying' || status === 'generating' || status === 'scheduling'}
          className="bg-sage-600 rounded-2xl px-5 py-4 flex-row items-center justify-between mb-5 active:bg-sage-700"
        >
          <Text className="text-white font-medium text-sm">Seed & Generate AI Reminder</Text>
          {(status === 'seeding' || status === 'classifying' || status === 'generating' || status === 'scheduling') && (
            <ActivityIndicator size="small" color="#FFFFFF" />
          )}
        </Pressable>

        {/* Status */}
        {statusMsg ? (
          <View className="bg-white rounded-2xl border border-sand-200 px-5 py-4 mb-5">
            <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-2">
              Status
            </Text>
            <Text className="text-ink-700 text-sm leading-5">{statusMsg}</Text>
          </View>
        ) : null}

        {/* Divider */}
        <View className="border-t border-sand-200 my-3" />

        {/* Clear Button */}
        <Pressable
          onPress={handleClear}
          className="bg-white rounded-2xl border border-red-200 px-5 py-4 active:bg-red-50"
        >
          <Text className="text-red-400 font-medium text-sm">Clear Debug Data</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
