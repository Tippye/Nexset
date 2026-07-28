import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme, View } from 'react-native';

import { initDatabase } from '@/db/client';
import { WorkoutPlatformBridge } from '@/platform/apple/workout-platform-bridge';
import { useAppStore } from '@/store/app-store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [dbReady, setDbReady] = useState(false);
  const hydrate = useAppStore((s) => s.hydrate);
  const hydrated = useAppStore((s) => s.hydrated);

  useEffect(() => {
    initDatabase()
      .then(() => hydrate())
      .then(() => setDbReady(true))
      .finally(() => SplashScreen.hideAsync());
  }, [hydrate]);

  if (!dbReady || !hydrated) {
    return <View />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <WorkoutPlatformBridge />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="workout/[sessionId]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="settings/ai" />
        <Stack.Screen name="settings/apple" />
        <Stack.Screen name="settings/webdav" />
      </Stack>
    </ThemeProvider>
  );
}
