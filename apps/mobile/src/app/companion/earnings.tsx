import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Badge, Button, Card, ErrorNote, Input, Row, Screen, T } from '@/components/ui';
import { api, errorMessage, formatPhp, newKey } from '@/lib/api';
import { c } from '@/theme';

export default function Earnings() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ['earnings'], queryFn: () => api.earnings.summary() });
  const payouts = useQuery({ queryKey: ['payouts'], queryFn: () => api.earnings.payouts() });
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'gcash' | 'maya' | 'bank'>('gcash');
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [key, setKey] = useState(newKey);
  const req = useMutation({
    mutationFn: () => api.earnings.requestPayout({ amountCentavos: Math.round(Number(amount) * 100), method, accountName: name, accountNumber: number, idempotencyKey: key }),
    onSuccess: () => {
      setKey(newKey());
      setAmount('');
      qc.invalidateQueries({ queryKey: ['earnings'] });
      qc.invalidateQueries({ queryKey: ['payouts'] });
    },
  });
  return (
    <Screen edges={['bottom']} refreshing={s.isRefetching} onRefresh={() => { s.refetch(); payouts.refetch(); }}>
      <Card style={{ gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}><T muted>Available</T><T weight="800" style={{ color: c.gold }}>{s.data ? formatPhp(s.data.availableCentavos) : '—'}</T></Row>
        <Row style={{ justifyContent: 'space-between' }}><T muted>Pending settlement</T><T>{s.data ? formatPhp(s.data.pendingCentavos) : '—'}</T></Row>
        <Row style={{ justifyContent: 'space-between' }}><T muted>Lifetime</T><T>{s.data ? formatPhp(s.data.lifetimeCentavos) : '—'}</T></Row>
        <T size={12} style={{ color: c.faint }}>Platform fee {s.data?.commissionPercent ?? '—'}%. Earnings settle after the dispute window.</T>
      </Card>
      <Card style={{ gap: 10 }}>
        <T weight="700">Request payout</T>
        <Input label="Amount (₱)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <Row>
          {(['gcash', 'maya', 'bank'] as const).map((m) => (
            <Pressable key={m} onPress={() => setMethod(m)} accessibilityRole="radio" accessibilityState={{ selected: method === m }} style={{ flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: method === m ? c.purple : c.line, alignItems: 'center' }}>
              <T weight="600">{m.toUpperCase()}</T>
            </Pressable>
          ))}
        </Row>
        <Input label="Account name" value={name} onChangeText={setName} />
        <Input label="Account / mobile number" value={number} onChangeText={setNumber} keyboardType="number-pad" />
        <ErrorNote error={req.error ? errorMessage(req.error) : null} />
        <Button title="Submit request" onPress={() => req.mutate()} loading={req.isPending} disabled={!Number(amount) || !name || !number} />
      </Card>
      <T weight="700" size={18}>Payout requests</T>
      {payouts.data?.map((p: any) => (
        <Row key={p.id} style={{ justifyContent: 'space-between' }}>
          <View><T>{formatPhp(p.amountCentavos)} · {p.method.toUpperCase()}</T><T muted size={12}>{new Date(p.createdAt).toLocaleDateString('en-PH')}</T></View>
          <Badge label={p.status.replace('_', ' ')} tone={p.status === 'paid' ? 'success' : ['rejected', 'failed'].includes(p.status) ? 'danger' : 'warning'} />
        </Row>
      ))}
    </Screen>
  );
}
