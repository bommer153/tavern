'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CompanionCard as Card, type Gift, ORDER_STATUS_LABELS, type OrderStatus, type VoiceRoom } from '@tavern/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, errorMessage, formatPhp, newKey } from '@/lib/api';
import { useSession } from '@/lib/session';
import s from './domain.module.css';
import { Icon } from './icon';
import { Tavern3DScene } from './three/stage';
import { Avatar, Badge, Button, cn, ErrorNote, GameTile, gameArt, gameLogo, GiftGlyph, LiveBadge, Modal, placeholderAvatar, Select, Skeleton, Stars, type Tone } from './ui';

/** Character card for a companion: portrait over their game's colours. Pass `following` (signed-in viewers only) to show the follow toggle. */
export function CompanionCard({ c, following, className }: { c: Card; following?: boolean; className?: string }) {
  const game = c.games[0];
  const status = c.busy ? 'busy' : c.online ? 'online' : 'offline';
  return (
    <article className={cn('tv-plate', s.plaque, className)}>
      <Link href={`/c/${c.username}`} className={s.plaqueLink}>
        <div className={s.portrait} style={{ background: gameArt(game?.slug) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.avatarUrl || placeholderAvatar(c.displayName)} alt="" loading="lazy" className={s.portraitImg} />
          {status !== 'offline' && (
            <span className={cn(s.presence, c.busy && s.presenceBusy)}>
              <i />
              {c.busy ? 'In session' : 'Online'}
            </span>
          )}
          <div className={s.nameplate}>
            <p className={s.name}>
              <span>{c.displayName}</span>
              {c.verified && <Icon name="verified" size={16} className={s.verified} label="Verified" />}
            </p>
            <p className={s.meta}>
              <Stars value={c.ratingAvg} count={c.ratingCount} />
              {c.startingPriceCentavos !== null && (
                <span className={s.price}>
                  from <b>{formatPhp(c.startingPriceCentavos)}</b>
                </span>
              )}
            </p>
          </div>
        </div>
        <p className={s.headline}>{c.headline}</p>
        <div className={s.loadout}>
          {game && <GameTile slug={game.slug} name={game.name} size={22} />}
          {game?.rank && <span className={s.rank}>{game.rank}</span>}
          {game?.roles[0] && <span className={s.tag}>{game.roles[0]}</span>}
          {c.voiceAvailable && <Icon name="mic" size={15} className={s.voice} label="Voice available" />}
        </div>
      </Link>
      {following !== undefined && <FollowButton userId={c.userId} following={following} username={c.username} compact />}
    </article>
  );
}

export function CardGridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className={s.grid}>
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} style={{ height: 268 }} />
      ))}
    </div>
  );
}
/** Grid of identity plaques; collapses to two columns on phones. */
export function PeopleGrid({ children }: { children: React.ReactNode }) {
  return <div className={s.grid}>{children}</div>;
}

const statusTone: Record<OrderStatus, Tone> = {
  pending_payment: 'amber',
  pending_acceptance: 'amber',
  accepted: 'violet',
  in_progress: 'cyan',
  extension_requested: 'cyan',
  completed: 'mint',
  cancelled: 'neutral',
  declined: 'neutral',
  disputed: 'red',
  refund_pending: 'amber',
  refunded: 'neutral',
};
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={statusTone[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}

/** Countdown driven by server timestamps; offset corrects for client clock skew. */
export function Countdown({ endsAt, serverNow }: { endsAt: string; serverNow?: string }) {
  const [now, setNow] = useState(() => (serverNow ? new Date(serverNow).getTime() : 0));
  useEffect(() => {
    const offset = serverNow ? new Date(serverNow).getTime() - Date.now() : 0;
    const t = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [serverNow]);
  const left = Math.max(0, new Date(endsAt).getTime() - now);
  const h = Math.floor(left / 3600_000);
  const m = Math.floor((left % 3600_000) / 60_000);
  const sec = Math.floor((left % 60_000) / 1000);
  return (
    <span className={s.timer} aria-live="off">
      {h > 0 && `${h}:`}
      {String(m).padStart(2, '0')}:{String(sec).padStart(2, '0')}
    </span>
  );
}

export function FollowButton({ userId, following, username, compact }: { userId: string; following: boolean; username: string; compact?: boolean }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const m = useMutation({
    mutationFn: () => (following ? api.companions.unfollow(userId) : api.companions.follow(userId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companion', username] });
      qc.invalidateQueries({ queryKey: ['following'] });
    },
  });
  if (compact)
    // Overlay toggle on plaques; a sibling of the plaque link, never nested inside it.
    return (
      <button
        type="button"
        onClick={() => m.mutate()}
        disabled={m.isPending}
        aria-pressed={following}
        aria-label={following ? `Unfollow ${username}` : `Follow ${username}`}
        className={s.followHex}
      >
        <Icon name="heart" size={17} filled={following} />
      </button>
    );
  if (!me)
    return (
      <Button variant="secondary" href="/login" icon="heart">
        Follow
      </Button>
    );
  return (
    <Button variant="secondary" onClick={() => m.mutate()} loading={m.isPending} aria-pressed={following}>
      {!m.isPending && <Icon name="heart" size={16} filled={following} style={{ color: following ? 'var(--tv-pink)' : undefined }} />}
      {following ? 'Following' : 'Follow'}
    </Button>
  );
}

/** Gift sending: celebration only plays after the server confirms the transaction. */
export function GiftPicker({
  open,
  onClose,
  recipient,
  context,
  contextId,
}: {
  open: boolean;
  onClose: () => void;
  recipient: { id: string; displayName: string };
  context: 'profile' | 'room' | 'order';
  contextId?: string;
}) {
  const qc = useQueryClient();
  const gifts = useQuery({ queryKey: ['gifts'], queryFn: () => api.gifts.list(), enabled: open });
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: () => api.wallet.summary(), enabled: open });
  const [selected, setSelected] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [key, setKey] = useState(newKey);
  const [celebrate, setCelebrate] = useState<{ image: string; label: string; rarity: Gift['rarity']; nonce: number } | null>(null);
  const gift = gifts.data?.find((g) => g.id === selected);
  const total = gift ? gift.coinCost * qty : 0;
  const balance = wallet.data?.balance ?? 0;

  const send = useMutation({
    mutationFn: () => api.gifts.send({ giftId: selected!, recipientId: recipient.id, quantity: qty, context, contextId, idempotencyKey: key }),
    // Celebrations (2D or 3D) start here only — after the server confirmed the transaction.
    onSuccess: (r) => {
      qc.setQueryData(['wallet'], (w: any) => (w ? { ...w, balance: r.balance } : w));
      qc.invalidateQueries({ queryKey: ['wallet'] });
      const nonce = Date.now();
      const high = gift!.rarity === 'epic' || gift!.rarity === 'legendary';
      setCelebrate({ image: gift!.imageUrl, label: `${qty}× ${gift!.name}`, rarity: gift!.rarity, nonce });
      setKey(newKey()); // next send is a new transaction
      setTimeout(() => setCelebrate((c) => (c?.nonce === nonce ? null : c)), high ? 2200 : 1200);
    },
  });
  const reveal = celebrate && (celebrate.rarity === 'epic' || celebrate.rarity === 'legendary') ? celebrate : null;

  return (
    <Modal open={open} onClose={onClose} title={`Send a gift to ${recipient.displayName}`} wide>
      {celebrate && !reveal && (
        <div className={s.burst} aria-live="polite">
          <span>
            <GiftGlyph image={celebrate.image} size={150} />
          </span>
          <span className="tv-sr-only">Gift sent</span>
        </div>
      )}
      {reveal && (
        <div className={cn('tv-plate', s.reveal)} aria-live="polite">
          <Tavern3DScene scene="gift" rarity={reveal.rarity as 'epic' | 'legendary'} nonce={reveal.nonce} bare />
          <div className={s.revealText}>
            <GiftGlyph image={reveal.image} size={44} />
            <div>
              <p className={s.revealTitle} style={{ color: reveal.rarity === 'legendary' ? 'var(--tv-gold)' : 'var(--tv-violet-hi)' }}>
                Sent {reveal.label}
              </p>
              <p style={{ fontSize: 'var(--tv-fs-sm)', color: 'var(--tv-ink-2)' }}>to {recipient.displayName}</p>
            </div>
          </div>
        </div>
      )}
      {gifts.isPending ? (
        <Skeleton style={{ height: 200 }} />
      ) : (
        <div className={s.giftGrid}>
          {gifts.data?.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelected(g.id)}
              aria-pressed={selected === g.id}
              className={cn('tv-plate', s.giftToken, g.rarity !== 'common' && s[g.rarity])}
            >
              <GiftGlyph image={g.imageUrl} size={40} />
              <span className={s.giftName}>{g.name}</span>
              <span className={s.cost}>
                <Icon name="coin" size={13} /> {g.coinCost}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className={s.giftFoot}>
        <div className={s.ledger}>
          <p>
            Balance <b><Icon name="coin" size={14} /> {balance.toLocaleString()}</b>
          </p>
          {gift && (
            <p>
              Total <b style={{ color: 'var(--tv-ink)' }}><Icon name="coin" size={14} /> {total.toLocaleString()}</b>
            </p>
          )}
        </div>
        <div className={s.sendRow}>
          <label className="tv-sr-only" htmlFor="gift-qty">Quantity</label>
          <Select id="gift-qty" value={qty} onChange={(e) => setQty(Number(e.target.value))} className={s.qty}>
            {[1, 5, 10, 25, 99].map((n) => <option key={n} value={n}>×{n}</option>)}
          </Select>
          {gift && total > balance ? (
            <Button variant="gold" href="/wallet" icon="coin">Top up</Button>
          ) : (
            <Button onClick={() => send.mutate()} disabled={!gift} loading={send.isPending} icon="gift">
              Send
            </Button>
          )}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <ErrorNote error={send.error ? errorMessage(send.error) : null} />
      </div>
      <p className={s.fine}>Coins spent on gifts are non-refundable and have no cash value. Companions receive a share as earnings.</p>
    </Modal>
  );
}

/** Seat meter: up to eight hexes filled in proportion to occupancy. */
function Seats({ n, of }: { n: number; of: number }) {
  const lit = Math.min(8, Math.ceil((n / Math.max(1, of)) * 8));
  return (
    <span className={s.seats} aria-label={`${n} of ${of} seats taken`} role="img">
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} className={cn(s.seat, i < lit && s.seatOn)} />
      ))}
      <span className={s.seatsLabel} aria-hidden>{n}/{of}</span>
    </span>
  );
}

/** A live voice room shown as a stage: game art, the room's name, its host and how full it is. */
export function RoomTile({ room: r, className }: { room: VoiceRoom; className?: string }) {
  return (
    <Link href={`/rooms/${r.id}`} className={cn('tv-plate', s.stage, className)}>
      <div className={s.stageArt} style={{ backgroundImage: r.coverUrl ? `url(${r.coverUrl})` : gameArt(r.game?.slug) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {!r.coverUrl && gameLogo(r.game?.slug) && <img src={gameLogo(r.game?.slug)} alt="" className={s.stageLogo} />}
        <div className={s.stageTop}>
          <LiveBadge onArt />
          {r.privacy === 'invite' && <Icon name="lock" size={16} label="Invite only" />}
        </div>
        <div>
          <p className={s.stageTitle}>{r.title}</p>
          <p className={s.stageSub}>{r.game?.name.split(':')[0] ?? r.category}</p>
        </div>
      </div>
      <div className={s.stageFoot}>
        <Avatar name={r.host.displayName} src={r.host.avatarUrl} size={26} />
        <span className={s.host}>{r.host.displayName}</span>
        <span className={s.speakers} title={`${r.speakerCount} on stage`}>
          <Icon name="mic" size={14} />
          {r.speakerCount}
        </span>
        <Seats n={r.participantCount} of={r.capacity} />
        <span className={s.join}>Join</span>
      </div>
    </Link>
  );
}
