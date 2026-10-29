'use client';
import { useQuery } from '@tanstack/react-query';
import { type CompanionCard as Card, SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS, type ServiceCategory } from '@tavern/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CardGridSkeleton, CompanionCard, PeopleGrid, RoomTile } from '@/components/domain';
import { Icon } from '@/components/icon';
import { Tavern3DScene } from '@/components/three/stage';
import { Button, Check, cn, Empty, ErrorNote, Field, GameTile, HScroll, Input, Modal, SearchField, SectionHeader, Select } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import k from '@/styles/layout.module.css';
import s from './discover.module.css';

const FILTER_KEYS = ['q', 'game', 'category', 'language', 'rank', 'role', 'voice', 'online', 'minPrice', 'maxPrice', 'minRating', 'sort', 'page'] as const;
const SECTIONS = [
  ['featured', 'Featured companions'],
  ['online', 'Online now'],
  ['topRated', 'Highest rated'],
  ['popular', 'Popular this week'],
  ['new', 'Newly approved'],
] as const;

export default function DiscoverPage() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const q = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? undefined])) as Record<(typeof FILTER_KEYS)[number], string | undefined>;
  const filtering = FILTER_KEYS.some((key) => key !== 'sort' && q[key]);
  const [showFilters, setShowFilters] = useState(false);
  const [text, setText] = useState(q.q ?? '');
  const [preview, setPreview] = useState<string | undefined>();
  const { me } = useSession();
  const following = useQuery({ queryKey: ['following'], queryFn: () => api.companions.following(), enabled: !!me });
  const followed = (id: string) => (me && following.data ? following.data.some((f) => f.userId === id) : undefined);
  const rooms = useQuery({ queryKey: ['rooms', undefined, undefined], queryFn: () => api.rooms.list(), enabled: !filtering });
  const activeFilters = (['category', 'language', 'rank', 'role', 'minPrice', 'maxPrice', 'minRating'] as const).filter((key) => q[key]).length;

  const set = (patch: Partial<typeof q>) => {
    const next = new URLSearchParams(params);
    for (const [key, v] of Object.entries(patch)) {
      if (v) next.set(key, v);
      else next.delete(key);
    }
    if (!('page' in patch)) next.delete('page');
    router.replace(`${path}?${next}`, { scroll: false });
  };
  const pickGame = (slug?: string) => set({ game: slug, rank: undefined, role: undefined });

  const games = useQuery({ queryKey: ['games'], queryFn: () => api.games.list(), staleTime: 300_000 });
  const game = games.data?.find((g) => g.slug === q.game);
  const sections = useQuery({ queryKey: ['sections'], queryFn: () => api.companions.sections(), enabled: !filtering });
  const results = useQuery({
    queryKey: ['companions', q],
    queryFn: () =>
      api.companions.list({
        ...q,
        category: q.category as ServiceCategory | undefined,
        voice: q.voice === 'true' || undefined,
        online: q.online === 'true' || undefined,
        minPrice: q.minPrice ? Number(q.minPrice) * 100 : undefined,
        maxPrice: q.maxPrice ? Number(q.maxPrice) * 100 : undefined,
        minRating: q.minRating ? Number(q.minRating) : undefined,
        page: q.page ? Number(q.page) : 1,
        sort: (q.sort as any) ?? 'featured',
      }),
    enabled: filtering,
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <section className={cn('tv-plate', s.world)}>
        <Tavern3DScene scene="gameworld" game={preview ?? q.game} fallback={game && <GameTile slug={game.slug} name={game.name} size={72} />} />
        <div className={s.worldInner}>
          <div className={s.worldHead}>
            <p className="tv-label">{game ? 'Game world' : 'Discover'}</p>
            <h1 className={s.worldTitle}>{game?.name ?? 'Find your people'}</h1>
            <p className={s.worldSub}>{game ? game.roles.slice(0, 5).join(' · ') : 'Duo partners, coaches and good vibes — by game, rank and playstyle.'}</p>
          </div>
          <form
            className={s.searchRow}
            onSubmit={(e) => {
              e.preventDefault();
              set({ q: text || undefined });
            }}
          >
            <SearchField placeholder="Search by name, game or vibe" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search companions" />
            <Button type="button" variant="secondary" onClick={() => setShowFilters(true)} aria-haspopup="dialog" icon="sliders">
              <span className={s.filterLabel}>Filters</span>
              {activeFilters > 0 && <span className={s.filterCount}>{activeFilters}</span>}
            </Button>
          </form>

          {/* Game selector: hover/focus previews the game's object in the portal; clicking filters real results. */}
          <div className={s.games} role="group" aria-label="Games" onMouseLeave={() => setPreview(undefined)}>
            {[undefined, ...(games.data ?? [])].map((g) => (
              <button
                key={g?.id ?? 'all'}
                type="button"
                onClick={() => pickGame(g?.slug)}
                onMouseEnter={() => setPreview(g?.slug)}
                onFocus={() => setPreview(g?.slug)}
                onBlur={() => setPreview(undefined)}
                aria-pressed={q.game === g?.slug}
                className={cn(s.game, !g && s.allGames)}
              >
                {g && (
                  <span className={s.token}>
                    <GameTile slug={g.slug} name={g.name} size={44} />
                  </span>
                )}
                {g ? g.name.split(':')[0] : 'All games'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className={s.quick} role="group" aria-label="Quick filters">
        <button type="button" onClick={() => set({ online: q.online === 'true' ? undefined : 'true' })} aria-pressed={q.online === 'true'} className={s.toggle}>
          <span className={s.onlinePip} aria-hidden /> Online now
        </button>
        <button type="button" onClick={() => set({ voice: q.voice === 'true' ? undefined : 'true' })} aria-pressed={q.voice === 'true'} className={cn(s.toggle, s.toggleVoice)}>
          <Icon name="mic" size={15} /> Voice
        </button>
      </div>

      <Modal open={showFilters} onClose={() => setShowFilters(false)} title="Filters" wide>
        <div className={k.formGrid}>
          <Field label="Service">
            <Select value={q.category ?? ''} onChange={(e) => set({ category: e.target.value || undefined })}>
              <option value="">Any service</option>
              {SERVICE_CATEGORIES.map((c) => <option key={c} value={c}>{SERVICE_CATEGORY_LABELS[c]}</option>)}
            </Select>
          </Field>
          <Field label="Language">
            <Select value={q.language ?? ''} onChange={(e) => set({ language: e.target.value || undefined })}>
              <option value="">Any language</option>
              {['Filipino', 'English', 'Cebuano', 'Ilocano', 'Hiligaynon'].map((l) => <option key={l}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Rank">
            <Select value={q.rank ?? ''} onChange={(e) => set({ rank: e.target.value || undefined })} disabled={!game}>
              <option value="">{game ? 'Any rank' : 'Pick a game for ranks'}</option>
              {game?.ranks.map((r) => <option key={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Role">
            <Select value={q.role ?? ''} onChange={(e) => set({ role: e.target.value || undefined })} disabled={!game}>
              <option value="">{game ? 'Any role' : 'Pick a game for roles'}</option>
              {game?.roles.map((r) => <option key={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Price per session (₱)">
            <div className={s.price}>
              <Input type="number" min={0} placeholder="Min" defaultValue={q.minPrice} onBlur={(e) => set({ minPrice: e.target.value || undefined })} aria-label="Minimum price" />
              <Input type="number" min={0} placeholder="Max" defaultValue={q.maxPrice} onBlur={(e) => set({ maxPrice: e.target.value || undefined })} aria-label="Maximum price" />
            </div>
          </Field>
          <Field label="Rating">
            <Select value={q.minRating ?? ''} onChange={(e) => set({ minRating: e.target.value || undefined })}>
              <option value="">Any rating</option>
              <option value="4.5">4.5 and up</option>
              <option value="4">4.0 and up</option>
            </Select>
          </Field>
          <Field label="Sort by">
            <Select value={q.sort ?? 'featured'} onChange={(e) => set({ sort: e.target.value })}>
              <option value="featured">Featured</option>
              <option value="rating">Highest rated</option>
              <option value="popular">Most popular</option>
              <option value="new">Newest</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </Select>
          </Field>
          <div className={k.cluster} style={{ alignSelf: 'end', gap: 16, minHeight: 44 }}>
            <Check checked={q.online === 'true'} onChange={(e) => set({ online: e.target.checked ? 'true' : undefined })}>Online now</Check>
            <Check checked={q.voice === 'true'} onChange={(e) => set({ voice: e.target.checked ? 'true' : undefined })}>Voice</Check>
          </div>
        </div>
        <div className={k.end} style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--tv-line)' }}>
          <Button variant="ghost" onClick={() => router.replace(path)}>Reset</Button>
          <Button onClick={() => setShowFilters(false)}>Show results</Button>
        </div>
      </Modal>

      {filtering ? (
        <div className={k.stackSm}>
          <ErrorNote error={results.error ? errorMessage(results.error) : null} onRetry={() => results.refetch()} retrying={results.isFetching} />
          {results.isPending ? (
            <CardGridSkeleton />
          ) : results.error && !results.data ? (
            <Unavailable />
          ) : results.data?.items.length ? (
            <>
              <p className={s.total}>{results.data.total} companions</p>
              <Grid items={results.data.items} followed={followed} />
              <div className={s.pager}>
                {results.data.page > 1 && <Button variant="secondary" onClick={() => set({ page: String(results.data.page - 1) })}>Previous</Button>}
                {results.data.hasMore && <Button variant="secondary" onClick={() => set({ page: String(results.data.page + 1) })}>Next</Button>}
              </div>
            </>
          ) : (
            <Empty icon="users" title="No companions match" body="Try removing a filter or searching another game." action={<Button variant="secondary" onClick={() => router.replace(path)}>Clear filters</Button>} />
          )}
        </div>
      ) : sections.isPending ? (
        <CardGridSkeleton />
      ) : (
        <div className={s.rails}>
          <ErrorNote error={sections.error ? errorMessage(sections.error) : null} onRetry={() => sections.refetch()} retrying={sections.isFetching} />
          {sections.error && !sections.data && <Unavailable />}
          {SECTIONS.map(([key, title], i) => (
            <div key={key} className={s.rails}>
              {!!sections.data?.[key]?.length && (
                <section>
                  <SectionHeader title={title} href={key === 'online' ? '/discover?online=true' : undefined} />
                  <HScroll label={title} className={s.peopleRail}>
                    {sections.data[key]!.map((c) => <CompanionCard key={c.userId} c={c} following={followed(c.userId)} className={s.plaque} />)}
                  </HScroll>
                </section>
              )}
              {i === 0 && !!rooms.data?.length && (
                <section>
                  <SectionHeader title="Live rooms" href="/rooms" live />
                  <HScroll label="Live rooms">{rooms.data.map((r) => <RoomTile key={r.id} room={r} className={s.stage} />)}</HScroll>
                </section>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Shown instead of results when the API can't be reached — never fake people to fill the gap. */
function Unavailable() {
  return <Empty icon="signal-off" title="Can't reach Tavern right now" body="Players will show up here as soon as the connection is back. Your search and filters are kept." />;
}

function Grid({ items, followed }: { items: Card[]; followed: (id: string) => boolean | undefined }) {
  return (
    <PeopleGrid>
      {items.map((c) => <CompanionCard key={c.userId} c={c} following={followed(c.userId)} />)}
    </PeopleGrid>
  );
}
