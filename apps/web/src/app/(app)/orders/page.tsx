'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { OrderList } from '@/components/orders';
import { Button, Empty, ErrorNote, PageHeader, Skeleton, Tabs } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { RequireRole } from '@/lib/session';
import k from '@/styles/layout.module.css';

// 'active' and 'past' are server buckets covering every status; the rest filter one exact status.
const TABS = [
  { value: 'active', label: 'All active' },
  { value: 'pending_acceptance', label: 'Pending' },
  { value: 'accepted', label: 'Upcoming' },
  { value: 'in_progress', label: 'In session' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'past', label: 'All history' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export default function OrdersPage() {
  const [tab, setTab] = useState<Tab>('active');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['orders', 'customer', tab, page], queryFn: () => api.orders.mine({ as: 'customer', status: tab, page }) });
  return (
    <RequireRole>
      <PageHeader eyebrow="Sessions" title="Orders" subtitle="Your bookings with companions." />
      <Tabs label="Order status" value={tab} onChange={(v) => { setTab(v); setPage(1); }} items={[...TABS]} />
      <div style={{ marginTop: 20 }} className={k.stackSm}>
        <ErrorNote error={q.error ? errorMessage(q.error) : null} onRetry={() => q.refetch()} retrying={q.isFetching} />
        {q.isPending ? (
          <Skeleton style={{ height: 160 }} />
        ) : q.data?.items.length ? (
          <>
            <OrderList orders={q.data.items} as="customer" />
            <div className={k.center}>
              {page > 1 && <Button variant="secondary" onClick={() => setPage(page - 1)}>Previous</Button>}
              {q.data.hasMore && <Button variant="secondary" onClick={() => setPage(page + 1)}>Next</Button>}
            </div>
          </>
        ) : (
          <Empty icon="orders" title="Nothing here" body="Find someone to play with and book your first session." action={<Button href="/discover">Discover people</Button>} />
        )}
      </div>
    </RequireRole>
  );
}
