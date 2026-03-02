import { View, Text, Pressable, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { useAppStore } from '@/store/appStore';
import { db } from '@/db/database';
import { settings } from '@/db/schema';

async function markOnboardingComplete() {
  await db.insert(settings)
    .values({ key: 'onboarding_complete', value: 'true' })
    .onConflictDoUpdate({ target: settings.key, set: { value: 'true' } });
}

export default function OnboardingAccount() {
  const { setHasCompletedOnboarding } = useAppStore();

  async function finish() {
    await markOnboardingComplete();
    setHasCompletedOnboarding(true);
    // Expo Router will re-render root layout and redirect to (tabs)
    router.replace('/(tabs)');
  }

  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <View className="flex-1 px-8 justify-between py-16">
        {/* Header */}
        <View className="items-center gap-y-3">
          <Text className="text-5xl">☁️</Text>
          <Text className="text-2xl font-semibold text-ink-900 text-center">
            Sync across devices
          </Text>
          <Text className="text-ink-300 text-sm text-center leading-relaxed mt-2">
            Create an account to back up your reflections and access them on multiple devices. Your data is always stored locally first.
          </Text>
        </View>

        {/* Benefits */}
        <View className="gap-y-4">
          {[
            ['🔒', 'End-to-end sync', 'Your reflections stay private — synced only to your account.'],
            ['📱', 'Multi-device', 'Log on your phone, review on your tablet.'],
            ['♾️', 'Never lose your data', 'If you lose your phone, your history is safe.'],
          ].map(([icon, title, desc]) => (
            <View key={title} className="flex-row gap-x-4 items-start">
              <Text className="text-xl mt-0.5">{icon}</Text>
              <View className="flex-1">
                <Text className="text-ink-700 font-medium text-sm">{title}</Text>
                <Text className="text-ink-300 text-xs leading-relaxed mt-0.5">{desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View className="gap-y-3">
          <Pressable
            className="bg-sage-500 py-4 rounded-2xl items-center active:bg-sage-600"
            onPress={() => {
              // TODO Phase F: Navigate to sign-up flow
              // For now, skip — account creation is a Phase F feature
              finish();
            }}
          >
            <Text className="text-white font-semibold text-base">Create Account</Text>
          </Pressable>

          <Pressable
            className="border border-sand-300 py-4 rounded-2xl items-center active:bg-sand-200"
            onPress={finish}
          >
            <Text className="text-ink-500 font-medium text-base">Continue Without Account</Text>
          </Pressable>

          <Text className="text-center text-ink-100 text-xs mt-1">
            You can always create an account later in Settings.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
