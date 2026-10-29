'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pager, Table } from '@/components/admin';
import { Badge, Button, ErrorNote, Field, Input, PageHeader, Panel, Tabs } from '@/components/ui';
import { api, errorMessage, formatPhp, newKey } from '@/lib/api';
import k from '@/styles/layout.module.css';

export default function AdminPayments() {
  const [tab, setTab] = useState<'payments' | 'ledger' | 'tools'>('payments');
  const [page, setPage] = useState(1);
  const payments = useQuery({ queryKey: ['admin', 'payments', page], queryFn: () => api.admin.payments({ page }), enabled: tab === 'payments' });
  const ledger = useQuery({ queryKey: ['admin', 'ledger', page], queryFn: () => api.admin.ledger({ page }), enabled: tab === 'ledger' });
  return (
    <div>
      <PageHeader title="Payments & transactions" />
      <Tabs label="Payments" value={tab} onChange={(t) => { setTab(t); setPage(1); }} items={[{ value: 'payments', label: 'Top-up payments' }, { value: 'ledger', label: 'Coin ledger' }, { value: 'tools', label: 'Reconcile & adjust' }]} />
      <div style={{ marginTop: 20 }}>
        {tab === 'payments' && (
          <>
            <Table loading={payments.isPending} rows={payments.data?.items} cols={[
              ['User', (p: any) => p.userId?.username ?? '—'],
              ['Amount', (p: any) => formatPhp(p.amountCentavos)],
              ['Coins', (p: any) => p.coins],
              ['Provider', (p: any) => <span className={k.fine}>{p.provider} · {p.providerRef ?? '—'}</span>],
              ['Status', (p: any) => <Badge tone={p.status === 'paid' ? 'mint' : p.status === 'pending' ? 'amber' : 'red'}>{p.status}</Badge>],
              ['Created', (p: any) => new Date(p.createdAt).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })],
            ]} />
            <Pager page={page} hasMore={payments.data?.hasMore} onPage={setPage} />
          </>
        )}
        {tab === 'ledger' && (
          <>
            <Table loading={ledger.isPending} rows={ledger.data?.items} cols={[
              ['User', (t: any) => t.userId?.username ?? '—'],
              ['Type', (t: any) => <Badge>{t.type}</Badge>],
              ['Amount', (t: any) => <span className={`${k.mono} ${t.amount > 0 ? k.mint : ''}`}>{t.amount > 0 ? '+' : ''}{t.amount}</span>],
              ['Balance after', (t: any) => t.balanceAfter],
              ['Description', (t: any) => <span className={k.muted}>{t.description}</span>],
              ['When', (t: any) => new Date(t.createdAt).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })],
            ]} />
            <Pager page={page} hasMore={ledger.data?.hasMore} onPage={setPage} />
          </>
        )}
        {tab === 'tools' && <Tools />}
      </div>
    </div>
  );
}

function Tools() {
  const recon = useMutation({ mutationFn: () => api.admin.reconcile() });
  const [f, setF] = useState({ userId: '', amount: '', reason: '' });
  const adjust = useMutation({ mutationFn: () => api.admin.adjustWallet(f.userId, Number(f.amount), f.reason, newKey()) });
  return (
    <div className={k.formGrid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', alignItems: 'start' }}>
      <Panel title="Reconciliation" icon="shield-check">
        <p className={`${k.small} ${k.muted}`}>Compares every wallet balance against the sum of its immutable ledger entries.</p>
        <Button style={{ marginTop: 16 }} variant="secondary" loading={recon.isPending} onClick={() => recon.mutate()}>Run reconciliation</Button>
        {recon.data && (
          <p className={k.small} style={{ marginTop: 12, color: recon.data.mismatches.length ? 'var(--tv-red)' : 'var(--tv-mint)' }}>
            {recon.data.wallets} wallets checked · {recon.data.mismatches.length} mismatches
          </p>
        )}
        {recon.data?.mismatches.map((m: any) => <p key={m.userId} className={k.fine} style={{ color: 'var(--tv-red)' }}>{m.userId}: balance {m.balance} vs ledger {m.ledgerSum}</p>)}
      </Panel>
      <Panel title="Manual coin adjustment" icon="coin">
        <div className={k.form}>
        <p className={`${k.small} ${k.muted}`}>Writes a ledger entry and an audit log. Use negative amounts to debit.</p>
        <Field label="User ID"><Input value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} /></Field>
        <Field label="Coins (±)"><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Reason"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <ErrorNote error={adjust.error ? errorMessage(adjust.error) : null} />
        {adjust.isSuccess && <p className={`${k.small} ${k.mint}`}>Adjustment recorded.</p>}
        <Button loading={adjust.isPending} disabled={!f.userId || !Number(f.amount) || f.reason.length < 3} onClick={() => adjust.mutate()}>Apply adjustment</Button>
        </div>
      </Panel>
    </div>
  );
}
