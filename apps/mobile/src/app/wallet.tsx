import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Badge, Button, Card, ErrorNote, Loading, Row, Screen, T } from '@/components/ui';
import { api, errorMessage, formatPhp, newKey } from '@/lib/api';
import { c } from '@/theme';
import { Icon } from '@/components/icon';

export default function Wallet() {
  const qc = useQueryClient();
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: () => api.wallet.summary() });
  const packages = useQuery({ queryKey: ['packages'], queryFn: () => api.wallet.packages() });
  const history = useQuery({ queryKey: ['wallet', 'history'], queryFn: () => api.wallet.transactions() });
  const [buying, setBuying] = useState<string | null>(null);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['wallet'] });
  };
  /** Polls the payment until the server (verified webhook) marks it paid. */
  const waitForPayment = async (paymentId: string) => {
    for (let i = 0; i < 20; i++) {
      const p = await api.payments.get(paymentId);
      if (p.status !== 'pending') return p.status;
      await new Promise((r) => setTimeout(r, 3000));
    }
    return 'pending';
  };

  const buy = useMutation({
    mutationFn: async (packageId: string) => {
      setBuying(packageId);
      const { paymentId, checkoutUrl } = await api.payments.checkout(packageId, newKey());
      if (checkoutUrl.includes('/wallet/dev-checkout/')) {
        // Development sandbox provider only — the API refuses it in production.
        const ok = await new Promise<boolean>((res) =>
          Alert.alert('Sandbox payment', 'Development provider: no real money moves.', [
            { text: 'Cancel', style: 'cancel', onPress: () => res(false) },
            { text: 'Approve', onPress: () => res(true) },
          ]),
        );
        if (!ok) return 'cancelled';
        await api.payments.devComplete(paymentId);
      } else {
        await WebBrowser.openBrowserAsync(checkoutUrl); // PayMongo hosted checkout (GCash, Maya, cards)
      }
      return waitForPayment(paymentId);
    },
    onSuccess: (status) => {
      refreshAll();
      if (status === 'paid') Alert.alert('Top-up successful', 'Coins were added to your wallet.');
      else if (status === 'pending') Alert.alert('Payment pending', 'We will add your coins as soon as the payment is confirmed.');
    },
    onSettled: () => setBuying(null),
  });

  return (
    <Screen edges={['bottom']} refreshing={wallet.isRefetching} onRefresh={() => { wallet.refetch(); history.refetch(); }}>
      <Card style={{ gap: 4, borderColor: c.gold + '55' }}>
        <T muted>Balance</T>
        <Row style={{ gap: 10 }}><Icon name="coin" size={34} color={c.gold} /><T size={34} weight="800" style={{ color: c.gold }}>{wallet.data?.balance.toLocaleString() ?? '—'}</T></Row>
        {wallet.data && <T muted size={12}>1 coin = {formatPhp(wallet.data.coinValueCentavos)} when booking</T>}
      </Card>
      <T weight="700" size={18}>Top up</T>
      <ErrorNote error={buy.error ? errorMessage(buy.error) : null} />
      {packages.isPending ? <Loading /> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {packages.data?.map((p) => (
            <Card key={p.id} style={{ width: '48%', gap: 6 }}>
              <Row style={{ gap: 6 }}><Icon name="coin" size={20} color={c.gold} /><T size={20} weight="800">{p.coins}</T></Row>
              {p.bonusCoins > 0 && <Badge label={`+${p.bonusCoins} bonus`} tone="gold" />}
              <T muted>{formatPhp(p.priceCentavos)}</T>
              <Button title="Buy" onPress={() => buy.mutate(p.id)} loading={buying === p.id} disabled={!!buying} />
            </Card>
          ))}
        </View>
      )}
      <T size={12} style={{ color: c.faint }}>Coins are credited only after the payment provider confirms payment. Coins have no cash value.</T>
      <T weight="700" size={18}>History</T>
      {history.data?.items.map((t) => (
        <Row key={t.id} style={{ justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <View style={{ flex: 1 }}>
            <T numberOfLines={1}>{t.description}</T>
            <T muted size={12}>{new Date(t.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</T>
          </View>
          <T weight="700" style={{ color: t.amount > 0 ? c.success : c.ink }}>{t.amount > 0 ? '+' : ''}{t.amount}</T>
        </Row>
      ))}
    </Screen>
  );
}
