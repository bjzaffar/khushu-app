import { View, Text, Pressable, SafeAreaView } from 'react-native';
import { router } from 'expo-router';

export default function OnboardingWelcome() {
  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <View className="flex-1 px-8 justify-between py-16">
        {/* Top — logo area */}
        <View className="items-center">
          <Text className="text-6xl mb-4">🕌</Text>
          <Text className="text-3xl font-semibold text-ink-900 tracking-tight">
            Khushu AI
          </Text>
          <Text className="text-ink-300 text-sm mt-2 tracking-widest uppercase">
            Focus. Presence. Prayer.
          </Text>
        </View>

        {/* Middle — explanation */}
        <View className="gap-y-6">
          <OnboardingPoint
            icon="📝"
            title="Reflect after each Salah"
            body="Rate your focus, note what pulled you away. No judgment — just awareness."
          />
          <OnboardingPoint
            icon="🔍"
            title="Discover your patterns"
            body="Over time, the app learns when and why your mind wanders — without fabricating anything."
          />
          <OnboardingPoint
            icon="🤲"
            title="Receive gentle reminders"
            body="Before each Salah, a quiet prompt to help you arrive fully present."
          />
        </View>

        {/* Bottom — CTA */}
        <View className="gap-y-3">
          <Pressable
            className="bg-sage-500 py-4 rounded-2xl items-center active:bg-sage-600"
            onPress={() => router.push('/onboarding/location')}
          >
            <Text className="text-white font-semibold text-base">Get Started</Text>
          </Pressable>
          <Text className="text-center text-ink-100 text-xs">
            No account required. Your data stays on your device.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function OnboardingPoint({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <View className="flex-row gap-x-4 items-start">
      <Text className="text-2xl mt-0.5">{icon}</Text>
      <View className="flex-1">
        <Text className="text-ink-700 font-semibold text-base mb-1">{title}</Text>
        <Text className="text-ink-300 text-sm leading-relaxed">{body}</Text>
      </View>
    </View>
  );
}
