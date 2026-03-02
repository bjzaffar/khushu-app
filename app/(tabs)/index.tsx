import { View, Text, SafeAreaView, ScrollView } from 'react-native';
import { useAppStore } from '@/store/appStore';
import { SALAH_DISPLAY_NAMES, SALAH_NAMES } from '@/types';
import { formatPrayerTime } from '@/lib/prayer/prayerTimes';

export default function HomeScreen() {
  const { todaysPrayerTimes } = useAppStore();

  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <ScrollView className="flex-1 px-5 pt-6">
        {/* Header */}
        <View className="mb-6">
          <Text className="text-2xl font-semibold text-ink-900">Today</Text>
          <Text className="text-ink-300 text-sm mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>

        {/* Prayer time timeline */}
        {todaysPrayerTimes ? (
          <View className="gap-y-3">
            {SALAH_NAMES.map((name) => (
              <SalahCard
                key={name}
                name={SALAH_DISPLAY_NAMES[name]}
                time={formatPrayerTime(todaysPrayerTimes[name])}
              />
            ))}
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

function SalahCard({ name, time }: { name: string; time: string }) {
  return (
    <View className="bg-white rounded-2xl px-5 py-4 flex-row justify-between items-center shadow-sm border border-sand-200">
      <Text className="text-ink-700 font-medium text-base">{name}</Text>
      <Text className="text-ink-300 text-sm">{time}</Text>
    </View>
  );
}
