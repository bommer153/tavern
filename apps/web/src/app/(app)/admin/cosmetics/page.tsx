'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { COSMETIC_KINDS, COSMETIC_UNLOCKS, type Cosmetic, GIFT_RARITIES } from '@tavern/shared';
import { useState } from 'react';
import { Table } from '@/components/admin';
import { Badge, Button, ErrorNote, Field, Input, Modal, PageHeader, Select, Switch } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import k from '@/styles/layout.module.css';

export default function AdminCosmetics() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['admin', 'cosmetics'], queryFn: () => api.admin.cosmetics() });
  const [edit, setEdit] = useState<Partial<Cosmetic> | null>(null);
  const [grant, setGrant] = useState<Cosmetic | null>(null);
  const toggle = useMutation({ mutationFn: (c: Cosmetic) => api.admin.saveCosmetic({ id: c.id, available: !c.available }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'cosmetics'] }) });
  return (
    <section>
      <PageHeader
        title="Cosmetics"
        subtitle="Seat frames and room backgrounds. Keys map to artwork in the web client; owners keep items when they're hidden or repriced."
        action={<Button icon="plus" onClick={() => setEdit({ kind: 'frame', unlock: 'purchase', rarity: 'common', priceCoins: 100, renderer: 'css' })}>Add item</Button>}
      />
      <Table loading={list.isPending} rows={list.data} cols={[
        ['Name', (c) => <><b>{c.name}</b><br /><span className={k.mono}>{c.key}</span></>],
        ['Kind', (c) => c.kind],
        ['Unlock', (c) => (c.unlock === 'purchase' ? <span className={k.mono}>{c.priceCoins} coins</span> : c.unlock)],
        ['Rarity', (c) => <Badge tone={c.rarity === 'legendary' ? 'gold' : c.rarity === 'epic' ? 'violet' : c.rarity === 'rare' ? 'cyan' : 'neutral'}>{c.rarity}</Badge>],
        ['Status', (c) => <Badge tone={c.available ? 'mint' : 'neutral'}>{c.available ? 'Listed' : 'Hidden'}</Badge>],
        ['', (c) => (
          <div className={k.cluster} style={{ gap: 4, flexWrap: 'nowrap' }}>
            <Button size="sm" variant="secondary" onClick={() => setEdit(c)}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => setGrant(c)}>Grant</Button>
            <Button size="sm" variant="ghost" onClick={() => toggle.mutate(c)}>{c.available ? 'Hide' : 'List'}</Button>
          </div>
        )],
      ]} />
      {edit && <CosmeticForm value={edit} onClose={() => setEdit(null)} />}
      {grant && <GrantForm item={grant} onClose={() => setGrant(null)} />}
    </section>
  );
}

function CosmeticForm({ value, onClose }: { value: Partial<Cosmetic>; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(value);
  const m = useMutation({
    mutationFn: () => api.admin.saveCosmetic({ ...f, priceCoins: Number(f.priceCoins ?? 0), sortOrder: f.sortOrder === undefined ? undefined : Number(f.sortOrder) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'cosmetics'] });
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={f.id ? `Edit ${f.name}` : 'New cosmetic'}>
      <div className={k.form}>
        {!f.id && (
          <>
            <Field label="Key" hint="Lowercase, matches the artwork in the client (e.g. ember-crown). Can't change later."><Input value={f.key ?? ''} onChange={(e) => setF({ ...f, key: e.target.value })} /></Field>
            <Field label="Kind"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Cosmetic['kind'] })}>{COSMETIC_KINDS.map((x) => <option key={x}>{x}</option>)}</Select></Field>
          </>
        )}
        <Field label="Name"><Input value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Description"><Input value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Category"><Input value={f.category ?? ''} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
        <Field label="Rarity"><Select value={f.rarity} onChange={(e) => setF({ ...f, rarity: e.target.value as Cosmetic['rarity'] })}>{GIFT_RARITIES.map((r) => <option key={r}>{r}</option>)}</Select></Field>
        <Field label="Unlock"><Select value={f.unlock} onChange={(e) => setF({ ...f, unlock: e.target.value as Cosmetic['unlock'] })}>{COSMETIC_UNLOCKS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
        {f.unlock === 'purchase' && <Field label="Price (coins)" hint="Changes apply to future purchases only."><Input type="number" min={1} value={f.priceCoins} onChange={(e) => setF({ ...f, priceCoins: Number(e.target.value) })} /></Field>}
        <Field label="Renderer"><Select value={f.renderer} onChange={(e) => setF({ ...f, renderer: e.target.value as Cosmetic['renderer'] })}><option value="css">css</option><option value="webgl">webgl</option></Select></Field>
        <Field label="Sort order"><Input type="number" value={f.sortOrder ?? 0} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} /></Field>
        <Switch label="Listed in the collection" checked={f.available ?? true} onChange={(e) => setF({ ...f, available: e.target.checked })} />
        <ErrorNote error={m.error ? errorMessage(m.error) : null} />
        <Button className={k.wide} loading={m.isPending} onClick={() => m.mutate()}>Save</Button>
      </div>
    </Modal>
  );
}

function GrantForm({ item, onClose }: { item: Cosmetic; onClose: () => void }) {
  const [userId, setUserId] = useState('');
  const m = useMutation({ mutationFn: () => api.admin.grantCosmetic(item.id, userId.trim()) });
  return (
    <Modal open onClose={onClose} title={`Grant ${item.name}`}>
      <div className={k.form}>
        <Field label="User ID" hint="Find it under Users. Granting an item someone owns does nothing."><Input value={userId} onChange={(e) => setUserId(e.target.value)} /></Field>
        <ErrorNote error={m.error ? errorMessage(m.error) : null} />
        {m.isSuccess && <p>Granted.</p>}
        <Button className={k.wide} loading={m.isPending} disabled={userId.trim().length !== 24} onClick={() => m.mutate()}>Grant item</Button>
      </div>
    </Modal>
  );
}
