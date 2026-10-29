import { useQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/icon';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { c } from '@/theme';

const ICON: Record<string, IconName> = { index: 'home', discover: 'discover', rooms: 'mic', messages: 'chat', profile: 'user' };

// Only the bits of the navigator's tab-bar props the dock uses.
type DockProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string; tabBarBadge?: number | string } }>;
  navigation: { emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean }; navigate: (name: string) => void };
};

/** Tavern's dock: a floating glass pill with the raised Tavern core in the middle (opens search). */
function Dock({ state, descriptors, navigation }: DockProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.dock} accessibilityRole="tablist">
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const { title, tabBarBadge } = descriptors[route.key]!.options;
          const onPress = () => {
            const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Fragment key={route.key}>
              {i === 2 && (
                <Pressable onPress={() => router.push('/search')} accessibilityRole="button" accessibilityLabel="Find someone to play with" style={({ pressed }) => [styles.core, pressed && { transform: [{ scale: 0.94 }] }]}>
                  <Icon name="emblem" size={30} color="#fff" />
                </Pressable>
              )}
              <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={tabBarBadge ? `${title}, ${tabBarBadge} unread` : title} style={styles.item}>
                <View style={styles.well}>
                  <Icon name={ICON[route.name] ?? 'home'} size={21} color={focused ? c.purpleHi : c.faint} />
                  {!!tabBarBadge && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{tabBarBadge}</Text>
                    </View>
                  )}
                </View>
                {focused && <View style={styles.activeDot} />}
              </Pressable>
            </Fragment>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { me } = useSession();
  const convs = useQuery({ queryKey: ['conversations'], queryFn: () => api.conversations.list(), enabled: !!me });
  if (!me) return <Redirect href="/sign-in" />;
  const unread = convs.data?.reduce((a, x) => a + x.unread, 0) ?? 0;
  return (
    <Tabs
      tabBar={(props) => <Dock {...(props as unknown as DockProps)} />}
      screenOptions={{ headerStyle: { backgroundColor: c.bg }, headerTintColor: c.ink, headerShadowVisible: false, headerTitleStyle: { fontWeight: '800' }, sceneStyle: { backgroundColor: c.bg } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', headerShown: false }} />
      <Tabs.Screen name="rooms" options={{ title: 'Voice' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages', tabBarBadge: unread || undefined }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: c.bg, paddingHorizontal: 12, paddingTop: 14 },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 62,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: '#0E0B28',
    borderWidth: 1,
    borderColor: c.lineHi,
    shadowColor: c.purple,
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  item: { flex: 1, alignItems: 'center', gap: 4 },
  well: { width: 40, height: 28, alignItems: 'center', justifyContent: 'center' },
  activeDot: { width: 4, height: 4, borderRadius: 4, backgroundColor: c.purpleHi },
  core: {
    width: 58,
    height: 58,
    marginTop: -28,
    marginHorizontal: 2,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5B2EE0',
    borderWidth: 4,
    borderColor: '#0E0B28',
    shadowColor: c.purple,
    shadowOpacity: 0.9,
    shadowRadius: 16,
    elevation: 14,
  },
  badge: { position: 'absolute', top: -4, right: 0, minWidth: 18, height: 16, paddingHorizontal: 4, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: c.pink, borderWidth: 2, borderColor: '#0E0B28' },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
