'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pager, promptNote, Table } from '@/components/admin';
import { Badge, Button, ErrorNote, PageHeader, Select } from '@/components/ui';
import { api, errorMessage, formatPhp } from '@/lib/api';
import k from '@/styles/layout.module.css';

const NEXT: Record<string, string[]> = {
  requested: ['under_review', 'approved', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['processing', 'rejected'],
  processing: ['paid', 'failed'],
};

export default function AdminPayouts() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('requested');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin', 'payouts', status, page], queryFn: () => api.admin.payouts(status || undefined, page) });
  const m = useMutation({
    mutationFn: ({ id, s, note }: { id: string; s: string; note?: string }) => api.admin.decidePayout(id, s, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payouts'] }),
  });
  return (
    <div className={k.stackSm}>
      <PageHeader title="Payout requests" subtitle="Payouts are sent manually through GCash, Maya or bank, then marked paid here." />
      <Select style={{ maxWidth: 280 }} aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        <option value="">All</option>
        {['requested', 'under_review', 'approved', 'processing', 'paid', 'rejected', 'failed'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
      </Select>
      <ErrorNote error={m.error ? errorMessage(m.error) : null} />
      <Table
        loading={q.isPending}
        rows={q.data?.items}
        cols={[
          ['Companion', (p: any) => <div><p className={k.strong}>{p.companionId?.displayName}</p><p className={k.fine}>{p.companionId?.email}</p></div>],
          ['Amount', (p: any) => formatPhp(p.amountCentavos)],
          ['Destination', (p: any) => `${p.method.toUpperCase()} · ${p.accountName} · ${p.accountNumberMasked}`],
          ['Status', (p: any) => <Badge>{p.status.replace('_', ' ')}</Badge>],
          ['Requested', (p: any) => new Date(p.createdAt).toLocaleDateString('en-PH')],
          ['', (p: any) => (
            <div className={k.cluster} style={{ gap: 4 }}>
              {NEXT[p.status]?.map((s) => (
                <Button key={s} size="sm" variant={['rejected', 'failed'].includes(s) ? 'danger' : 'secondary'} onClick={() => {
                  const note = ['rejected', 'failed'].includes(s) ? promptNote('Reason (shown to the companion):') : undefined;
                  if (note === null) return;
                  m.mutate({ id: p.id, s, note });
                }}>{s.replace('_', ' ')}</Button>
              ))}
            </div>
          )],
        ]}
      />
      <Pager page={page} hasMore={q.data?.hasMore} onPage={setPage} />
    </div>
  );
}
