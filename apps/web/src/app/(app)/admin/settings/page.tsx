'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Table } from '@/components/admin';
import { Button, ErrorNote, Field, Input, PageHeader, Panel, SectionHeader, Skeleton } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import k from '@/styles/layout.module.css';

const FIELDS: [string, string, string][] = [
  ['commissionPercent', 'Platform commission (%)', 'Share of each service price kept by Tavern.'],
  ['serviceFeePercent', 'Customer service fee (%)', 'Added on top of the service price at checkout.'],
  ['coinValueCentavos', 'Coin value (centavos)', '100 = 1 coin is worth ₱1.00 when booking.'],
  ['giftSharePercent', 'Companion gift share (%)', 'Share of a gift’s coin value credited to companion earnings.'],
  ['settlementHoldHours', 'Settlement hold (hours)', 'Delay before earnings become available.'],
  ['disputeWindowHours', 'Dispute window (hours)', 'How long after completion a customer can dispute.'],
  ['autoCompleteGraceMinutes', 'Auto-complete grace (minutes)', 'After the timer ends, sessions auto-complete after this.'],
  ['minPayoutCentavos', 'Minimum payout (centavos)', '10000 = ₱100.00'],
  ['minimumAge', 'Minimum age', 'Paid marketplace eligibility.'],
];

export default function AdminSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api.admin.settings() });
  const audit = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => api.admin.auditLogs() });
  // Edits are a draft over the server values (derived, not synced in an effect).
  const [draft, setF] = useState<Record<string, string> | null>(null);
  const f = draft ?? Object.fromEntries(Object.entries(q.data ?? {}).map(([key, v]) => [key, String(v)]));
  const save = useMutation({
    mutationFn: () => api.admin.saveSettings(Object.fromEntries(Object.entries(f).map(([key, v]) => [key, Number(v)]))),
    onSuccess: (d) => { qc.setQueryData(['admin', 'settings'], d); qc.invalidateQueries({ queryKey: ['admin', 'audit'] }); },
  });
  return (
    <div className={k.stack}>
      <div className={k.narrow} style={{ marginInline: 0 }}>
        <PageHeader title="Platform settings" subtitle="Changes apply to new orders and gifts. Existing orders keep their recorded amounts." />
        {q.isPending ? <Skeleton style={{ height: 256 }} /> : (
          <Panel>
            <div className={k.formGrid}>
            {FIELDS.map(([key, label, hint]) => (
              <Field key={key} label={label} hint={hint}><Input type="number" min={0} value={f[key] ?? ''} onChange={(e) => setF({ ...f, [key]: e.target.value })} /></Field>
            ))}
            </div>
          </Panel>
        )}
        <div className={k.stackSm} style={{ marginTop: 16 }}>
          <ErrorNote error={save.error ? errorMessage(save.error) : null} />
          <Button loading={save.isPending} onClick={() => save.mutate()}>{save.isSuccess ? 'Saved' : 'Save settings'}</Button>
        </div>
      </div>
      <section>
        <SectionHeader title="Audit log" />
        <Table loading={audit.isPending} rows={audit.data?.items} cols={[
          ['When', (a: any) => new Date(a.createdAt).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })],
          ['Actor', (a: any) => a.actorId?.username ?? 'system'],
          ['Action', (a: any) => <code className={k.fine}>{a.action}</code>],
          ['Target', (a: any) => <span className={k.fine}>{a.targetType} {a.targetId}</span>],
        ]} />
      </section>
    </div>
  );
}
