import { View, Text, Pressable, StatusBar, Platform } from 'react-native';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useAppStore } from '@/store/appStore';
import { SALAH_DISPLAY_NAMES } from '@/types';

export default function SalahModeScreen() {
  // Keep screen on while praying
  useKeepAwake();

  const { activeSalah, endSalahMode } = useAppStore();
  const salahDisplayName = activeSalah ? SALAH_DISPLAY_NAMES[activeSalah] : 'Salah';

  function handleEndSalah() {
    endSalahMode();
    // Navigate to the log tab, pre-selecting this Salah
    if (activeSalah) {
      router.replace({
        pathname: '/(tabs)/log',
        params: { salah: activeSalah, fromSalahMode: '1' },
      });
    } else {
      router.replace('/(tabs)/log');
    }
  }

  return (
    <View className="flex-1 bg-ink-900 items-center justify-center px-8">
      <StatusBar barStyle="light-content" backgroundColor="#1A1917" />

      {/* Main message */}
      <View className="items-center gap-y-6 mb-20">
        <Text className="text-6xl">🤲</Text>
        <Text className="text-white text-xl font-medium text-center leading-relaxed">
          Kindly do not disturb me,{'\n'}I am praying.
        </Text>
        {activeSalah && (
          <Text className="text-ink-300 text-sm tracking-widest uppercase">
            {salahDisplayName}
          </Text>
        )}
      </View>

      {/* iOS DND instruction — iOS does not allow programmatic DND */}
      {Platform.OS === 'ios' && (
        <View className="bg-ink-700 rounded-2xl p-4 mb-8 mx-4">
          <Text className="text-ink-300 text-xs text-center leading-relaxed">
            Tip: Swipe down to open Control Center and enable Do Not Disturb to silence notifications during Salah.
          </Text>
        </View>
      )}

      {/* End Salah button */}
      <Pressable
        className="border border-ink-500 py-4 px-10 rounded-2xl active:bg-ink-700"
        onPress={handleEndSalah}
      >
        <Text className="text-ink-300 font-medium text-base">End Salah</Text>
      </Pressable>
    </View>
  );
}
