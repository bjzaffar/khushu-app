import '../global.css';
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { eq } from 'drizzle-orm';
import { useAppStore } from '@/store/appStore';
import { initDatabase, db } from '@/db/database';
import { settings } from '@/db/schema';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { hasCompletedOnboarding, setHasCompletedOnboarding, setDbReady } = useAppStore();
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    async function setup() {
      try {
        await initDatabase();

        // Rehydrate onboarding status from the settings table so the app
        // doesn't show onboarding again after the user has completed it.
        const row = db
          .select()
          .from(settings)
          .where(eq(settings.key, 'onboarding_complete'))
          .get();
        if (row?.value === 'true') setHasCompletedOnboarding(true);

        setDbReady(true);
      } catch (e: unknown) {
        setInitError(e instanceof Error ? e.message : String(e));
      } finally {
        SplashScreen.hideAsync();
      }
    }
    setup();
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        {hasCompletedOnboarding ? (
          <Stack.Screen name="(tabs)" />
        ) : (
          <Stack.Screen name="onboarding" />
        )}
        <Stack.Screen name="salah-mode" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </GestureHandlerRootView>
  );
}
