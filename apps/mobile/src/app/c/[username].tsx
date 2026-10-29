import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SERVICE_CATEGORY_LABELS } from '@tavern/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { Avatar, Badge, Button, Card, ErrorNote, IconButton, Loading, Row, Screen, T } from '@/components/ui';
import { api, errorMessage, formatPhp } from '@/lib/api';
import { useSession } from '@/lib/session';
import { c } from '@/theme';
import { Icon } from '@/components/icon';

export default function CompanionProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { me } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['companion', username], queryFn: () => api.companions.get(username) });
  const reviews = useQuery({ queryKey: ['reviews', q.data?.userId], queryFn: () => api.companions.reviews(q.data!.userId), enabled: !!q.data });
  const follow = useMutation({
    mutationFn: () => (q.data!.isFollowing ? api.companions.unfollow(q.data!.userId) : api.companions.follow(q.data!.userId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companion', username] }),
  });
  const message = useMutation({ mutationFn: () => api.conversations.start(q.data!.userId), onSuccess: (r) => router.push(`/chat/${r.id}`) });

  if (q.isPending) return <Loading />;
  if (q.error) return <Screen><ErrorNote error={errorMessage(q.error)} /></Screen>;
  const x = q.data;
  const self = me?.id === x.userId;

  const moreActions = () =>
    Alert.alert(x.displayName, undefined, [
      { text: 'Report', onPress: () => api.reports.create({ targetType: 'user', targetId: x.userId, reason: 'other' }).then(() => Alert.alert('Reported', 'Our moderators will review this.')) },
      { text: 'Block', style: 'destructive', onPress: () => api.users.block(x.userId).then(() => router.back()) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: x.displayName, headerRight: self ? undefined : () => <Pressable onPress={moreActions} accessibilityRole="button" accessibilityLabel="More actions" hitSlop={10}><Icon name="more" size={22} color={c.ink} /></Pressable> }} />
      <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
        <Avatar name={x.displayName} uri={x.avatarUrl} size={88} status={x.busy ? 'busy' : x.online ? 'online' : 'offline'} />
        <Row style={{ gap: 4 }}>
          <T size={22} weight="800">{x.displayName}</T>
          {x.verified && <Icon name="verified" size={18} color="#B49CFF" label="Verified" />}
        </Row>
        <T muted>@{x.username} · {x.busy ? 'In a session' : x.online ? 'Online' : 'Offline'}</T>
        <Row style={{ gap: 4 }}><Icon name="star" size={14} color={c.gold} /><T>{x.ratingAvg ? x.ratingAvg.toFixed(1) : 'New'} <T muted>({x.ratingCount}) · {x.followerCount} followers</T></T></Row>
        {!self && (
          <Row style={{ marginTop: 10, gap: 16 }}>
            <IconButton icon="heart" label={x.isFollowing ? 'Unfollow' : 'Follow'} variant={x.isFollowing ? 'active' : 'glass'} filled={x.isFollowing} onPress={() => follow.mutate()} loading={follow.isPending} size={52} />
            <IconButton icon="chat" label="Message" variant="primary" onPress={() => message.mutate()} loading={message.isPending} size={60} />
            <IconButton icon="gift" label="Send a gift" onPress={() => router.push({ pathname: '/gift', params: { recipientId: x.userId, name: x.displayName, context: 'profile' } })} size={52} />
          </Row>
        )}
      </Card>
      <Card style={{ gap: 8 }}>
        <T weight="700" size={17}>About</T>
        <T muted style={{ lineHeight: 21 }}>{x.bio || x.headline}</T>
        <Row style={{ flexWrap: 'wrap', gap: 6 }}>
          {x.games.map((g) => <Badge key={g.gameId} label={`${g.name.split(':')[0]}${g.rank ? ' · ' + g.rank : ''}`} tone="purple" />)}
          {x.languages.map((l) => <Badge key={l} label={l} />)}
        </Row>
      </Card>
      <T weight="700" size={18}>Services</T>
      {x.services.map((s) => (
        <Card key={s.id} style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <T weight="700" size={16}>{s.title}</T>
              <T muted size={12}>{SERVICE_CATEGORY_LABELS[s.category]} · {s.unitMinutes} min</T>
            </View>
            <T weight="800" size={17}>{formatPhp(s.pricePerUnitCentavos)}</T>
          </Row>
          {!!s.description && <T muted>{s.description}</T>}
          {s.includes.map((i) => <T key={i} size={13}>✓ {i}</T>)}
          {s.excludes.map((i) => <T key={i} size={13} muted>✕ {i}</T>)}
          <T size={12} style={{ color: c.faint }}>{s.cancellationPolicy}</T>
          {!self && <Button title="Hire now" onPress={() => router.push({ pathname: '/book', params: { username, serviceId: s.id } })} style={{ marginTop: 6 }} />}
        </Card>
      ))}
      <T weight="700" size={18}>Reviews</T>
      {reviews.data?.items.length ? reviews.data.items.map((r) => (
        <Card key={r.id} style={{ gap: 4 }}>
          <Row style={{ justifyContent: 'space-between' }}><T weight="600">{r.author.displayName}</T><View accessible accessibilityLabel={`${r.rating} out of 5 stars`} style={{ flexDirection: 'row', gap: 1 }}>{Array.from({ length: r.rating }, (_, i) => <Icon key={i} name="star" size={13} color={c.gold} />)}</View></Row>
          {!!r.comment && <T muted>{r.comment}</T>}
        </Card>
      )) : <T muted>No reviews yet.</T>}
    </Screen>
  );
}
