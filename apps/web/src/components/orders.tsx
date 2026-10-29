'use client';
import type { Order } from '@tavern/shared';
import Link from 'next/link';
import { formatPhp } from '@/lib/api';
import k from '@/styles/layout.module.css';
import { OrderStatusBadge } from './domain';
import { Avatar } from './ui';

export function OrderList({ orders, as }: { orders: Order[]; as: 'customer' | 'companion' }) {
  return (
    <ul className={k.rows}>
      {orders.map((o) => {
        const other = as === 'customer' ? o.companion : o.customer;
        return (
          <li key={o.id}>
            <Link href={`/orders/${o.id}`} className={k.row}>
              <Avatar name={other.displayName} src={other.avatarUrl} size={44} />
              <div className={k.rowMain}>
                <p className={k.rowTitle}>
                  {other.displayName} <span className={k.muted} style={{ fontWeight: 400 }}>· {o.service.title}</span>
                </p>
                <p className={k.rowMeta}>
                  {o.service.gameName} · {o.durationMinutes} min · {o.scheduledStart ? new Date(o.scheduledStart).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : 'Play now'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p className={k.mono}>{formatPhp(as === 'companion' ? o.amounts.companionEarning : o.amounts.total)}</p>
                <p className={k.fine}>{as === 'companion' ? 'your earning' : `${o.paidWithCoins} coins`}</p>
              </div>
              <OrderStatusBadge status={o.status} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
