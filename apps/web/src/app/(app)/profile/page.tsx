'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/icon';
import { Avatar, Badge, Button, cn } from '@/components/ui';
import { api } from '@/lib/api';
import { RequireRole, useSession } from '@/lib/session';
import k from '@/styles/layout.module.css';
import s from './profile.module.css';

export default function ProfilePage() {
  return (
    <RequireRole>
      <Profile />
    </RequireRole>
  );
}

function Profile() {
  const { me, has, signOut } = useSession();
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: () => api.wallet.summary() });
  const following = useQuery({ queryKey: ['following'], queryFn: () => api.companions.following() });
  const orders = useQuery({ queryKey: ['orders', 'customer', 'active'], queryFn: () => api.orders.mine({ as: 'customer', status: 'active' }) });
  if (!me) return null;
  const companion = has('companion');
  const staff = has('moderator') || has('admin');

  return (
    <div className={s.wrap}>
      <section className={cn('tv-plate', s.card)}>
        <div className={s.banner} />
        <div className={s.top}>
          <Avatar name={me.displayName} src={me.avatarUrl} size={88} ring="var(--tv-plate)" />
          <div className={k.cluster}>
            {companion && <Button variant="secondary" size="sm" href={`/c/${me.username}`} icon="external">Public profile</Button>}
            <Button variant="secondary" size="sm" href="/settings" icon="settings">Edit</Button>
          </div>
        </div>
        <div className={s.who}>
          <h1 className={s.name}>{me.displayName}</h1>
          <p className={cn(k.small, k.muted)}>@{me.username}</p>
          <div className={s.tags}>
            {companion && <Badge tone="violet">Companion</Badge>}
            {staff && <Badge tone="gold">Staff</Badge>}
            {!me.emailVerified && <Badge tone="amber">Email not verified</Badge>}
          </div>
          {me.bio && <p className={s.bio}>{me.bio}</p>}
        </div>
        <dl className={s.readouts}>
          <Readout href="/wallet" label="Coins" value={wallet.data?.balance.toLocaleString()} />
          <Readout href="/favorites" label="Following" value={following.data?.length} />
          <Readout href="/orders" label="Active orders" value={orders.data?.total} />
        </dl>
      </section>

      <nav className={k.rows} aria-label="Your account">
        <Row href="/orders" icon="orders" label="Orders" />
        <Row href="/wallet" icon="wallet" label="Wallet & gifts" />
        <Row href="/notifications" icon="bell" label="Notifications" />
        <Row href="/favorites" icon="heart" label="Following" />
        <Row href="/settings" icon="settings" label="Settings" />
      </nav>

      <nav className={k.rows} aria-label="More">
        {companion ? <Row href="/companion/dashboard" icon="gauge" label="Companion dashboard" /> : <Row href="/become-companion" icon="sparkle" label="Become a companion" />}
        {staff && <Row href="/admin" icon="shield" label="Administration" />}
        <button type="button" onClick={signOut} className={cn(k.row, s.signOut)}>
          <Icon name="logout" size={20} /> Sign out
        </button>
      </nav>
    </div>
  );
}

function Readout({ href, label, value }: { href: string; label: string; value?: number | string }) {
  return (
    <Link href={href} className={s.readout}>
      <dd><strong>{value ?? '—'}</strong></dd>
      <dt className="tv-label">{label}</dt>
    </Link>
  );
}

function Row({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link href={href} className={k.row}>
      <Icon name={icon} size={20} className={s.go} />
      <span>{label}</span>
      <Icon name="chevron" size={18} className={s.chev} />
    </Link>
  );
}
