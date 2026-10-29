'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Message } from '@tavern/shared';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, newKey, timeAgo } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Icon } from './icon';
import s from './messages.module.css';
import { Avatar, Badge, Button, cn, Empty, ErrorNote, IconButton, Input, Skeleton } from './ui';

type Pending = Message & { state?: 'sending' | 'failed' };

export function MessagesLayout({ activeId }: { activeId?: string }) {
  const list = useQuery({ queryKey: ['conversations'], queryFn: () => api.conversations.list() });
  return (
    <div className={s.frame}>
      <aside className={cn(s.list, activeId && s.hideNarrow)}>
        <h1 className={s.listHead}>Messages</h1>
        <div className={s.scroll}>
          {list.isPending ? (
            <div style={{ display: 'grid', gap: 8, padding: 12 }}>{[1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 56 }} />)}</div>
          ) : list.data?.length ? (
            list.data.map((c) => (
              <Link key={c.id} href={`/messages/${c.id}`} className={s.conv} aria-current={c.id === activeId ? 'page' : undefined}>
                <Avatar name={c.other.displayName} src={c.other.avatarUrl} size={44} />
                <div className={s.convMain}>
                  <div className={s.convName}>
                    <p>{c.other.displayName}</p>
                    {c.type === 'order' && <Badge tone="violet">Order</Badge>}
                  </div>
                  <p className={cn(s.preview, c.unread > 0 && s.unreadText)}>{c.lastMessage ?? 'Say hi'}</p>
                </div>
                <div className={s.side}>
                  <span className={s.time}>{timeAgo(c.lastMessageAt)}</span>
                  {c.unread > 0 && <span className={s.count}>{c.unread}</span>}
                </div>
              </Link>
            ))
          ) : (
            <div style={{ padding: 16 }}><Empty icon="chat" title="No conversations yet" body="Message a companion from their profile, or chat inside an order." /></div>
          )}
        </div>
      </aside>
      <section className={cn(s.thread, !activeId && s.hideNarrow)}>
        {activeId ? <Thread id={activeId} /> : <div className={s.pick}><Icon name="chat" size={32} style={{ color: 'var(--tv-violet-hi)' }} />Pick a conversation to keep chatting</div>}
      </section>
    </div>
  );
}

function Thread({ id }: { id: string }) {
  const { me, socket } = useSession();
  const qc = useQueryClient();
  const conv = useQuery({ queryKey: ['conversation', id], queryFn: () => api.conversations.get(id) });
  const history = useQuery({ queryKey: ['messages', id], queryFn: () => api.conversations.messages(id) });
  const [pending, setPending] = useState<Pending[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);

  useEffect(() => {
    api.conversations.read(id).then(() => qc.invalidateQueries({ queryKey: ['conversations'] })).catch(() => {});
  }, [id, qc, history.data?.length]);

  useEffect(() => {
    if (!socket) return;
    let t: ReturnType<typeof setTimeout>;
    const onMsg = (m: Message) => {
      if (m.conversationId !== id) return;
      qc.setQueryData<Message[]>(['messages', id], (old = []) => (old.some((x) => x.id === m.id) ? old : [...old, m]));
      setPending((p) => p.filter((x) => x.clientId !== m.clientId));
    };
    const onTyping = (e: { conversationId: string }) => {
      if (e.conversationId !== id) return;
      setTyping(true);
      clearTimeout(t);
      t = setTimeout(() => setTyping(false), 3000);
    };
    // Re-sync after reconnect in case events were missed while offline.
    const onConnect = () => qc.invalidateQueries({ queryKey: ['messages', id] });
    socket.on('message:new', onMsg);
    socket.on('typing', onTyping);
    socket.on('connect', onConnect);
    return () => {
      socket.off('message:new', onMsg);
      socket.off('typing', onTyping);
      socket.off('connect', onConnect);
      clearTimeout(t);
    };
  }, [socket, id, qc]);

  const messages: Pending[] = [...(history.data ?? []), ...pending.filter((p) => !history.data?.some((m) => m.clientId === p.clientId))];
  useEffect(() => {
    // Scroll the log itself; scrollIntoView would also scroll the page and make the composer jump on phones.
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages.length, typing]);

  async function send(body: string, clientId = newKey()) {
    const draft: Pending = { id: clientId, clientId, body, conversationId: id, senderId: me!.id, createdAt: new Date().toISOString(), state: 'sending' };
    setPending((p) => [...p.filter((x) => x.clientId !== clientId), draft]);
    try {
      const m = await api.conversations.send(id, body, clientId);
      qc.setQueryData<Message[]>(['messages', id], (old = []) => (old.some((x) => x.id === m.id) ? old : [...old, m]));
      setPending((p) => p.filter((x) => x.clientId !== clientId));
    } catch {
      setPending((p) => p.map((x) => (x.clientId === clientId ? { ...x, state: 'failed' } : x)));
    }
  }

  return (
    <>
      <header className={s.threadHead}>
        <IconButton href="/messages" icon="back" label="Back" className={s.back} />
        {conv.data && (
          <>
            <Avatar name={conv.data.other.displayName} src={conv.data.other.avatarUrl} size={36} />
            <div className={s.who}>
              {conv.data.other.roles.includes('companion') ? (
                <Link href={`/c/${conv.data.other.username}`} style={{ fontWeight: 600 }}>{conv.data.other.displayName}</Link>
              ) : (
                <p style={{ fontWeight: 600 }}>{conv.data.other.displayName}</p>
              )}
              <p className={typing ? s.typing : s.handle}>{typing ? 'typing…' : `@${conv.data.other.username}`}</p>
            </div>
            {conv.data.orderId && <Button size="sm" variant="secondary" className={s.orderLink} href={`/orders/${conv.data.orderId}`} icon="orders">View order</Button>}
          </>
        )}
      </header>
      <div ref={log} className={s.log} aria-live="polite">
        <ErrorNote error={history.error ? errorMessage(history.error) : null} />
        {history.isPending && <Skeleton style={{ height: 96 }} />}
        {messages.map((m) => {
          const mine = m.senderId === me?.id;
          return (
            <div key={m.clientId} className={cn(s.msg, mine && s.mine)}>
              <div className={cn(s.bubble, m.state === 'sending' && s.sending)}>
                <p>{m.body}</p>
                <p className={s.stamp}>
                  {m.state === 'failed' ? (
                    <button type="button" className={s.retry} onClick={() => send(m.body, m.clientId)}><Icon name="retry" size={12} /> Failed — tap to retry</button>
                  ) : (
                    new Date(m.createdAt).toLocaleTimeString('en-PH', { timeStyle: 'short' })
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <form
        className={s.composer}
        onSubmit={(e) => {
          e.preventDefault();
          const body = text.trim();
          if (!body) return;
          setText('');
          void send(body);
        }}
      >
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (socket && Date.now() - lastTyping.current > 2000) {
              lastTyping.current = Date.now();
              socket.emit('typing', { conversationId: id });
            }
          }}
          maxLength={2000}
          placeholder="Write a message…"
          aria-label="Message"
        />
        <Button type="submit" aria-label="Send" disabled={!text.trim()} icon="send" />
      </form>
    </>
  );
}
