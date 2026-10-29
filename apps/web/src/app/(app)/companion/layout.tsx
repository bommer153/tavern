'use client';
import { NavTabs } from '@/components/ui';
import { RequireRole } from '@/lib/session';

const TABS = [
  ['/companion/dashboard', 'Dashboard'],
  ['/companion/orders', 'Orders'],
  ['/companion/services', 'Services'],
  ['/companion/earnings', 'Earnings & payouts'],
  ['/companion/reviews', 'Reviews'],
  ['/companion/profile', 'Profile'],
] as const;

export default function CompanionLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="companion">
      <NavTabs items={TABS} label="Companion" />
      {children}
    </RequireRole>
  );
}
