'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Table } from '@/components/admin';
import { Badge, Button, ErrorNote, Field, GameTile, Input, Modal, PageHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import k from '@/styles/layout.module.css';

type GameForm = { id?: string; slug: string; name: string; platforms: string; ranks: string; roles: string; sortOrder: number };

export default function AdminGames() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'games'], queryFn: () => api.admin.games() });
  const [edit, setEdit] = useState<GameForm | null>(null);
  const toggle = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => api.admin.saveGame({ id, active }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'games'] }) });
  return (
    <div className={k.stackSm}>
      <PageHeader title="Game catalog" action={<Button icon="plus" onClick={() => setEdit({ slug: '', name: '', platforms: 'mobile', ranks: '', roles: '', sortOrder: q.data?.length ?? 0 })}>Add game</Button>} />
      <Table loading={q.isPending} rows={q.data} cols={[
        ['', (g) => <GameTile slug={g.slug} name={g.name} />],
        ['Name', (g) => <div><p className={k.strong}>{g.name}</p><p className={k.fine}>{g.slug}</p></div>],
        ['Platforms', (g) => g.platforms.join(', ')],
        ['Ranks', (g) => <span className={k.fine}>{g.ranks.length} ranks</span>],
        ['Status', (g) => <Badge tone={g.active ? 'mint' : 'neutral'}>{g.active ? 'Active' : 'Hidden'}</Badge>],
        ['', (g) => <div className={k.cluster} style={{ gap: 4, flexWrap: 'nowrap' }}>
          <Button size="sm" variant="secondary" onClick={() => setEdit({ id: g.id, slug: g.slug, name: g.name, platforms: g.platforms.join(', '), ranks: g.ranks.join(', '), roles: g.roles.join(', '), sortOrder: g.sortOrder })}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: g.id, active: !g.active })}>{g.active ? 'Hide' : 'Show'}</Button>
        </div>],
      ]} />
      {edit && <Form value={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function Form({ value, onClose }: { value: GameForm; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(value);
  const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const m = useMutation({
    mutationFn: () => api.admin.saveGame({ id: f.id, slug: f.slug, name: f.name, platforms: split(f.platforms), ranks: split(f.ranks), roles: split(f.roles), sortOrder: Number(f.sortOrder) } as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'games'] }); qc.invalidateQueries({ queryKey: ['games'] }); onClose(); },
  });
  const set = (key: keyof GameForm) => (e: { target: { value: string } }) => setF({ ...f, [key]: e.target.value });
  return (
    <Modal open onClose={onClose} title={f.id ? 'Edit game' : 'New game'}>
      <div className={k.form}>
        <Field label="Name"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="Slug" hint="lowercase-with-dashes"><Input value={f.slug} onChange={set('slug')} /></Field>
        <Field label="Platforms" hint="Comma separated"><Input value={f.platforms} onChange={set('platforms')} /></Field>
        <Field label="Ranks (low → high)" hint="Comma separated"><Input value={f.ranks} onChange={set('ranks')} /></Field>
        <Field label="Roles" hint="Comma separated"><Input value={f.roles} onChange={set('roles')} /></Field>
        <Field label="Sort order"><Input type="number" value={f.sortOrder} onChange={set('sortOrder')} /></Field>
        <ErrorNote error={m.error ? errorMessage(m.error) : null} />
        <Button className={k.wide} loading={m.isPending} onClick={() => m.mutate()}>Save</Button>
      </div>
    </Modal>
  );
}
