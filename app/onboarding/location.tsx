import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Pressable, ActivityIndicator, Linking, AppState } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { MapPinIcon } from 'react-native-heroicons/outline';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { useAppStore } from '@/store/appStore';
import { calculatePrayerTimes } from '@/lib/prayer/prayerTimes';
import { getDeviceLocation } from '@/lib/location/deviceLocation';
import { db } from '@/db/database';
import { settings } from '@/db/schema';
import { OnboardingFrame } from '@/components/responsive/OnboardingFrame';
import { useResponsiveLayout } from '@/components/responsive/ResponsiveLayout';

export default function OnboardingLocation() {
  const responsive = useResponsiveLayout();
  const { setLocation, setTodaysPrayerTimes } = useAppStore();
  const [status, setStatus] = useState<'idle' | 'loading' | 'denied' | 'blocked' | 'error'>('idle');
  const settingsOpenedRef = useRef(false);
  const appLeftForSettingsRef = useRef(false);
  const requestLocationRef = useRef(requestLocation);
  requestLocationRef.current = requestLocation;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (!settingsOpenedRef.current) return;

      if (nextState === 'inactive' || nextState === 'background') {
        appLeftForSettingsRef.current = true;
        return;
      }

      if (nextState === 'active' && appLeftForSettingsRef.current) {
        settingsOpenedRef.current = false;
        appLeftForSettingsRef.current = false;
        void requestLocationRef.current();
      }
    });

    return () => subscription.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setStatus('idle');
    }, [])
  );

  async function requestLocation() {
    setStatus('loading');
    try {
      const coords = await getDeviceLocation();
      if (!coords) {
        const permission = await Location.getForegroundPermissionsAsync();
        setStatus(permission.canAskAgain ? 'denied' : 'blocked');
        return;
      }

      const prayerTimes = calculatePrayerTimes(coords);
      setLocation(coords);
      setTodaysPrayerTimes(prayerTimes);

      db.insert(settings).values({ key: 'location_lat', value: String(coords.latitude) })
        .onConflictDoUpdate({ target: settings.key, set: { value: String(coords.latitude) } }).run();
      db.insert(settings).values({ key: 'location_lng', value: String(coords.longitude) })
        .onConflictDoUpdate({ target: settings.key, set: { value: String(coords.longitude) } }).run();

      router.push('/onboarding/account');
    } catch {
      setStatus('error');
    }
  }

  async function openLocationSettings() {
    settingsOpenedRef.current = true;
    appLeftForSettingsRef.current = false;
    try {
      await Linking.openSettings();
    } catch {
      settingsOpenedRef.current = false;
      setStatus('error');
    }
  }

  function skipLocation() {
    // Continue without location — user can set in Settings later
    router.push('/onboarding/account');
  }

  return (
    <OnboardingFrame>
        {/* Header */}
        <View className="items-center gap-y-3">
          <MapPinIcon size={responsive.scaleControl(48)} color="#5A7A5A" />
          <Text className="text-2xl font-semibold text-ink-900 text-center">
            Prayer times for your location
          </Text>
          <Text className="text-ink-300 text-sm text-center leading-relaxed mt-2">
            Khushu App calculates your prayer times locally using your device&apos;s GPS — no data leaves your device.
          </Text>
        </View>

        {/* Visual example */}
        <View className="bg-sand-200 rounded-2xl p-5 gap-y-3">
          <Text className="text-ink-500 text-xs uppercase tracking-widest font-medium mb-1">
            Example — London, UK
          </Text>
          {[
            ['Fajr', '5:14 AM'],
            ['Dhuhr', '12:18 PM'],
            ['Asr', '3:45 PM'],
            ['Maghrib', '6:02 PM'],
            ['Isha', '7:28 PM'],
          ].map(([name, time]) => (
            <View key={name} className="flex-row justify-between">
              <Text className="text-ink-700 font-medium" style={{ fontSize: 14 }}>{name}</Text>
              <Text className="text-ink-300" style={{ fontSize: 14 }}>{time}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View className="gap-y-3">
          {status === 'denied' && (
            <View className="bg-sand-200 rounded-xl p-4 mb-2">
              <Text className="text-ink-500 text-sm text-center">
                Location access was not allowed. Tap Allow Location Access to try again.
              </Text>
            </View>
          )}
          {status === 'blocked' && (
            <View className="bg-sand-200 rounded-xl p-4 mb-2">
              <Text className="text-ink-500 text-sm text-center">
                Location access is blocked for Khushu. Enable it in your device settings, then try again.
              </Text>
            </View>
          )}
          {status === 'error' && (
            <View className="bg-sand-200 rounded-xl p-4 mb-2">
              <Text className="text-ink-500 text-sm text-center">
                Could not get your location. Make sure GPS is enabled, then try again.
              </Text>
            </View>
          )}

          <Pressable
            className="bg-sage-500 py-4 rounded-2xl items-center justify-center active:bg-sage-600"
            style={{
              minHeight: responsive.isTablet ? responsive.scaleControl(52) : undefined,
            }}
            onPress={status === 'blocked' ? openLocationSettings : requestLocation}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-pure-white font-semibold text-base">
                {status === 'blocked' ? 'Open Device Settings' : 'Allow Location Access'}
              </Text>
            )}
          </Pressable>

          <Pressable
            className="py-3 items-center justify-center"
            style={{
              minHeight: responsive.isTablet ? responsive.scaleControl(44) : undefined,
            }}
            onPress={skipLocation}
          >
            <Text className="text-ink-300 text-sm">Continue without location</Text>
          </Pressable>
        </View>
    </OnboardingFrame>
  );
}
