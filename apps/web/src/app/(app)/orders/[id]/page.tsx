'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SERVICE_CATEGORY_LABELS } from '@tavern/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Countdown, GiftPicker, OrderStatusBadge } from '@/components/domain';
import { Icon } from '@/components/icon';
import { Avatar, Button, cn, ErrorNote, Field, Modal, Panel, Skeleton, Textarea } from '@/components/ui';
import { api, errorMessage, formatPhp } from '@/lib/api';
import { RequireRole, useSession } from '@/lib/session';
import k from '@/styles/layout.module.css';
import s from './order.module.css';

type Action = 'accept' | 'decline' | 'cancel' | 'start' | 'complete' | 'dispute';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const qc = useQueryClient();
  // Polling is a fallback; socket "order:updated" events refresh this instantly.
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api.orders.get(id), refetchInterval: 30_000 });
  const [reasonFor, setReasonFor] = useState<Action | null>(null);
  const [gift, setGift] = useState(false);
  const act = useMutation({
    mutationFn: ({ action, reason }: { action: Action; reason?: string }) => api.orders.action(id, action, reason),
    onSuccess: () => {
      setReasonFor(null);
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });

  if (q.isPending) return <Skeleton style={{ height: 320 }} />;
  if (q.error) return <ErrorNote error={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  const o = q.data;
  const isCustomer = me?.id === o.customer.id;
  const other = isCustomer ? o.companion : o.customer;
  const run = (action: Action) => act.mutate({ action });
  const sessionOver = o.endsAt && new Date(o.endsAt).getTime() <= new Date(o.serverNow).getTime();

  const actions: { label: string; action: Action; variant?: 'primary' | 'secondary' | 'danger'; needsReason?: boolean }[] = [];
  if (isCustomer) {
    if (['pending_acceptance', 'accepted'].includes(o.status)) actions.push({ label: 'Cancel order', action: 'cancel', variant: 'danger', needsReason: true });
    if (o.status === 'in_progress') actions.push({ label: 'Mark complete', action: 'complete' });
    if (['in_progress', 'completed'].includes(o.status)) actions.push({ label: 'Report a problem', action: 'dispute', variant: 'secondary', needsReason: true });
  } else {
    if (o.status === 'pending_acceptance') actions.push({ label: 'Accept', action: 'accept' }, { label: 'Decline', action: 'decline', variant: 'danger', needsReason: true });
    if (o.status === 'accepted') actions.push({ label: 'Start session', action: 'start' }, { label: 'Cancel', action: 'cancel', variant: 'danger', needsReason: true });
    if (o.status === 'in_progress' && sessionOver) actions.push({ label: 'End session', action: 'complete' });
  }
  const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <RequireRole>
      <div className={k.split}>
        <div className={k.stack}>
          <section className={cn('tv-plate', s.ticket)}>
            <div className={s.head}>
              <div>
                <p className="tv-label">{o.orderNo}</p>
                <h1 className={s.title}>{o.service.title}</h1>
                <p className={s.sub}>{SERVICE_CATEGORY_LABELS[o.service.category]} · {o.service.gameName} · {o.units} × {o.service.unitMinutes} min</p>
              </div>
              <OrderStatusBadge status={o.status} />
            </div>

            {o.status === 'in_progress' && o.endsAt && (
              <div className={s.clock}>
                <Icon name="timer" size={30} />
                <div>
                  <p className="tv-label" style={{ color: 'var(--tv-cyan)' }}>Time remaining</p>
                  <p className={s.digits}><Countdown endsAt={o.endsAt} serverNow={o.serverNow} /></p>
                </div>
              </div>
            )}
            {o.status === 'pending_acceptance' && (
              <p className={s.waiting}>
                {isCustomer ? `Waiting for ${other.displayName} to accept. If they don't respond in time, your coins are refunded automatically.` : 'A player wants to book you. Accept or decline below.'}
              </p>
            )}

            <dl className={cn(k.stats, s.facts)}>
              <div className={k.stat}><dt className="tv-label">Starts</dt><dd className={s.factValue}>{o.scheduledStart ? when(o.scheduledStart) : 'Play now'}</dd></div>
              <div className={k.stat}><dt className="tv-label">Duration</dt><dd className={s.factValue}>{o.durationMinutes} min</dd></div>
              {o.startedAt && <div className={k.stat}><dt className="tv-label">Started</dt><dd className={s.factValue}>{new Date(o.startedAt).toLocaleTimeString('en-PH', { timeStyle: 'short' })}</dd></div>}
              {o.completedAt && <div className={k.stat}><dt className="tv-label">Completed</dt><dd className={s.factValue}>{when(o.completedAt)}</dd></div>}
            </dl>
            {o.notes && <p className={k.quote} style={{ marginTop: 16 }}>“{o.notes}”</p>}

            <div style={{ marginTop: 16 }}>
              <ErrorNote error={act.error && !reasonFor ? errorMessage(act.error) : null} />
            </div>
            {actions.length > 0 && (
              <div className={s.actions}>
                {actions.map((a) => (
                  <Button key={a.action} variant={a.variant ?? 'primary'} loading={act.isPending && act.variables?.action === a.action} disabled={act.isPending} onClick={() => (a.needsReason ? setReasonFor(a.action) : run(a.action))}>
                    {a.label}
                  </Button>
                ))}
              </div>
            )}
          </section>
          {isCustomer && o.status === 'completed' && !o.reviewed && <ReviewForm orderId={o.id} name={other.displayName} />}
        </div>

        <aside className={k.stack}>
          <Panel>
            <p className="tv-label">{isCustomer ? 'Companion' : 'Customer'}</p>
            <div className={s.party}>
              <Avatar name={other.displayName} src={other.avatarUrl} size={48} />
              <div>
                <p className={k.strong}>{other.displayName}</p>
                <p className={k.fine}>@{other.username}</p>
              </div>
            </div>
            <div className={k.stackSm}>
              {o.conversationId ? (
                <Button variant="secondary" href={`/messages/${o.conversationId}`} icon="chat">Order chat</Button>
              ) : (
                <p className={k.fine}>Order chat opens once the companion accepts.</p>
              )}
              {isCustomer && ['accepted', 'in_progress', 'completed'].includes(o.status) && (
                <Button variant="secondary" onClick={() => setGift(true)} icon="gift">Send a gift</Button>
              )}
              {isCustomer && <Link href={`/c/${other.username}`} className={s.link}>View profile</Link>}
            </div>
          </Panel>
          <Panel title="Payment" icon="receipt">
            <div className={s.receipt}>
              <Line k="Service" v={formatPhp(o.amounts.subtotal)} />
              {o.amounts.serviceFee > 0 && <Line k="Service fee" v={formatPhp(o.amounts.serviceFee)} />}
              <Line k="Total" v={formatPhp(o.amounts.total)} strong />
              <Line k="Paid with" v={`${o.paidWithCoins.toLocaleString()} coins`} />
              {!isCustomer && (
                <>
                  <span className={s.rule} aria-hidden />
                  <Line k="Platform fee" v={`− ${formatPhp(o.amounts.commission)}`} />
                  <Line k="Your earning" v={formatPhp(o.amounts.companionEarning)} strong />
                </>
              )}
            </div>
          </Panel>
          <p className={s.caution}>
            <Icon name="alert" size={16} /> Never share game account passwords. Report anything off-platform.
          </p>
        </aside>
      </div>

      <Modal open={!!reasonFor} onClose={() => setReasonFor(null)} title={reasonFor === 'dispute' ? 'Report a problem' : 'Add a reason'}>
        <ReasonForm required={reasonFor === 'dispute'} busy={act.isPending} error={act.error ? errorMessage(act.error) : null} onSubmit={(reason) => act.mutate({ action: reasonFor!, reason })} />
      </Modal>
      <GiftPicker open={gift} onClose={() => setGift(false)} recipient={{ id: o.companion.id, displayName: o.companion.displayName }} context="order" contextId={o.id} />
    </RequireRole>
  );
}

const Line = ({ k: label, v, strong }: { k: string; v: string; strong?: boolean }) => (
  <div className={cn(s.line, strong && s.strong)}>
    <span>{label}</span>
    <span>{v}</span>
  </div>
);

function ReasonForm({ required, busy, error, onSubmit }: { required: boolean; busy: boolean; error: string | null; onSubmit: (r?: string) => void }) {
  const [text, setText] = useState('');
  return (
    <div className={k.form}>
      <Field label={required ? 'What went wrong?' : 'Reason (optional)'}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
      </Field>
      <ErrorNote error={error} />
      <Button className={k.wide} loading={busy} disabled={required && !text.trim()} onClick={() => onSubmit(text.trim() || undefined)}>
        Submit
      </Button>
    </div>
  );
}

function ReviewForm({ orderId, name }: { orderId: string; name: string }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const m = useMutation({
    mutationFn: () => api.orders.review(orderId, { rating, comment: comment || undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order', orderId] }),
  });
  return (
    <Panel title={`How was your session with ${name}?`} icon="star">
      <div className={s.rate} role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} stars`} onClick={() => setRating(n)} className={n <= rating ? s.on : undefined}>
            <Icon name="star" size={30} />
          </button>
        ))}
      </div>
      <div className={k.form}>
        <Textarea placeholder="Share what made it great (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
        <ErrorNote error={m.error ? errorMessage(m.error) : null} />
        <div>
          <Button loading={m.isPending} onClick={() => m.mutate()}>Submit review</Button>
        </div>
      </div>
    </Panel>
  );
}
