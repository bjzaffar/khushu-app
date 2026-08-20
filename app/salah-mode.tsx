import { AppState, View, Pressable, StatusBar, Platform, NativeModules } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useKeepAwake } from 'expo-keep-awake';
import { useAppStore } from '@/store/appStore';
import { SALAH_DISPLAY_NAMES } from '@/types';
import { getPatternForSalah } from '@/lib/patterns/patternEngine';
import { getReminderContent } from '@/lib/notifications/reminderContent';

type Step = 'loading' | 'reminder' | 'active';
type SilenceStatus = 'off' | 'applying' | 'silenced' | 'permission-required' | 'failed' | 'unsupported';

export default function SalahModeScreen() {
  useKeepAwake();

  const { activeSalah, endSalahMode, dndDuringSalah } = useAppStore();
  const salahDisplayName = activeSalah ? SALAH_DISPLAY_NAMES[activeSalah] : 'Salah';
  const previousRingerMode = useRef<0 | 1 | 2 | null>(null);
  const ringerWasChanged = useRef(false);
  const retrySilencing = useRef<(() => void) | null>(null);

  const [step, setStep] = useState<Step>('loading');
  const [reminderText, setReminderText] = useState('');
  const [silenceStatus, setSilenceStatus] = useState<SilenceStatus>('off');

  // Load reminder content on mount
  useEffect(() => {
    if (!activeSalah) { setStep('active'); return; }
    (async () => {
      try {
        const pattern = await getPatternForSalah(activeSalah);
        const { text } = getReminderContent(pattern);
        setReminderText(text);
        setStep('reminder');
      } catch {
        setStep('active');
      }
    })();
  }, []);

  // On Android: silence phone when entering Salah Mode, restore when leaving.
  // Android 7+ requires the user to grant Notification Policy (DND) access
  // before an app can move the ringer across the silent/DND boundary.
  useEffect(() => {
    if (!dndDuringSalah || Platform.OS !== 'android') {
      setSilenceStatus('off');
      return;
    }
    if (!NativeModules.VolumeManager) {
      setSilenceStatus('unsupported');
      return;
    }

    let mounted = true;
    let operation = Promise.resolve();

    const applySilence = async () => {
      try {
        const { VolumeManager, RINGER_MODE } = await import('react-native-volume-manager');
        const hasDndAccess = await VolumeManager.checkDndAccess();
        if (!mounted) return;
        if (!hasDndAccess) {
          setSilenceStatus('permission-required');
          return;
        }

        setSilenceStatus('applying');
        if (previousRingerMode.current === null) {
          const current = await VolumeManager.getRingerMode();
          previousRingerMode.current = (current as 0 | 1 | 2) ?? null;
        }
        if (!mounted) return;

        await VolumeManager.setRingerMode(RINGER_MODE.silent);
        ringerWasChanged.current = true;

        const actual = await VolumeManager.getRingerMode();
        if (mounted) {
          setSilenceStatus(actual === RINGER_MODE.silent ? 'silenced' : 'failed');
        }
      } catch (error) {
        console.warn('[salah-mode] Could not silence the Android ringer:', error);
        if (mounted) setSilenceStatus('failed');
      }
    };

    const enqueueSilence = () => {
      operation = operation.then(applySilence, applySilence);
    };

    retrySilencing.current = enqueueSilence;
    enqueueSilence();

    // Re-check after the user returns from Android's DND access screen.
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') enqueueSilence();
    });

    return () => {
      mounted = false;
      retrySilencing.current = null;
      appStateSubscription.remove();
      void (async () => {
        try {
          await operation;
          if (!ringerWasChanged.current || previousRingerMode.current === null) return;

          const { VolumeManager, RINGER_MODE } = await import('react-native-volume-manager');
          // Do not override a ringer mode the user manually selected while praying.
          const current = await VolumeManager.getRingerMode();
          if (current === RINGER_MODE.silent) {
            await VolumeManager.setRingerMode(previousRingerMode.current);
          }
        } catch (error) {
          console.warn('[salah-mode] Could not restore the Android ringer:', error);
        }
      })();
    };
  }, [dndDuringSalah]);

  async function handleDndAccessRequest() {
    try {
      const { VolumeManager } = await import('react-native-volume-manager');
      await VolumeManager.requestDndAccess();
    } catch (error) {
      console.warn('[salah-mode] Could not open Android DND access settings:', error);
      setSilenceStatus('failed');
    }
  }

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
    <View className="flex-1 bg-[#1A1917] items-center justify-center px-8">
      <StatusBar barStyle="light-content" backgroundColor="#1A1917" />

      <View className="items-center gap-y-6 mb-20">
        <Text className="text-6xl">🤲</Text>
        <Text className="text-pure-white text-3xl font-medium text-center leading-relaxed">
          {"Kindly do not disturb me,\nI am praying :)"}
        </Text>
        {activeSalah && (
          <Text className="text-ink-300 text-sm tracking-widest uppercase">
            {salahDisplayName}
          </Text>
        )}
        {dndDuringSalah && Platform.OS === 'android' && silenceStatus === 'silenced' && (
          <Text className="text-ink-500 text-xs text-center">Phone silenced</Text>
        )}
        {dndDuringSalah && Platform.OS === 'android' && silenceStatus === 'applying' && (
          <Text className="text-ink-500 text-xs text-center">Silencing phone...</Text>
        )}
        {dndDuringSalah && Platform.OS === 'android' && silenceStatus === 'permission-required' && (
          <Pressable
            onPress={() => void handleDndAccessRequest()}
            accessibilityRole="button"
            className="border border-[#6B6360] py-2.5 px-4 rounded-xl active:bg-[#3D3A37]"
          >
            <Text className="text-ink-300 text-xs text-center">Allow Do Not Disturb access</Text>
          </Pressable>
        )}
        {dndDuringSalah && Platform.OS === 'android' && silenceStatus === 'failed' && (
          <Pressable
            onPress={() => retrySilencing.current?.()}
            accessibilityRole="button"
          >
            <Text className="text-ink-300 text-xs text-center">Couldn&apos;t silence phone · Tap to retry</Text>
          </Pressable>
        )}
        {dndDuringSalah && Platform.OS === 'android' && silenceStatus === 'unsupported' && (
          <Text className="text-ink-500 text-xs text-center">Automatic silencing unavailable</Text>
        )}
        {dndDuringSalah && Platform.OS === 'ios' && (
          <Text className="text-ink-500 text-xs text-center">
            Tip: Enable Do Not Disturb in Control Center
          </Text>
        )}
      </View>

      <Pressable
        className="border border-[#6B6360] py-4 px-10 rounded-2xl active:bg-[#3D3A37]"
        onPress={handleEndSalah}
      >
        <Text className="text-ink-300 font-medium text-base">End Salah</Text>
      </Pressable>
    </View>
  );
}
