'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Me } from '@tavern/shared';
import { useState } from 'react';
import { Icon } from '@/components/icon';
import { Avatar, Button, ErrorNote, Field, Input, PageHeader, Panel, Select, Switch, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { RequireRole, useSession } from '@/lib/session';
import k from '@/styles/layout.module.css';

const PUSH_TYPES = [
  ['order', 'Orders and sessions'],
  ['message', 'Messages'],
  ['room', 'Voice room invites'],
  ['gift', 'Gifts'],
  ['payment', 'Payments and refunds'],
  ['payout', 'Payouts'],
] as const;

export default function SettingsPage() {
  const { me, signOut } = useSession();
  return <RequireRole>{me && <SettingsForm me={me} signOut={signOut} />}</RequireRole>;
}

function SettingsForm({ me, signOut }: { me: Me; signOut: () => Promise<void> }) {
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio ?? '');
  const [timezone, setTimezone] = useState(me.settings.timezone);
  const [prefs, setPrefs] = useState(me.notificationPrefs);
  const save = useMutation({
    mutationFn: () => api.users.update({ displayName, bio, settings: { timezone }, notificationPrefs: prefs }),
    onSuccess: (u) => qc.setQueryData(['me'], u),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const { url } = await api.uploads.image(fd);
      return api.users.update({ avatarUrl: url });
    },
    onSuccess: (u) => qc.setQueryData(['me'], u),
  });
  const logoutAll = useMutation({ mutationFn: () => api.auth.logoutAll(), onSuccess: () => signOut() });

  return (
    <div className={k.narrow}>
      <PageHeader eyebrow="Account" title="Profile & settings" />
      <div className={k.stack}>
        <Panel title="Identity" icon="user">
          <div className={k.form}>
            <div className={k.cluster} style={{ gap: 16 }}>
              <Avatar name={me.displayName} src={me.avatarUrl} size={72} />
              <label style={{ cursor: 'pointer', fontSize: 'var(--tv-fs-sm)', fontWeight: 600, color: 'var(--tv-violet-hi)', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <Icon name="image" size={16} />
                {upload.isPending ? 'Uploading…' : 'Change photo'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="tv-sr-only" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
              </label>
            </div>
            <ErrorNote error={upload.error ? errorMessage(upload.error) : null} />
            <Field label="Display name"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} /></Field>
            <Field label="Bio"><Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} /></Field>
            <Field label="Timezone">
              <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {['Asia/Manila', 'Asia/Singapore', 'Asia/Tokyo', 'UTC', 'America/Los_Angeles', 'Europe/London'].map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <p className={`${k.small} ${k.muted}`}>Email: {me.email} {me.emailVerified ? '· verified' : '· not verified'}</p>
          </div>
        </Panel>
        <Panel title="Push notifications (mobile)" icon="bell">
          <p className={`${k.small} ${k.muted}`}>In-app notifications are always kept. Choose which ones also send a push to your phone.</p>
          <div style={{ marginTop: 8 }}>
            {PUSH_TYPES.map(([key, label]) => (
              <Switch key={key} label={label} checked={prefs[`push_${key}`] !== false} onChange={(e) => setPrefs({ ...prefs, [`push_${key}`]: e.target.checked })} />
            ))}
          </div>
        </Panel>
        <ErrorNote error={save.error ? errorMessage(save.error) : null} />
        <div className={k.cluster}>
          <Button loading={save.isPending} onClick={() => save.mutate()} icon={save.isSuccess ? 'check' : undefined}>{save.isSuccess ? 'Saved' : 'Save changes'}</Button>
          <Button variant="secondary" loading={logoutAll.isPending} onClick={() => logoutAll.mutate()} icon="logout">Sign out of all devices</Button>
        </div>
      </div>
    </div>
  );
}
