import { Icon, type IconName } from '@/components/icon';
import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Card, IconButton, Row, Screen, T } from '@/components/ui';
import { WEB_URL } from '@/lib/api';
import { useSession } from '@/lib/session';
import { c, radius } from '@/theme';

type Item = [IconName, string, () => void];

/** Profile: who you are, then every destination as an icon tile (one word each). */
export default function Profile() {
  const { me, has, signOut } = useSession();
  if (!me) return null;
  const items: Item[] = [
    ['orders', 'Orders', () => router.push('/orders')],
    ['wallet', 'Wallet', () => router.push('/wallet')],
    ['bell', 'Alerts', () => router.push('/notifications')],
    ['heart', 'Following', () => router.push('/favorites')],
    ['settings', 'Settings', () => router.push('/settings')],
    ...(has('companion')
      ? ([
          ['gauge', 'Dashboard', () => router.push('/companion')],
          ['receipt', 'Earnings', () => router.push('/companion/earnings')],
        ] as Item[])
      : ([['sparkle', 'Go pro', () => Linking.openURL(`${WEB_URL}/become-companion`)]] as Item[])),
  ];

  return (
    <Screen glow edges={[]} style={{ gap: 24, padding: 20 }}>
      <Card style={{ paddingVertical: 22 }}>
        <Row style={{ gap: 16 }}>
          <Avatar name={me.displayName} uri={me.avatarUrl} size={68} ring={c.purple} />
          <View style={{ flex: 1, gap: 2 }}>
            <T size={20} weight="800" numberOfLines={1}>{me.displayName}</T>
            <T muted numberOfLines={1}>@{me.username}</T>
            {!me.emailVerified && (
              <Row style={{ gap: 4 }}>
                <Icon name="alert" size={13} color={c.warning} />
                <T size={12} style={{ color: c.warning }}>Verify email</T>
              </Row>
            )}
          </View>
          <IconButton icon="logout" label="Sign out" size={42} onPress={signOut} />
        </Row>
      </Card>

      <View style={st.grid}>
        {items.map(([icon, label, onPress]) => (
          <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [st.tile, pressed && { backgroundColor: c.surface2, transform: [{ scale: 0.97 }] }]}>
            <View style={st.well}>
              <Icon name={icon} size={24} color={c.purpleHi} />
            </View>
            <T size={12} weight="600" numberOfLines={1}>{label}</T>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '30.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: radius.card, backgroundColor: c.glass, borderWidth: 1, borderColor: c.line },
  well: { width: 50, height: 50, borderRadius: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: c.purple + '22' },
});
