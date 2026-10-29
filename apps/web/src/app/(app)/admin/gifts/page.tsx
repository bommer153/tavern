'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GIFT_RARITIES, type CoinPackage, type Gift } from '@tavern/shared';
import { useState } from 'react';
import { Table } from '@/components/admin';
import { Badge, Button, ErrorNote, Field, GiftGlyph, Input, Modal, PageHeader, Select } from '@/components/ui';
import { api, errorMessage, formatPhp } from '@/lib/api';
import k from '@/styles/layout.module.css';

export default function AdminGifts() {
  const qc = useQueryClient();
  const gifts = useQuery({ queryKey: ['admin', 'gifts'], queryFn: () => api.admin.gifts() });
  const packages = useQuery({ queryKey: ['admin', 'packages'], queryFn: () => api.admin.packages() });
  const [gift, setGift] = useState<Partial<Gift> | null>(null);
  const [pkg, setPkg] = useState<Partial<CoinPackage> | null>(null);
  const toggle = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
  return (
    <div className={k.stack}>
      <section>
        <PageHeader title="Gift catalog" action={<Button icon="plus" onClick={() => setGift({ name: '', coinCost: 10, imageUrl: '🎁', rarity: 'common', sortOrder: (gifts.data?.length ?? 0) })}>Add gift</Button>} />
        <Table loading={gifts.isPending} rows={gifts.data} cols={[
          ['', (g) => <GiftGlyph image={g.imageUrl} size={32} />],
          ['Name', (g) => g.name],
          ['Cost', (g) => <span className={k.mono}>{g.coinCost} coins</span>],
          ['Rarity', (g) => <Badge tone={g.rarity === 'legendary' ? 'gold' : g.rarity === 'epic' ? 'violet' : g.rarity === 'rare' ? 'cyan' : 'neutral'}>{g.rarity}</Badge>],
          ['Order', (g) => g.sortOrder],
          ['Status', (g) => <Badge tone={g.active ? 'mint' : 'neutral'}>{g.active ? 'Active' : 'Hidden'}</Badge>],
          ['', (g) => <div className={k.cluster} style={{ gap: 4, flexWrap: 'nowrap' }}><Button size="sm" variant="secondary" onClick={() => setGift(g)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => toggle.mutate(() => api.admin.saveGift({ id: g.id, active: !g.active }))}>{g.active ? 'Deactivate' : 'Activate'}</Button></div>],
        ]} />
      </section>
      <section>
        <PageHeader title="Coin packages" action={<Button icon="plus" onClick={() => setPkg({ coins: 100, bonusCoins: 0, priceCentavos: 10000 })}>Add package</Button>} />
        <Table loading={packages.isPending} rows={packages.data} cols={[
          ['Coins', (p) => <span className={k.mono}>{p.coins}{p.bonusCoins ? ` + ${p.bonusCoins}` : ''}</span>],
          ['Price', (p) => formatPhp(p.priceCentavos)],
          ['Status', (p) => <Badge tone={p.active ? 'mint' : 'neutral'}>{p.active ? 'Active' : 'Hidden'}</Badge>],
          ['', (p) => <div className={k.cluster} style={{ gap: 4, flexWrap: 'nowrap' }}><Button size="sm" variant="secondary" onClick={() => setPkg(p)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => toggle.mutate(() => api.admin.savePackage({ id: p.id, active: !p.active }))}>{p.active ? 'Deactivate' : 'Activate'}</Button></div>],
        ]} />
      </section>
      {gift && <GiftForm value={gift} onClose={() => setGift(null)} />}
      {pkg && <PackageForm value={pkg} onClose={() => setPkg(null)} />}
    </div>
  );
}

function GiftForm({ value, onClose }: { value: Partial<Gift>; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(value);
  const m = useMutation({ mutationFn: () => api.admin.saveGift({ id: f.id, name: f.name, coinCost: Number(f.coinCost), imageUrl: f.imageUrl, animation: f.animation?.trim() ?? '', rarity: f.rarity, sortOrder: Number(f.sortOrder ?? 0) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'gifts'] }); onClose(); } });
  return (
    <Modal open onClose={onClose} title={f.id ? 'Edit gift' : 'New gift'}>
      <div className={k.form}>
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Coin cost" hint="Changes apply to future sends only."><Input type="number" min={1} value={f.coinCost} onChange={(e) => setF({ ...f, coinCost: Number(e.target.value) })} /></Field>
        <Field label="Image URL or emoji"><Input value={f.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} /></Field>
        <Field label="Effect file URL" hint="Optional full-screen effect: animated WebP (recommended), WebM/MP4, or GIF. Empty uses the built-in effect.">
          <Input value={f.animation ?? ''} placeholder="/effects/dragon.webp" onChange={(e) => setF({ ...f, animation: e.target.value })} />
        </Field>
        <Field label="Rarity"><Select value={f.rarity} onChange={(e) => setF({ ...f, rarity: e.target.value as Gift['rarity'] })}>{GIFT_RARITIES.map((r) => <option key={r}>{r}</option>)}</Select></Field>
        <Field label="Sort order"><Input type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} /></Field>
        <ErrorNote error={m.error ? errorMessage(m.error) : null} />
        <Button className={k.wide} loading={m.isPending} onClick={() => m.mutate()}>Save</Button>
      </div>
    </Modal>
  );
}

function PackageForm({ value, onClose }: { value: Partial<CoinPackage>; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ ...value, price: String((value.priceCentavos ?? 0) / 100) });
  const m = useMutation({ mutationFn: () => api.admin.savePackage({ id: f.id, coins: Number(f.coins), bonusCoins: Number(f.bonusCoins ?? 0), priceCentavos: Math.round(Number(f.price) * 100) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'packages'] }); onClose(); } });
  return (
    <Modal open onClose={onClose} title={f.id ? 'Edit package' : 'New package'}>
      <div className={k.form}>
        <Field label="Coins"><Input type="number" min={1} value={f.coins} onChange={(e) => setF({ ...f, coins: Number(e.target.value) })} /></Field>
        <Field label="Bonus coins"><Input type="number" min={0} value={f.bonusCoins} onChange={(e) => setF({ ...f, bonusCoins: Number(e.target.value) })} /></Field>
        <Field label="Price (₱)"><Input type="number" min={1} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
        <ErrorNote error={m.error ? errorMessage(m.error) : null} />
        <Button className={k.wide} loading={m.isPending} onClick={() => m.mutate()}>Save</Button>
      </div>
    </Modal>
  );
}
