'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ROOM_CATEGORIES } from '@tavern/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { RoomTile } from '@/components/domain';
import { Icon } from '@/components/icon';
import { Tavern3DScene } from '@/components/three/stage';
import { Avatar, Button, cn, Empty, ErrorNote, Field, HScroll, Input, LiveBadge, Modal, PageHeader, SectionHeader, Select, Skeleton, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import k from '@/styles/layout.module.css';
import s from './rooms.module.css';

export default function RoomsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { me } = useSession();
  const category = params.get('category') ?? undefined;
  const game = params.get('game') ?? undefined;
  const [create, setCreate] = useState(false);
  const q = useQuery({ queryKey: ['rooms', category, game], queryFn: () => api.rooms.list({ category, game }), refetchInterval: 20_000 });
  const following = useQuery({ queryKey: ['following'], queryFn: () => api.companions.following(), enabled: !!me });
  const friendsRooms = q.data?.filter((r) => following.data?.some((f) => f.userId === r.host.id)) ?? [];
  // Featured = the busiest public room right now (a real metric, not an editorial pick).
  const featured = !category && !game ? q.data?.filter((r) => r.privacy === 'public').sort((a, b) => b.participantCount - a.participantCount)[0] : undefined;
  const start = () => (me ? setCreate(true) : router.push('/login?next=/rooms'));

  return (
    <div>
      <PageHeader eyebrow="Voice" title="Live rooms" subtitle="Drop into a room, find a squad, or just hang out." action={<Button onClick={start} icon="plus">Start a room</Button>} />
      <div className={s.cats} role="group" aria-label="Room categories">
        {[undefined, ...ROOM_CATEGORIES].map((c) => (
          <button key={c ?? 'all'} type="button" aria-pressed={category === c} onClick={() => router.replace(c ? `/rooms?category=${c}` : '/rooms')} className={s.cat}>
            {c ?? 'All'}
          </button>
        ))}
      </div>
      <ErrorNote error={q.error ? errorMessage(q.error) : null} onRetry={() => q.refetch()} retrying={q.isFetching} />
      {q.isPending ? (
        <div className={s.stageGrid}>{[1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 184 }} />)}</div>
      ) : q.data?.length ? (
        <div className={k.stack}>
          {featured && (
            <Link href={`/rooms/${featured.id}`} className={cn('tv-plate', s.featured)}>
              <Tavern3DScene scene="gameworld" game={featured.game?.slug} />
              <div className={s.featuredText}>
                <div className={k.cluster}>
                  <LiveBadge />
                  <span className="tv-label">Most active right now</span>
                </div>
                <p className={s.featuredTitle}>{featured.title}</p>
                {featured.description && <p className={s.featuredDesc}>{featured.description}</p>}
                <div className={s.featuredMeta}>
                  <span><Avatar name={featured.host.displayName} src={featured.host.avatarUrl} size={24} />{featured.host.displayName}</span>
                  <span><Icon name="mic" size={16} />{featured.speakerCount} on stage</span>
                  <span><Icon name="users" size={16} />{featured.participantCount}/{featured.capacity}</span>
                </div>
                <span className={s.featuredJoin}>Join room</span>
              </div>
            </Link>
          )}
          {!category && !game && friendsRooms.length > 0 && (
            <section>
              <SectionHeader title="People you follow" live />
              <HScroll label="Rooms from people you follow">{friendsRooms.map((r) => <RoomTile key={r.id} room={r} className={s.railStage} />)}</HScroll>
            </section>
          )}
          <section>
            <SectionHeader title="All live rooms" />
            <div className={s.stageGrid}>{q.data.map((r) => <RoomTile key={r.id} room={r} />)}</div>
          </section>
        </div>
      ) : (
        !q.error && <Empty icon="mic" title="No live rooms right now" body="Be the first — start a room and invite your squad." action={<Button onClick={start} icon="plus">Start a room</Button>} />
      )}
      <CreateRoomModal open={create} onClose={() => setCreate(false)} />
    </div>
  );
}

function CreateRoomModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const games = useQuery({ queryKey: ['games'], queryFn: () => api.games.list(), enabled: open });
  const [f, setF] = useState({ title: '', description: '', rules: '', category: 'hangout', gameId: '', privacy: 'public', capacity: 50 });
  const m = useMutation({
    mutationFn: () => api.rooms.create({ ...f, gameId: f.gameId || undefined, privacy: f.privacy as 'public' | 'invite', category: f.category as any }),
    onSuccess: (r) => router.push(`/rooms/${r.id}`),
  });
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [key]: key === 'capacity' ? Number(e.target.value) : e.target.value });
  return (
    <Modal open={open} onClose={onClose} title="Start a voice room">
      <form
        className={k.form}
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Title"><Input required minLength={3} maxLength={60} value={f.title} onChange={set('title')} /></Field>
        <Field label="Description"><Textarea maxLength={500} value={f.description} onChange={set('description')} /></Field>
        <div className={k.formGrid}>
          <Field label="Category">
            <Select value={f.category} onChange={set('category')}>{ROOM_CATEGORIES.map((c) => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}</Select>
          </Field>
          <Field label="Game">
            <Select value={f.gameId} onChange={set('gameId')}><option value="">None</option>{games.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
          </Field>
          <Field label="Privacy">
            <Select value={f.privacy} onChange={set('privacy')}><option value="public">Public</option><option value="invite">Invite only</option></Select>
          </Field>
          <Field label="Capacity"><Input type="number" min={2} max={200} value={f.capacity} onChange={set('capacity')} /></Field>
        </div>
        <Field label="Room rules"><Textarea maxLength={1000} value={f.rules} onChange={set('rules')} placeholder="Be kind. No toxicity." /></Field>
        <ErrorNote error={m.error ? errorMessage(m.error) : null} />
        <Button type="submit" className={s.goLive} loading={m.isPending} icon="mic">Go live</Button>
      </form>
    </Modal>
  );
}
