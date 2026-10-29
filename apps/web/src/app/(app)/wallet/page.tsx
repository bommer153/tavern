'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/icon';
import { Badge, Button, cn, Empty, ErrorNote, PageHeader, Skeleton, Tabs } from '@/components/ui';
import { api, errorMessage, formatPhp, newKey } from '@/lib/api';
import { RequireRole } from '@/lib/session';
import k from '@/styles/layout.module.css';
import s from './wallet.module.css';

const TYPE_LABEL: Record<string, string> = { topup: 'Top-up', order_payment: 'Order payment', order_refund: 'Refund', gift_sent: 'Gift', adjustment: 'Adjustment' };
const TYPE_ICON: Record<string, IconName> = { topup: 'coin', order_payment: 'orders', order_refund: 'retry', gift_sent: 'gift', adjustment: 'sliders' };

export default function WalletPage() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const paymentId = params.get('payment');
  const [tab, setTab] = useState<'packages' | 'history'>('packages');
  const [page, setPage] = useState(1);
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: () => api.wallet.summary() });
  const packages = useQuery({ queryKey: ['packages'], queryFn: () => api.wallet.packages() });
  const history = useQuery({ queryKey: ['wallet', 'history', page], queryFn: () => api.wallet.transactions(page), enabled: tab === 'history' });
  // After returning from checkout, poll the payment until the verified webhook credits it.
  const payment = useQuery({
    queryKey: ['payment', paymentId],
    queryFn: () => api.payments.get(paymentId!),
    enabled: !!paymentId,
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 3000 : false),
  });
  useEffect(() => {
    if (payment.data?.status === 'paid') qc.invalidateQueries({ queryKey: ['wallet'] });
  }, [payment.data?.status, qc]);

  const [buying, setBuying] = useState<string | null>(null);
  const checkout = useMutation({
    mutationFn: (packageId: string) => {
      setBuying(packageId);
      return api.payments.checkout(packageId, newKey());
    },
    onSuccess: (r) => window.location.assign(r.checkoutUrl),
    onSettled: () => setBuying(null),
  });

  return (
    <RequireRole>
      <PageHeader eyebrow="Coins" title="Wallet" subtitle="Coins pay for sessions and gifts on Tavern." />
      {paymentId && payment.data && !params.get('cancelled') && (
        <p className={cn(s.status, payment.data.status === 'paid' ? s.paid : s.pending)} role="status">
          {payment.data.status === 'paid' ? `Payment confirmed — ${payment.data.coins} coins added.` : payment.data.status === 'pending' ? 'Waiting for payment confirmation from the provider…' : `Payment ${payment.data.status}.`}
        </p>
      )}
      <section className={cn('tv-plate', s.vault)}>
        <Icon name="coin" size={64} className={s.coinMark} />
        <div>
          <p className="tv-label">Available balance</p>
          {wallet.isPending ? <Skeleton style={{ height: 44, width: 180, marginTop: 6 }} /> : <p className={s.balance}>{wallet.data?.balance.toLocaleString() ?? '—'}</p>}
          {wallet.data && <p className={k.fine}>1 coin = {formatPhp(wallet.data.coinValueCentavos)} when booking sessions</p>}
        </div>
      </section>
      <ErrorNote error={wallet.error ? errorMessage(wallet.error) : null} onRetry={() => wallet.refetch()} retrying={wallet.isFetching} />

      <div style={{ marginTop: 24 }}>
        <Tabs label="Wallet" value={tab} onChange={setTab} items={[{ value: 'packages', label: 'Top up' }, { value: 'history', label: 'Transaction history' }]} />
      </div>

      {tab === 'packages' ? (
        <div style={{ marginTop: 20 }}>
          <ErrorNote error={checkout.error ? errorMessage(checkout.error) : packages.error ? errorMessage(packages.error) : null} onRetry={packages.error ? () => packages.refetch() : undefined} />
          <div className={s.packs}>
            {packages.isPending
              ? [1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 150 }} />)
              : packages.data?.map((p) => (
                  <article key={p.id} className={cn('tv-plate', s.pack)}>
                    <div className={s.packTop}>
                      <p className={s.amount}><Icon name="coin" size={22} />{p.coins.toLocaleString()}</p>
                      {p.bonusCoins > 0 && <Badge tone="gold">+{p.bonusCoins} bonus</Badge>}
                    </div>
                    <p className={cn(k.small, k.muted)}>{formatPhp(p.priceCentavos)}</p>
                    <Button className={s.buy} loading={buying === p.id} disabled={!!buying} onClick={() => checkout.mutate(p.id)}>Buy</Button>
                  </article>
                ))}
          </div>
          <p className={k.fine} style={{ marginTop: 16 }}>
            Payments are processed by our payment partner (GCash, Maya, cards). Coins are credited only after the provider confirms payment. Coins have no cash value, are
            non-transferable, and are refundable only as described in the Terms.
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 20 }} className={k.stackSm}>
          <ErrorNote error={history.error ? errorMessage(history.error) : null} onRetry={() => history.refetch()} retrying={history.isFetching} />
          {history.isPending ? (
            <Skeleton style={{ height: 200 }} />
          ) : history.data?.items.length ? (
            <ul className={k.rows}>
              {history.data.items.map((t) => (
                <li key={t.id} className={k.row}>
                  <span className={s.txIcon}><Icon name={TYPE_ICON[t.type] ?? 'receipt'} size={16} /></span>
                  <div className={k.rowMain}>
                    <p className={cn(k.rowTitle, k.small)}>{t.description || TYPE_LABEL[t.type]}</p>
                    <p className={k.fine}>{TYPE_LABEL[t.type] ?? t.type} · {new Date(t.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  </div>
                  <div className={s.figure}>
                    <p className={cn(k.mono, t.amount > 0 && s.credit)}>{t.amount > 0 ? '+' : ''}{t.amount.toLocaleString()}</p>
                    <p className={k.fine}>bal {t.balanceAfter.toLocaleString()}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            !history.error && <Empty icon="receipt" title="No transactions yet" body="Top-ups, bookings and gifts will be listed here." />
          )}
          <div className={k.center}>
            {page > 1 && <Button variant="secondary" onClick={() => setPage(page - 1)}>Newer</Button>}
            {history.data?.hasMore && <Button variant="secondary" onClick={() => setPage(page + 1)}>Older</Button>}
          </div>
        </div>
      )}
    </RequireRole>
  );
}
