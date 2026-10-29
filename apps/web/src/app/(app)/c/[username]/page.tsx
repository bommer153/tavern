'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CompanionDetail, SERVICE_CATEGORY_LABELS, type Service } from '@tavern/shared';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { FollowButton, GiftPicker } from '@/components/domain';
import { Icon } from '@/components/icon';
import { ReportModal } from '@/components/report';
import { Tavern3DScene } from '@/components/three/stage';
import { Avatar, Badge, Button, cn, ErrorNote, GameTile, gameArt, Panel, SectionHeader, Skeleton, Stars, StatusDot } from '@/components/ui';
import { api, errorMessage, formatPhp, newKey, timeAgo } from '@/lib/api';
import { useSession } from '@/lib/session';
import k from '@/styles/layout.module.css';
import s from './profile.module.css';

export default function CompanionProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { me } = useSession();
  const router = useRouter();
  const q = useQuery({ queryKey: ['companion', username], queryFn: () => api.companions.get(username) });
  const [gift, setGift] = useState(false);
  const [report, setReport] = useState(false);

  if (q.isPending) return <Skeleton style={{ height: 380 }} />;
  if (q.error) return <ErrorNote error={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  const c = q.data;
  const isSelf = me?.id === c.userId;
  const requireAuth = (fn: () => void) => (me ? fn() : router.push(`/login?next=/c/${username}`));
  const status = c.busy ? 'busy' : c.online ? 'online' : 'offline';

  return (
    <div>
      <section className={cn('tv-plate', s.hero)}>
        <div className={s.banner} style={{ background: c.bannerUrl ? `center / cover url(${c.bannerUrl})` : gameArt(c.games[0]?.slug) }}>
          {/* Verified-companion accent; purely decorative, never covers an uploaded banner. */}
          {c.verified && !c.bannerUrl && <Tavern3DScene scene="gameworld" game={c.games[0]?.slug} />}
        </div>
        <div className={s.identity}>
          <Avatar name={c.displayName} src={c.avatarUrl} size={120} status={status} ring="var(--tv-plate)" />
          <div className={s.who}>
            <h1 className={s.name}>
              {c.displayName}
              {c.verified && <Icon name="verified" size={22} className={s.verified} label="Verified" />}
            </h1>
            <p className={s.handle}>
              @{c.username}
              <span className={cn('tv-label', s.presence)}>
                <StatusDot status={status} /> {c.busy ? 'In a session' : c.online ? 'Online' : 'Offline'}
              </span>
            </p>
            <div className={s.readouts}>
              <span className={s.readout}><strong>{c.followerCount}</strong><span className="tv-label">Followers</span></span>
              <span className={s.readout}><strong>{c.completedOrders}</strong><span className="tv-label">Sessions</span></span>
              <span className={s.readout}><Stars value={c.ratingAvg} count={c.ratingCount} /><span className="tv-label">Rating</span></span>
            </div>
          </div>
          {!isSelf && (
            <div className={s.actions}>
              {c.services.length > 0 && (
                <Button size="lg" onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })} icon="orders">
                  Order now
                </Button>
              )}
              <FollowButton userId={c.userId} following={c.isFollowing} username={username} />
              <Button variant="secondary" onClick={() => requireAuth(() => setGift(true))} icon="gift">Gift</Button>
              <Button variant="secondary" icon="chat" onClick={() => requireAuth(async () => router.push(`/messages/${(await api.conversations.start(c.userId)).id}`))}>
                Message
              </Button>
            </div>
          )}
        </div>
      </section>

      <div className={s.cols}>
        <div className={k.stack}>
          <Panel title="About" icon="user">
            <p className={s.bio}>{c.bio || c.headline}</p>
            <div className={s.tags}>
              {c.languages.map((l) => <Badge key={l}>{l}</Badge>)}
              {c.playstyles.map((p) => <Badge key={p} tone="violet">{p}</Badge>)}
              {c.voiceAvailable && <Badge tone="pink"><Icon name="mic" size={12} /> Voice</Badge>}
            </div>
            <div className={s.loadout}>
              <p className="tv-label">Loadout</p>
              {c.games.map((g) => (
                <div key={g.gameId} className={s.slot}>
                  <GameTile slug={g.slug} name={g.name} size={44} />
                  <div className={s.slotText}>
                    <p className={k.strong}>{g.name}</p>
                    {g.rank && <p className={s.rank}>{g.rank}</p>}
                    {g.roles.length > 0 && <p className={s.roles}>{g.roles.join(' · ')}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <section id="services" style={{ scrollMarginTop: 'calc(var(--tv-bar-h) + 16px)' }}>
            {isSelf ? (
              <>
                <SectionHeader title="Your services" />
                <div className={s.contracts}>
                  {c.services.map((svc) => (
                    <article key={svc.id} className={cn('tv-plate', s.contract)}>
                      <div className={s.contractHead}>
                        <div>
                          <p className={s.contractTitle}>{svc.title}</p>
                          <p className="tv-label">{SERVICE_CATEGORY_LABELS[svc.category]} · {svc.unitMinutes} min</p>
                        </div>
                        <p className={s.cost}>{formatPhp(svc.pricePerUnitCentavos)}</p>
                      </div>
                      <p className={cn(k.small, k.muted)}>{svc.description}</p>
                      <ul className={s.terms}>
                        {svc.includes.map((x) => <li key={x}><Icon name="check" size={16} className={s.yes} /> {x}</li>)}
                        {svc.excludes.map((x) => <li key={x} className={k.muted}><Icon name="close" size={16} className={s.no} /> {x}</li>)}
                      </ul>
                      <p className={k.fine}>{svc.cancellationPolicy}</p>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              // Visitors get one straight order: the companion's first service, no picker.
              c.services[0] && <OrderBar c={c} svc={c.services[0]} signedIn={!!me} />
            )}
          </section>
          <Reviews userId={c.userId} />
        </div>

        <aside className={k.stack}>
          <Panel title="Play safe" icon="shield-check">
            <p className={cn(k.small, k.muted)}>Never share your game account password. Keep payments inside Tavern so they are protected.</p>
            {me && !isSelf && (
              <div className={s.safety}>
                <button type="button" onClick={() => setReport(true)}><Icon name="flag" size={14} /> Report</button>
                <button
                  type="button"
                  className={s.danger}
                  onClick={async () => {
                    if (confirm(`Block ${c.displayName}? They won't be able to message or book with you.`)) {
                      await api.users.block(c.userId);
                      router.push('/discover');
                    }
                  }}
                >
                  <Icon name="ban" size={14} /> Block
                </button>
              </div>
            )}
          </Panel>
        </aside>
      </div>

      <GiftPicker open={gift} onClose={() => setGift(false)} recipient={{ id: c.userId, displayName: c.displayName }} context="profile" />
      <ReportModal open={report} onClose={() => setReport(false)} targetType="user" targetId={c.userId} />
    </div>
  );
}

/**
 * The one order flow: sessions → Order now → one inline confirmation with the real
 * price and balance → the server books it (idempotent) → the order page is the confirmation.
 */
function OrderBar({ c, svc, signedIn }: { c: CompanionDetail; svc: Service; signedIn: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: () => api.wallet.summary(), enabled: signedIn });
  const [units, setUnits] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [key] = useState(newKey); // reused across retries so a double tap can never double-book
  const coinValue = wallet.data?.coinValueCentavos ?? 100;
  const coins = Math.ceil((svc.pricePerUnitCentavos * units) / coinValue);
  const balance = wallet.data?.balance;
  const short = balance !== undefined && balance < coins;
  const ready = c.online && !c.busy;

  const order = useMutation({
    mutationFn: () => api.orders.create({ serviceId: svc.id, units, idempotencyKey: key }),
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      router.push(`/orders/${o.id}`);
    },
  });

  return (
    <div className={cn('tv-plate', s.orderBar, confirming && s.confirming)} aria-live="polite">
      <div className={s.orderInfo}>
        <p className={s.orderTitle}>{svc.title}</p>
        <div className={s.stepper} role="group" aria-label="Sessions">
          <button type="button" aria-label="One session fewer" disabled={units <= 1 || order.isPending} onClick={() => { setUnits(units - 1); setConfirming(false); }}>−</button>
          <span>{units} × {svc.unitMinutes} min</span>
          <button type="button" aria-label="One session more" disabled={units >= svc.maxUnits || order.isPending} onClick={() => { setUnits(units + 1); setConfirming(false); }}>+</button>
        </div>
      </div>
      <p className={s.orderPrice}>
        {formatPhp(svc.pricePerUnitCentavos * units)}
        <small><Icon name="coin" size={13} /> {coins.toLocaleString()} coins</small>
      </p>
      {!ready ? (
        <p className={s.orderNote}>
          <Icon name={c.busy ? 'timer' : 'signal-off'} size={16} />
          {c.busy ? `${c.displayName} is in a session. Try again soon.` : `${c.displayName} is offline. Ordering opens when they’re online.`}
        </p>
      ) : !signedIn ? (
        <Button size="lg" href={`/login?next=/c/${c.username}`} icon="orders">Sign in to order</Button>
      ) : !confirming ? (
        <Button size="lg" className={s.orderBtn} onClick={() => setConfirming(true)} icon="orders">Order now</Button>
      ) : short ? (
        <div className={s.confirm}>
          <p>You need {coins.toLocaleString()} coins · you have {balance!.toLocaleString()}.</p>
          <Button variant="gold" href="/wallet" icon="coin">Top up</Button>
        </div>
      ) : (
        <div className={s.confirm}>
          <p>
            Pay <b>{coins.toLocaleString()} coins</b> from your wallet{balance !== undefined && <> · {balance.toLocaleString()} → {(balance - coins).toLocaleString()}</>}. Starts as soon as {c.displayName} accepts.
          </p>
          <div className={s.confirmBtns}>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={order.isPending}>Cancel</Button>
            <Button loading={order.isPending} onClick={() => order.mutate()} icon="check">Confirm &amp; pay</Button>
          </div>
        </div>
      )}
      <ErrorNote error={order.error ? errorMessage(order.error) : null} />
    </div>
  );
}

function Reviews({ userId }: { userId: string }) {
  const q = useQuery({ queryKey: ['reviews', userId], queryFn: () => api.companions.reviews(userId) });
  return (
    <section>
      <SectionHeader title="Reviews" />
      {q.isPending ? (
        <Skeleton style={{ height: 96 }} />
      ) : q.data?.items.length ? (
        <div className={k.stackSm}>
          {q.data.items.map((r) => (
            <article key={r.id} className={cn('tv-cut', s.review)}>
              <div className={s.reviewHead}>
                <Avatar name={r.author.displayName} src={r.author.avatarUrl} size={32} />
                <div className={k.rowMain}>
                  <p className={cn(k.small, k.strong)}>{r.author.displayName}</p>
                  <p className={k.fine}>{timeAgo(r.createdAt)}</p>
                </div>
                <span className={s.rating} role="img" aria-label={`${r.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }, (_, i) => <Icon key={i} name="star" size={14} className={i < r.rating ? undefined : s.off} />)}
                </span>
              </div>
              {r.comment && <p className={s.comment}>{r.comment}</p>}
            </article>
          ))}
        </div>
      ) : (
        <p className={cn(k.small, k.muted)}>No reviews yet.</p>
      )}
    </section>
  );
}
