import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { OrderRow } from '@/components/orders';
import { Button, Empty, ErrorNote, Loading, Row, Screen, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { c } from '@/theme';

export default function Orders() {
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const q = useQuery({ queryKey: ['orders', 'customer', tab], queryFn: () => api.orders.mine({ as: 'customer', status: tab }) });
  return (
    <Screen edges={[]} refreshing={q.isRefetching} onRefresh={q.refetch}>
      <Row style={{ backgroundColor: c.surface, borderRadius: 12, padding: 4 }}>
        {(['active', 'past'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} style={{ flex: 1, padding: 10, borderRadius: 9, backgroundColor: tab === t ? c.surface2 : 'transparent', alignItems: 'center' }}>
            <T weight="600" style={{ color: tab === t ? c.ink : c.muted }}>{t === 'active' ? 'Active & upcoming' : 'History'}</T>
          </Pressable>
        ))}
      </Row>
      <ErrorNote error={q.error ? errorMessage(q.error) : null} />
      {q.isPending ? <Loading /> : q.data?.items.length ? q.data.items.map((o) => <OrderRow key={o.id} o={o} as="customer" />) : (
        <Empty icon="orders" title="No orders here" body="Book a companion from Discover." action={<Button title="Discover" variant="secondary" onPress={() => router.navigate('/(tabs)/discover')} />} />
      )}
    </Screen>
  );
}
