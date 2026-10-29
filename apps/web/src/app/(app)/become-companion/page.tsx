'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS, type ServiceCategory } from '@tavern/shared';
import { useState } from 'react';
import { Badge, Button, Check, Chip, Chips, ErrorNote, Field, Input, PageHeader, Panel, Select, Skeleton, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { RequireRole, useSession } from '@/lib/session';
import k from '@/styles/layout.module.css';

export default function BecomeCompanionPage() {
  return (
    <RequireRole>
      <Application />
    </RequireRole>
  );
}

function Application() {
  const { me, has } = useSession();
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: ['application'], queryFn: () => api.applications.mine() });
  const games = useQuery({ queryKey: ['games'], queryFn: () => api.games.list() });
  const [f, setF] = useState({ displayName: me?.displayName ?? '', headline: '', introduction: '', gameId: '', rank: '', role: '', languages: 'Filipino, English', price: '150', voiceCapable: true });
  const [cats, setCats] = useState<ServiceCategory[]>(['ranked_duo']);
  const [ack, setAck] = useState({ adult: false, noAccountSharing: false, nonRomantic: false, guidelines: false });
  const game = games.data?.find((g) => g.id === f.gameId);
  const submit = useMutation({
    mutationFn: () =>
      api.applications.submit({
        displayName: f.displayName,
        headline: f.headline,
        introduction: f.introduction,
        games: [{ gameId: f.gameId, rank: f.rank || undefined, roles: f.role ? [f.role] : [] }],
        categories: cats,
        languages: f.languages.split(',').map((s) => s.trim()).filter(Boolean),
        proposedPriceCentavos: Math.round(Number(f.price) * 100),
        voiceCapable: f.voiceCapable,
        acknowledgements: ack as any,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['application'] }),
  });

  if (has('companion'))
    return (
      <Panel title="You&apos;re already a companion" icon="verified">
        <Button href="/companion/dashboard" icon="gauge">Go to dashboard</Button>
      </Panel>
    );
  if (mine.isPending) return <Skeleton style={{ height: 256 }} />;
  if (mine.data && ['submitted', 'under_review'].includes(mine.data.status))
    return (
      <div className={k.narrow}>
        <Panel>
          <Badge tone="amber">{mine.data.status.replace('_', ' ')}</Badge>
          <h1 className={k.h2} style={{ marginTop: 12 }}>Application received</h1>
          <p className={k.muted} style={{ marginTop: 8 }}>Our team reviews applications within a few days. We&apos;ll notify you when there&apos;s a decision.</p>
        </Panel>
      </div>
    );

  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [key]: e.target.value });
  const allAck = Object.values(ack).every(Boolean);

  return (
    <div className={k.narrow}>
      <PageHeader eyebrow="Earn" title="Become a companion" subtitle="Play the games you love, help others climb, and earn." />
      {mine.data?.status === 'rejected' && <ErrorNote error={`Your previous application was not approved${mine.data.decisionNote ? `: ${mine.data.decisionNote}` : '.'} You can apply again.`} />}
      {!me?.emailVerified && <p className={k.quote} style={{ marginBottom: 16, color: 'var(--tv-amber)' }}>Verify your email before applying (see the banner above).</p>}
      <form className={k.stack} onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
        <Panel title="You" icon="user">
          <div className={k.form}>
          <Field label="Display name"><Input required maxLength={40} value={f.displayName} onChange={set('displayName')} /></Field>
          <Field label="Headline" hint="One line players see on your card."><Input required maxLength={80} value={f.headline} onChange={set('headline')} placeholder="Mythic jungler · chill comms" /></Field>
          <Field label="Introduction" hint="At least 20 characters. Tell players how you play and what a session with you is like."><Textarea required minLength={20} maxLength={1000} value={f.introduction} onChange={set('introduction')} /></Field>
          </div>
        </Panel>
        <Panel title="Your game" icon="gamepad">
          <div className={k.form}>
          <Field label="Main game">
            <Select required value={f.gameId} onChange={set('gameId')}><option value="">Choose a game</option>{games.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
          </Field>
          <div className={k.formGrid}>
            <Field label="Rank"><Select value={f.rank} onChange={set('rank')} disabled={!game}><option value="">—</option>{game?.ranks.map((r) => <option key={r}>{r}</option>)}</Select></Field>
            <Field label="Main role"><Select value={f.role} onChange={set('role')} disabled={!game}><option value="">—</option>{game?.roles.map((r) => <option key={r}>{r}</option>)}</Select></Field>
          </div>
          <div>
            <p className={k.small} style={{ fontWeight: 550, marginBottom: 8 }}>Services you want to offer</p>
            <Chips label="Services">
              {SERVICE_CATEGORIES.map((c) => (
                <Chip key={c} pressed={cats.includes(c)} onClick={() => setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])}>
                  {SERVICE_CATEGORY_LABELS[c]}
                </Chip>
              ))}
            </Chips>
            <p className={k.fine} style={{ marginTop: 8 }}>Voice Companion is a non-romantic social conversation service.</p>
          </div>
          <div className={k.formGrid}>
            <Field label="Languages" hint="Comma separated"><Input value={f.languages} onChange={set('languages')} /></Field>
            <Field label="Proposed price per hour (₱)"><Input type="number" min={10} max={10000} required value={f.price} onChange={set('price')} /></Field>
          </div>
          <Check checked={f.voiceCapable} onChange={(e) => setF({ ...f, voiceCapable: e.target.checked })}>I can use voice chat during sessions</Check>
          </div>
        </Panel>
        <Panel title="Agreements" icon="shield-check">
          <div className={k.stackSm}>
          {(
            [
              ['adult', 'I am at least 18 years old.'],
              ['noAccountSharing', 'I will never ask for or use a customer’s game account credentials.'],
              ['nonRomantic', 'My services are gaming, coaching or non-romantic social interaction only.'],
              ['guidelines', 'I agree to the Community Guidelines and companion terms.'],
            ] as const
          ).map(([key, label]) => (
            <Check key={key} checked={ack[key]} onChange={(e) => setAck({ ...ack, [key]: e.target.checked })}>{label}</Check>
          ))}
          </div>
        </Panel>
        <ErrorNote error={submit.error ? errorMessage(submit.error) : null} />
        <Button type="submit" size="lg" loading={submit.isPending} disabled={!allAck || !cats.length || !me?.emailVerified} icon="sparkle">Submit application</Button>
      </form>
    </div>
  );
}
