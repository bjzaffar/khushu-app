import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

export default function PaywallScreen() {
  const returnHome = () => router.replace('/(tabs)');

  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Close */}
        <Pressable onPress={returnHome} className="self-end mb-4 p-2 active:opacity-60">
          <Text className="text-ink-300 text-sm">Close</Text>
        </Pressable>

        {/* Header */}
        <View className="items-center gap-y-3 mb-10">
          <Text className="text-4xl">✨</Text>
          <Text className="text-2xl font-semibold text-ink-900 text-center">Unlock Premium</Text>
          <Text className="text-ink-300 text-sm text-center leading-relaxed">
            Deepen your focus with AI-powered reminders and detailed insights.
          </Text>
        </View>

        {/* Feature list */}
        <View className="bg-white rounded-2xl border border-sand-200 overflow-hidden mb-8">
          {[
            ['🤲', 'AI-generated reminders', 'Claude writes a personalised pre-Salah reminder based on your unique distraction patterns — not a generic template.'],
            ['📊', 'Detailed trend charts', 'See how your khushu changes over time, broken down by prayer and distraction type.'],
            ['☁️', 'Cloud sync', 'Your reflections backed up and available on all your devices.'],
          ].map(([icon, title, desc], i, arr) => (
            <View
              key={title as string}
              className={`px-5 py-4 flex-row gap-x-4 items-start${i < arr.length - 1 ? ' border-b border-sand-100' : ''}`}
            >
              <Text className="text-xl mt-0.5">{icon}</Text>
              <View className="flex-1">
                <Text className="text-ink-700 font-medium text-sm">{title}</Text>
                <Text className="text-ink-300 text-xs leading-relaxed mt-1">{desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Purchase button (stub) */}
        <Pressable
          className="bg-sage-600 py-4 rounded-2xl items-center mb-3 active:bg-sage-700"
          onPress={() => {
            // TODO Step 5: purchasePremium() via RevenueCat
            returnHome();
          }}
        >
          <Text className="text-white font-semibold text-base">Subscribe — coming soon</Text>
        </Pressable>

        <Pressable
          className="items-center py-3 active:opacity-60"
          onPress={() => {
            // TODO Step 5: restorePurchases()
            returnHome();
          }}
        >
          <Text className="text-ink-300 text-sm">Restore purchases</Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}
