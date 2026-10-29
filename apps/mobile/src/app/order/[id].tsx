import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ORDER_STATUS_LABELS } from '@tavern/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { statusTone } from '@/components/orders';
import { Avatar, Badge, Button, Card, ErrorNote, IconButton, Input, Loading, Row, Screen, T } from '@/components/ui';
import { api, errorMessage, formatPhp } from '@/lib/api';
import { useSession } from '@/lib/session';
import { c } from '@/theme';
import { Icon } from '@/components/icon';

type Action = 'accept' | 'decline' | 'cancel' | 'start' | 'complete' | 'dispute';

/** Timer uses server timestamps plus the measured clock offset, so app restarts never reset it. */
function Countdown({ endsAt, serverNow }: { endsAt: string; serverNow: string }) {
  const offset = useMemo(() => new Date(serverNow).getTime() - Date.now(), [serverNow]);
  const [now, setNow] = useState(Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);
  const left = Math.max(0, new Date(endsAt).getTime() - now);
  const mm = String(Math.floor(left / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0');
  return <T size={44} weight="800" style={{ fontVariant: ['tabular-nums'] }}>{mm}:{ss}</T>;
}

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api.orders.get(id), refetchInterval: 30_000 });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const act = useMutation({
    mutationFn: ({ a, reason }: { a: Action; reason?: string }) => api.orders.action(id, a, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
  const review = useMutation({ mutationFn: () => api.orders.review(id, { rating, comment: comment || undefined }), onSuccess: () => qc.invalidateQueries({ queryKey: ['order', id] }) });

  if (q.isPending) return <Loading />;
  if (q.error) return <Screen><ErrorNote error={errorMessage(q.error)} /></Screen>;
  const o = q.data;
  const isCustomer = me?.id === o.customer.id;
  const other = isCustomer ? o.companion : o.customer;
  const over = !!o.endsAt && new Date(o.endsAt) <= new Date(o.serverNow);
  const withReason = (a: Action, title: string) =>
    Alert.prompt
      ? Alert.prompt(title, a === 'dispute' ? 'Describe what went wrong' : 'Optional reason', (r) => act.mutate({ a, reason: r || undefined }))
      : Alert.alert(title, 'Are you sure?', [{ text: 'No', style: 'cancel' }, { text: 'Yes', onPress: () => act.mutate({ a, reason: a === 'dispute' ? 'Reported from Android app' : undefined }) }]);

  const actions: [string, () => void, 'primary' | 'secondary' | 'danger'][] = [];
  if (isCustomer) {
    if (['pending_acceptance', 'accepted'].includes(o.status)) actions.push(['Cancel order', () => withReason('cancel', 'Cancel order'), 'danger']);
    if (o.status === 'in_progress') actions.push(['Mark complete', () => act.mutate({ a: 'complete' }), 'primary']);
    if (['in_progress', 'completed'].includes(o.status)) actions.push(['Report a problem', () => withReason('dispute', 'Report a problem'), 'secondary']);
  } else {
    if (o.status === 'pending_acceptance') actions.push(['Accept', () => act.mutate({ a: 'accept' }), 'primary'], ['Decline', () => withReason('decline', 'Decline order'), 'danger']);
    if (o.status === 'accepted') actions.push(['Start session', () => act.mutate({ a: 'start' }), 'primary']);
    if (o.status === 'in_progress' && over) actions.push(['End session', () => act.mutate({ a: 'complete' }), 'primary']);
  }

  return (
    <Screen edges={['bottom']} refreshing={q.isRefetching} onRefresh={q.refetch}>
      <Card style={{ gap: 6 }}>
        <T muted size={12}>{o.orderNo}</T>
        <T size={20} weight="800">{o.service.title}</T>
        <T muted>{o.service.gameName} · {o.units} × {o.service.unitMinutes} min</T>
        <Badge label={ORDER_STATUS_LABELS[o.status]} tone={statusTone(o.status)} />
      </Card>
      {o.status === 'in_progress' && o.endsAt && (
        <Card style={{ alignItems: 'center', borderColor: c.pink + '66' }}>
          <T muted>Time remaining</T>
          <Countdown endsAt={o.endsAt} serverNow={o.serverNow} />
        </Card>
      )}
      <Card>
        <Row>
          <Avatar name={other.displayName} uri={other.avatarUrl} size={44} />
          <T weight="700" style={{ flex: 1 }}>{other.displayName}</T>
          {isCustomer && ['accepted', 'in_progress', 'completed'].includes(o.status) && (
            <IconButton icon="gift" label="Send a gift" size={44} onPress={() => router.push({ pathname: '/gift', params: { recipientId: o.companion.id, name: o.companion.displayName, context: 'order', contextId: o.id } })} />
          )}
          {o.conversationId && <IconButton icon="chat" label="Open chat" variant="primary" size={44} onPress={() => router.push(`/chat/${o.conversationId}`)} />}
        </Row>
      </Card>
      <Card style={{ gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}><T muted>Starts</T><T>{o.scheduledStart ? new Date(o.scheduledStart).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : 'Play now'}</T></Row>
        <Row style={{ justifyContent: 'space-between' }}><T muted>Total</T><T weight="700">{formatPhp(o.amounts.total)} · {o.paidWithCoins} coins</T></Row>
        {!isCustomer && <Row style={{ justifyContent: 'space-between' }}><T muted>Your earning</T><T weight="700" style={{ color: c.gold }}>{formatPhp(o.amounts.companionEarning)}</T></Row>}
      </Card>
      <ErrorNote error={act.error ? errorMessage(act.error) : null} />
      {actions.map(([label, fn, v]) => <Button key={label} title={label} variant={v} onPress={fn} loading={act.isPending} />)}
      {isCustomer && o.status === 'completed' && !o.reviewed && (
        <Card style={{ gap: 10 }}>
          <T weight="700">Rate your session</T>
          <Row>{[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => setRating(n)} hitSlop={6} accessibilityLabel={`${n} stars`}><Icon name="star" size={32} color={n <= rating ? c.gold : c.line} /></Pressable>)}</Row>
          <Input placeholder="Comment (optional)" value={comment} onChangeText={setComment} multiline />
          <ErrorNote error={review.error ? errorMessage(review.error) : null} />
          <Button title="Submit review" onPress={() => review.mutate()} loading={review.isPending} />
        </Card>
      )}
    </Screen>
  );
}
