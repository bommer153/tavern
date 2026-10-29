import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { Button, ErrorNote, GiftGlyph, Loading, Row, Screen, T } from '@/components/ui';
import { api, errorMessage, newKey } from '@/lib/api';
import { c } from '@/theme';
import { Icon } from '@/components/icon';

export default function GiftScreen() {
  const p = useLocalSearchParams<{ recipientId: string; name: string; context: 'profile' | 'room' | 'order'; contextId?: string }>();
  const qc = useQueryClient();
  const gifts = useQuery({ queryKey: ['gifts'], queryFn: () => api.gifts.list() });
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: () => api.wallet.summary() });
  const [sel, setSel] = useState<string | null>(null);
  const [key, setKey] = useState(newKey);
  const [sent, setSent] = useState<string | null>(null);
  const scale = useRef(new Animated.Value(0)).current;
  const gift = gifts.data?.find((g) => g.id === sel);

  const send = useMutation({
    mutationFn: () => api.gifts.send({ giftId: sel!, recipientId: p.recipientId, quantity: 1, context: p.context, contextId: p.contextId, idempotencyKey: key }),
    onSuccess: (r) => {
      qc.setQueryData(['wallet'], (w: any) => (w ? { ...w, balance: r.balance } : w));
      setSent(gift!.imageUrl); // animation only after the server confirmed the transaction
      setKey(newKey());
    },
  });
  useEffect(() => {
    if (!sent) return;
    scale.setValue(0);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
    const t = setTimeout(() => setSent(null), 1400);
    return () => clearTimeout(t);
  }, [sent, scale]);

  return (
    <Screen edges={['bottom']}>
      <T size={18} weight="800">To {p.name}</T>
      <T muted>Balance: <T style={{ color: c.gold }} weight="700">{wallet.data?.balance ?? '—'} coins</T></T>
      {gifts.isPending ? <Loading /> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {gifts.data?.map((g) => (
            <Pressable key={g.id} onPress={() => setSel(g.id)} accessibilityRole="radio" accessibilityLabel={`${g.name}, ${g.coinCost} coins`} accessibilityState={{ selected: sel === g.id }}
              style={{ width: '30%', alignItems: 'center', gap: 4, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: sel === g.id ? c.purple : c.line, backgroundColor: sel === g.id ? c.purple + '22' : c.surface }}>
              <GiftGlyph image={g.imageUrl} size={38} />
              <T size={12} numberOfLines={1}>{g.name}</T>
              <Row style={{ gap: 3 }}><Icon name="coin" size={12} color={c.gold} /><T size={12} style={{ color: c.gold }}>{g.coinCost}</T></Row>
            </Pressable>
          ))}
        </View>
      )}
      <ErrorNote error={send.error ? errorMessage(send.error) : null} />
      <Row>
        {gift && wallet.data && gift.coinCost > wallet.data.balance ? (
          <Button title="Top up" variant="gold" style={{ flex: 1 }} onPress={() => router.push('/wallet')} />
        ) : (
          <Button title={gift ? `Send ${gift.name}` : 'Choose a gift'} style={{ flex: 1 }} disabled={!gift} loading={send.isPending} onPress={() => send.mutate()} />
        )}
      </Row>
      <T size={12} style={{ color: c.faint }}>Gifts are final and coins have no cash value. Companions receive a share as earnings.</T>
      {sent && (
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }} accessibilityLiveRegion="polite">
          <Animated.View style={{ transform: [{ scale }] }}><GiftGlyph image={sent} size={140} /></Animated.View>
        </View>
      )}
    </Screen>
  );
}
