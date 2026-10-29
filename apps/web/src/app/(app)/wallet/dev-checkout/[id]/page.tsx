'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { Icon } from '@/components/icon';
import { Button, cn, ErrorNote, Skeleton } from '@/components/ui';
import { api, errorMessage, formatPhp } from '@/lib/api';
import { RequireRole } from '@/lib/session';
import k from '@/styles/layout.module.css';
import s from '../../wallet.module.css';

/** Development-only sandbox checkout (API refuses this provider in production). */
export default function DevCheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const p = useQuery({ queryKey: ['payment', id], queryFn: () => api.payments.get(id) });
  const pay = useMutation({ mutationFn: () => api.payments.devComplete(id), onSuccess: () => router.replace(`/wallet?payment=${id}`) });
  return (
    <RequireRole>
      <section className={cn('tv-plate', s.sandbox)}>
        <span className={s.sandboxMark}><Icon name="flask" size={24} /></span>
        <h1 className={k.h2}>Sandbox checkout</h1>
        <p className={cn(k.small, k.muted)} style={{ marginTop: 4 }}>Development payment provider — no real money moves. In production this page is replaced by PayMongo checkout.</p>
        {p.isPending ? (
          <Skeleton style={{ height: 40, width: 200, margin: '20px auto 0' }} />
        ) : (
          p.data && (
            <p className={s.exchange}>
              {formatPhp(p.data.amountCentavos)} → {p.data.coins} coins
            </p>
          )
        )}
        <div style={{ marginTop: 16 }}>
          <ErrorNote error={pay.error ? errorMessage(pay.error) : p.error ? errorMessage(p.error) : null} />
        </div>
        <div className={s.pair}>
          <Button variant="secondary" onClick={() => router.replace(`/wallet?payment=${id}&cancelled=1`)}>Cancel</Button>
          <Button loading={pay.isPending} disabled={p.data?.status !== 'pending'} onClick={() => pay.mutate()}>Approve sandbox payment</Button>
        </div>
      </section>
    </RequireRole>
  );
}
