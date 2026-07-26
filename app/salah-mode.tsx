import { View, Text, Pressable, StatusBar, Platform, NativeModules } from 'react-native';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useKeepAwake } from 'expo-keep-awake';
import { selectIsPremium, useAppStore } from '@/store/appStore';
import { SALAH_DISPLAY_NAMES } from '@/types';
import { getPatternForSalah } from '@/lib/patterns/patternEngine';
import { getReminderContent } from '@/lib/notifications/reminderContent';

type Step = 'loading' | 'reminder' | 'active';

export default function SalahModeScreen() {
  useKeepAwake();

  const { activeSalah, endSalahMode, dndDuringSalah } = useAppStore();
  const isPremium = useAppStore(selectIsPremium);
  const salahDisplayName = activeSalah ? SALAH_DISPLAY_NAMES[activeSalah] : 'Salah';
  const previousRingerMode = useRef<0 | 1 | 2 | null>(null);

  const [step, setStep] = useState<Step>('loading');
  const [reminderText, setReminderText] = useState('');

  // Load reminder content on mount
  useEffect(() => {
    if (!activeSalah) { setStep('active'); return; }
    (async () => {
      try {
        const pattern = await getPatternForSalah(activeSalah, isPremium ? undefined : 7);
        const { text } = getReminderContent(pattern);
        setReminderText(text);
        setStep('reminder');
      } catch {
        setStep('active');
      }
    })();
  }, []);

  // On Android: silence phone when entering Salah Mode, restore when leaving
  useEffect(() => {
    if (!dndDuringSalah || Platform.OS !== 'android') return;
    if (!NativeModules.VolumeManager) return;

    (async () => {
      try {
        const { VolumeManager, RINGER_MODE } = await import('react-native-volume-manager');
        const current = await VolumeManager.getRingerMode();
        previousRingerMode.current = (current as 0 | 1 | 2) ?? null;
        await VolumeManager.setRingerMode(RINGER_MODE.silent);
      } catch {}
    })();

    return () => {
      if (!NativeModules.VolumeManager) return;
      (async () => {
        try {
          const { VolumeManager, RINGER_MODE } = await import('react-native-volume-manager');
          const restore = previousRingerMode.current ?? RINGER_MODE.normal;
          await VolumeManager.setRingerMode(restore);
        } catch {}
      })();
    };
  }, [dndDuringSalah]);

  async function handleEndSalah() {
    endSalahMode();
    if (activeSalah) {
      router.replace({
        pathname: '/(tabs)/log',
        params: { salah: activeSalah, fromSalahMode: '1' },
      });
    } else {
      router.replace('/(tabs)/log');
    }
  }

  // ── Reminder pre-screen ────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: '#1A1917' }}>
        <StatusBar barStyle="light-content" backgroundColor="#1A1917" />
      </View>
    );
  }

  if (step === 'reminder') {
    return (
      <View style={{ flex: 1, backgroundColor: '#1A1917', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
        <StatusBar barStyle="light-content" backgroundColor="#1A1917" />

        {/* Salah label */}
        <Text style={{ color: '#9B9189', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 32 }}>
          {salahDisplayName}
        </Text>

        {/* Reminder text */}
        <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '400', textAlign: 'center', lineHeight: 32, marginBottom: 64 }}>
          {reminderText}
        </Text>

        {/* Begin button */}
        <Pressable
          onPress={() => setStep('active')}
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#4A6A4A' : '#5A7A5A',
            paddingVertical: 16,
            paddingHorizontal: 48,
            borderRadius: 20,
          })}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 16 }}>
            Begin {salahDisplayName}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── Active Salah screen ────────────────────────────────────────────────────
  return (
    <View className="flex-1 bg-ink-900 items-center justify-center px-8">
      <StatusBar barStyle="light-content" backgroundColor="#1A1917" />

      <View className="items-center gap-y-6 mb-20">
        <Text className="text-6xl">🤲</Text>
        <Text className="text-white text-xl font-medium text-center leading-relaxed">
          {"Kindly do not disturb me,\nI am praying :)"}
        </Text>
        {activeSalah && (
          <Text className="text-ink-300 text-sm tracking-widest uppercase">
            {salahDisplayName}
          </Text>
        )}
        {dndDuringSalah && Platform.OS === 'android' && (
          <Text className="text-ink-500 text-xs text-center">Phone silenced</Text>
        )}
        {dndDuringSalah && Platform.OS === 'ios' && (
          <Text className="text-ink-500 text-xs text-center">
            Tip: Enable Do Not Disturb in Control Center
          </Text>
        )}
      </View>

      <Pressable
        className="border border-ink-500 py-4 px-10 rounded-2xl active:bg-ink-700"
        onPress={handleEndSalah}
      >
        <Text className="text-ink-300 font-medium text-base">End Salah</Text>
      </Pressable>
    </View>
  );
}
