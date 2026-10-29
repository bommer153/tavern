'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Table } from '@/components/admin';
import { Badge, Button, ErrorNote, PageHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import k from '@/styles/layout.module.css';

export default function AdminRooms() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'rooms'], queryFn: () => api.admin.rooms(), refetchInterval: 15_000 });
  const close = useMutation({ mutationFn: (id: string) => api.rooms.close(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'rooms'] }) });
  return (
    <div className={k.stackSm}>
      <PageHeader title="Live voice rooms" subtitle="Moderators can close any room that breaks the guidelines." />
      <ErrorNote error={close.error ? errorMessage(close.error) : null} />
      <Table loading={q.isPending} rows={q.data} empty="No live rooms." cols={[
        ['Room', (r) => <Link href={`/rooms/${r.id}`} className={k.strong} style={{ color: 'var(--tv-violet-hi)' }}>{r.title}</Link>],
        ['Host', (r) => `${r.host.displayName} (@${r.host.username})`],
        ['Category', (r) => <Badge>{r.category}</Badge>],
        ['Privacy', (r) => r.privacy],
        ['People', (r) => `${r.participantCount}/${r.capacity} · ${r.speakerCount} speaking`],
        ['', (r) => <Button size="sm" variant="danger" loading={close.isPending && close.variables === r.id} onClick={() => confirm(`Close "${r.title}" for everyone?`) && close.mutate(r.id)}>Close room</Button>],
      ]} />
    </div>
  );
}
