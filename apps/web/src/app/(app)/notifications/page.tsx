'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@tavern/shared';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/icon';
import { Button, Empty, ErrorNote, PageHeader, Skeleton } from '@/components/ui';
import { api, errorMessage, timeAgo } from '@/lib/api';
import { RequireRole } from '@/lib/session';
import k from '@/styles/layout.module.css';

/** Glyph per notification, chosen from where it points. */
const glyph = (n: Notification): IconName => {
  const l = n.link ?? '';
  return l.startsWith('/orders') ? 'orders' : l.startsWith('/messages') ? 'chat' : l.startsWith('/rooms') ? 'mic' : l.startsWith('/wallet') ? 'coin' : l.startsWith('/c/') ? 'user' : 'bell';
};

export default function NotificationsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => api.notifications.list() });
  const read = useMutation({ mutationFn: () => api.notifications.markRead(), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  return (
    <RequireRole>
      <PageHeader
        eyebrow="Activity"
        title="Notifications"
        action={q.data?.unread ? <Button variant="secondary" size="sm" loading={read.isPending} onClick={() => read.mutate()} icon="check">Mark all read</Button> : undefined}
      />
      <ErrorNote error={q.error ? errorMessage(q.error) : null} onRetry={() => q.refetch()} retrying={q.isFetching} />
      {q.isPending ? (
        <Skeleton style={{ height: 200 }} />
      ) : q.data?.items.length ? (
        <ul className={k.rows}>
          {q.data.items.map((n) => {
            const body = (
              <>
                <Icon name={glyph(n)} size={20} style={{ color: n.readAt ? 'var(--tv-ink-3)' : 'var(--tv-violet-hi)' }} />
                <div className={k.rowMain}>
                  <p className={k.strong} style={{ fontWeight: n.readAt ? 500 : 650 }}>{n.title}</p>
                  <p className={`${k.small} ${k.muted}`}>{n.body}</p>
                </div>
                <span className={k.fine} style={{ whiteSpace: 'nowrap' }}>{timeAgo(n.createdAt)}</span>
                {!n.readAt && <span aria-label="Unread" role="img" style={{ width: 8, height: 9, background: 'var(--tv-pink)', clipPath: 'var(--tv-hex)', flexShrink: 0 }} />}
              </>
            );
            return (
              <li key={n.id}>
                {n.link ? (
                  <Link href={n.link} className={k.row}>{body}</Link>
                ) : (
                  <div className={k.row}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        !q.error && <Empty icon="bell" title="You're all caught up" body="Bookings, messages and room invites will show up here." />
      )}
    </RequireRole>
  );
}
