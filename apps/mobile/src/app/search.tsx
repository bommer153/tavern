import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS, type ServiceCategory } from '@tavern/shared';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CompanionCard, Empty, ErrorNote, Input, Loading, Row, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { c } from '@/theme';

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ borderRadius: 99, borderWidth: 1, borderColor: on ? c.purple : c.line, backgroundColor: on ? c.purple + '22' : 'transparent', paddingHorizontal: 12, paddingVertical: 7 }}>
      <T size={13} style={{ color: on ? c.ink : c.muted }}>{label}</T>
    </Pressable>
  );
}

export default function Search() {
  const params = useLocalSearchParams<{ game?: string; online?: string }>();
  const [q, setQ] = useState('');
  const [text, setText] = useState('');
  const [game, setGame] = useState(params.game);
  const [category, setCategory] = useState<ServiceCategory>();
  const [rank, setRank] = useState<string>();
  const [online, setOnline] = useState(params.online === 'true');
  const [voice, setVoice] = useState(false);
  const [sort, setSort] = useState<'featured' | 'rating' | 'price_asc'>('featured');
  const games = useQuery({ queryKey: ['games'], queryFn: () => api.games.list(), staleTime: 300_000 });
  const g = games.data?.find((x) => x.slug === game);
  const filters = { q: q || undefined, game, category, rank, online: online || undefined, voice: voice || undefined, sort };
  const list = useInfiniteQuery({
    queryKey: ['companions', 'mobile', filters],
    queryFn: ({ pageParam }) => api.companions.list({ ...filters, page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <Input placeholder="Name, headline…" value={text} onChangeText={setText} onSubmitEditing={() => setQ(text)} returnKeyType="search" accessibilityLabel="Search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <Chip label="All games" on={!game} onPress={() => { setGame(undefined); setRank(undefined); }} />
        {games.data?.map((x) => <Chip key={x.id} label={x.name.split(':')[0]!} on={game === x.slug} onPress={() => { setGame(x.slug); setRank(undefined); }} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {SERVICE_CATEGORIES.map((x) => <Chip key={x} label={SERVICE_CATEGORY_LABELS[x]} on={category === x} onPress={() => setCategory(category === x ? undefined : x)} />)}
      </ScrollView>
      {g && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {g.ranks.map((r) => <Chip key={r} label={r} on={rank === r} onPress={() => setRank(rank === r ? undefined : r)} />)}
        </ScrollView>
      )}
      <Row style={{ justifyContent: 'space-between' }}>
        <Row><Switch value={online} onValueChange={setOnline} trackColor={{ true: c.purple }} accessibilityLabel="Online now" /><T>Online now</T></Row>
        <Row><Switch value={voice} onValueChange={setVoice} trackColor={{ true: c.purple }} accessibilityLabel="Voice" /><T>Voice</T></Row>
      </Row>
      <Row style={{ gap: 6 }}>
        {([['featured', 'Featured'], ['rating', 'Top rated'], ['price_asc', 'Lowest price']] as const).map(([v, l]) => <Chip key={v} label={l} on={sort === v} onPress={() => setSort(v)} />)}
      </Row>
      <ErrorNote error={list.error ? errorMessage(list.error) : null} />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['bottom']}>
      <FlatList
        data={items}
        keyExtractor={(x) => x.userId}
        renderItem={({ item }) => <CompanionCard c={item} />}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListHeaderComponent={header}
        ListEmptyComponent={list.isPending ? <Loading /> : <Empty icon="search" title="No companions match" body="Try removing a filter." />}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
}
