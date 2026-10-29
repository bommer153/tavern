'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Icon } from '@/components/icon';
import { cn, ErrorNote, GameTile, gameArt, gameLogo, PageHeader, Skeleton } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import s from './games.module.css';

export default function GamesPage() {
  const q = useQuery({ queryKey: ['games'], queryFn: () => api.games.list(), staleTime: 300_000 });
  return (
    <div>
      <PageHeader eyebrow="Worlds" title="Games" subtitle="Pick a world to find companions and live rooms." />
      <ErrorNote error={q.error ? errorMessage(q.error) : null} onRetry={() => q.refetch()} retrying={q.isFetching} />
      <div className={s.grid}>
        {q.isPending
          ? [1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} style={{ height: 210 }} />)
          : q.data?.map((g) => (
              <article key={g.id} className={cn('tv-plate', s.door)}>
                <div className={s.art} style={{ background: g.coverUrl ? `center / cover url(${g.coverUrl})` : gameArt(g.slug) }}>
                  {(gameLogo(g.slug) ?? g.iconUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={gameLogo(g.slug) ?? g.iconUrl} alt="" className={s.logo} />
                  ) : (
                    <GameTile slug={g.slug} name={g.name} size={72} />
                  )}
                </div>
                <div className={s.body}>
                  <h2 className={s.name}>{g.name}</h2>
                  <p className="tv-label">{g.platforms.join(' · ')}</p>
                  <p className={s.roles}>{g.roles.join(' · ')}</p>
                  <div className={s.links}>
                    <Link href={`/discover?game=${g.slug}`} className={s.primary}>
                      Find companions <Icon name="chevron" size={15} />
                    </Link>
                    <Link href={`/rooms?game=${g.slug}`} className={s.secondary}>
                      <Icon name="mic" size={15} /> Live rooms
                    </Link>
                  </div>
                </div>
              </article>
            ))}
      </div>
    </div>
  );
}
