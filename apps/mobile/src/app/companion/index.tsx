import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { OrderRow } from '@/components/orders';
import { Button, Card, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { api, formatPhp } from '@/lib/api';
import { c } from '@/theme';

const TABS = [['pending_acceptance', 'Requests'], ['active', 'Active'], ['past', 'History']] as const;

export default function CompanionDashboard() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('pending_acceptance');
  const earnings = useQuery({ queryKey: ['earnings'], queryFn: () => api.earnings.summary() });
  const orders = useQuery({ queryKey: ['orders', 'companion', tab], queryFn: () => api.orders.mine({ as: 'companion', status: tab }) });
  const items = tab === 'active' ? orders.data?.items.filter((o) => o.status !== 'pending_acceptance') : orders.data?.items;
  return (
    <Screen edges={['bottom']} refreshing={orders.isRefetching} onRefresh={() => { orders.refetch(); earnings.refetch(); }}>
      <Row>
        <Card style={{ flex: 1 }}><T muted size={12}>Available</T><T size={20} weight="800" style={{ color: c.gold }}>{earnings.data ? formatPhp(earnings.data.availableCentavos) : '—'}</T></Card>
        <Card style={{ flex: 1 }}><T muted size={12}>Pending</T><T size={20} weight="800">{earnings.data ? formatPhp(earnings.data.pendingCentavos) : '—'}</T></Card>
      </Row>
      <Button title="Earnings & payouts" variant="secondary" icon="wallet" onPress={() => router.push('/companion/earnings')} />
      <Row style={{ backgroundColor: c.surface, borderRadius: 12, padding: 4 }}>
        {TABS.map(([v, l]) => (
          <Pressable key={v} onPress={() => setTab(v)} accessibilityRole="tab" accessibilityState={{ selected: tab === v }} style={{ flex: 1, padding: 10, borderRadius: 9, alignItems: 'center', backgroundColor: tab === v ? c.surface2 : 'transparent' }}>
            <T weight="600" style={{ color: tab === v ? c.ink : c.muted }}>{l}</T>
          </Pressable>
        ))}
      </Row>
      {orders.isPending ? <Loading /> : items?.length ? <View style={{ gap: 10 }}>{items.map((o) => <OrderRow key={o.id} o={o} as="companion" />)}</View> : <Empty icon="list" title="Nothing here yet" body="Stay online in the app to receive play-now bookings." />}
      <T size={12} style={{ color: c.faint }}>Manage services and availability on the web dashboard.</T>
    </Screen>
  );
}
