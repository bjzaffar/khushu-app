import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { and, eq } from 'drizzle-orm';
import { Text } from '@/components/ui/Typography';
import { db } from '@/db/database';
import { salahLogs, settings } from '@/db/schema';
import { shiftLocalDate, toLocalDateKey } from '@/lib/date';
import { getPatternForSalah } from '@/lib/patterns/patternEngine';
import {
  classifyDistraction,
  completeAIReminderGeneration,
  generateAIReminder,
  getReminderContent,
  queueAIReminderGeneration,
} from '@/lib/notifications/reminderContent';
import { queueClassificationUpdate, queueLogUpsert } from '@/lib/supabase/sync';
import { selectIsPremium, useAppStore } from '@/store/appStore';
import { DEV_TOOLS_ENABLED } from '@/lib/devTools';
import {
  DISTRACTION_LABELS,
  SALAH_DISPLAY_NAMES,
  SALAH_NAMES,
  type SalahName,
} from '@/types';

type CustomDistraction = { key: string; label: string };
type DevDistraction = CustomDistraction & { isCustom: boolean };
type GeneratedDevLog = {
  salahName: SalahName;
  focusRating: number;
  distractions: string;
  reflectionText: string;
  loggedAt: number;
  logDate: string;
  fromSalahMode: boolean;
  reminderType: null;
  classifiedCategory: string | null;
};

const CUSTOM_SETTING_KEYS = [
  'custom_distractions',
  'deleted_custom_distractions',
  'historical_custom_labels',
  'custom_distraction_labels',
];

function readCustomDistractions(): CustomDistraction[] {
  const all = new Map<string, string>();
  for (const key of CUSTOM_SETTING_KEYS) {
    const raw = db.select().from(settings).where(eq(settings.key, key)).get()?.value;
    if (!raw) continue;
    try {
      const entries = JSON.parse(raw) as CustomDistraction[];
      for (const entry of entries) {
        if (typeof entry?.key === 'string' && typeof entry.label === 'string' && entry.label.trim()) {
          all.set(entry.key, entry.label.trim());
        }
      }
    } catch {}
  }
  return [...all.entries()].map(([key, label]) => ({ key, label }));
}

export default function DevRoute() {
  if (!DEV_TOOLS_ENABLED) return <Redirect href="/" />;
  return <DevScreen />;
}

function DevScreen() {
  const isPremium = useAppStore(selectIsPremium);
  const userId = useAppStore((state) => state.userId);
  const [customDistractions, setCustomDistractions] = useState<CustomDistraction[]>([]);
  const [selectedSalah, setSelectedSalah] = useState<SalahName>('fajr');
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ text: string; type: string | null } | null>(null);

  useEffect(() => {
    setCustomDistractions(readCustomDistractions());
  }, []);

  const distractions = useMemo<DevDistraction[]>(() => [
    ...Object.entries(DISTRACTION_LABELS).map(([key, label]) => ({ key, label, isCustom: false })),
    ...customDistractions.map((distraction) => ({ ...distraction, isCustom: true })),
  ], [customDistractions]);

  async function generateHistory(distraction: DevDistraction) {
    if (isGenerating) return;
    setIsGenerating(true);
    setStatus(null);
    setPreview(null);

    try {
      let added = 0;
      let skipped = 0;
      let aiResult: 'cached' | 'queued' | null = null;
      const generatedLogs: GeneratedDevLog[] = [];
      const now = new Date();

      for (let offset = 1; offset <= 5; offset += 1) {
        const date = shiftLocalDate(now, -offset);
        const logDate = toLocalDateKey(date);
        const existing = db.select({ id: salahLogs.id })
          .from(salahLogs)
          .where(and(eq(salahLogs.salahName, selectedSalah), eq(salahLogs.logDate, logDate)))
          .get();
        if (existing) {
          skipped += 1;
          continue;
        }

        const loggedAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, offset).getTime();
        const log = {
          salahName: selectedSalah,
          focusRating: 3,
          distractions: distraction.key,
          reflectionText: 'Dev reminder test log',
          loggedAt,
          logDate,
          fromSalahMode: false,
          reminderType: null,
          classifiedCategory: null,
        };
        db.insert(salahLogs).values(log).run();
        generatedLogs.push(log);
        added += 1;
        queueLogUpsert(log, userId ?? undefined).catch((error) =>
          console.warn('[dev] test-log sync queued for retry:', error)
        );
      }

      if (distraction.isCustom && isPremium) {
        // Use the same durable workflow as a normal custom-distraction log so
        // this screen can exercise both online and offline AI reminder paths.
        queueAIReminderGeneration({
          customKey: distraction.key,
          text: distraction.label,
          prayerName: selectedSalah,
          closestCategory: null,
        });
        const category = await classifyDistraction(distraction.label);
        if (category) {
          queueAIReminderGeneration({
            customKey: distraction.key,
            text: distraction.label,
            prayerName: selectedSalah,
            closestCategory: category,
          });

          for (const log of generatedLogs) {
            db.update(salahLogs)
              .set({ classifiedCategory: category })
              .where(eq(salahLogs.loggedAt, log.loggedAt))
              .run();
            queueClassificationUpdate(log, category, userId ?? undefined).catch((error) =>
              console.warn('[dev] test-log classification sync queued for retry:', error)
            );
          }

          const generated = await generateAIReminder(
            distraction.label,
            distraction.key,
            category,
            selectedSalah,
          );
          if (generated) {
            completeAIReminderGeneration(distraction.key);
            aiResult = 'cached';
          } else {
            aiResult = 'queued';
          }
        } else {
          aiResult = 'queued';
        }
      }

      const pattern = await getPatternForSalah(selectedSalah);
      const reminder = getReminderContent(pattern);
      setPreview(reminder);
      const logStatus =
        added === 5
          ? `Added five ${SALAH_DISPLAY_NAMES[selectedSalah]} test logs for ${distraction.label}.`
          : `Added ${added} test log${added === 1 ? '' : 's'}; skipped ${skipped} existing day${skipped === 1 ? '' : 's'}.`;
      const aiStatus = aiResult === 'cached'
        ? ' Fresh AI reminder cached.'
        : aiResult === 'queued'
          ? ' AI reminder queued for the next connection.'
          : '';
      setStatus(`${logStatus}${aiStatus}`);
    } catch (error) {
      console.warn('[dev] Could not generate test logs:', error);
      setStatus('Could not generate the test logs. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <View className="flex-row items-center px-5 pt-4 pb-3">
        <Pressable onPress={() => router.back()} className="py-2 pr-4" accessibilityRole="button" accessibilityLabel="Close dev tools">
          <Text className="text-sage-600 text-sm font-semibold">Close</Text>
        </Pressable>
        <Text className="text-2xl font-semibold text-ink-900">Dev Tools</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}>
        <View className="bg-white rounded-2xl border border-sand-200 p-4 mb-5">
          <Text className="text-ink-900 font-semibold text-sm mb-1">Reminder history generator</Text>
          <Text className="text-ink-500 text-sm leading-relaxed">
            Tap a distraction to add up to five test logs for the five calendar days before today. Existing logs are never replaced.
          </Text>
        </View>

        <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">Target Salah</Text>
        <View className="flex-row flex-wrap gap-2 mb-6">
          {SALAH_NAMES.map((salah) => {
            const selected = salah === selectedSalah;
            return (
              <Pressable
                key={salah}
                onPress={() => setSelectedSalah(salah)}
                className={`px-3 py-2 rounded-xl ${selected ? 'bg-sage-600' : 'bg-white border border-sand-200'}`}
              >
                <Text className={`text-sm font-medium ${selected ? 'text-pure-white' : 'text-ink-700'}`}>
                  {SALAH_DISPLAY_NAMES[salah]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">Built-in distractions</Text>
        <View className="bg-white rounded-2xl border border-sand-200 overflow-hidden mb-6">
          {distractions.filter((item) => !item.isCustom).map((distraction, index, items) => (
            <Pressable
              key={distraction.key}
              onPress={() => void generateHistory(distraction)}
              disabled={isGenerating}
              className={`px-5 py-4 ${index < items.length - 1 ? 'border-b border-sand-100' : ''} ${isGenerating ? 'opacity-50' : 'active:bg-sand-100'}`}
            >
              <Text className="text-ink-700 font-medium text-sm">{distraction.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">Your custom distractions</Text>
        <View className="bg-white rounded-2xl border border-sand-200 overflow-hidden mb-5">
          {distractions.filter((item) => item.isCustom).length === 0 ? (
            <Text className="px-5 py-4 text-ink-300 text-sm">No custom distractions yet.</Text>
          ) : distractions.filter((item) => item.isCustom).map((distraction, index, items) => (
            <Pressable
              key={distraction.key}
              onPress={() => void generateHistory(distraction)}
              disabled={isGenerating}
              className={`px-5 py-4 ${index < items.length - 1 ? 'border-b border-sand-100' : ''} ${isGenerating ? 'opacity-50' : 'active:bg-sand-100'}`}
            >
              <Text className="text-ink-700 font-medium text-sm">{distraction.label}</Text>
            </Pressable>
          ))}
        </View>

        {isGenerating && <ActivityIndicator color="#5A7A5A" className="mb-4" />}
        {status && <Text className="text-ink-500 text-sm leading-relaxed mb-4">{status}</Text>}
        {preview && (
          <View className="bg-sage-100 rounded-2xl p-4">
            <Text className="text-sage-700 text-xs font-semibold uppercase tracking-widest mb-2">
              Preview{preview.type ? ` · ${preview.type}` : ''}
            </Text>
            <Text className="text-ink-900 text-sm leading-relaxed">{preview.text}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
