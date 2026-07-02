import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import {
  SALAH_DISPLAY_NAMES,
  SALAH_NAMES,
  type SalahName,
  type PrayerTimes,
} from '@/types';
import { formatPrayerTime, getCurrentSalahWindow } from '@/lib/prayer/prayerTimes';
import { db } from '@/db/database';
import { salahLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';

type SalahStatus = 'logged' | 'current' | 'upcoming' | 'past';

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

export default function HomeScreen() {
  const { todaysPrayerTimes, startSalahMode } = useAppStore();
  // salahName → focusRating for logs today
  const [todaysLogs, setTodaysLogs] = useState<Record<string, number>>({});

  // Reload today's logs whenever this tab is focused
  useFocusEffect(
    useCallback(() => {
      async function loadLogs() {
        const today = new Date().toISOString().split('T')[0];
        const logs = await db
          .select()
          .from(salahLogs)
          .where(eq(salahLogs.logDate, today));
        const map: Record<string, number> = {};
        for (const log of logs) {
          map[log.salahName] = log.focusRating;
        }
        setTodaysLogs(map);
      }
      loadLogs();
    }, [])
  );

  const now = new Date();
  const loggedSet = new Set(Object.keys(todaysLogs));

  function handleSalahPress(name: SalahName, status: SalahStatus) {
    if (status !== 'logged') {
      startSalahMode(name);
      router.push('/salah-mode');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }}>
        {/* Header */}
        <View className="mb-6">
          <Text className="text-2xl font-semibold text-ink-900">Today</Text>
          <Text className="text-ink-300 text-sm mt-1">
            {now.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>

        {todaysPrayerTimes ? (
          <View className="gap-y-3">
            {SALAH_NAMES.map((name) => {
              const status = getSalahStatus(name, todaysPrayerTimes, loggedSet, now);
              const rating = todaysLogs[name];
              return (
                <SalahCard
                  key={name}
                  name={name}
                  time={formatPrayerTime(todaysPrayerTimes[name])}
                  status={status}
                  rating={rating}
                  onPress={() => handleSalahPress(name, status)}
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
    </SafeAreaView>
  );
}

function SalahCard({
  name,
  time,
  status,
  rating,
  onPress,
}: {
  name: SalahName;
  time: string;
  status: SalahStatus;
  rating?: number;
  onPress: () => void;
}) {
  const isInteractive = status !== 'logged';

  const borderColor = {
    logged: 'border-sage-500',
    current: 'border-sage-600',
    upcoming: 'border-sand-200',
    past: 'border-sand-200',
  }[status];

  const bgColor = {
    logged: 'bg-white',
    current: 'bg-white',
    upcoming: 'bg-white',
    past: 'bg-white',
  }[status];

  return (
    <Pressable
      onPress={onPress}
      disabled={!isInteractive}
      className={`rounded-2xl px-5 py-4 flex-row justify-between items-center border ${bgColor} ${borderColor} ${
        status === 'past' ? 'opacity-60' : ''
      }`}
    >
      {/* Left: name + sub-label */}
      <View className="flex-1">
        <Text className="font-medium text-base text-ink-700">
          {SALAH_DISPLAY_NAMES[name]}
        </Text>
        {status === 'current' && (
          <Text className="text-sage-600 text-xs font-medium mt-0.5">
            Now · Tap to enter Salah Mode
          </Text>
        )}
        {(status === 'upcoming' || status === 'past') && (
          <Text className="text-ink-300 text-xs mt-0.5">Tap to enter Salah Mode</Text>
        )}
      </View>

      {/* Right: time + stars */}
      <View className="items-end gap-y-1">
        <Text className="text-ink-300 text-sm">{time}</Text>
        {status === 'logged' && rating !== undefined && (
          <View className="flex-row gap-x-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Text
                key={n}
                className={`text-xs ${n <= rating ? 'text-sage-600' : 'text-sand-300'}`}
              >
                ★
              </Text>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}
