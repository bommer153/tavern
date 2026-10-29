import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Providers, useSession } from '@/lib/session';
import { c } from '@/theme';

SplashScreen.preventAutoHideAsync();

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: c.bg, card: c.bg, primary: c.purple, text: c.ink, border: c.line } };

function Nav() {
  const { ready } = useSession();
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: c.bg }, headerTintColor: c.ink, contentStyle: { backgroundColor: c.bg }, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      <Stack.Screen name="register" options={{ title: 'Create account' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="search" options={{ title: 'Search & filters' }} />
      <Stack.Screen name="c/[username]" options={{ title: '' }} />
      <Stack.Screen name="book" options={{ title: 'Book a session', presentation: 'modal' }} />
      <Stack.Screen name="gift" options={{ title: 'Send a gift', presentation: 'modal' }} />
      <Stack.Screen name="orders" options={{ title: 'Orders' }} />
      <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
      <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
      <Stack.Screen name="room/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="wallet" options={{ title: 'Wallet' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="favorites" options={{ title: 'Favorites' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="companion/index" options={{ title: 'Companion dashboard' }} />
      <Stack.Screen name="companion/earnings" options={{ title: 'Earnings & payouts' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <ThemeProvider value={theme}>
        <Providers>
          <StatusBar style="light" />
          <Nav />
        </Providers>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
