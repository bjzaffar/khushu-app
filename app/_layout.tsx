import '../global.css';
import { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { eq } from 'drizzle-orm';
import { selectIsPremium, useAppStore } from '@/store/appStore';
import { initDatabase, db } from '@/db/database';
import { settings } from '@/db/schema';
import * as SecureStore from 'expo-secure-store';
import { calculatePrayerTimes } from '@/lib/prayer/prayerTimes';
import {
  setupNotificationChannel,
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
import NetInfo from '@react-native-community/netinfo';
import { writeWidgetData } from '@/lib/widget/widgetData';
import { setPendingUrl } from '@/lib/deeplink';
import * as Linking from 'expo-linking';
import { archiveActiveCustomDistractions } from '@/lib/customDistractions';
import {
  clearRevenueCatUser,
  configureRevenueCat,
  identifyRevenueCatUser,
  refreshPremiumStatus,
} from '@/lib/revenuecat/service';

// Capture the deep link URL IMMEDIATELY at module scope — before any async init blocks the navigator.
// Without this, release builds lose the URL because the callback screen can't mount until
// setup() finishes (1-3 s), by which time Linking.getInitialURL() already returns null.
Linking.getInitialURL().then(setPendingUrl).catch(() => {});

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  const {
    isHydrated,
    setIsHydrated,
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
    setPremiumStatus,
    premiumStatus,
    isDbReady,
  } = useAppStore();
  const isPremium = useAppStore(selectIsPremium);
  const [initError, setInitError] = useState<string | null>(null);
  const wasPremiumRef = useRef(false);
  const authVersionRef = useRef(0);

  useEffect(() => {
    async function setup() {
      try {
        // Resolve the persistent completion state before rendering a navigator.
        // An existing authenticated session also completes onboarding: users should
        // never be sent through it again after having signed in.
        const onboardingVal = await SecureStore.getItemAsync('onboarding_complete');
        let onboardingComplete = onboardingVal === 'true';

        // Rehydrate Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && !onboardingComplete) {
          await SecureStore.setItemAsync('onboarding_complete', 'true');
          onboardingComplete = true;
        }
        if (onboardingComplete) setHasCompletedOnboarding(true);
        setIsHydrated(true);

        await initDatabase();
        await setupNotificationChannel();

        // Configure the purchase SDK before resolving identity. It remains a
        // locked no-op until this platform's public SDK key is supplied at build time.
        await configureRevenueCat();

        if (session?.user) {
          setUserId(session.user.id);
          setPremiumStatus('unknown');
          try {
            await identifyRevenueCatUser(session.user.id);
          } catch (error) {
            console.warn('[revenuecat] startup identity failed:', error);
            setPremiumStatus('free');
          }
          // Never block startup when the device is offline. The durable queue
          // and connectivity listener will retry and refresh the cache later.
          syncLogsFromCloud(session.user.id).catch((error) =>
            console.warn('[supabase] startup log sync failed:', error)
          );
        } else {
          setUserId(null);
          await clearRevenueCatUser();
        }

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

          const { status: notificationPermission } = await Notifications.getPermissionsAsync();
          if (notificationPermission === 'granted') {
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
      }
    }
    setup();
  }, []);

  // Keep the Supabase and RevenueCat identities in lockstep. Auth callbacks are
  // serialized so an older asynchronous identity result cannot win a race.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const version = ++authVersionRef.current;

      if (!session?.user || event === 'SIGNED_OUT') {
        setUserId(null);
        setPremiumStatus('free');
        setTimeout(() => {
          clearRevenueCatUser();
        }, 0);
        return;
      }

      // Supabase invokes this callback while holding its auth lock. Calling auth APIs
      // from an async callback can deadlock setSession(), including recovery links.
      const uid = session.user.id;
      setUserId(uid);
      setPremiumStatus('unknown');
      setTimeout(() => {
        (async () => {
          try {
            await identifyRevenueCatUser(uid);
          } catch (error) {
            console.warn('[revenuecat] auth identity failed:', error);
            if (authVersionRef.current === version) setPremiumStatus('free');
          }
          if (authVersionRef.current !== version) return;
          syncLogsFromCloud(uid).catch((error) =>
            console.warn('[supabase] post-auth log sync failed:', error)
          );
        })();
      }, 0);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isHydrated && (fontsLoaded || fontError)) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, isHydrated]);

  // Refresh entitlement state after returning from Google Play or the Customer
  // Center. No refresh can grant access without RevenueCat CustomerInfo.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && useAppStore.getState().userId) {
        refreshPremiumStatus();
      }
    });
    return () => subscription.remove();
  }, []);

  // Widgets run outside React Native, so mirror every entitlement transition
  // into native shared storage. Unknown access is deliberately locked.
  useEffect(() => {
    if (!isDbReady) return;
    writeWidgetData(isPremium).catch((err) =>
      console.warn('[widget] premium access sync failed:', err)
    );
  }, [isDbReady, isPremium]);

  // Rebuild future reminders after an entitlement transition so Premium
  // customers receive the full pattern depth immediately after purchase.
  useEffect(() => {
    if (!isDbReady || (premiumStatus === 'unknown' && !isPremium)) return;
    const { todaysPrayerTimes, reminderMinutesBefore } = useAppStore.getState();
    if (!todaysPrayerTimes) return;
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        schedulePreSalahReminders(todaysPrayerTimes, reminderMinutesBefore).catch((error) =>
          console.warn('[notifications] entitlement reschedule failed:', error)
        );
      }
    });
  }, [isDbReady, isPremium, premiumStatus]);

  // Downgrading removes custom distractions from new logging, but keeps their
  // labels and every historical log intact for Insights and later reactivation.
  useEffect(() => {
    if (wasPremiumRef.current && !isPremium) {
      archiveActiveCustomDistractions();
    }
    wasPremiumRef.current = isPremium;
  }, [isPremium]);

  // Flush offline saves as soon as the device regains an internet connection.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        const uid = useAppStore.getState().userId;
        syncLogsFromCloud(uid ?? undefined).catch((error) =>
          console.warn('[supabase] reconnect log sync failed:', error)
        );
      }
    });
    return unsubscribe;
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

  // Capture deep link URLs that arrive while the app is already running (warm start).
  // Stores them so auth/callback can read via consumePendingUrl() instead of relying on
  // Linking.getInitialURL() which only returns the cold-start URL.
  useEffect(() => {
    const sub = Linking.addEventListener('url', (event) => {
      setPendingUrl(event.url);
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

  // Don't render anything until hydration and font loading are complete.
  if (!isHydrated || (!fontsLoaded && !fontError)) return null;

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
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="settings/change-password" />
        <Stack.Screen name="salah-mode" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
