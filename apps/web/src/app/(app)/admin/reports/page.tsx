'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pager, promptNote, Table } from '@/components/admin';
import { Badge, Button, ErrorNote, PageHeader, Tabs } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import k from '@/styles/layout.module.css';

const ACTIONS: Record<string, [string, string][]> = {
  user: [['warn', 'Warn'], ['suspend_user', 'Suspend']],
  message: [['warn', 'Warn sender'], ['suspend_user', 'Suspend sender']],
  review: [['hide_review', 'Hide review']],
  room: [['close_room', 'Close room']],
  order: [],
};

export default function AdminReports() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'open' | 'resolved' | 'dismissed'>('open');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin', 'reports', status, page], queryFn: () => api.admin.reports(status, page) });
  const m = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: string; note: string }) => api.admin.resolveReport(id, action, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'reports'] }),
  });
  const run = (id: string, action: string) => {
    const note = promptNote('Moderation note (logged; warnings are sent to the user):');
    if (note) m.mutate({ id, action, note });
  };
  return (
    <div>
      <PageHeader title="Reports" />
      <Tabs label="Report status" value={status} onChange={(s) => { setStatus(s); setPage(1); }} items={[{ value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }, { value: 'dismissed', label: 'Dismissed' }]} />
      <div className={k.stackSm} style={{ marginTop: 20 }}>
        <ErrorNote error={m.error ? errorMessage(m.error) : null} />
        <Table loading={q.isPending} rows={q.data?.items} empty="No reports." cols={[
          ['Target', (r: any) => <div><Badge>{r.targetType}</Badge><p className={`${k.mono} ${k.fine}`} style={{ marginTop: 4 }}>{String(r.targetId)}</p></div>],
          ['Reason', (r: any) => <div><p className={k.strong}>{r.reason}</p>{r.details && <p className={k.fine} style={{ maxWidth: 360 }}>{r.details}</p>}</div>],
          ['Reporter', (r: any) => r.reporterId?.username ?? '—'],
          ['When', (r: any) => new Date(r.createdAt).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })],
          ['', (r: any) => r.status === 'open' ? (
            <div className={k.cluster} style={{ gap: 4 }}>
              {ACTIONS[r.targetType]?.map(([a, label]) => <Button key={a} size="sm" variant="danger" onClick={() => run(r.id, a)}>{label}</Button>)}
              <Button size="sm" variant="ghost" onClick={() => run(r.id, 'dismiss')}>Dismiss</Button>
            </div>
          ) : <span className={k.fine}>{r.resolution}</span>],
        ]} />
        <Pager page={page} hasMore={q.data?.hasMore} onPage={setPage} />
      </div>
    </div>
  );
}
