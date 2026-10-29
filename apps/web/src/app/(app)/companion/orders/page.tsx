'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { OrderList } from '@/components/orders';
import { Button, Empty, ErrorNote, PageHeader, Skeleton, Tabs } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import k from '@/styles/layout.module.css';

export default function CompanionOrdersPage() {
  const [tab, setTab] = useState<'pending_acceptance' | 'active' | 'past'>('pending_acceptance');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['orders', 'companion', tab, page], queryFn: () => api.orders.mine({ as: 'companion', status: tab, page }) });
  const items = tab === 'active' ? q.data?.items.filter((o) => o.status !== 'pending_acceptance') : q.data?.items;
  return (
    <div>
      <PageHeader title="Orders" subtitle="Accept requests, run sessions and review your history." />
      <Tabs
        label="Order status"
        value={tab}
        onChange={(v) => {
          setTab(v);
          setPage(1);
        }}
        items={[{ value: 'pending_acceptance', label: 'Requests' }, { value: 'active', label: 'Accepted & in progress' }, { value: 'past', label: 'History' }]}
      />
      <div className={k.stackSm} style={{ marginTop: 20 }}>
        <ErrorNote error={q.error ? errorMessage(q.error) : null} onRetry={() => q.refetch()} retrying={q.isFetching} />
        {q.isPending ? <Skeleton style={{ height: 160 }} /> : items?.length ? <OrderList orders={items} as="companion" /> : !q.error && <Empty icon="list" title="Nothing here yet" />}
        <div className={k.center}>
          {page > 1 && <Button variant="secondary" onClick={() => setPage(page - 1)}>Previous</Button>}
          {q.data?.hasMore && <Button variant="secondary" onClick={() => setPage(page + 1)}>Next</Button>}
        </div>
      </div>
    </div>
  );
}
