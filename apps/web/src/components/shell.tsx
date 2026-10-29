'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, type ReactNode, useId, useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Icon, type IconName } from './icon';
import s from './shell.module.css';
import { Avatar, Button, cn, IconButton, Menu, MenuItem, MenuSeparator, SearchField } from './ui';

/** Tavern emblem: two T halves split by a slit, forming a shield around an inner shield (vector of assets/images/logo.jpg). */
export function Emblem({ size = 30 }: { size?: number }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id={`${id}l`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#B65CFF" />
          <stop offset="1" stopColor="#6A1CF6" />
        </linearGradient>
        <linearGradient id={`${id}r`} x1="0.2" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#FBD6FF" />
          <stop offset="0.45" stopColor="#E06AF5" />
          <stop offset="1" stopColor="#9A3BE2" />
        </linearGradient>
      </defs>
      <g stroke="#0B0A22" strokeWidth="0.6" strokeLinejoin="miter" paintOrder="stroke">
        <path d="M2 6h13.2v5.7h-3.4v8.8l3.4 2v3.2l-8-4.4v-8.6H4.3z" fill={`url(#${id}l)`} />
        <path d="M30 6H16.8v5.7h3.4v8.8l-3.4 2v3.2l8-4.4v-8.6h2.9z" fill={`url(#${id}r)`} />
      </g>
      <path d="M13.4 12.6h5.2v7L16 21.4l-2.6-1.8z" fill="none" stroke="#9B6BFF" strokeWidth="0.6" />
    </svg>
  );
}

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn(s.logo, className)} aria-label="Tavern home">
      <Emblem />
      <span className={s.wordmark}>Tavern</span>
    </Link>
  );
}

type Dest = { href: string; label: string; icon: IconName; badge?: number; gold?: boolean };
const isActive = (path: string, href: string) => path === href || path.startsWith(href + '/') || (href === '/companion/dashboard' && path.startsWith('/companion'));

function useCounts(enabled: boolean) {
  const notifications = useQuery({ queryKey: ['notifications', 'count'], queryFn: () => api.notifications.list(), enabled, refetchInterval: 60_000 });
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: () => api.conversations.list(), enabled });
  return { notifications: notifications.data?.unread ?? 0, messages: conversations.data?.reduce((a, c) => a + c.unread, 0) ?? 0 };
}

export function AppShell({ children }: { children: ReactNode }) {
  const { me, has, signOut } = useSession();
  const path = usePathname();
  const router = useRouter();
  const counts = useCounts(!!me);
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: () => api.wallet.summary(), enabled: !!me });
  const companion = has('companion');
  const staff = has('moderator') || has('admin');

  const tabs: Dest[] = [
    { href: '/home', label: 'Home', icon: 'home' },
    { href: '/discover', label: 'Discover', icon: 'discover' },
    { href: '/rooms', label: 'Voice', icon: 'mic' },
    { href: me ? '/messages' : '/login?next=/messages', label: 'Messages', icon: 'chat', badge: counts.messages },
    ...(companion ? [{ href: '/companion/dashboard', label: 'Companion', icon: 'gauge' as const, gold: true }] : []),
  ];
  const profile: Dest = { href: me ? '/profile' : '/login', label: me ? 'Profile' : 'Sign in', icon: 'user' };
  const dock: Dest[] = [tabs[0], tabs[2], tabs[3], profile];
  const rail: Dest[] = [...tabs, ...(me ? [{ href: '/wallet', label: 'Wallet', icon: 'wallet' as const }, { href: '/favorites', label: 'Following', icon: 'heart' as const }] : [])];

  return (
    <div className={s.frame}>
      <nav className={s.rail} aria-label="Main">
        <Link href="/home" className={s.railLogo} aria-label="Tavern home">
          <Emblem size={34} />
        </Link>
        {rail.map((t) => (
          <Link key={t.label} href={t.href} className={cn(s.railItem, t.gold && s.railGold)} aria-current={isActive(path, t.href) ? 'page' : undefined}>
            <Icon name={t.icon} size={20} />
            <span className={s.railLabel}>{t.label}</span>
            {!!t.badge && <span className={cn(s.badge, s.railBadge)}>{t.badge > 99 ? '99+' : t.badge}</span>}
          </Link>
        ))}
      </nav>
      <div className={s.column}>
      <header className={s.bar}>
        <Logo href="/home" className={s.barLogo} />
        <form
          role="search"
          className={s.search}
          onSubmit={(e) => {
            e.preventDefault();
            const q = new FormData(e.currentTarget).get('q')?.toString().trim();
            router.push(q ? `/discover?q=${encodeURIComponent(q)}` : '/discover');
          }}
        >
          <SearchField name="q" placeholder="Players, games, vibes" aria-label="Search Tavern" />
        </form>
        <div className={s.actions}>
          <IconButton icon="search" label="Search" href="/discover" className={s.searchIcon} />
          {me === null && (
            <div className={s.authLinks}>
              <Button variant="ghost" size="sm" href="/login">Sign in</Button>
              <Button size="sm" href="/register">Join</Button>
            </div>
          )}
          {me && (
            <>
              <Link href="/wallet" className={s.coins} aria-label={`Wallet, ${wallet.data?.balance ?? 0} coins`}>
                <Icon name="coin" size={16} />
                {wallet.data?.balance?.toLocaleString() ?? '—'}
              </Link>
              <IconButton icon="bell" href="/notifications" dot={counts.notifications > 0} label={`Notifications${counts.notifications ? `, ${counts.notifications} unread` : ''}`} />
              <Menu
                label="Account"
                trigger={(p) => (
                  <button type="button" className={s.avatarBtn} aria-label="Account menu" {...p}>
                    <Avatar name={me.displayName} src={me.avatarUrl} size={34} />
                  </button>
                )}
              >
                <Link href="/profile" className={s.menuHead} role="menuitem">
                  <span className={s.menuName}>{me.displayName}</span>
                  <br />
                  <span className={s.menuHandle}>@{me.username}</span>
                </Link>
                <MenuSeparator />
                <MenuItem href="/orders" icon="orders">Orders</MenuItem>
                <MenuItem href="/wallet" icon="wallet">Wallet & gifts</MenuItem>
                <MenuItem href="/favorites" icon="heart">Following</MenuItem>
                <MenuItem href="/customize" icon="palette">Customize</MenuItem>
                <MenuItem href="/notifications" icon="bell">Notifications</MenuItem>
                <MenuItem href="/settings" icon="settings">Settings</MenuItem>
                <MenuSeparator />
                {companion ? <MenuItem href="/companion/dashboard" icon="gauge">Companion dashboard</MenuItem> : <MenuItem href="/become-companion" icon="sparkle">Become a companion</MenuItem>}
                {staff && <MenuItem href="/admin" icon="shield">Administration</MenuItem>}
                <MenuItem icon="logout" danger onClick={signOut}>Sign out</MenuItem>
              </Menu>
            </>
          )}
        </div>
      </header>

      {me && !me.emailVerified && <VerifyBanner />}
      <main className={s.main}>{children}</main>
      </div>

      <nav className={s.dock} aria-label="Primary">
        {dock.map((t, i) => (
          <Fragment key={t.label}>
            {i === 2 && (
              <Link href="/discover" className={s.core} aria-label="Find someone to play with">
                <Emblem size={30} />
              </Link>
            )}
            <Link href={t.href} className={s.dockItem} aria-current={isActive(path, t.href) ? 'page' : undefined}>
              <span className={s.well}>
                <Icon name={t.icon} size={21} />
                {!!t.badge && <span className={cn(s.badge, s.dockBadge)}>{t.badge > 99 ? '99+' : t.badge}</span>}
              </span>
              {t.label}
            </Link>
          </Fragment>
        ))}
      </nav>
    </div>
  );
}

function VerifyBanner() {
  const [sent, setSent] = useState(false);
  return (
    <div className={s.verify}>
      Verify your email to secure your account and apply as a companion.
      <button type="button" disabled={sent} onClick={() => api.auth.resendVerification().then(() => setSent(true))}>
        {sent ? 'Email sent' : 'Resend email'}
      </button>
    </div>
  );
}
