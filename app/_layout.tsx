import '../global.css';
import { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { ResponsiveLayoutProvider } from '@/components/responsive/ResponsiveLayout';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
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
import { count, eq, gte, max } from 'drizzle-orm';
import { selectIsPremium, type ThemePreference, useAppStore } from '@/store/appStore';
import { initDatabase, db } from '@/db/database';
import { salahLogs, settings } from '@/db/schema';
import * as SecureStore from 'expo-secure-store';
import { calculatePrayerTimes } from '@/lib/prayer/prayerTimes';
import {
  setupNotificationChannel,
  schedulePreSalahReminders,
  cancelPreSalahReminders,
  schedulePostSalahPrompts,
  cancelPostSalahReminders,
  dismissExpiredPrayerNotifications,
  scheduleWeeklySummaryNotification,
  scheduleReEngagementNotification,
} from '@/lib/notifications/notificationService';
import {
  clearAllCachedAIReminders,
  flushQueuedAIReminderGenerations,
} from '@/lib/notifications/reminderContent';
import type { SalahName, CalculationMethodKey, AsrMadhab } from '@/types';
import { supabase } from '@/lib/supabase/client';
import { syncLogsFromCloud } from '@/lib/supabase/sync';
import NetInfo from '@react-native-community/netinfo';
import { writeWidgetData } from '@/lib/widget/widgetData';
import { setPendingUrl } from '@/lib/deeplink';
import * as Linking from 'expo-linking';
import {
  clearRevenueCatUser,
  configureRevenueCat,
  identifyRevenueCatUser,
  refreshPremiumStatus,
} from '@/lib/revenuecat/service';
import { getThemeColors, shouldUseDarkAutoTheme } from '@/lib/theme/colors';
import {
  AnalyticsProvider,
  identifyAnalyticsUser,
  resetAnalyticsUser,
} from '@/lib/analytics/posthog';
import { LOCATION_LABEL_SETTING_KEY, resolveLocationLabel } from '@/lib/location/locationLabel';

// Capture the deep link URL IMMEDIATELY at module scope — before any async init blocks the navigator.
// Without this, release builds lose the URL because the callback screen can't mount until
// setup() finishes (1-3 s), by which time Linking.getInitialURL() already returns null.
Linking.getInitialURL().then(setPendingUrl).catch(() => {});

SplashScreen.preventAutoHideAsync();

const STARTUP_SESSION_TIMEOUT_MS = 1_500;

/**
 * Supabase session recovery refreshes expired tokens over the network. That
 * must never hold the splash screen open when the device is offline.
 */
async function getStartupSession() {
  return Promise.race([
    supabase.auth.getSession(),
    new Promise<{ data: { session: null } }>((resolve) => {
      setTimeout(() => resolve({ data: { session: null } }), STARTUP_SESSION_TIMEOUT_MS);
    }),
  ]);
}

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
    setLocationLabel,
    setTodaysPrayerTimes,
    setReminderMinutesBefore,
    setPreSalahReminderEnabled,
    setPostSalahPromptEnabled,
    setUse24HourTime,
    location,
    darkMode,
    setDarkMode,
    themePreference,
    setThemePreference,
    calculationMethod,
    setCalculationMethod,
    asrMadhab,
    setAsrMadhab,
    setDndDuringSalah,
    setUserId,
    setPremiumStatus,
    premiumStatus,
    isDbReady,
  } = useAppStore();
  const isPremium = useAppStore(selectIsPremium);
  const { setColorScheme } = useColorScheme();
  const theme = getThemeColors(darkMode);
  const [initError, setInitError] = useState<string | null>(null);
  const [pendingNotificationResponse, setPendingNotificationResponse] =
    useState<Notifications.NotificationResponse | null>(null);
  const authVersionRef = useRef(0);

  useEffect(() => {
    async function setup() {
      try {
        // Resolve the persistent completion state before rendering a navigator.
        // An existing authenticated session also completes onboarding: users should
        // never be sent through it again after having signed in.
        const onboardingVal = await SecureStore.getItemAsync('onboarding_complete');
        let onboardingComplete = onboardingVal === 'true';

        // Rehydrate Supabase session without waiting indefinitely for an
        // offline token refresh. The auth listener reconciles the identity
        // later once Supabase becomes available again.
        const { data: { session } } = await getStartupSession();
        if (session?.user && !onboardingComplete) {
          await SecureStore.setItemAsync('onboarding_complete', 'true');
          onboardingComplete = true;
        }
        if (onboardingComplete) setHasCompletedOnboarding(true);
        await initDatabase();

        // Resolve the app-selected theme before revealing any React Native
        // surfaces. Otherwise Android's system theme can render the first frame
        // and then be replaced by the persisted app theme after navigation mounts.
        const themePreferenceRow = db.select().from(settings).where(eq(settings.key, 'theme_preference')).get();
        const darkModeRow = db.select().from(settings).where(eq(settings.key, 'dark_mode')).get();
        const savedThemePreference = themePreferenceRow?.value;
        const persistedThemePreference: ThemePreference = (
          savedThemePreference === 'auto' || savedThemePreference === 'light' || savedThemePreference === 'dark'
        ) ? savedThemePreference : darkModeRow?.value === 'true' ? 'dark' : 'light';

        let persistedDarkMode = persistedThemePreference === 'dark';
        if (persistedThemePreference === 'auto') {
          const latRow = db.select().from(settings).where(eq(settings.key, 'location_lat')).get();
          const lngRow = db.select().from(settings).where(eq(settings.key, 'location_lng')).get();
          if (latRow && lngRow) {
            const methodRow = db.select().from(settings).where(eq(settings.key, 'calculation_method')).get();
            const madhabRow = db.select().from(settings).where(eq(settings.key, 'asr_madhab')).get();
            const prayerTimes = calculatePrayerTimes(
              { latitude: parseFloat(latRow.value), longitude: parseFloat(lngRow.value) },
              new Date(),
              (methodRow?.value ?? 'MuslimWorldLeague') as CalculationMethodKey,
              (madhabRow?.value ?? 'Shafi') as AsrMadhab,
            );
            persistedDarkMode = shouldUseDarkAutoTheme(prayerTimes);
          }
        }

        setThemePreference(persistedThemePreference);
        setColorScheme(persistedDarkMode ? 'dark' : 'light');
        setDarkMode(persistedDarkMode);

        // Hydrate the saved location and today's calculations before revealing
        // Home. Rendering first with Zustand's null defaults caused the empty
        // location state to flash briefly on every cold launch.
        const startupLatRow = db.select().from(settings).where(eq(settings.key, 'location_lat')).get();
        const startupLngRow = db.select().from(settings).where(eq(settings.key, 'location_lng')).get();
        const startupLabelRow = db.select().from(settings).where(eq(settings.key, LOCATION_LABEL_SETTING_KEY)).get();
        if (startupLatRow && startupLngRow) {
          const startupLocation = {
            latitude: parseFloat(startupLatRow.value),
            longitude: parseFloat(startupLngRow.value),
          };
          if (Number.isFinite(startupLocation.latitude) && Number.isFinite(startupLocation.longitude)) {
            const methodRow = db.select().from(settings).where(eq(settings.key, 'calculation_method')).get();
            const method = (methodRow?.value ?? 'MuslimWorldLeague') as CalculationMethodKey;
            const madhabRow = db.select().from(settings).where(eq(settings.key, 'asr_madhab')).get();
            const madhab = (madhabRow?.value ?? 'Shafi') as AsrMadhab;

            setLocation(startupLocation);
            setLocationLabel(startupLabelRow?.value?.trim() || null);
            setCalculationMethod(method);
            setAsrMadhab(madhab);
            setTodaysPrayerTimes(calculatePrayerTimes(startupLocation, new Date(), method, madhab));

            // Older installs have coordinates but no cached name. Backfill it
            // without requesting permission or delaying the first frame.
            if (!startupLabelRow?.value?.trim()) {
              void resolveLocationLabel(startupLocation).then((label) => {
                if (!label) return;
                setLocationLabel(label);
                db.insert(settings)
                  .values({ key: LOCATION_LABEL_SETTING_KEY, value: label })
                  .onConflictDoUpdate({ target: settings.key, set: { value: label } })
                  .run();
              });
            }
          }
        }
        setIsHydrated(true);

        await setupNotificationChannel();

        // Configure the purchase SDK before resolving identity. It remains a
        // locked no-op until this platform's public SDK key is supplied at build time.
        await configureRevenueCat();

        if (session?.user) {
          setUserId(session.user.id);
          identifyAnalyticsUser(session.user.id);
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
          // Preserve PostHog's anonymous ID for guests. Resetting it on every
          // cold start makes lifecycle events and subsequent guest activity
          // belong to separate people, which breaks funnels.
          await clearRevenueCatUser();
        }

        // Rehydrate notification settings
        const minutesRow = db.select().from(settings).where(eq(settings.key, 'reminder_minutes_before')).get();
        const savedMinutesBefore = minutesRow ? parseInt(minutesRow.value, 10) : 10;
        // Versions before the dedicated pre-Salah switch used -1 as the off
        // value. Preserve that choice while giving the picker a usable time if
        // the user turns reminders back on.
        const preSalahWasDisabled = savedMinutesBefore === -1;
        const minutesBefore = preSalahWasDisabled ? 10 : savedMinutesBefore;
        setReminderMinutesBefore(minutesBefore);

        const preRow = db.select().from(settings).where(eq(settings.key, 'pre_salah_reminder_enabled')).get();
        const preEnabled = preRow ? preRow.value !== 'false' : !preSalahWasDisabled;
        setPreSalahReminderEnabled(preEnabled);

        const postRow = db.select().from(settings).where(eq(settings.key, 'post_salah_prompt_enabled')).get();
        const postEnabled = postRow?.value !== 'false';
        setPostSalahPromptEnabled(postEnabled);

        const timeFormatRow = db.select().from(settings).where(eq(settings.key, 'use_24_hour_time')).get();
        setUse24HourTime(timeFormatRow?.value === 'true');

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
            if (preEnabled) await schedulePreSalahReminders(prayerTimes, minutesBefore);
            else await cancelPreSalahReminders();
            if (postEnabled) await schedulePostSalahPrompts(prayerTimes);
            else await cancelPostSalahReminders();
            await dismissExpiredPrayerNotifications();
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

      if (event === 'SIGNED_OUT') {
        setUserId(null);
        resetAnalyticsUser();
        setPremiumStatus('free');
        setTimeout(() => {
          clearRevenueCatUser();
        }, 0);
        return;
      }

      // INITIAL_SESSION for a guest is not a sign-out. Keep the existing
      // anonymous PostHog identity so events remain attributable to one person.
      if (!session?.user) {
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
      identifyAnalyticsUser(uid);
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

  // Auto follows the locally calculated daylight window and is re-evaluated
  // after returning to the foreground as well as while the app remains open.
  useEffect(() => {
    if (themePreference !== 'auto') return;

    const applyAutoTheme = () => {
      const resolvedDarkMode = location
        ? shouldUseDarkAutoTheme(calculatePrayerTimes(location, new Date(), calculationMethod, asrMadhab))
        : false;
      if (useAppStore.getState().darkMode !== resolvedDarkMode) {
        setDarkMode(resolvedDarkMode);
        setColorScheme(resolvedDarkMode ? 'dark' : 'light');
      }
    };

    applyAutoTheme();
    const interval = setInterval(applyAutoTheme, 30_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') applyAutoTheme();
    });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [asrMadhab, calculationMethod, location, setColorScheme, setDarkMode, themePreference]);

  // Android can revoke exact-alarm access while the app is backgrounded, and
  // prayer times can roll over to a new day on either platform. Rebuild the
  // one-shot alarms on return using the current permission and today's times.
  useEffect(() => {
    if (!isDbReady) return;

    let running = false;
    let refreshQueued = false;

    const refreshPrayerNotifications = async () => {
      if (running) {
        refreshQueued = true;
        return;
      }
      running = true;

      try {
        do {
          refreshQueued = false;
          const current = useAppStore.getState();
          if (!current.location) continue;

          const { status } = await Notifications.getPermissionsAsync();
          if (status !== 'granted') continue;

          const prayerTimes = calculatePrayerTimes(
            current.location,
            new Date(),
            current.calculationMethod,
            current.asrMadhab,
          );
          current.setTodaysPrayerTimes(prayerTimes);
          if (current.preSalahReminderEnabled) {
            await schedulePreSalahReminders(prayerTimes, current.reminderMinutesBefore);
          } else {
            await cancelPreSalahReminders();
          }
          if (current.postSalahPromptEnabled) {
            await schedulePostSalahPrompts(prayerTimes);
          } else {
            await cancelPostSalahReminders();
          }
          await dismissExpiredPrayerNotifications();
        } while (refreshQueued);
      } catch (error) {
        console.warn('[notifications] foreground refresh failed:', error);
      } finally {
        running = false;
      }
    };

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPrayerNotifications();
    });
    return () => subscription.remove();
  }, [isDbReady]);

  // The initial theme is resolved while the navigator is still hidden. On a
  // cold Android start, NativeWind can initialise its CSS variables from the
  // device colour scheme after that early call, leaving the Zustand setting on
  // Light while the rendered palette is still Dark. Re-apply the resolved app
  // theme once hydration has mounted the React surface so both stay in sync.
  useEffect(() => {
    if (!isHydrated) return;
    setColorScheme(darkMode ? 'dark' : 'light');
  }, [darkMode, isHydrated, setColorScheme]);

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

  // A confirmed Free entitlement must not retain AI content from an expired
  // membership. Running this for every resolved Free startup also covers a
  // subscription that expired while the app was closed.
  useEffect(() => {
    if (!isDbReady || premiumStatus !== 'free') return;
    clearAllCachedAIReminders().catch((error) =>
      console.warn('[reminder] Premium cache cleanup failed:', error)
    );
  }, [isDbReady, premiumStatus]);

  // Rebuild future reminders after an entitlement transition so Premium
  // customers receive the full pattern depth immediately after purchase.
  useEffect(() => {
    if (!isDbReady || (premiumStatus === 'unknown' && !isPremium)) return;
    const { todaysPrayerTimes, reminderMinutesBefore, preSalahReminderEnabled } = useAppStore.getState();
    if (!todaysPrayerTimes) return;
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        const update = preSalahReminderEnabled
          ? schedulePreSalahReminders(todaysPrayerTimes, reminderMinutesBefore)
          : cancelPreSalahReminders();
        update.catch((error) => console.warn('[notifications] entitlement reschedule failed:', error));
      }
    });
  }, [isDbReady, isPremium, premiumStatus]);

  // Flush offline saves as soon as the device regains an internet connection.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        const uid = useAppStore.getState().userId;
        syncLogsFromCloud(uid ?? undefined).catch((error) =>
          console.warn('[supabase] reconnect log sync failed:', error)
        );
        if (selectIsPremium(useAppStore.getState())) {
          flushQueuedAIReminderGenerations().catch((error) =>
            console.warn('[reminder] queued generation retry failed:', error)
          );
        }
      }
    });
    return unsubscribe;
  }, []);

  // NetInfo normally reports the current state to a new listener, but check
  // once after hydration as well so queued reminders are recovered on a fresh,
  // already-online launch.
  useEffect(() => {
    if (!isDbReady || !isPremium) return;
    NetInfo.fetch().then((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        return flushQueuedAIReminderGenerations();
      }
    }).catch((error) =>
      console.warn('[reminder] queued generation startup retry failed:', error)
    );
  }, [isDbReady, isPremium]);

  // Handle notification taps:
  // - pre_salah / weekly_summary → open Home
  // - post_salah → open Log tab pre-selected to that prayer and its log day
  useEffect(() => {
    const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
      setPendingNotificationResponse(response);
      Notifications.clearLastNotificationResponse();
    };

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) {
      handleNotificationResponse(lastResponse);
    }

    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => sub.remove();
  }, []);

  // Wait until the root Stack has rendered before navigating from a cold-start
  // notification tap. Expo Router throws if navigation happens any earlier.
  useEffect(() => {
    if (
      !pendingNotificationResponse
      || !isHydrated
      || (!fontsLoaded && !fontError)
      || !hasCompletedOnboarding
    ) return;

    const data = pendingNotificationResponse.notification.request.content.data as {
      type?: string;
      salah?: SalahName;
      logDay?: 'today' | 'yesterday';
    };
    if (data?.type === 'pre_salah' || data?.type === 'weekly_summary') {
      router.replace('/(tabs)');
    } else if (data?.type === 'post_salah' && data.salah) {
      router.push({
        pathname: '/(tabs)/log',
        params: { salah: data.salah, day: data.logDay ?? 'today' },
      });
    }
    setPendingNotificationResponse(null);
  }, [fontError, fontsLoaded, hasCompletedOnboarding, isHydrated, pendingNotificationResponse]);

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
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.backgroundAlt }}>
        <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 12, color: theme.text }}>
          Startup error:
        </Text>
        <Text style={{ fontSize: 12, color: theme.greyDark, lineHeight: 18 }}>
          {initError}
        </Text>
      </View>
    );
  }

  // Don't render anything until hydration and font loading are complete.
  if (!isHydrated || (!fontsLoaded && !fontError)) return null;

  return (
    <AnalyticsProvider>
      <ResponsiveLayoutProvider>
        <SafeAreaProvider>
          <View className="flex-1 bg-sand-100">
            <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'transparent' }}>
              <StatusBar style={darkMode ? 'light' : 'dark'} />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
                {hasCompletedOnboarding ? (
                  <Stack.Screen name="(tabs)" />
                ) : (
                  <Stack.Screen name="onboarding" />
                )}
                <Stack.Screen name="auth/callback" />
                <Stack.Screen name="settings/change-password" />
                <Stack.Screen name="settings/manage-subscription" />
                <Stack.Screen name="dev" options={{ presentation: 'modal' }} />
                <Stack.Screen name="salah-mode" options={{ presentation: 'fullScreenModal' }} />
                <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
                <Stack.Screen name="+not-found" />
              </Stack>
            </GestureHandlerRootView>
          </View>
        </SafeAreaProvider>
      </ResponsiveLayoutProvider>
    </AnalyticsProvider>
  );
}
