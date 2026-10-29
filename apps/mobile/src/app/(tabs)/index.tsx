import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, ErrorNote, FloatingEmblem, Loading, PersonTile, RoomTile, Row, Screen, SectionTitle, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { c, radius } from '@/theme';
import { Icon } from '@/components/icon';

const rail = { gap: 14, paddingHorizontal: 20 };
const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/** Home, kept short: hero, who's online, next session, then two horizontal rails (rooms, companions). */
export default function Home() {
  const { me } = useSession();
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: () => api.rooms.list(), refetchInterval: 20_000 });
  const sections = useQuery({ queryKey: ['sections'], queryFn: () => api.companions.sections() });
  const following = useQuery({ queryKey: ['following'], queryFn: () => api.companions.following() });
  const orders = useQuery({ queryKey: ['orders', 'customer', 'active'], queryFn: () => api.orders.mine({ as: 'customer', status: 'active' }) });
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: () => api.wallet.summary() });
  const notes = useQuery({ queryKey: ['notifications', 'count'], queryFn: () => api.notifications.list(), refetchInterval: 60_000 });

  const followingIds = new Set(following.data?.map((x) => x.userId));
  const hostIds = new Set(rooms.data?.map((r) => r.host.id));
  const online = [...(following.data ?? []), ...(sections.data?.online ?? [])].filter((x, i, a) => (x.online || x.busy) && a.findIndex((y) => y.userId === x.userId) === i);
  const companions = sections.data ? [...(sections.data.featured ?? []), ...(sections.data.topRated ?? [])].filter((x, i, a) => a.findIndex((y) => y.userId === x.userId) === i) : null;
  const next = orders.data?.items[0];
  const refresh = () => { rooms.refetch(); sections.refetch(); following.refetch(); orders.refetch(); };

  return (
    <Screen glow refreshing={sections.isRefetching} onRefresh={refresh} style={{ gap: 26, padding: 20 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: 8 }}>
          <FloatingEmblem size={28} />
          <T size={20} weight="800" style={{ letterSpacing: 2 }}>TAVERN</T>
        </Row>
        <Row style={{ gap: 12 }}>
          <Pressable onPress={() => router.push('/wallet')} accessibilityLabel={`Wallet, ${wallet.data?.balance ?? 0} coins`} style={st.coins}>
            <Icon name="coin" size={15} color={c.gold} />
            <T size={13} weight="700">{wallet.data?.balance.toLocaleString() ?? '—'}</T>
          </Pressable>
          <Pressable onPress={() => router.push('/notifications')} accessibilityLabel={`Notifications${notes.data?.unread ? `, ${notes.data.unread} unread` : ''}`} hitSlop={10}>
            <Icon name="bell" size={24} color={c.ink} />
            {!!notes.data?.unread && <View style={st.unread} />}
          </Pressable>
        </Row>
      </Row>

      <View style={st.hero}>
        <View style={st.heroGlow} />
        <View style={st.heroEmblem}><FloatingEmblem size={72} /></View>
        <View style={st.pill}>
          <View style={st.onDot} />
          <T size={12} weight="600">{online.length ? `${online.length} online now` : 'The Tavern is open'}</T>
        </View>
        <T size={26} weight="800" style={{ marginTop: 18 }}>{me ? `${greeting()}, ${me.displayName.split(' ')[0]}` : "Who's playing tonight?"}</T>
      </View>

      {online.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 16, paddingHorizontal: 20 }}>
          {online.map((x) => (
            <Pressable key={x.userId} onPress={() => router.push(`/c/${x.username}`)} accessibilityLabel={`${x.displayName}, ${x.busy ? 'in a session' : 'online'}`} style={{ width: 58, alignItems: 'center', gap: 5 }}>
              <Avatar name={x.displayName} uri={x.avatarUrl} size={52} status={x.busy ? 'busy' : 'online'} ring={hostIds.has(x.userId) ? c.cyan : followingIds.has(x.userId) ? c.purple : undefined} />
              <T size={11} numberOfLines={1}>{x.displayName}</T>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {next && (
        <Pressable onPress={() => router.push(`/order/${next.id}`)} style={({ pressed }) => [st.session, pressed && { backgroundColor: c.surface2 }]}>
          <Avatar name={next.companion.displayName} uri={next.companion.avatarUrl} size={44} />
          <View style={{ flex: 1 }}>
            <T weight="700" numberOfLines={1}>{next.service.title}</T>
            <T muted size={12} numberOfLines={1}>
              {next.scheduledStart ? new Date(next.scheduledStart).toLocaleString('en-PH', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'Play now'} · {next.companion.displayName}
            </T>
          </View>
          <Icon name="chevron" size={18} color={c.faint} />
        </Pressable>
      )}

      {!!rooms.data?.length && (
        <View style={{ gap: 10 }}>
          <SectionTitle title="Live rooms" onMore={() => router.navigate('/(tabs)/rooms')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={rail}>
            {rooms.data.map((r) => <RoomTile key={r.id} r={r} width={230} />)}
          </ScrollView>
        </View>
      )}

      <View style={{ gap: 10 }}>
        <SectionTitle title="Companions" onMore={() => router.navigate('/(tabs)/discover')} />
        <ErrorNote error={sections.error ? errorMessage(sections.error) : null} />
        {!companions ? (
          <Loading />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={rail}>
            {companions.slice(0, 10).map((x) => <PersonTile key={x.userId} c={x} width={140} />)}
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  coins: { flexDirection: 'row', gap: 5, alignItems: 'center', borderRadius: 99, backgroundColor: c.glass, borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, paddingVertical: 6 },
  unread: { position: 'absolute', right: 1, top: 1, width: 9, height: 9, borderRadius: 5, backgroundColor: c.pink, borderWidth: 2, borderColor: c.bg },
  hero: { overflow: 'hidden', padding: 20, minHeight: 150, borderRadius: 22, backgroundColor: '#1A1050', borderWidth: 1, borderColor: c.lineHi },
  heroGlow: { position: 'absolute', right: -40, top: -50, width: 220, height: 220, borderRadius: 220, backgroundColor: c.purple, opacity: 0.35 },
  heroEmblem: { position: 'absolute', right: 18, top: 14 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: '#06051A99', borderWidth: 1, borderColor: c.line },
  onDot: { width: 7, height: 7, borderRadius: 7, backgroundColor: c.success },
  session: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.card, backgroundColor: c.glass, borderWidth: 1, borderColor: c.line },
});
