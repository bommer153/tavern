'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ErrorNote, PageHeader, Skeleton } from '@/components/ui';
import { api, errorMessage, formatPhp } from '@/lib/api';
import { useSession } from '@/lib/session';
import k from '@/styles/layout.module.css';

const TILES: [string, string, string][] = [
  ['users', 'Users', '/admin/users'],
  ['companions', 'Approved companions', '/admin/applications'],
  ['pendingApplications', 'Pending applications', '/admin/applications'],
  ['activeOrders', 'Active orders', '/admin/orders'],
  ['disputes', 'Open disputes', '/admin/orders?status=disputed'],
  ['openReports', 'Open reports', '/admin/reports'],
  ['liveRooms', 'Live rooms', '/admin/rooms'],
  ['pendingPayouts', 'Payouts in progress', '/admin/payouts'],
];

export default function AdminOverview() {
  const { has } = useSession();
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api.admin.overview(), enabled: has('admin') });
  if (!has('admin')) return <p className={k.muted}>Use the tabs above to review reports, users and live rooms.</p>;
  return (
    <div className={k.stack}>
      <PageHeader eyebrow="Administration" title="Platform overview" />
      <ErrorNote error={q.error ? errorMessage(q.error) : null} onRetry={() => q.refetch()} retrying={q.isFetching} />
      <dl className={`tv-cut ${k.stats}`}>
        {TILES.map(([key, label, href]) => (
          <Link key={key} href={href} className={k.stat}>
            <dt className="tv-label">{label}</dt>
            <dd>{q.data ? <span className={k.statValue}>{q.data[key]?.toLocaleString()}</span> : <Skeleton style={{ height: 32, width: 64 }} />}</dd>
          </Link>
        ))}
        <div className={k.stat}>
          <dt className="tv-label">Top-up revenue (30 days)</dt>
          <dd>{q.data ? <span className={`${k.statValue} ${k.gold}`}>{formatPhp(q.data.topupRevenue30dCentavos ?? 0)}</span> : <Skeleton style={{ height: 32, width: 120 }} />}</dd>
        </div>
      </dl>
    </div>
  );
}
