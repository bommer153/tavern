'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge, Button, cn, ErrorNote, Field, Input, Modal, PageHeader, SectionHeader, Select, Skeleton } from '@/components/ui';
import { api, errorMessage, formatPhp, newKey } from '@/lib/api';
import k from '@/styles/layout.module.css';

const LABEL: Record<string, string> = { order_earning: 'Session earning', gift_earning: 'Gift earning', payout: 'Payout', payout_reversal: 'Payout returned', reversal: 'Refund reversal', adjustment: 'Adjustment' };

export default function EarningsPage() {
  const summary = useQuery({ queryKey: ['earnings'], queryFn: () => api.earnings.summary() });
  const entries = useQuery({ queryKey: ['earnings', 'entries'], queryFn: () => api.earnings.entries() });
  const payouts = useQuery({ queryKey: ['payouts'], queryFn: () => api.earnings.payouts() });
  const [open, setOpen] = useState(false);
  const sum = summary.data;
  return (
    <div className={k.stack}>
      <PageHeader
        title="Earnings & payouts"
        subtitle="Cash earnings from sessions and eligible gifts. Separate from your coin wallet."
        action={<Button variant="gold" disabled={!sum?.availableCentavos} onClick={() => setOpen(true)} icon="wallet">Request payout</Button>}
      />
      <ErrorNote error={summary.error ? errorMessage(summary.error) : null} onRetry={() => summary.refetch()} retrying={summary.isFetching} />
      <dl className={cn('tv-cut', k.stats)}>
        {([['Available', sum?.availableCentavos, true], ['Pending settlement', sum?.pendingCentavos], ['Lifetime earned', sum?.lifetimeCentavos]] as const).map(([label, v, gold]) => (
          <div key={label} className={k.stat}>
            <dt className="tv-label">{label}</dt>
            <dd>{v === undefined ? <Skeleton style={{ height: 28, width: 110 }} /> : <span className={cn(k.statValue, gold && k.gold)}>{formatPhp(v)}</span>}</dd>
          </div>
        ))}
      </dl>
      <p className={k.fine}>
        Tavern keeps a {sum?.commissionPercent ?? '—'}% platform fee on session prices. Earnings become available after the settlement hold, unless the order is disputed. Payouts are reviewed by our team and sent manually to your GCash, Maya or bank account.
      </p>

      <section>
        <SectionHeader title="Payout requests" />
        {payouts.data?.length ? (
          <ul className={k.rows}>
            {payouts.data.map((p: any) => (
              <li key={p.id} className={k.row}>
                <div className={k.rowMain}>
                  <p className={cn(k.small, k.strong)}>{formatPhp(p.amountCentavos)} · {p.method.toUpperCase()} {p.account}</p>
                  <p className={k.fine}>{new Date(p.createdAt).toLocaleDateString('en-PH')}{p.note ? ` · ${p.note}` : ''}</p>
                </div>
                <Badge tone={p.status === 'paid' ? 'mint' : ['rejected', 'failed'].includes(p.status) ? 'red' : 'amber'}>{p.status.replace('_', ' ')}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className={cn(k.small, k.muted)}>No payout requests yet.</p>
        )}
      </section>

      <section>
        <SectionHeader title="Earnings history" />
        {entries.isPending ? (
          <Skeleton style={{ height: 128 }} />
        ) : (
          <ul className={k.rows}>
            {entries.data?.items.map((e) => (
              <li key={e.id} className={k.row}>
                <div className={k.rowMain}>
                  <p className={cn(k.small, k.strong)}>{LABEL[e.type] ?? e.type}</p>
                  <p className={k.fine}>
                    {new Date(e.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                    {e.status === 'pending' && e.availableAt ? ` · available ${new Date(e.availableAt).toLocaleDateString('en-PH')}` : ''}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p className={cn(k.mono, e.amountCentavos > 0 && k.mint)}>{e.amountCentavos > 0 ? '+' : ''}{formatPhp(e.amountCentavos)}</p>
                  <p className={k.fine}>{e.status}</p>
                </div>
              </li>
            ))}
            {!entries.data?.items.length && <li className={cn(k.row, k.small, k.muted)}>Complete a session to start earning.</li>}
          </ul>
        )}
      </section>
      {open && sum && <PayoutModal available={sum.availableCentavos} onClose={() => setOpen(false)} />}
    </div>
  );
}

function PayoutModal({ available, onClose }: { available: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ amount: String(available / 100), method: 'gcash', accountName: '', accountNumber: '' });
  const [key] = useState(newKey);
  const m = useMutation({
    mutationFn: () => api.earnings.requestPayout({ amountCentavos: Math.round(Number(f.amount) * 100), method: f.method, accountName: f.accountName, accountNumber: f.accountNumber, idempotencyKey: key }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['earnings'] });
      qc.invalidateQueries({ queryKey: ['payouts'] });
      onClose();
    },
  });
  const set = (field: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [field]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Request payout">
      <form
        className={k.form}
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Amount (₱)" hint={`Available: ${formatPhp(available)}`}>
          <Input type="number" step="0.01" min={100} max={available / 100} required value={f.amount} onChange={set('amount')} />
        </Field>
        <Field label="Method">
          <Select value={f.method} onChange={set('method')}>
            <option value="gcash">GCash</option>
            <option value="maya">Maya</option>
            <option value="bank">Bank transfer</option>
          </Select>
        </Field>
        <Field label="Account name"><Input required maxLength={80} value={f.accountName} onChange={set('accountName')} /></Field>
        <Field label="Account / mobile number"><Input required maxLength={40} value={f.accountNumber} onChange={set('accountNumber')} /></Field>
        <ErrorNote error={m.error ? errorMessage(m.error) : null} />
        <Button type="submit" className={k.wide} loading={m.isPending}>Submit request</Button>
      </form>
    </Modal>
  );
}
