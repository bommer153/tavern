'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { CompanionCard, RoomTile } from '@/components/domain';
import { Icon } from '@/components/icon';
import { Tavern3DScene } from '@/components/three/stage';
import { GameTile, GiftGlyph, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import s from './landing.module.css';

// Live data sections of the landing page (public endpoints only — nothing here is invented).

export function LandingCompanions() {
  const q = useQuery({ queryKey: ['sections'], queryFn: () => api.companions.sections() });
  const items = (q.data?.featured ?? []).slice(0, 4);
  return (
    <div className={s.showcase}>
      <Tavern3DScene scene="emblem" className={s.showcaseScene} />
      {q.isPending ? (
        <Skeleton style={{ height: 320, marginTop: 150 }} />
      ) : (
        items.length > 0 && <div className={s.plaques}>{items.map((c) => <CompanionCard key={c.userId} c={c} />)}</div>
      )}
    </div>
  );
}

export function LandingGames() {
  const q = useQuery({ queryKey: ['games'], queryFn: () => api.games.list() });
  return (
    <div className={`tv-cut ${s.games}`}>
      {q.data?.map((g) => (
        <Link key={g.id} href={`/discover?game=${g.slug}`} className={s.game}>
          <GameTile slug={g.slug} name={g.name} size={52} />
          <span>{g.name.split(':')[0]}</span>
        </Link>
      ))}
    </div>
  );
}

export function LandingRooms() {
  const q = useQuery({ queryKey: ['rooms', undefined, undefined], queryFn: () => api.rooms.list() });
  if (!q.data?.length)
    return (
      <p className={s.empty}>
        No rooms live right now — <Link href="/rooms">start one</Link>.
      </p>
    );
  return <div className={s.stages}>{q.data.slice(0, 3).map((r) => <RoomTile key={r.id} room={r} />)}</div>;
}

export function LandingGifts() {
  const q = useQuery({ queryKey: ['gifts'], queryFn: () => api.gifts.list() });
  return (
    <div className={s.gifts}>
      {q.data?.map((g) => (
        <div key={g.id} className={`tv-plate ${s.gift}`}>
          <GiftGlyph image={g.imageUrl} size={44} />
          <span className={s.giftName}>{g.name}</span>
          <span className={s.cost}>
            <Icon name="coin" size={13} /> {g.coinCost}
          </span>
        </div>
      ))}
    </div>
  );
}
