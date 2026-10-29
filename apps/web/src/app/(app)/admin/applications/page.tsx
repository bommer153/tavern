'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SERVICE_CATEGORY_LABELS } from '@tavern/shared';
import { useState } from 'react';
import { promptNote } from '@/components/admin';
import { Avatar, Badge, Button, Empty, ErrorNote, PageHeader, Panel, Skeleton, Tabs } from '@/components/ui';
import { api, errorMessage, formatPhp } from '@/lib/api';
import k from '@/styles/layout.module.css';

export default function AdminApplications() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'' | 'approved' | 'rejected'>('');
  const q = useQuery({ queryKey: ['admin', 'applications', status], queryFn: () => api.admin.applications(status || undefined) });
  const decide = useMutation({
    mutationFn: ({ id, d, note }: { id: string; d: 'approved' | 'rejected' | 'under_review'; note?: string }) => api.admin.decideApplication(id, d, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
  return (
    <div>
      <PageHeader title="Companion applications" />
      <Tabs label="Application status" value={status} onChange={setStatus} items={[{ value: '', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }]} />
      <div className={k.stackSm} style={{ marginTop: 20 }}>
        <ErrorNote error={decide.error ? errorMessage(decide.error) : q.error ? errorMessage(q.error) : null} />
        {q.isPending ? (
          <Skeleton style={{ height: 160 }} />
        ) : q.data?.items.length ? (
          q.data.items.map((a: any) => (
            <Panel key={a.id}>
              <div className={k.cluster} style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <Avatar name={a.displayName} src={a.userId?.avatarUrl} size={48} />
                <div className={k.rowMain} style={{ minWidth: 240 }}>
                  <div className={k.cluster}>
                    <p className={k.strong}>{a.displayName}</p>
                    <Badge>{a.status.replace('_', ' ')}</Badge>
                  </div>
                  <p className={k.fine}>@{a.userId?.username} · {a.userId?.email} · applied {new Date(a.createdAt).toLocaleDateString('en-PH')}</p>
                  <p className={`${k.small} ${k.strong}`} style={{ marginTop: 8 }}>{a.headline}</p>
                  <p className={`${k.small} ${k.muted} ${k.pre}`} style={{ marginTop: 4 }}>{a.introduction}</p>
                  <div className={k.cluster} style={{ gap: 6, marginTop: 12 }}>
                    {a.games?.map((g: any, i: number) => <Badge key={i} tone="violet">{g.gameId?.name} {g.rank ? `· ${g.rank}` : ''}</Badge>)}
                    {a.categories?.map((c: string) => <Badge key={c}>{SERVICE_CATEGORY_LABELS[c as keyof typeof SERVICE_CATEGORY_LABELS] ?? c}</Badge>)}
                    {a.languages?.map((l: string) => <Badge key={l}>{l}</Badge>)}
                    <Badge tone="gold">{formatPhp(a.proposedPriceCentavos)}/hr</Badge>
                    {a.voiceCapable && <Badge tone="pink">Voice</Badge>}
                  </div>
                  {a.decisionNote && <p className={k.fine} style={{ marginTop: 8 }}>Note: {a.decisionNote}</p>}
                </div>
                {['submitted', 'under_review'].includes(a.status) && (
                  <div className={k.cluster}>
                    {a.status === 'submitted' && <Button size="sm" variant="secondary" onClick={() => decide.mutate({ id: a.id, d: 'under_review' })}>Mark under review</Button>}
                    <Button size="sm" onClick={() => decide.mutate({ id: a.id, d: 'approved' })} icon="check">Approve</Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        const note = promptNote('Reason for rejection (sent to the applicant):');
                        if (note) decide.mutate({ id: a.id, d: 'rejected', note });
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </Panel>
          ))
        ) : (
          !q.error && <Empty icon="list" title="No applications" />
        )}
      </div>
    </div>
  );
}
