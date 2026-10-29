'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Appearance, type Cosmetic, type CosmeticCollection, type CosmeticKind, DEFAULT_BACKGROUND, type WalletSummary } from '@tavern/shared';
import { useState } from 'react';
import { RoomBackdrop } from '@/components/cosmetics/backdrops';
import { SeatFrame, type SeatState } from '@/components/cosmetics/frames';
import { DEFAULT_APPEARANCE, useCosmetics } from '@/components/cosmetics/use-cosmetics';
import { Icon } from '@/components/icon';
import { Badge, Button, Chip, Chips, cn, ErrorNote, Modal, SearchField, Skeleton, Switch, type Tone } from '@/components/ui';
import { api, errorMessage, newKey } from '@/lib/api';
import { RequireRole, useSession } from '@/lib/session';
import s from './customize.module.css';

const RARITY_TONE: Record<string, Tone> = { common: 'neutral', rare: 'cyan', epic: 'violet', legendary: 'gold' };
const SAMPLES: { name: string; state: SeatState; frame: string | null }[] = [
  { name: 'Sample Kai', state: 'speaking', frame: 'circuit' },
  { name: 'Sample Mira', state: 'idle', frame: null },
  { name: 'Sample Jun', state: 'muted', frame: 'obsidian' },
  { name: 'Sample Lea', state: 'offline', frame: 'pilot-light' },
];

export default function CustomizePage() {
  return (
    <RequireRole>
      <Collection />
    </RequireRole>
  );
}

function Collection() {
  const { me } = useSession();
  const qc = useQueryClient();
  const look = useCosmetics();
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: () => api.wallet.summary() });
  const history = useQuery({ queryKey: ['cosmetics', 'history'], queryFn: () => api.cosmetics.history() });
  const [tab, setTab] = useState<CosmeticKind>('frame');
  const [draft, setDraft] = useState<Appearance | null>(null);
  const [selected, setSelected] = useState<Cosmetic | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [q, setQ] = useState('');
  const [speakingPreview, setSpeakingPreview] = useState(true);
  const [buying, setBuying] = useState<Cosmetic | null>(null);

  const saved = look.appearance;
  const view = draft ?? saved;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  const items = look.data?.items ?? [];
  const byKey = new Map(items.map((c) => [c.key, c]));
  const unowned = [view.frame, view.background].filter((k): k is string => !!k && k !== DEFAULT_BACKGROUND && !look.owned.has(k)).map((k) => byKey.get(k)?.name ?? k);
  const list = items.filter((c) => c.kind === tab && (!category || c.category === category) && (!ownedOnly || look.owned.has(c.key)) && (!q || `${c.name} ${c.category} ${c.description}`.toLowerCase().includes(q.toLowerCase())));
  const categories = [...new Set(items.filter((c) => c.kind === tab).map((c) => c.category))];
  const edit = (patch: Partial<Appearance>) => setDraft({ ...view, ...patch });

  const apply = useMutation({
    mutationFn: () => api.cosmetics.setAppearance(view),
    onSuccess: (appearance) => {
      qc.setQueryData<CosmeticCollection>(['cosmetics', 'me'], (c) => (c ? { ...c, appearance } : c));
      setDraft(null);
    },
  });

  function pick(c: Cosmetic) {
    setSelected(c);
    edit(c.kind === 'frame' ? { frame: c.key } : { background: c.key });
  }

  if (look.isPending) return <Skeleton style={{ height: 480 }} />;
  if (look.error) return <ErrorNote error={errorMessage(look.error)} onRetry={() => look.refetch()} />;

  const sel = selected && byKey.get(selected.key);
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow}>Collection</p>
        <h1 className={s.title}>Make your seat yours</h1>
        <p className={s.sub}>Frames show around your mic seat in every room. Backgrounds change what you see — and what your room sees when you host.</p>
      </header>

      <section className={s.preview} aria-label="Live preview">
        <RoomBackdrop theme={view.background} animated={view.animated} intensity={view.intensity} parallax={view.parallax} level={speakingPreview ? 0.6 : 0} />
        <div className={s.stageCenter}>
          <SeatFrame frame={view.frame} name={me?.displayName ?? 'You'} src={me?.avatarUrl} size={150} state={speakingPreview ? 'speaking' : 'idle'} level={0.6} />
          <p className={s.you}>{me?.displayName ?? 'You'}</p>
        </div>
        <ul className={s.samples} aria-label="Sample seats (preview only)">
          {SAMPLES.map((p) => (
            <li key={p.name}>
              <SeatFrame frame={p.frame} name={p.name} size={58} state={p.state} level={0.5} />
              <span>{p.state === 'idle' ? 'Sample' : p.state}</span>
            </li>
          ))}
        </ul>
        <div className={s.previewBar} role="group" aria-label="Preview state">
          <button type="button" aria-pressed={!speakingPreview} onClick={() => setSpeakingPreview(false)}>Idle</button>
          <button type="button" aria-pressed={speakingPreview} onClick={() => setSpeakingPreview(true)}>Speaking</button>
        </div>
        {dirty && <span className={s.unsaved}>Preview · not applied</span>}
      </section>

      <div className={s.tabs} role="tablist" aria-label="Cosmetic type">
        {(['frame', 'background'] as const).map((k) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => { setTab(k); setCategory(null); setSelected(null); }}>
            <Icon name={k === 'frame' ? 'user' : 'image'} size={18} /> {k === 'frame' ? 'Seat frames' : 'Backgrounds'}
          </button>
        ))}
      </div>

      <div className={s.filters}>
        <SearchField value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'frame' ? 'Search frames' : 'Search backgrounds'} aria-label="Search the collection" />
        <Chips label="Filter">
          <Chip pressed={ownedOnly} onClick={() => setOwnedOnly(!ownedOnly)}>Owned</Chip>
          {categories.map((c) => (
            <Chip key={c} pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>{c}</Chip>
          ))}
        </Chips>
      </div>

      {tab === 'frame' ? (
        <ul className={s.shelf} aria-label="Seat frames">
          <li>
            <button type="button" className={s.medal} aria-pressed={!view.frame} onClick={() => { setSelected(null); edit({ frame: null }); }}>
              <SeatFrame name={me?.displayName ?? 'You'} src={me?.avatarUrl} size={84} />
              <span className={s.name}>No frame</span>
              <Status text={!saved.frame ? 'Equipped' : 'Owned'} />
            </button>
          </li>
          {list.map((c) => (
            <li key={c.key}>
              <button type="button" className={cn(s.medal, s[`r-${c.rarity}`])} aria-pressed={view.frame === c.key} onClick={() => pick(c)}>
                <SeatFrame frame={c.key} name={me?.displayName ?? 'You'} src={me?.avatarUrl} size={84} state={view.frame === c.key && speakingPreview ? 'speaking' : 'idle'} level={0.5} />
                <span className={s.name}>{c.name}</span>
                <Status text={statusOf(c, saved.frame === c.key, look.owned.has(c.key))} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={s.portals} aria-label="Backgrounds">
          {list.map((c) => (
            <li key={c.key}>
              <button type="button" className={cn(s.portal, s[`r-${c.rarity}`])} aria-pressed={view.background === c.key} onClick={() => pick(c)}>
                <span className={s.window}>
                  <RoomBackdrop theme={c.key} animated={false} />
                  {!look.owned.has(c.key) && <Icon name="lock" size={18} className={s.lock} label="Locked" />}
                </span>
                <span className={s.name}>{c.name}</span>
                <Status text={statusOf(c, saved.background === c.key, look.owned.has(c.key))} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!list.length && <p className={s.none}>Nothing matches these filters.</p>}

      {sel && (
        <section className={cn('tv-plate', s.detail)} aria-label={`${sel.name} details`}>
          <div className={s.detailHead}>
            <h2>{sel.name}</h2>
            <Badge tone={RARITY_TONE[sel.rarity]}>{sel.rarity}</Badge>
            <Badge>{sel.category}</Badge>
          </div>
          <p className={s.desc}>{sel.description}</p>
          {look.owned.has(sel.key) ? (
            <p className={s.ok}><Icon name="check" size={16} /> In your collection</p>
          ) : sel.unlock === 'purchase' ? (
            <div className={s.buyRow}>
              <span className={s.price}><Icon name="coin" size={16} /> {sel.priceCoins.toLocaleString()} coins</span>
              <Button variant="gold" onClick={() => setBuying(sel)} icon="coin">Buy {sel.kind === 'frame' ? 'frame' : 'background'}</Button>
            </div>
          ) : (
            <p className={s.lockNote}><Icon name="lock" size={16} /> {sel.unlock === 'event' ? 'Unlocked by taking part in Tavern events. Not for sale.' : 'Awarded by the Tavern team. Not for sale.'}</p>
          )}
        </section>
      )}

      {tab === 'background' && (
        <section className={cn('tv-plate', s.controls)} aria-label="Background settings">
          <Switch label="Use the room’s theme when the host sets one" checked={view.followRoomTheme} onChange={(e) => edit({ followRoomTheme: e.target.checked })} />
          <Switch label="Animated background" checked={view.animated} onChange={(e) => edit({ animated: e.target.checked })} />
          <Switch label="Parallax" checked={view.parallax} disabled={!view.animated} onChange={(e) => edit({ parallax: e.target.checked })} />
          <label className={s.range}>
            <span>Brightness · {view.intensity}%</span>
            <input type="range" min={20} max={100} step={5} value={view.intensity} onChange={(e) => edit({ intensity: Number(e.target.value) })} />
          </label>
          <p className={s.hint}>Animation turns off automatically when your device asks for reduced motion or saves data.</p>
        </section>
      )}

      <div className={s.bar}>
        <span className={cn(s.barNote, draft && !unowned.length && s.dirty)}>{unowned.length ? `Unlock ${unowned.join(' and ')} to apply` : dirty ? 'Unsaved changes' : 'Your look is saved'}</span>
        {draft && <Button size="sm" variant="ghost" onClick={() => { setDraft(null); setSelected(null); }}>Cancel</Button>}
        <Button size="sm" variant="secondary" onClick={() => setDraft({ ...DEFAULT_APPEARANCE })}>Reset</Button>
        {draft && <Button size="sm" disabled={!dirty || unowned.length > 0} loading={apply.isPending} onClick={() => apply.mutate()}>Apply</Button>}
      </div>
      <ErrorNote error={apply.error ? errorMessage(apply.error) : null} />

      {!!history.data?.length && (
        <section className={s.history} aria-label="Unlock history">
          <h2 className={s.h2}>Unlock history</h2>
          <ul>
            {history.data.map((h) => (
              <li key={h.key + h.createdAt}>
                <span>{byKey.get(h.key)?.name ?? h.key}</span>
                <span className={s.muted}>{h.source === 'purchase' ? `${h.priceCoins} coins` : h.source === 'event' ? 'Event reward' : 'Gift from Tavern'}</span>
                <time className={s.muted}>{new Date(h.createdAt).toLocaleDateString()}</time>
              </li>
            ))}
          </ul>
        </section>
      )}

      {buying && <BuyDialog item={buying} balance={wallet.data?.balance ?? 0} onClose={() => setBuying(null)} />}
    </div>
  );
}

function statusOf(c: Cosmetic, equipped: boolean, owned: boolean) {
  if (equipped) return 'Equipped';
  if (owned) return 'Owned';
  if (c.unlock === 'purchase') return `${c.priceCoins.toLocaleString()} coins`;
  return c.unlock === 'event' ? 'Event only' : 'Locked';
}

function Status({ text }: { text: string }) {
  const icon = text === 'Equipped' ? 'check' : text === 'Owned' ? null : text.endsWith('coins') ? 'coin' : 'lock';
  return (
    <span className={cn(s.status, text === 'Equipped' && s.equipped)}>
      {icon && <Icon name={icon} size={12} />} {text}
    </span>
  );
}

/** Explicit confirmation with price and balance; the server charges the catalog price, never this one. */
function BuyDialog({ item, balance, onClose }: { item: Cosmetic; balance: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [key] = useState(newKey);
  const buy = useMutation({
    mutationFn: () => api.cosmetics.purchase(item.id, key),
    onSuccess: (r) => {
      qc.setQueryData<WalletSummary>(['wallet'], (w) => (w ? { ...w, balance: r.balance } : w));
      qc.invalidateQueries({ queryKey: ['cosmetics'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
  const short = item.priceCoins > balance;
  return (
    <Modal open onClose={onClose} title={buy.isSuccess ? 'Unlocked!' : `Buy ${item.name}?`}>
      {buy.isSuccess ? (
        <div className={s.confirm}>
          <p><b>{item.name}</b> is now in your collection. Press <b>Apply</b> to wear it.</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <div className={s.confirm}>
          <dl className={s.ledger}>
            <dt>Price</dt>
            <dd><Icon name="coin" size={14} /> {item.priceCoins.toLocaleString()}</dd>
            <dt>Your balance</dt>
            <dd><Icon name="coin" size={14} /> {balance.toLocaleString()}</dd>
            <dt>After purchase</dt>
            <dd>{short ? '—' : (balance - item.priceCoins).toLocaleString()}</dd>
          </dl>
          <p className={s.fine}>Cosmetics are yours to keep. Coins spent are non-refundable and have no cash value.</p>
          <ErrorNote error={buy.error ? errorMessage(buy.error) : null} />
          {short ? (
            <Button variant="gold" href="/wallet" icon="coin">Top up coins</Button>
          ) : (
            <Button variant="gold" loading={buy.isPending} onClick={() => buy.mutate()} icon="coin">Confirm purchase</Button>
          )}
        </div>
      )}
    </Modal>
  );
}
