import { View, Switch, Pressable, ScrollView, ActivityIndicator, Platform, NativeModules, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { AppDialog, type AppDialogTone } from '@/components/ui/AppDialog';
import { ArrowRightIcon } from 'react-native-heroicons/outline';
import { CheckIcon } from 'react-native-heroicons/solid';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { G, Rect } from 'react-native-svg';
import { eq } from 'drizzle-orm';
import * as Location from 'expo-location';
import { selectIsPremium, useAppStore } from '@/store/appStore';
import { getDeviceLocation } from '@/lib/location/deviceLocation';
import { supabase } from '@/lib/supabase/client';
import { clearLogsEverywhere } from '@/lib/supabase/sync';
import { writeWidgetData } from '@/lib/widget/widgetData';
import { db } from '@/db/database';
import { settings } from '@/db/schema';
import { calculatePrayerTimes } from '@/lib/prayer/prayerTimes';
import {
  PRE_SALAH_REMINDERS_DISABLED,
  schedulePreSalahReminders,
  schedulePostSalahPrompts,
  cancelPostSalahReminders,
} from '@/lib/notifications/notificationService';
import { CALCULATION_METHODS, type CalculationMethodKey, type AsrMadhab } from '@/types';
import { WheelPicker } from '@/components/ui/WheelPicker';
import { clearRevenueCatUser, openRevenueCatCustomerCenter } from '@/lib/revenuecat/service';
import { resetToAppRoot } from '@/lib/navigation';
import { clearNativeGoogleSignInSession } from '@/lib/auth/googleSignIn';

const MINUTE_VALUES = [
  PRE_SALAH_REMINDERS_DISABLED,
  0,
  ...Array.from({ length: 60 }, (_, i) => i + 1),
];
const AnimatedGroup = Animated.createAnimatedComponent(G);
const STAR_GLOW_LAYERS = [
  { strokeWidth: 7, strokeOpacity: 0.06 },
  { strokeWidth: 4.5, strokeOpacity: 0.1 },
  { strokeWidth: 2.6, strokeOpacity: 0.18 },
  { strokeWidth: 1.2, strokeOpacity: 0.82 },
] as const;

type ToggleRowProps = {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  showDivider?: boolean;
};

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  showDivider = false,
}: ToggleRowProps) {
  return (
    <View className={`relative px-5 py-4 flex-row justify-between items-center ${showDivider ? 'border-b border-sand-100' : ''}`}>
      <Pressable
        onPress={() => onValueChange(!value)}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
        className="absolute inset-0 active:bg-sand-100"
      />
      <View pointerEvents="none" className="flex-1 pr-4">
        <Text className="text-ink-700 font-medium text-sm">{label}</Text>
        <Text className="text-ink-300 text-xs mt-0.5">{description}</Text>
      </View>
      <Switch
        accessible={false}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#EFE8D8', true: '#5A7A5A' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function StarBorderUpgradeRow() {
  const progress = useSharedValue(0);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: 4500,
        easing: Easing.linear,
      }),
      -1,
      false
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) => current.width === width && current.height === height ? current : { width, height });
  };

  const { width, height } = size;
  const borderInset = 3;
  const borderWidth = Math.max(width - borderInset * 2, 1);
  const borderHeight = Math.max(height - borderInset * 2, 1);
  const borderRadius = Math.min(13, borderWidth / 2, borderHeight / 2);
  const perimeter = 2 * (borderWidth + borderHeight - 4 * borderRadius) + 2 * Math.PI * borderRadius;
  const glowLength = Math.min(34, perimeter * 0.1);
  const glowPattern = [glowLength, Math.max(perimeter - glowLength, 1)];
  const firstAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: -progress.value * perimeter,
  }), [perimeter]);
  const secondAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: -perimeter / 2 - progress.value * perimeter,
  }), [perimeter]);

  return (
    <View onLayout={onLayout} className="relative overflow-hidden">
      <Pressable
        onPress={() => router.push('/paywall')}
        className="px-5 py-4 flex-row justify-between items-center border-b border-sand-100 active:bg-sand-100"
      >
        <View className="flex-1 pr-3">
          <Text className="text-ink-700 font-medium text-sm">UPGRADE TO PREMIUM</Text>
        </View>
        <View className="flex-row items-center gap-x-1">
          <Text className="text-sage-600 text-sm font-medium">Upgrade</Text>
          <ArrowRightIcon size={16} color="#5A7A5A" />
        </View>
      </Pressable>
      {width > 0 && height > 0 && (
        <View pointerEvents="none" className="absolute inset-0">
          <Svg width={width} height={height}>
            <AnimatedGroup animatedProps={firstAnimatedProps}>
              {STAR_GLOW_LAYERS.map((layer) => (
                <Rect
                  key={layer.strokeWidth}
                  x={borderInset}
                  y={borderInset}
                  width={borderWidth}
                  height={borderHeight}
                  rx={borderRadius}
                  fill="none"
                  stroke="#5A7A5A"
                  strokeWidth={layer.strokeWidth}
                  strokeOpacity={layer.strokeOpacity}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={glowPattern}
                />
              ))}
            </AnimatedGroup>
            <AnimatedGroup animatedProps={secondAnimatedProps}>
              {STAR_GLOW_LAYERS.map((layer) => (
                <Rect
                  key={layer.strokeWidth}
                  x={borderInset}
                  y={borderInset}
                  width={borderWidth}
                  height={borderHeight}
                  rx={borderRadius}
                  fill="none"
                  stroke="#5A7A5A"
                  strokeWidth={layer.strokeWidth}
                  strokeOpacity={layer.strokeOpacity}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={glowPattern}
                />
              ))}
            </AnimatedGroup>
          </Svg>
        </View>
      )}
    </View>
  );
}

// Country ISO → recommended calculation method
const COUNTRY_TO_METHOD: Partial<Record<string, CalculationMethodKey>> = {
  SA: 'UmmAlQura',
  AE: 'Dubai',
  EG: 'Egyptian',
  PK: 'Karachi',
  BD: 'Karachi',
  IN: 'Karachi',
  AF: 'Karachi',
  KW: 'Kuwait',
  QA: 'Qatar',
  SG: 'Singapore',
  MY: 'Singapore',
  ID: 'Singapore',
  BN: 'Singapore',
  TR: 'Turkey',
  US: 'NorthAmerica',
  CA: 'NorthAmerica',
  MX: 'NorthAmerica',
  GB: 'MoonsightingCommittee',
  IE: 'MoonsightingCommittee',
};

function saveSetting(key: string, value: string) {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export default function SettingsScreen() {
  const {
    reminderMinutesBefore, setReminderMinutesBefore,
    postSalahPromptEnabled, setPostSalahPromptEnabled,
    calculationMethod, setCalculationMethod,
    asrMadhab, setAsrMadhab,
    dndDuringSalah, setDndDuringSalah,
    location,
    setTodaysPrayerTimes,
    userId,
  } = useAppStore();
  const isPremium = useAppStore(selectIsPremium);

  const [autoDetectStatus, setAutoDetectStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [wheelActive, setWheelActive] = useState(false);
  const [autoDetectedLabel, setAutoDetectedLabel] = useState<string>('');
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [methodDropdownOpen, setMethodDropdownOpen] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showFinalDeleteAccountModal, setShowFinalDeleteAccountModal] = useState(false);
  const [showClearLogsModal, setShowClearLogsModal] = useState(false);
  const [showDndPermissionDialog, setShowDndPermissionDialog] = useState(false);
  const [feedbackDialog, setFeedbackDialog] = useState<{ title: string; message: string; tone?: AppDialogTone } | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  // Rehydrate from DB each time tab is focused
  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });

      let isActive = true;
      void supabase.auth.getUser().then(({ data: { user } }) => {
        if (isActive) setSignedInEmail(user?.email ?? null);
      });

      const mRow = db.select().from(settings).where(eq(settings.key, 'reminder_minutes_before')).get();
      if (mRow) setReminderMinutesBefore(parseInt(mRow.value, 10));

      const pRow = db.select().from(settings).where(eq(settings.key, 'post_salah_prompt_enabled')).get();
      if (pRow) setPostSalahPromptEnabled(pRow.value !== 'false');

      const cRow = db.select().from(settings).where(eq(settings.key, 'calculation_method')).get();
      if (cRow) setCalculationMethod(cRow.value as CalculationMethodKey);

      const aRow = db.select().from(settings).where(eq(settings.key, 'asr_madhab')).get();
      if (aRow) setAsrMadhab(aRow.value as AsrMadhab);

      const dRow = db.select().from(settings).where(eq(settings.key, 'dnd_during_salah')).get();
      if (dRow) setDndDuringSalah(dRow.value === 'true');

      return () => { isActive = false; };
    }, [])
  );

  function recalcAndReschedule(
    method: CalculationMethodKey,
    madhab: AsrMadhab,
    mins: number,
    coords = location
  ) {
    if (!coords) return;
    const pt = calculatePrayerTimes(coords, new Date(), method, madhab);
    setTodaysPrayerTimes(pt);
    schedulePreSalahReminders(pt, mins);
  }

  async function handleMinutesChange(mins: number) {
    setReminderMinutesBefore(mins);
    saveSetting('reminder_minutes_before', String(mins));
    recalcAndReschedule(calculationMethod, asrMadhab, mins);
  }

  async function handleDndToggle(val: boolean) {
    if (!val || Platform.OS !== 'android') {
      setDndDuringSalah(val);
      saveSetting('dnd_during_salah', String(val));
      return;
    }

    // Match the native Switch's immediate visual response while the Android
    // permission check runs. Cancel/failure paths below roll this back.
    setDndDuringSalah(true);

    try {
      if (!NativeModules.VolumeManager) throw new Error('VolumeManager native module is unavailable');

      const { VolumeManager } = await import('react-native-volume-manager');
      const hasDndAccess = await VolumeManager.checkDndAccess();
      if (hasDndAccess) {
        setDndDuringSalah(true);
        saveSetting('dnd_during_salah', 'true');
        return;
      }

      setShowDndPermissionDialog(true);
    } catch (error) {
      console.warn('[settings] Could not enable automatic silencing:', error);
      setDndDuringSalah(false);
      saveSetting('dnd_during_salah', 'false');
      setFeedbackDialog({
        title: 'Automatic silencing unavailable',
        message: 'This build cannot control the Android ringer. Please update or reinstall Khushu and try again.',
        tone: 'warning',
      });
    }
  }

  async function openDndAccessSettings() {
    setShowDndPermissionDialog(false);
    // Keep the preference enabled so it starts working as soon as Android
    // grants access. Salah Mode verifies the grant each time.
    setDndDuringSalah(true);
    saveSetting('dnd_during_salah', 'true');
    try {
      const { VolumeManager } = await import('react-native-volume-manager');
      await VolumeManager.requestDndAccess();
    } catch (error) {
      console.warn('[settings] Could not open Android DND access settings:', error);
      setDndDuringSalah(false);
      saveSetting('dnd_during_salah', 'false');
      setFeedbackDialog({
        title: 'Could not open settings',
        message: 'Please try again, or allow Do Not Disturb access for Khushu in Android Settings.',
        tone: 'warning',
      });
    }
  }

  async function handlePostSalahToggle(val: boolean) {
    setPostSalahPromptEnabled(val);
    saveSetting('post_salah_prompt_enabled', String(val));
    if (location) {
      const pt = calculatePrayerTimes(location, new Date(), calculationMethod, asrMadhab);
      if (val) { await schedulePostSalahPrompts(pt); }
      else { await cancelPostSalahReminders(); }
    }
  }

  function handleMethodChange(method: CalculationMethodKey) {
    setCalculationMethod(method);
    saveSetting('calculation_method', method);
    recalcAndReschedule(method, asrMadhab, reminderMinutesBefore);
    setAutoDetectStatus('idle');
  }

  function handleMadhabChange(madhab: AsrMadhab) {
    setAsrMadhab(madhab);
    saveSetting('asr_madhab', madhab);
    recalcAndReschedule(calculationMethod, madhab, reminderMinutesBefore);
  }

  async function handleUpdateLocation() {
    setLocationStatus('loading');
    try {
      const coords = await getDeviceLocation();
      if (!coords) {
        setLocationStatus('error');
        return;
      }
      useAppStore.getState().setLocation(coords);
      db.insert(settings).values({ key: 'location_lat', value: String(coords.latitude) })
        .onConflictDoUpdate({ target: settings.key, set: { value: String(coords.latitude) } }).run();
      db.insert(settings).values({ key: 'location_lng', value: String(coords.longitude) })
        .onConflictDoUpdate({ target: settings.key, set: { value: String(coords.longitude) } }).run();
      recalcAndReschedule(calculationMethod, asrMadhab, reminderMinutesBefore, coords);
      setLocationStatus('done');
    } catch {
      setLocationStatus('error');
    }
  }

  async function handleAutoDetect() {
    if (!location) {
      setAutoDetectStatus('error');
      return;
    }
    setAutoDetectStatus('loading');
    try {
      const [result] = await Location.reverseGeocodeAsync({
        latitude: location.latitude,
        longitude: location.longitude,
      });
      const isoCode = result?.isoCountryCode ?? '';
      const detected = COUNTRY_TO_METHOD[isoCode] ?? 'MuslimWorldLeague';
      const entry = CALCULATION_METHODS.find((m) => m.key === detected);

      setCalculationMethod(detected);
      saveSetting('calculation_method', detected);
      recalcAndReschedule(detected, asrMadhab, reminderMinutesBefore);
      setAutoDetectedLabel(entry?.label ?? detected);
      setAutoDetectStatus('done');
    } catch {
      setAutoDetectStatus('error');
    }
  }

  function handleSignOut() {
    setShowSignOutModal(true);
  }

  function handleDeleteAccount() {
    setShowDeleteAccountModal(true);
  }

  async function confirmSignOut() {
    setShowSignOutModal(false);
    try {
      await clearNativeGoogleSignInSession().catch((error) =>
        console.warn('[auth] native Google sign-out cleanup failed:', error)
      );
      await clearRevenueCatUser();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      resetToAppRoot();
    } catch (error) {
      console.error('[auth] sign-out failed:', error);
      setFeedbackDialog({
        title: 'Could not sign out',
        message: 'Please check your connection and try again.',
        tone: 'warning',
      });
    }
  }

  async function confirmDeleteAccount() {
    setShowFinalDeleteAccountModal(false);
    setShowDeleteAccountModal(false);
    try {
      const { error: deleteError } = await supabase.rpc('delete_user');
      if (deleteError) throw deleteError;
    } catch (error) {
      console.error('[auth] account deletion failed:', error);
      setFeedbackDialog({
        title: 'Could not delete account',
        message: 'Your account has not been deleted. Please check your connection and try again.',
        tone: 'warning',
      });
      return;
    }

    await clearNativeGoogleSignInSession().catch((error) =>
      console.warn('[auth] native Google deletion cleanup failed:', error)
    );
    await clearRevenueCatUser().catch((error) =>
      console.warn('[revenuecat] deletion cleanup failed:', error)
    );
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) console.warn('[auth] post-deletion local sign-out failed:', signOutError);
    resetToAppRoot();
  }

  function handleClearLogs() {
    setShowClearLogsModal(true);
  }

  async function confirmClearLogs() {
    setShowClearLogsModal(false);
    try {
      await clearLogsEverywhere();
    } catch (error) {
      console.warn('[sync] salah_logs deletion queued for retry:', error);
    } finally {
      // The widget has its own persisted heatmap, so rebuild it after the
      // local database is cleared even when the cloud deletion is queued.
      await writeWidgetData(isPremium);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }} scrollEnabled={!wheelActive}>
        <Text className="text-2xl font-semibold text-ink-900 mb-6">Settings</Text>

        {/* ── Location ─────────────────────────────────────────────────────── */}
        <View className="mb-6">
          <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
            Location
          </Text>
          <Pressable
            onPress={handleUpdateLocation}
            disabled={locationStatus === 'loading'}
            className="bg-white rounded-2xl border border-sand-200 px-5 py-4 flex-row items-center justify-between active:bg-sand-100"
          >
            <View className="flex-1 pr-3">
              <Text className="text-ink-700 font-medium text-sm">Update my location</Text>
              {locationStatus === 'done' && (
                <Text className="text-sage-600 text-xs mt-0.5">Location updated.</Text>
              )}
              {locationStatus === 'error' && (
                <Text className="text-red-400 text-xs mt-0.5">Could not get location. Check permissions in device Settings.</Text>
              )}
              {locationStatus === 'idle' && (
                <Text className="text-ink-300 text-xs mt-0.5">
                  {location ? 'Tap to refresh your saved GPS coordinates.' : 'No location saved — tap to enable.'}
                </Text>
              )}
            </View>
            {locationStatus === 'loading'
              ? <ActivityIndicator size="small" color="#5A7A5A" />
              : <Text className="text-sage-600 text-sm font-medium">Update</Text>
            }
          </Pressable>
        </View>

        {/* ── Reminder Timing ──────────────────────────────────────────────── */}
        <View className="mb-6">
          <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
            Remind me before Salah
          </Text>
          <View className="bg-white rounded-2xl border border-sand-200 px-4 py-2">
            <WheelPicker
              values={MINUTE_VALUES}
              selectedValue={reminderMinutesBefore}
              onValueChange={handleMinutesChange}
              formatValue={(value) => {
                if (value === PRE_SALAH_REMINDERS_DISABLED) return "Don't remind me";
                return `${value} min`;
              }}
              onTouchStart={() => setWheelActive(true)}
              onTouchEnd={() => setWheelActive(false)}
            />
          </View>
        </View>

        {/* ── Notifications ─────────────────────────────────────────────────── */}
        <View className="mb-6">
          <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
            Notifications
          </Text>
          <View className="bg-white rounded-2xl border border-sand-200 overflow-hidden">
            <ToggleRow
              label="Post-Salah prompt"
              description="Remind me to log if I haven't after the prayer window closes."
              value={postSalahPromptEnabled}
              onValueChange={(value) => void handlePostSalahToggle(value)}
              showDivider
            />
            {Platform.OS !== 'ios' && (
              <ToggleRow
                label="Silence during Salah Mode"
                description="Automatically silences your phone when Salah Mode starts."
                value={dndDuringSalah}
                onValueChange={(value) => void handleDndToggle(value)}
              />
            )}
          </View>
        </View>

        {/* ── Calculation Method ────────────────────────────────────────────── */}
        <View className="mb-6">
          <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
            Prayer Calculation Method
          </Text>

          {/* Auto Detect button */}
          <Pressable
            onPress={handleAutoDetect}
            disabled={autoDetectStatus === 'loading'}
            className="bg-white rounded-2xl border border-sand-200 px-5 py-4 flex-row items-center justify-between mb-2 active:bg-sand-100"
          >
            <View className="flex-1 pr-3">
              <Text className="text-ink-700 font-medium text-sm">Auto detect for my location</Text>
              {autoDetectStatus === 'done' && (
                <Text className="text-sage-600 text-xs mt-0.5">Applied: {autoDetectedLabel}</Text>
              )}
              {autoDetectStatus === 'error' && (
                <Text className="text-red-400 text-xs mt-0.5">
                  {!location ? 'No saved location — enable location first.' : 'Could not detect. Try manually.'}
                </Text>
              )}
              {autoDetectStatus === 'idle' && (
                <Text className="text-ink-300 text-xs mt-0.5">
                  Uses your saved GPS coordinates to suggest the right method.
                </Text>
              )}
            </View>
            {autoDetectStatus === 'loading'
              ? <ActivityIndicator size="small" color="#5A7A5A" />
              : <Text className="text-sage-600 text-sm font-medium">Detect</Text>
            }
          </Pressable>

          {/* Selected method row */}
          <View className="bg-white rounded-2xl border border-sand-200 overflow-hidden">
            {(() => {
              const selected = CALCULATION_METHODS.find((m) => m.key === calculationMethod);
              return (
                <Pressable
                  onPress={() => setMethodDropdownOpen(!methodDropdownOpen)}
                  className="px-5 py-4 flex-row justify-between items-center active:bg-sand-100"
                >
                  <View className="flex-1 pr-3">
                    <Text className="text-sm font-medium text-sage-600">
                      {selected?.label ?? 'Select method'}
                    </Text>
                    {selected && (
                      <Text className="text-ink-300 text-xs mt-0.5">{selected.region}</Text>
                    )}
                  </View>
                  <Text className="text-ink-300 text-xs">
                    {methodDropdownOpen ? '▲' : '▼'}
                  </Text>
                </Pressable>
              );
            })()}

            {methodDropdownOpen && (
              <View className="border-t border-sand-100">
                {CALCULATION_METHODS.map((m, i) => {
                  const selected = calculationMethod === m.key;
                  return (
                    <Pressable
                      key={m.key}
                      onPress={() => {
                        handleMethodChange(m.key);
                        setMethodDropdownOpen(false);
                      }}
                      className={`px-5 py-4 flex-row justify-between items-center active:bg-sand-100 ${
                        i < CALCULATION_METHODS.length - 1 ? 'border-b border-sand-100' : ''
                      }`}
                    >
                      <View className="flex-1 pr-3">
                        <Text className={`text-sm font-medium ${selected ? 'text-sage-600' : 'text-ink-700'}`}>
                          {m.label}
                        </Text>
                        <Text className="text-ink-300 text-xs mt-0.5">{m.region}</Text>
                      </View>
                      {selected && (
                        <CheckIcon size={20} color="#5A7A5A" />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        {/* ── Asr Time ─────────────────────────────────────────────────────── */}
        <View className="mb-6">
          <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
            Asr Time
          </Text>
          <View className="bg-white rounded-2xl border border-sand-200 p-4">
            <View className="flex-row gap-x-3">
              <Pressable
                onPress={() => handleMadhabChange('Shafi')}
                className={`flex-1 py-3 rounded-xl items-center ${
                  asrMadhab === 'Shafi' ? 'bg-sage-600' : 'bg-sand-100'
                }`}
              >
                <Text className={`text-sm font-semibold ${asrMadhab === 'Shafi' ? 'text-white' : 'text-ink-700'}`}>
                  Earlier Asr
                </Text>
                <Text className={`text-xs mt-0.5 text-center ${asrMadhab === 'Shafi' ? 'text-white opacity-80' : 'text-ink-300'}`}>
                  Shafi&apos;i, Maliki & Hanbali
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleMadhabChange('Hanafi')}
                className={`flex-1 py-3 rounded-xl items-center ${
                  asrMadhab === 'Hanafi' ? 'bg-sage-600' : 'bg-sand-100'
                }`}
              >
                <Text className={`text-sm font-semibold ${asrMadhab === 'Hanafi' ? 'text-white' : 'text-ink-700'}`}>
                  Later Asr
                </Text>
                <Text className={`text-xs mt-0.5 text-center ${asrMadhab === 'Hanafi' ? 'text-white opacity-80' : 'text-ink-300'}`}>
                  Hanafi
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── Account & Premium ────────────────────────────────────────────── */}
        <View className="mb-6">
          <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
            Account
          </Text>
          <View className="bg-white rounded-2xl border border-sand-200 overflow-hidden">
            {userId && signedInEmail && (
              <View className="px-5 py-4 border-b border-sand-100">
                <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-1">
                  Signed in as
                </Text>
                <Text className="text-ink-700 font-medium text-sm" numberOfLines={1}>
                  {signedInEmail}
                </Text>
              </View>
            )}
            {!userId ? (
              <>
              <Pressable
                onPress={() => router.push({ pathname: '/onboarding/account', params: { from: 'settings' } })}
                className="px-5 py-4 flex-row justify-between items-center active:bg-sand-100"
              >
                <View className="flex-1 pr-3">
                  <Text className="text-ink-700 font-medium text-sm">Sign in</Text>
                  <Text className="text-ink-300 text-xs mt-0.5">
                    Sync your logs across devices and unlock Premium.
                  </Text>
                </View>
                <View className="flex-row items-center gap-x-1"><Text className="text-sage-600 text-sm font-medium">Sign in</Text><ArrowRightIcon size={16} color="#5A7A5A" /></View>
              </Pressable>
              <Pressable
                onPress={handleClearLogs}
                className="px-5 py-4 flex-row justify-between items-center active:bg-sand-100"
              >
                <Text className="text-red-400 font-medium text-sm">Clear all log history</Text>
              </Pressable>
              </>
            ) : isPremium ? (
              <>
                <View className="px-5 py-4 flex-row justify-between items-center border-b border-sand-100">
                  <View className="flex-1 pr-3">
                    <Text className="text-ink-700 font-medium text-sm">Premium</Text>
                    <Text className="text-ink-300 text-xs mt-0.5">
                      AI-generated reminders and detailed insights are active.
                    </Text>
                  </View>
                  <View className="bg-sage-600 rounded-full px-3 py-1">
                    <Text className="text-white text-xs font-semibold">Active</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => {
                    openRevenueCatCustomerCenter().catch((error) =>
                      console.warn('[revenuecat] customer center failed:', error)
                    );
                  }}
                  className="px-5 py-4 flex-row justify-between items-center border-b border-sand-100 active:bg-sand-100"
                >
                  <Text className="text-ink-700 font-medium text-sm">Manage subscription</Text>
                  <ArrowRightIcon size={16} color="#5A7A5A" />
                </Pressable>
                <Pressable
                  onPress={() => router.push('/settings/change-password')}
                  className="px-5 py-4 flex-row justify-between items-center border-b border-sand-100 active:bg-sand-100"
                >
                  <Text className="text-ink-700 font-medium text-sm">Change password</Text>
                  <ArrowRightIcon size={16} color="#5A7A5A" />
                </Pressable>
                <Pressable
                  onPress={handleClearLogs}
                  className="px-5 py-4 flex-row justify-between items-center border-b border-sand-100 active:bg-sand-100"
                >
                  <Text className="text-red-400 font-medium text-sm">Clear all log history</Text>
                </Pressable>
                <Pressable
                  onPress={handleSignOut}
                  className="px-5 py-4 flex-row justify-between items-center border-b border-sand-100 active:bg-sand-100"
                >
                  <Text className="text-ink-700 font-medium text-sm">Sign out</Text>
                </Pressable>
                <Pressable
                  onPress={handleDeleteAccount}
                  className="px-5 py-4 flex-row justify-between items-center active:bg-sand-100"
                >
                  <Text className="text-red-400 font-medium text-sm">Delete account</Text>
                </Pressable>
              </>
            ) : (
              <>
                <StarBorderUpgradeRow />
                <Pressable
                  onPress={() => router.push('/settings/change-password')}
                  className="px-5 py-4 flex-row justify-between items-center border-b border-sand-100 active:bg-sand-100"
                >
                  <Text className="text-ink-700 font-medium text-sm">Change password</Text>
                  <ArrowRightIcon size={16} color="#5A7A5A" />
                </Pressable>
                <Pressable
                  onPress={handleClearLogs}
                  className="px-5 py-4 flex-row justify-between items-center border-b border-sand-100 active:bg-sand-100"
                >
                  <Text className="text-red-400 font-medium text-sm">Clear all log history</Text>
                </Pressable>
                <Pressable
                  onPress={handleSignOut}
                  className="px-5 py-4 flex-row justify-between items-center border-b border-sand-100 active:bg-sand-100"
                >
                  <Text className="text-ink-700 font-medium text-sm">Sign out</Text>
                </Pressable>
                <Pressable
                  onPress={handleDeleteAccount}
                  className="px-5 py-4 flex-row justify-between items-center active:bg-sand-100"
                >
                  <Text className="text-red-400 font-medium text-sm">Delete account</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* ── Version (hidden debug entry) ────────────────────────────────── */}
        <View className="items-center py-4">
          <Text className="text-ink-300 text-xs">Khushu App v1.1.2</Text>
        </View>

      </ScrollView>

      {/* ── Sign Out Confirmation Modal ────────────────────────────────── */}
      <AppDialog
        visible={showSignOutModal}
        title="Sign out?"
        message="Are you sure you want to sign out?"
        tone="warning"
        onDismiss={() => setShowSignOutModal(false)}
        actions={[
          { label: 'Cancel', tone: 'secondary', onPress: () => setShowSignOutModal(false) },
          { label: 'Sign out', tone: 'destructive', onPress: confirmSignOut },
        ]}
      />

      {/* ── Delete Account Confirmation Modal ──────────────────────────── */}
      <AppDialog
        visible={showDeleteAccountModal}
        title="Delete account?"
        message="This will permanently delete your account. Your locally stored logs will remain on this device, but your account and cloud data will be gone forever."
        tone="destructive"
        onDismiss={() => setShowDeleteAccountModal(false)}
        actions={[
          { label: 'Cancel', tone: 'secondary', onPress: () => setShowDeleteAccountModal(false) },
          {
            label: 'Delete',
            tone: 'destructive',
            onPress: () => {
              setShowDeleteAccountModal(false);
              setShowFinalDeleteAccountModal(true);
            },
          },
        ]}
      />

      {/* ── Clear Logs Confirmation Modal ──────────────────────────────── */}
      <AppDialog
        visible={showFinalDeleteAccountModal}
        title="Permanently delete account?"
        message="This cannot be undone."
        tone="destructive"
        onDismiss={() => setShowFinalDeleteAccountModal(false)}
        actions={[
          { label: 'Cancel', tone: 'secondary', onPress: () => setShowFinalDeleteAccountModal(false) },
          { label: 'Delete account', tone: 'destructive', onPress: confirmDeleteAccount },
        ]}
      />

      <AppDialog
        visible={showClearLogsModal}
        title="Clear all log history?"
        message="This will permanently delete all your logged salah reflections. This cannot be undone."
        tone="destructive"
        onDismiss={() => setShowClearLogsModal(false)}
        actions={[
          { label: 'Cancel', tone: 'secondary', onPress: () => setShowClearLogsModal(false) },
          { label: 'Clear', tone: 'destructive', onPress: confirmClearLogs },
        ]}
      />

      <AppDialog
        visible={showDndPermissionDialog}
        title="Allow Do Not Disturb access"
        message="Android requires this special access before Khushu can silence your phone. On the next screen, enable Khushu, then return to the app."
        tone="info"
        dismissOnBackdrop={false}
        actions={[
          {
            label: 'Cancel',
            tone: 'secondary',
            onPress: () => {
              setShowDndPermissionDialog(false);
              setDndDuringSalah(false);
              saveSetting('dnd_during_salah', 'false');
            },
          },
          { label: 'Open settings', onPress: () => void openDndAccessSettings() },
        ]}
      />

      <AppDialog
        visible={feedbackDialog !== null}
        title={feedbackDialog?.title ?? ''}
        message={feedbackDialog?.message ?? ''}
        tone={feedbackDialog?.tone}
        onDismiss={() => setFeedbackDialog(null)}
        actions={[{ label: 'OK', onPress: () => setFeedbackDialog(null) }]}
      />

    </SafeAreaView>
  );
}
