import '../global.css';
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { eq } from 'drizzle-orm';
import { useAppStore } from '@/store/appStore';
import { initDatabase, db } from '@/db/database';
import { settings } from '@/db/schema';
import { calculatePrayerTimes } from '@/lib/prayer/prayerTimes';
import {
  setupNotificationChannel,
  requestNotificationPermissions,
  schedulePreSalahReminders,
  schedulePostSalahPrompts,
  scheduleWeeklySummaryNotification,
  scheduleReEngagementNotification,
} from '@/lib/notifications/notificationService';
import { salahLogs } from '@/db/schema';
import { count, gte, max } from 'drizzle-orm';
import type { SalahName, CalculationMethodKey, AsrMadhab } from '@/types';
import { supabase } from '@/lib/supabase/client';
import { syncLogsFromCloud } from '@/lib/supabase/sync';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const {
    hasCompletedOnboarding,
    setHasCompletedOnboarding,
    setDbReady,
    setLocation,
    setTodaysPrayerTimes,
    setReminderMinutesBefore,
    setPostSalahPromptEnabled,
    setCalculationMethod,
    setAsrMadhab,
    setDndDuringSalah,
    startSalahMode,
    setUserId,
  } = useAppStore();
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    async function setup() {
      try {
        await initDatabase();
        await setupNotificationChannel();

        // Rehydrate Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) setUserId(session.user.id);

        // Rehydrate onboarding flag
        const onboardingRow = db.select().from(settings).where(eq(settings.key, 'onboarding_complete')).get();
        if (onboardingRow?.value === 'true') setHasCompletedOnboarding(true);

        // Rehydrate notification settings
        const minutesRow = db.select().from(settings).where(eq(settings.key, 'reminder_minutes_before')).get();
        const minutesBefore = minutesRow ? parseInt(minutesRow.value, 10) : 10;
        setReminderMinutesBefore(minutesBefore);

        const postRow = db.select().from(settings).where(eq(settings.key, 'post_salah_prompt_enabled')).get();
        const postEnabled = postRow?.value !== 'false';
        setPostSalahPromptEnabled(postEnabled);

        // Reload location + prayer times + schedule notifications
        const latRow = db.select().from(settings).where(eq(settings.key, 'location_lat')).get();
        const lngRow = db.select().from(settings).where(eq(settings.key, 'location_lng')).get();
        if (latRow && lngRow) {
          const coords = {
            latitude: parseFloat(latRow.value),
            longitude: parseFloat(lngRow.value),
          };
          setLocation(coords);

          const methodRow = db.select().from(settings).where(eq(settings.key, 'calculation_method')).get();
          const method = (methodRow?.value ?? 'MuslimWorldLeague') as CalculationMethodKey;
          setCalculationMethod(method);

          const madhabRow = db.select().from(settings).where(eq(settings.key, 'asr_madhab')).get();
          const madhab = (madhabRow?.value ?? 'Shafi') as AsrMadhab;
          setAsrMadhab(madhab);

          const prayerTimes = calculatePrayerTimes(coords, new Date(), method, madhab);
          setTodaysPrayerTimes(prayerTimes);

          const granted = await requestNotificationPermissions();
          if (granted) {
            await schedulePreSalahReminders(prayerTimes, minutesBefore);
            if (postEnabled) await schedulePostSalahPrompts(prayerTimes);
          }
        }

        // Rehydrate DND preference
        const dndRow = db.select().from(settings).where(eq(settings.key, 'dnd_during_salah')).get();
        if (dndRow) setDndDuringSalah(dndRow.value === 'true');

        // Retention notifications
        const lastLogRow = db.select({ ts: max(salahLogs.loggedAt) }).from(salahLogs).get();
        const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
        if (!lastLogRow?.ts || lastLogRow.ts < threeDaysAgo) {
          await scheduleReEngagementNotification();
        }
        const weekAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const weekCountRow = db.select({ n: count() }).from(salahLogs).where(gte(salahLogs.logDate, weekAgoStr)).get();
        await scheduleWeeklySummaryNotification(weekCountRow?.n ?? 0);

        setDbReady(true);
      } catch (e: unknown) {
        setInitError(e instanceof Error ? e.message : String(e));
      } finally {
        SplashScreen.hideAsync();
      }
    }
    setup();
  }, []);

  // Keep userId in sync with Supabase auth state (sign in, sign out, token refresh)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUserId(session?.user?.id ?? null);
      if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        await syncLogsFromCloud();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Handle notification taps:
  // - pre_salah → open Salah Mode for that prayer
  // - post_salah → open Log tab pre-selected to that prayer
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string; salah?: SalahName };
      if (data?.type === 'pre_salah' && data.salah) {
        startSalahMode(data.salah);
        router.push('/salah-mode');
      } else if (data?.type === 'post_salah' && data.salah) {
        router.push({ pathname: '/(tabs)/log', params: { salah: data.salah } });
      }
    });
    return () => sub.remove();
  }, []);

  // Show a readable error screen instead of Expo Go's generic blue screen.
  // This makes startup errors debuggable.
  if (initError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FAF7F2' }}>
        <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 12, color: '#1A1917' }}>
          Startup error:
        </Text>
        <Text style={{ fontSize: 12, color: '#6B6360', lineHeight: 18 }}>
          {initError}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        {hasCompletedOnboarding ? (
          <Stack.Screen name="(tabs)" />
        ) : (
          <Stack.Screen name="onboarding" />
        )}
        <Stack.Screen name="salah-mode" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
