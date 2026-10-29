'use client';
import { useQuery } from '@tanstack/react-query';
import type { CompanionCard as Card, Game, Notification, Order, VoiceRoom } from '@tavern/shared';
import Link from 'next/link';
import { useState } from 'react';
import { CardGridSkeleton, CompanionCard, OrderStatusBadge, PeopleGrid } from '@/components/domain';
import { NexusHero } from '@/components/art/nexus-hero';
import { Icon, type IconName } from '@/components/icon';
import { Avatar, Button, Chip, Chips, Empty, ErrorNote, GameTile, gameArt, gameLogo, SectionHeader, Skeleton, Stars, cn } from '@/components/ui';
import { api, errorMessage, formatPhp } from '@/lib/api';
import { useSession } from '@/lib/session';
import s from './home.module.css';

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};
const gameName = (name?: string) => name?.split(':')[0];
const uniq = (list: Card[]) => list.filter((c, i, a) => a.findIndex((x) => x.userId === c.userId) === i);

const SHELVES = [
  ['featured', 'Featured'],
  ['topRated', 'Top rated'],
  ['popular', 'Popular'],
  ['new', 'New on Tavern'],
] as const;

export default function HomePage() {
  const { me } = useSession();
  const rooms = useQuery({ queryKey: ['rooms', undefined, undefined], queryFn: () => api.rooms.list(), refetchInterval: 20_000 });
  const sections = useQuery({ queryKey: ['sections'], queryFn: () => api.companions.sections() });
  const following = useQuery({ queryKey: ['following'], queryFn: () => api.companions.following(), enabled: !!me });
  const orders = useQuery({ queryKey: ['orders', 'customer', 'active'], queryFn: () => api.orders.mine({ as: 'customer', status: 'active' }), enabled: !!me });
  const notifications = useQuery({ queryKey: ['notifications', 'count'], queryFn: () => api.notifications.list(), enabled: !!me });
  const games = useQuery({ queryKey: ['games'], queryFn: () => api.games.list(), staleTime: 300_000 });

  const followingIds = new Set(following.data?.map((c) => c.userId));
  const friends = (following.data ?? []).filter((c) => c.online || c.busy);
  const online = uniq([...friends, ...(sections.data?.online ?? [])].filter((c) => c.online || c.busy));
  const faces = friends.length ? friends : online;
  const featured = sections.data?.featured?.[0] ?? sections.data?.topRated?.[0];
  const failed = rooms.error || sections.error;

  return (
    <div className={s.home}>
      {/* Opening screen: key art, one message, one action. */}
      <section className={s.hero}>
        <div className={s.heroArt}>
          <NexusHero />
        </div>
        <div className={s.heroCopy}>
          <p className={s.onlinePill}>
            <i />
            {online.length ? `${online.length} online now` : 'The Tavern is open'}
          </p>
          <p className={s.eyebrow}>{me ? `${greeting()}, ${me.displayName.split(' ')[0]}` : 'Gaming companions · voice rooms'}</p>
          <h1 className={s.headline}>
            Find your duo.
            <span>Enter your world.</span>
          </h1>
          <p className={s.lede}>Real players online right now. Pick one, press Order, and you&apos;re in the lobby together.</p>
          <div className={s.cta}>
            <Button size="lg" href="/discover?online=1" icon="discover">Find someone online</Button>
            {!me && <Button size="lg" variant="secondary" href="/register">Join Tavern</Button>}
          </div>
          {faces.length > 0 && (
            <div>
              <p className={s.label}>{friends.length ? 'Friends online' : 'Online now'}</p>
              <div className={s.faces}>
                {faces.slice(0, 5).map((c) => (
                  <Link key={c.userId} href={`/c/${c.username}`} className={s.face}>
                    <Avatar name={c.displayName} src={c.avatarUrl} size={50} status={c.busy ? 'busy' : 'online'} />
                    <span>{c.displayName}</span>
                  </Link>
                ))}
                {faces.length > 5 && (
                  <Link href="/discover?online=1" className={s.face} aria-label={`${faces.length - 5} more online`}>
                    <span className={s.more}>+{faces.length - 5}</span>
                    <span aria-hidden>&nbsp;</span>
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={s.dash} aria-label="Your Tavern">
        {me && <Upcoming orders={orders.data?.items} />}
        <div>
          <p className={s.label}>
            Active voice rooms
            <Link href="/rooms">View all <Icon name="chevron" size={14} /></Link>
          </p>
          {!rooms.data ? (
            <div className={s.rooms}>{[1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 66 }} />)}</div>
          ) : rooms.data.length ? (
            <div className={s.rooms}>{rooms.data.slice(0, 3).map((r) => <RoomCard key={r.id} room={r} />)}</div>
          ) : (
            <Link href="/rooms" className={cn('tv-glass', s.roomEmpty)}>
              <Icon name="mic" size={18} /> No rooms live yet. Start one and others will join.
            </Link>
          )}
        </div>
        {featured && (
          <div>
            <p className={s.label}>Featured companion</p>
            <Featured c={featured} />
          </div>
        )}
        {me && <Activity items={notifications.data?.items} />}
      </section>

      <ErrorNote
        error={failed ? errorMessage(rooms.error ?? sections.error) : null}
        retrying={rooms.isFetching || sections.isFetching}
        onRetry={() => {
          rooms.refetch();
          sections.refetch();
        }}
      />

      {!!games.data?.length && <Games games={games.data} />}

      {online.length > 0 && (
        <section>
          <SectionHeader title="Online now" href="/discover?online=1" />
          <div className={cn('tv-glass', s.online)}>
            {online.slice(0, 12).map((c) => (
              <Link key={c.userId} href={`/c/${c.username}`} className={s.onlineFace}>
                <Avatar name={c.displayName} src={c.avatarUrl} size={58} status={c.busy ? 'busy' : 'online'} ring={followingIds.has(c.userId) ? 'var(--tv-violet)' : undefined} />
                <span className={s.onlineName}>{c.displayName}</span>
                <span className={s.onlineWhat}>{c.busy ? 'In a session' : c.games[0] ? `Plays ${gameName(c.games[0].name)}` : 'Online'}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Shelves sections={sections.data} followingIds={me ? followingIds : undefined} failed={!!failed} />
    </div>
  );
}

function Upcoming({ orders }: { orders?: Order[] }) {
  const next = orders?.[0];
  return (
    <div>
      <p className={s.label}>
        Your sessions
        <Link href="/orders">View all <Icon name="chevron" size={14} /></Link>
      </p>
      {!orders ? (
        <Skeleton style={{ height: 88 }} />
      ) : next ? (
        <Link href={`/orders/${next.id}`} className={cn('tv-glass', s.session)}>
          <span className={s.thumb}>
            <Avatar name={next.companion.displayName} src={next.companion.avatarUrl} size={44} />
          </span>
          <span className={s.sessionText}>
            <b>{next.service.title}</b>
            <small>
              {next.scheduledStart ? new Date(next.scheduledStart).toLocaleString('en-PH', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'Started now'} · with{' '}
              {next.companion.displayName}
            </small>
            <OrderStatusBadge status={next.status} />
          </span>
          <span className={s.view}>View</span>
        </Link>
      ) : (
        <Link href="/discover" className={cn('tv-glass', s.session)}>
          <span className={s.thumb}>
            <Icon name="orders" size={22} />
          </span>
          <span className={s.sessionText}>
            <b>No active sessions</b>
            <small>Find someone online and order in one tap.</small>
          </span>
          <span className={s.view}>Find</span>
        </Link>
      )}
    </div>
  );
}

function RoomCard({ room: r }: { room: VoiceRoom }) {
  return (
    <Link href={`/rooms/${r.id}`} className={cn('tv-glass', s.room)}>
      {r.game ? <GameTile slug={r.game.slug} name={r.game.name} size={42} /> : <span className={s.roomIcon}><Icon name="mic" size={18} /></span>}
      <span className={s.roomText}>
        <b>{r.title}</b>
        <small>
          <Icon name="users" size={12} />
          {r.participantCount}/{r.capacity} · {gameName(r.game?.name) ?? r.category}
        </small>
      </span>
      <Icon name="chevron" size={16} className={s.chev} />
    </Link>
  );
}

function Featured({ c }: { c: Card }) {
  const game = c.games[0];
  return (
    <Link href={`/c/${c.username}`} className={cn('tv-glass', s.featured)}>
      <span className={s.portrait} style={{ background: gameArt(game?.slug) }}>
        <Avatar name={c.displayName} src={c.avatarUrl} size={96} />
      </span>
      <span className={s.featuredBody}>
        <b className={s.featuredName}>
          {c.displayName}
          {c.verified && <Icon name="verified" size={16} label="Verified" className={s.verified} />}
        </b>
        <small className={s.featuredMeta}>
          <i className={c.busy ? s.busyDot : s.onDot} />
          {c.busy ? 'In a session' : c.online ? 'Online' : 'Offline'}
          {game && ` · ${gameName(game.name)}`}
        </small>
        <Stars value={c.ratingAvg} count={c.ratingCount} />
        <span className={s.featuredFoot}>
          {c.startingPriceCentavos !== null && (
            <span className={s.from}>
              From <b>{formatPhp(c.startingPriceCentavos)}</b>
            </span>
          )}
          <span className={s.book}>Order</span>
        </span>
      </span>
    </Link>
  );
}

const ACTIVITY_ICON: Record<string, IconName> = { follow: 'heart', gift: 'gift', message: 'chat', order: 'orders', review: 'star', room: 'mic' };

function Activity({ items }: { items?: Notification[] }) {
  return (
    <div>
      <p className={s.label}>
        Latest activity
        <Link href="/notifications">View all <Icon name="chevron" size={14} /></Link>
      </p>
      <div className={cn('tv-glass', s.activity)}>
        {!items ? (
          <Skeleton style={{ height: 120 }} />
        ) : items.length ? (
          items.slice(0, 3).map((n) => (
            <Link key={n.id} href={n.link ?? '/notifications'} className={s.event}>
              <span className={s.eventIcon}>
                <Icon name={ACTIVITY_ICON[n.type.split('.')[0]] ?? 'bell'} size={16} />
              </span>
              <span className={s.eventText}>
                <b>{n.title}</b>
                <small>{timeAgo(n.createdAt)}</small>
              </span>
              {!n.readAt && <i className={s.unread} aria-label="Unread" />}
            </Link>
          ))
        ) : (
          <p className={s.quiet}>Nothing new yet. Follows, gifts and bookings show up here.</p>
        )}
      </div>
    </div>
  );
}

function timeAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

function Games({ games }: { games: Game[] }) {
  return (
    <section>
      <SectionHeader title="Popular games" href="/games" />
      <div className={s.posters}>
        {games.slice(0, 6).map((g) => {
          const logo = gameLogo(g.slug) ?? g.iconUrl;
          return (
            <Link
              key={g.id}
              href={`/discover?game=${g.slug}`}
              className={s.poster}
              style={{ background: g.coverUrl ? `center / cover url(${g.coverUrl})` : `radial-gradient(circle at 60% 30%, ${gameArt(g.slug).match(/#\w+/)?.[0]}, #0b0a22 75%)` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo ? <img src={logo} alt="" className={s.posterLogo} /> : <span className={s.posterInitials}>{g.name.slice(0, 2)}</span>}
              <span className={s.posterName}>{g.name}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Shelves({ sections, followingIds, failed }: { sections?: Record<string, Card[]>; followingIds?: Set<string>; failed: boolean }) {
  const available = SHELVES.filter(([key]) => sections?.[key]?.length);
  const [picked, setPicked] = useState<string>();
  const key = picked ?? available[0]?.[0];
  if (failed) return null;
  return (
    <section>
      <SectionHeader title="Featured companions" href="/discover" />
      {available.length > 1 && (
        <Chips label="Companion lists">
          {available.map(([k, label]) => (
            <Chip key={k} pressed={k === key} onClick={() => setPicked(k)}>
              {label}
            </Chip>
          ))}
        </Chips>
      )}
      <div className={s.shelf}>
        {!sections ? (
          <CardGridSkeleton n={4} />
        ) : key ? (
          <PeopleGrid>
            {sections[key].slice(0, 8).map((c) => (
              <CompanionCard key={c.userId} c={c} following={followingIds ? followingIds.has(c.userId) : undefined} />
            ))}
          </PeopleGrid>
        ) : (
          <Empty icon="users" title="No companions yet" body="Companions appear here once they finish their profile." action={<Button href="/become-companion">Become a companion</Button>} />
        )}
      </div>
    </section>
  );
}
