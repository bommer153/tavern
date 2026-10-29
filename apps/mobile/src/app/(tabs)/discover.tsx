import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Empty, ErrorNote, GameToken, H, Loading, PersonTile, RoomTile, Screen, SectionTitle, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { c } from '@/theme';
import { Icon } from '@/components/icon';

const SECTIONS = [
  ['featured', 'Featured'],
  ['online', 'Online now'],
  ['topRated', 'Top rated'],
  ['popular', 'Popular'],
  ['new', 'New'],
] as const;

// Rails bleed to the screen edge; Screen pads 16.
const rail = { gap: 14, paddingHorizontal: 20 };

/** Discover, kept to about one screen: search, game tiles, one companion list at a time, live rooms. */
export default function Discover() {
  const sections = useQuery({ queryKey: ['sections'], queryFn: () => api.companions.sections() });
  const games = useQuery({ queryKey: ['games'], queryFn: () => api.games.list(), staleTime: 300_000 });
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: () => api.rooms.list(), refetchInterval: 20_000 });
  const lists = SECTIONS.filter(([k]) => sections.data?.[k]?.length);
  const [picked, setPicked] = useState<string>();
  const key = picked ?? lists[0]?.[0];

  return (
    <Screen glow refreshing={sections.isRefetching} onRefresh={() => { sections.refetch(); rooms.refetch(); }} style={{ gap: 24, padding: 20 }}>
      <H>Discover</H>
      <Pressable onPress={() => router.push('/search')} accessibilityRole="search" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, backgroundColor: c.glass, borderWidth: 1, borderColor: c.line, paddingHorizontal: 16, paddingVertical: 13 }}>
        <Icon name="search" size={18} color={c.faint} />
        <T muted style={{ flex: 1 }}>Search</T>
        <Icon name="sliders" size={18} color={c.muted} />
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
        {games.data?.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => router.push({ pathname: '/search', params: { game: g.slug } })}
            accessibilityRole="button"
            accessibilityLabel={g.name}
            style={({ pressed }) => ({ width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: pressed ? c.surface2 : c.glass, borderWidth: 1, borderColor: c.line })}
          >
            <GameToken slug={g.slug} name={g.name} size={44} />
          </Pressable>
        ))}
      </ScrollView>

      <ErrorNote error={sections.error ? errorMessage(sections.error) : null} />
      {sections.isPending ? (
        <Loading />
      ) : key ? (
        <View style={{ gap: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
            {lists.map(([k, title]) => (
              <Chip key={k} label={title} on={k === key} onPress={() => setPicked(k)} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={rail}>
            {sections.data![key]!.map((x) => <PersonTile key={x.userId} c={x} width={140} />)}
          </ScrollView>
        </View>
      ) : (
        <Empty icon="users" title="No companions yet" />
      )}

      {!!rooms.data?.length && (
        <View style={{ gap: 10 }}>
          <SectionTitle title="Live rooms" onMore={() => router.navigate('/(tabs)/rooms')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={rail}>
            {rooms.data.map((r) => <RoomTile key={r.id} r={r} width={230} />)}
          </ScrollView>
        </View>
      )}
    </Screen>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ borderRadius: 999, borderWidth: 1, borderColor: on ? c.purple : c.line, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: on ? c.purple : pressed ? c.surface2 : c.glass })}
    >
      <T size={13} weight="600" style={{ color: on ? '#fff' : c.muted }}>{label}</T>
    </Pressable>
  );
}
