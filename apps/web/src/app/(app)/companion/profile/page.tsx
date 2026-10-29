'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompanionDetail } from '@tavern/shared';
import { useState } from 'react';
import { Icon } from '@/components/icon';
import { Button, Check, ErrorNote, Field, Input, PageHeader, Panel, Select, Skeleton, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import k from '@/styles/layout.module.css';

export default function CompanionProfileEditor() {
  const q = useQuery({ queryKey: ['companion-self'], queryFn: () => api.companion.profile() });
  if (q.isPending) return <Skeleton style={{ height: 256 }} />;
  if (!q.data) return <ErrorNote error={q.error ? errorMessage(q.error) : 'Profile not found'} onRetry={() => q.refetch()} />;
  return <Editor p={q.data} />;
}

function Editor({ p }: { p: CompanionDetail }) {
  const qc = useQueryClient();
  const games = useQuery({ queryKey: ['games'], queryFn: () => api.games.list() });
  const [f, setF] = useState({ headline: p.headline, bio: p.bio, languages: p.languages.join(', '), playstyles: p.playstyles.join(', '), voiceAvailable: p.voiceAvailable });
  const [gameRows, setGameRows] = useState(p.games.map((g) => ({ gameId: g.gameId, rank: g.rank ?? '', roles: g.roles.join(', ') })));
  const split = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
  const save = useMutation({
    mutationFn: () =>
      api.companion.updateProfile({
        headline: f.headline,
        bio: f.bio,
        languages: split(f.languages),
        playstyles: split(f.playstyles),
        voiceAvailable: f.voiceAvailable,
        games: gameRows.filter((g) => g.gameId).map((g) => ({ gameId: g.gameId, rank: g.rank || undefined, roles: split(g.roles) })),
      }),
    onSuccess: (d) => qc.setQueryData(['companion-self'], d),
  });
  const banner = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.companion.updateProfile({ bannerUrl: (await api.uploads.image(fd)).url });
    },
    onSuccess: (d) => qc.setQueryData(['companion-self'], d),
  });
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [key]: e.target.value });
  const row = (i: number, patch: Partial<(typeof gameRows)[number]>) => setGameRows(gameRows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className={k.narrow}>
      <PageHeader title="Profile editor" subtitle="This is what players see on your public profile." />
      <div className={k.stack}>
        <Panel title="Public profile" icon="user">
          <div className={k.form}>
            <Field label="Headline"><Input maxLength={80} value={f.headline} onChange={set('headline')} /></Field>
            <Field label="Bio"><Textarea maxLength={1000} style={{ minHeight: 128 }} value={f.bio} onChange={set('bio')} /></Field>
            <div className={k.formGrid}>
              <Field label="Languages" hint="Comma separated"><Input value={f.languages} onChange={set('languages')} /></Field>
              <Field label="Playstyles" hint="e.g. Chill, Tryhard"><Input value={f.playstyles} onChange={set('playstyles')} /></Field>
            </div>
            <Check checked={f.voiceAvailable} onChange={(e) => setF({ ...f, voiceAvailable: e.target.checked })}>Voice available</Check>
            <label style={{ cursor: 'pointer', fontSize: 'var(--tv-fs-sm)', fontWeight: 600, color: 'var(--tv-violet-hi)', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <Icon name="image" size={16} />
              {banner.isPending ? 'Uploading banner…' : 'Upload cover banner'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="tv-sr-only" onChange={(e) => e.target.files?.[0] && banner.mutate(e.target.files[0])} />
            </label>
          </div>
        </Panel>
        <Panel title="Loadout" icon="gamepad">
          <div className={k.stackSm}>
            {gameRows.map((g, i) => {
              const game = games.data?.find((x) => x.id === g.gameId);
              return (
                <div key={i} className={k.formGrid}>
                  <Select value={g.gameId} onChange={(e) => row(i, { gameId: e.target.value })} aria-label="Game">
                    <option value="">Remove</option>
                    {games.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </Select>
                  <Select value={g.rank} onChange={(e) => row(i, { rank: e.target.value })} aria-label="Rank">
                    <option value="">No rank</option>
                    {game?.ranks.map((r) => <option key={r}>{r}</option>)}
                  </Select>
                  <Input placeholder="Roles, comma separated" value={g.roles} onChange={(e) => row(i, { roles: e.target.value })} aria-label="Roles" />
                </div>
              );
            })}
            {gameRows.length < 10 && (
              <div>
                <Button size="sm" variant="secondary" icon="plus" onClick={() => setGameRows([...gameRows, { gameId: '', rank: '', roles: '' }])}>Add game</Button>
              </div>
            )}
          </div>
        </Panel>
        <ErrorNote error={save.error ? errorMessage(save.error) : banner.error ? errorMessage(banner.error) : null} />
        <div>
          <Button loading={save.isPending} onClick={() => save.mutate()} icon={save.isSuccess ? 'check' : undefined}>{save.isSuccess ? 'Saved' : 'Save profile'}</Button>
        </div>
      </div>
    </div>
  );
}
