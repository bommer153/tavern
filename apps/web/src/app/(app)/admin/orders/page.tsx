'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from '@tavern/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Pager, promptNote, Table } from '@/components/admin';
import { OrderStatusBadge } from '@/components/domain';
import { Button, ErrorNote, PageHeader, Select } from '@/components/ui';
import { api, errorMessage, formatPhp } from '@/lib/api';
import k from '@/styles/layout.module.css';

export default function AdminOrders() {
  const qc = useQueryClient();
  const [status, setStatus] = useState(useSearchParams().get('status') ?? '');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin', 'orders', status, page], queryFn: () => api.admin.orders({ status: status || undefined, page }) });
  const resolve = useMutation({
    mutationFn: ({ id, outcome, note }: { id: string; outcome: 'refund' | 'release'; note: string }) => api.admin.resolveDispute(id, outcome, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
  const run = (id: string, outcome: 'refund' | 'release') => {
    const note = promptNote(outcome === 'refund' ? 'Refund the customer in full. Resolution note:' : 'Release payment to the companion. Resolution note:');
    if (note) resolve.mutate({ id, outcome, note });
  };
  return (
    <div className={k.stackSm}>
      <PageHeader title="Orders & disputes" />
      <Select style={{ maxWidth: 280 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
        <option value="">All statuses</option>
        {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
      </Select>
      <ErrorNote error={resolve.error ? errorMessage(resolve.error) : null} />
      <Table
        loading={q.isPending}
        rows={q.data?.items}
        cols={[
          ['Order', (o) => <Link href={`/orders/${o.id}`} className={k.mono} style={{ color: 'var(--tv-violet-hi)' }}>{o.orderNo}</Link>],
          ['Customer → Companion', (o) => `${o.customer.displayName} → ${o.companion.displayName}`],
          ['Service', (o) => `${o.service.title} · ${o.durationMinutes}m`],
          ['Total', (o) => <div><p>{formatPhp(o.amounts.total)}</p><p className={k.fine}>fee {formatPhp(o.amounts.commission)}</p></div>],
          ['Status', (o) => <OrderStatusBadge status={o.status} />],
          ['Created', (o) => new Date(o.createdAt).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })],
          ['', (o) => o.status === 'disputed' && (
            <div className={k.cluster} style={{ gap: 4, flexWrap: 'nowrap' }}>
              <Button size="sm" variant="danger" loading={resolve.isPending} onClick={() => run(o.id, 'refund')}>Refund</Button>
              <Button size="sm" variant="secondary" loading={resolve.isPending} onClick={() => run(o.id, 'release')}>Release</Button>
            </div>
          )],
        ]}
      />
      <Pager page={page} hasMore={q.data?.hasMore} onPage={setPage} />
    </div>
  );
}
