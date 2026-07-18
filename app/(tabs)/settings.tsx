import { View, Text, Switch, Pressable, ScrollView, ActivityIndicator, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { eq } from 'drizzle-orm';
import { salahLogs } from '@/db/schema';
import * as Location from 'expo-location';
import { useAppStore } from '@/store/appStore';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase/client';
import { clearLogsEverywhere } from '@/lib/supabase/sync';
import { db } from '@/db/database';
import { settings } from '@/db/schema';
import { calculatePrayerTimes } from '@/lib/prayer/prayerTimes';
import {
  schedulePreSalahReminders,
  schedulePostSalahPrompts,
  cancelPostSalahReminders,
} from '@/lib/notifications/notificationService';
import { CALCULATION_METHODS, type CalculationMethodKey, type AsrMadhab } from '@/types';
import { WheelPicker } from '@/components/ui/WheelPicker';

const MINUTE_VALUES = Array.from({ length: 60 }, (_, i) => i + 1); // 1–60

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
    isPremium,
    setUserId,
    setIsPremium,
  } = useAppStore();

  const [autoDetectStatus, setAutoDetectStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [wheelActive, setWheelActive] = useState(false);
  const [autoDetectedLabel, setAutoDetectedLabel] = useState<string>('');
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [methodDropdownOpen, setMethodDropdownOpen] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showClearLogsModal, setShowClearLogsModal] = useState(false);

  // Debug entry: 5 taps on version text within 3 seconds
  const debugTapCount = useRef(0);
  const debugTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  function handleDebugTap() {
    debugTapCount.current += 1;
    if (debugTapTimer.current) clearTimeout(debugTapTimer.current);
    debugTapTimer.current = setTimeout(() => { debugTapCount.current = 0; }, 3000);
    if (debugTapCount.current >= 5) {
      debugTapCount.current = 0;
      router.push('/debug');
    }
  }

  // Rehydrate from DB each time tab is focused
  useFocusEffect(
    useCallback(() => {
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
    }, [])
  );

  function recalcAndReschedule(method: CalculationMethodKey, madhab: AsrMadhab, mins: number) {
    if (!location) return;
    const pt = calculatePrayerTimes(location, new Date(), method, madhab);
    setTodaysPrayerTimes(pt);
    schedulePreSalahReminders(pt, mins);
  }

  async function handleMinutesChange(mins: number) {
    setReminderMinutesBefore(mins);
    saveSetting('reminder_minutes_before', String(mins));
    recalcAndReschedule(calculationMethod, asrMadhab, mins);
  }

  function handleDndToggle(val: boolean) {
    setDndDuringSalah(val);
    saveSetting('dnd_during_salah', String(val));
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
    const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    if (permStatus !== 'granted') {
      setLocationStatus('error');
      return;
    }
    try {
      let loc = await Location.getLastKnownPositionAsync();
      if (!loc) {
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      }
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      useAppStore.getState().setLocation(coords);
      db.insert(settings).values({ key: 'location_lat', value: String(coords.latitude) })
        .onConflictDoUpdate({ target: settings.key, set: { value: String(coords.latitude) } }).run();
      db.insert(settings).values({ key: 'location_lng', value: String(coords.longitude) })
        .onConflictDoUpdate({ target: settings.key, set: { value: String(coords.longitude) } }).run();
      recalcAndReschedule(calculationMethod, asrMadhab, reminderMinutesBefore);
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
    await supabase.auth.signOut();
    setUserId(null);
    setIsPremium(false);
  }

  async function confirmDeleteAccount() {
    setShowDeleteAccountModal(false);
    try {
      await supabase.rpc('delete_user');
      await supabase.auth.signOut();
      setUserId(null);
      setIsPremium(false);
    } catch {
      // silent — user will see auth state change
    }
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
              formatValue={(v) => `${v} min`}
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
            <View className="px-5 py-4 flex-row justify-between items-center border-b border-sand-100">
              <View className="flex-1 pr-4">
                <Text className="text-ink-700 font-medium text-sm">Post-Salah prompt</Text>
                <Text className="text-ink-300 text-xs mt-0.5">
                  Remind me to log if I haven't after the prayer window closes.
                </Text>
              </View>
              <Switch
                value={postSalahPromptEnabled}
                onValueChange={handlePostSalahToggle}
                trackColor={{ false: '#EFE8D8', true: '#5A7A5A' }}
                thumbColor="#FFFFFF"
              />
            </View>
            {Platform.OS !== 'ios' && (
              <View className="px-5 py-4 flex-row justify-between items-center">
                <View className="flex-1 pr-4">
                  <Text className="text-ink-700 font-medium text-sm">Silence during Salah Mode</Text>
                  <Text className="text-ink-300 text-xs mt-0.5">
                    Automatically silences your phone when Salah Mode starts. (Android only)
                  </Text>
                </View>
                <Switch
                  value={dndDuringSalah}
                  onValueChange={handleDndToggle}
                  trackColor={{ false: '#EFE8D8', true: '#5A7A5A' }}
                  thumbColor="#FFFFFF"
                />
              </View>
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
                        <View className="w-5 h-5 rounded-full bg-sage-600 items-center justify-center">
                          <Text className="text-white text-xs font-bold">✓</Text>
                        </View>
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
                  Shafi'i, Maliki & Hanbali
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
            {!userId ? (
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
                <Text className="text-sage-600 text-sm font-medium">Sign in →</Text>
              </Pressable>
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
                  onPress={() => router.push('/paywall')}
                  className="px-5 py-4 flex-row justify-between items-center border-b border-sand-100 active:bg-sand-100"
                >
                  <Text className="text-ink-700 font-medium text-sm">Manage subscription</Text>
                  <Text className="text-sage-600 text-sm font-medium">→</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push('/settings/change-password')}
                  className="px-5 py-4 flex-row justify-between items-center border-b border-sand-100 active:bg-sand-100"
                >
                  <Text className="text-ink-700 font-medium text-sm">Change password</Text>
                  <Text className="text-sage-600 text-sm font-medium">→</Text>
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
                <Pressable
                  onPress={() => router.push('/paywall')}
                  className="px-5 py-4 flex-row justify-between items-center border-b border-sand-100 active:bg-sand-100"
                >
                  <View className="flex-1 pr-3">
                    <Text className="text-ink-700 font-medium text-sm">Upgrade to Premium</Text>
                    <Text className="text-ink-300 text-xs mt-0.5">
                      AI reminders personalised to your focus patterns.
                    </Text>
                  </View>
                  <Text className="text-sage-600 text-sm font-medium">Upgrade →</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push('/settings/change-password')}
                  className="px-5 py-4 flex-row justify-between items-center border-b border-sand-100 active:bg-sand-100"
                >
                  <Text className="text-ink-700 font-medium text-sm">Change password</Text>
                  <Text className="text-sage-600 text-sm font-medium">→</Text>
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
        <Pressable onPress={handleDebugTap} className="items-center py-4">
          <Text className="text-ink-300 text-xs">Khushu AI v1.0.0</Text>
        </Pressable>

      </ScrollView>

      {/* ── Sign Out Confirmation Modal ────────────────────────────────── */}
      <Modal visible={showSignOutModal} transparent animationType="fade">
        <Pressable className="flex-1 bg-black/30 items-center justify-center px-8" onPress={() => setShowSignOutModal(false)}>
          <Pressable className="bg-white rounded-2xl p-6 w-full max-w-sm" onPress={(e) => e.stopPropagation()}>
            <Text className="text-ink-900 text-base font-semibold text-center mb-2">
              Sign out?
            </Text>
            <Text className="text-ink-400 text-sm text-center mb-6">
              Are you sure you want to sign out?
            </Text>
            <View className="flex-row gap-x-3">
              <Pressable
                onPress={() => setShowSignOutModal(false)}
                className="flex-1 py-3 rounded-2xl bg-sand-200 items-center"
              >
                <Text className="text-ink-700 font-medium">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmSignOut}
                className="flex-1 py-3 rounded-2xl bg-red-500 items-center"
              >
                <Text className="text-white font-medium">Sign out</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Delete Account Confirmation Modal ──────────────────────────── */}
      <Modal visible={showDeleteAccountModal} transparent animationType="fade">
        <Pressable className="flex-1 bg-black/30 items-center justify-center px-8" onPress={() => setShowDeleteAccountModal(false)}>
          <Pressable className="bg-white rounded-2xl p-6 w-full max-w-sm" onPress={(e) => e.stopPropagation()}>
            <Text className="text-ink-900 text-base font-semibold text-center mb-2">
              Delete account?
            </Text>
            <Text className="text-ink-400 text-sm text-center mb-6">
              This will permanently delete your account. Your locally stored logs will remain on this device, but your account and any cloud data will be gone forever.
            </Text>
            <View className="flex-row gap-x-3">
              <Pressable
                onPress={() => setShowDeleteAccountModal(false)}
                className="flex-1 py-3 rounded-2xl bg-sand-200 items-center"
              >
                <Text className="text-ink-700 font-medium">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmDeleteAccount}
                className="flex-1 py-3 rounded-2xl bg-red-500 items-center"
              >
                <Text className="text-white font-medium">Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Clear Logs Confirmation Modal ──────────────────────────────── */}
      <Modal visible={showClearLogsModal} transparent animationType="fade">
        <Pressable className="flex-1 bg-black/30 items-center justify-center px-8" onPress={() => setShowClearLogsModal(false)}>
          <Pressable className="bg-white rounded-2xl p-6 w-full max-w-sm" onPress={(e) => e.stopPropagation()}>
            <Text className="text-ink-900 text-base font-semibold text-center mb-2">
              Clear all log history?
            </Text>
            <Text className="text-ink-400 text-sm text-center mb-6">
              This will permanently delete all your logged salah reflections. This cannot be undone.
            </Text>
            <View className="flex-row gap-x-3">
              <Pressable
                onPress={() => setShowClearLogsModal(false)}
                className="flex-1 py-3 rounded-2xl bg-sand-200 items-center"
              >
                <Text className="text-ink-700 font-medium">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmClearLogs}
                className="flex-1 py-3 rounded-2xl bg-red-500 items-center"
              >
                <Text className="text-white font-medium">Clear</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}
