import { ORDER_STATUS_LABELS, type Order } from '@tavern/shared';
import { router } from 'expo-router';
import { View } from 'react-native';
import { formatPhp } from '@/lib/api';
import { Avatar, Badge, Card, Row, T } from './ui';

export const statusTone = (s: Order['status']) =>
  (({ pending_acceptance: 'warning', accepted: 'purple', in_progress: 'pink', completed: 'success', disputed: 'danger' }) as const)[s as 'accepted'] ?? 'neutral';

export function OrderRow({ o, as }: { o: Order; as: 'customer' | 'companion' }) {
  const other = as === 'customer' ? o.companion : o.customer;
  return (
    <Card onPress={() => router.push(`/order/${o.id}`)}>
      <Row>
        <Avatar name={other.displayName} uri={other.avatarUrl} size={42} />
        <View style={{ flex: 1 }}>
          <T weight="700" numberOfLines={1}>{o.service.title} · {other.displayName}</T>
          <T muted size={12}>{o.scheduledStart ? new Date(o.scheduledStart).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : 'Play now'} · {o.durationMinutes} min</T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <T weight="700">{formatPhp(as === 'companion' ? o.amounts.companionEarning : o.amounts.total)}</T>
          <Badge label={ORDER_STATUS_LABELS[o.status]} tone={statusTone(o.status)} />
        </View>
      </Row>
    </Card>
  );
}

