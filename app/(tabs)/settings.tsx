import { View, Text, SafeAreaView } from 'react-native';

export default function SettingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <View className="flex-1 px-5 pt-6">
        <Text className="text-2xl font-semibold text-ink-900 mb-2">Settings</Text>
        <Text className="text-ink-300 text-sm">Coming soon — Phase C</Text>
      </View>
    </SafeAreaView>
  );
}
