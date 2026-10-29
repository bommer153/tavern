import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { Button, Card, ErrorNote, Input, Loading, Row, Screen, T } from '@/components/ui';
import { api, errorMessage, formatPhp, newKey } from '@/lib/api';
import { c } from '@/theme';
import { Icon } from '@/components/icon';

/** Parses "YYYY-MM-DD HH:mm" in the device's local time. */
const parseLocal = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(s.trim());
  return m ? new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) : null;
};

export default function Book() {
  const { username, serviceId } = useLocalSearchParams<{ username: string; serviceId: string }>();
  const qc = useQueryClient();
  const comp = useQuery({ queryKey: ['companion', username], queryFn: () => api.companions.get(username) });
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: () => api.wallet.summary() });
  const [units, setUnits] = useState(1);
  const [mode, setMode] = useState<'now' | 'schedule'>('schedule');
  const [when, setWhen] = useState('');
  const [notes, setNotes] = useState('');
  const [key] = useState(newKey); // stable across retries → no double booking on flaky networks
  const book = useMutation({
    mutationFn: () => {
      const start = mode === 'schedule' ? parseLocal(when) : null;
      if (mode === 'schedule' && !start) throw new Error('Enter the start as YYYY-MM-DD HH:mm');
      return api.orders.create({ serviceId, units, scheduledStart: start?.toISOString(), notes: notes || undefined, idempotencyKey: key });
    },
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      router.dismiss();
      router.push(`/order/${o.id}`);
    },
  });

  if (comp.isPending) return <Loading />;
  const s = comp.data?.services.find((x) => x.id === serviceId);
  if (!s || !comp.data) return <Screen><ErrorNote error="Service not available" /></Screen>;
  const coins = Math.ceil((s.pricePerUnitCentavos * units) / (wallet.data?.coinValueCentavos ?? 100));
  const canNow = comp.data.online && !comp.data.busy;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['bottom']}>
        <T size={20} weight="800">{s.title} with {comp.data.displayName}</T>
        <Card style={{ gap: 10 }}>
          <T weight="600">Sessions ({s.unitMinutes} min each)</T>
          <Row style={{ flexWrap: 'wrap' }}>
            {Array.from({ length: s.maxUnits }, (_, i) => i + 1).map((n) => (
              <Pressable key={n} onPress={() => setUnits(n)} accessibilityRole="radio" accessibilityState={{ selected: units === n }} style={{ minWidth: 48, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: units === n ? c.purple : c.line, backgroundColor: units === n ? c.purple + '22' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <T weight="700">{n}×</T>
              </Pressable>
            ))}
          </Row>
        </Card>
        <Row>
          {(['now', 'schedule'] as const).map((m) => (
            <Pressable key={m} disabled={m === 'now' && !canNow} onPress={() => setMode(m)} accessibilityRole="radio" accessibilityState={{ selected: mode === m, disabled: m === 'now' && !canNow }} style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: mode === m ? c.purple : c.line, opacity: m === 'now' && !canNow ? 0.4 : 1 }}>
              <T weight="700">{m === 'now' ? 'Play now' : 'Schedule'}</T>
              <T muted size={12}>{m === 'now' ? (canNow ? 'Companion is online' : 'Unavailable') : 'Within availability'}</T>
            </Pressable>
          ))}
        </Row>
        {mode === 'schedule' && <Input label="Start (YYYY-MM-DD HH:mm)" placeholder="2026-11-02 20:00" value={when} onChangeText={setWhen} keyboardType="numbers-and-punctuation" />}
        <Input label="Notes for your companion (optional)" value={notes} onChangeText={setNotes} multiline maxLength={500} style={{ minHeight: 70 }} />
        <T muted size={12}>Never share your game account password.</T>
        <Card style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}><T muted>Service</T><T>{formatPhp(s.pricePerUnitCentavos * units)}</T></Row>
          <Row style={{ justifyContent: 'space-between' }}><T weight="700">Pay with wallet</T><Row style={{ gap: 4 }}><Icon name="coin" size={16} color={c.gold} /><T weight="800" style={{ color: c.gold }}>{coins}</T></Row></Row>
          <T size={12} style={{ color: c.faint }}>Balance {wallet.data?.balance ?? '—'} coins. Final amount confirmed by Tavern.</T>
        </Card>
        <ErrorNote error={book.error ? (book.error instanceof Error && !('status' in book.error) ? book.error.message : errorMessage(book.error)) : null} />
        <View style={{ gap: 8 }}>
          {wallet.data && wallet.data.balance < coins ? (
            <Button title="Top up to book" variant="gold" onPress={() => router.push('/wallet')} />
          ) : (
            <Button title="Confirm & pay" onPress={() => book.mutate()} loading={book.isPending} />
          )}
          <T size={12} style={{ color: c.faint, textAlign: 'center' }}>{s.cancellationPolicy}</T>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
