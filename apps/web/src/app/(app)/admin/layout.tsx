'use client';
import { NavTabs } from '@/components/ui';
import { RequireRole, useSession } from '@/lib/session';

const TABS: [string, string, 'admin' | 'moderator'][] = [
  ['/admin', 'Overview', 'admin'],
  ['/admin/users', 'Users', 'moderator'],
  ['/admin/applications', 'Applications', 'admin'],
  ['/admin/orders', 'Orders & disputes', 'admin'],
  ['/admin/payments', 'Payments & ledger', 'admin'],
  ['/admin/payouts', 'Payouts', 'admin'],
  ['/admin/gifts', 'Gifts & coins', 'admin'],
  ['/admin/cosmetics', 'Cosmetics', 'admin'],
  ['/admin/games', 'Games', 'admin'],
  ['/admin/rooms', 'Voice rooms', 'moderator'],
  ['/admin/reports', 'Reports', 'moderator'],
  ['/admin/settings', 'Settings', 'admin'],
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { has } = useSession();
  return (
    <RequireRole role="moderator">
      <NavTabs items={TABS.filter(([, , r]) => has(r)).map(([href, label]) => [href, label] as const)} label="Administration" />
      {children}
    </RequireRole>
  );
}
