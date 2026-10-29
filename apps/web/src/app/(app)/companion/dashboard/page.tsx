'use client';
import { useQuery } from '@tanstack/react-query';
import { OrderList } from '@/components/orders';
import { Button, Empty, PageHeader, Panel, SectionHeader, Skeleton, Stars } from '@/components/ui';
import { api, formatPhp } from '@/lib/api';
import k from '@/styles/layout.module.css';

export default function CompanionDashboard() {
  const earnings = useQuery({ queryKey: ['earnings'], queryFn: () => api.earnings.summary() });
  const profile = useQuery({ queryKey: ['companion-self'], queryFn: () => api.companion.profile() });
  const requests = useQuery({ queryKey: ['orders', 'companion', 'pending_acceptance'], queryFn: () => api.orders.mine({ as: 'companion', status: 'pending_acceptance' }) });
  const active = useQuery({ queryKey: ['orders', 'companion', 'active'], queryFn: () => api.orders.mine({ as: 'companion', status: 'active' }) });
  const e = earnings.data;
  const p = profile.data;
  const running = active.data?.items.filter((o) => o.status !== 'pending_acceptance') ?? [];

  return (
    <div className={k.stack}>
      <PageHeader
        eyebrow="Companion"
        title={`Welcome back${p ? `, ${p.displayName}` : ''}`}
        subtitle="Here's how your Tavern is doing."
        action={p && <Button variant="secondary" href={`/c/${p.username}`} icon="external">View public profile</Button>}
      />
      <dl className={`tv-cut ${k.stats}`}>
        <Stat label="Available to withdraw" value={e ? formatPhp(e.availableCentavos) : null} gold />
        <Stat label="Pending settlement" value={e ? formatPhp(e.pendingCentavos) : null} />
        <Stat label="Completed sessions" value={e ? String(e.completedOrders) : null} />
        <div className={k.stat}>
          <dt className="tv-label">Rating</dt>
          <dd>{p ? <Stars value={p.ratingAvg} count={p.ratingCount} /> : <Skeleton style={{ height: 28, width: 96 }} />}</dd>
        </div>
      </dl>
      {p && p.services.length === 0 && (
        <Panel title="Add your first service" icon="sparkle">
          <p className={`${k.small} ${k.muted}`}>Players can order you while you have an active service and you’re online.</p>
          <div style={{ marginTop: 12 }}>
            <Button href="/companion/services" icon="plus">Create a service</Button>
          </div>
        </Panel>
      )}
      <section>
        <SectionHeader title="New requests" href="/companion/orders" />
        {requests.isPending ? <Skeleton style={{ height: 96 }} /> : requests.data?.items.length ? <OrderList orders={requests.data.items} as="companion" /> : <Empty icon="list" title="No new requests" body="Stay online to receive play-now bookings." />}
      </section>
      <section>
        <SectionHeader title="Active sessions" />
        {active.isPending ? <Skeleton style={{ height: 96 }} /> : running.length ? <OrderList orders={running} as="companion" /> : <p className={`${k.small} ${k.muted}`}>Nothing in progress.</p>}
      </section>
      <p className={k.fine}>Platform fee: {e?.commissionPercent ?? '—'}% of each service price. Earnings settle after the dispute window.</p>
    </div>
  );
}

function Stat({ label, value, gold }: { label: string; value: string | null; gold?: boolean }) {
  return (
    <div className={k.stat}>
      <dt className="tv-label">{label}</dt>
      <dd>{value === null ? <Skeleton style={{ height: 28, width: 110 }} /> : <span className={`${k.statValue} ${gold ? k.gold : ''}`}>{value}</span>}</dd>
    </div>
  );
}
