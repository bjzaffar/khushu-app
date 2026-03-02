import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAppStore } from '@/store/appStore';
import { initDatabase } from '@/db/database';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { hasCompletedOnboarding, setDbReady } = useAppStore();

  useEffect(() => {
    async function setup() {
      await initDatabase();
      setDbReady(true);
      await SplashScreen.hideAsync();
    }
    setup();
  }, []);

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
