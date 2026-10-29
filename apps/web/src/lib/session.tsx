'use client';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Me, Role } from '@tavern/shared';
import { useRouter } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Empty, Skeleton } from '@/components/ui';
import { api, ApiError, SOCKET_URL } from './api';

let browserClient: QueryClient | undefined;
function getQueryClient() {
  const make = () =>
    new QueryClient({
      defaultOptions: {
        queries: { staleTime: 20_000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2, refetchOnWindowFocus: false },
      },
    });
  if (typeof window === 'undefined') return make();
  return (browserClient ??= make());
}

interface Session {
  me: Me | null | undefined; // undefined = loading
  has: (role: Role) => boolean;
  socket: Socket | null;
  signOut: () => Promise<void>;
}
const SessionCtx = createContext<Session>({ me: undefined, has: () => false, socket: null, signOut: async () => {} });
const noSubscribe = () => () => {};
/**
 * The server always renders signed-out-and-loading (the session lives in an HTTP-only cookie the
 * API reads, not Next). Suspense boundaries can hydrate after `me` has already loaded, so while a
 * component is hydrating we report that same loading state, then switch to the real session.
 * Client-side navigations skip this (getSnapshot is used, not the server snapshot).
 */
export function useSession(): Session {
  const ctx = useContext(SessionCtx);
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated ? ctx : { ...ctx, me: undefined, has: () => false };
}

function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.users.me().catch((e) => (e instanceof ApiError && e.status === 401 ? null : Promise.reject(e))),
    staleTime: 60_000,
  });
  const [socket, setSocket] = useState<Socket | null>(null);

  // One socket per signed-in session; cookies authenticate the handshake.
  useEffect(() => {
    if (!me) return;
    const s = io(SOCKET_URL, { withCredentials: true, transports: ['websocket'] });
    s.on('auth_error', async () => {
      if (await api.users.me().then(() => true).catch(() => false)) s.connect();
    });
    s.on('notification', () => qc.invalidateQueries({ queryKey: ['notifications'] }));
    s.on('message:new', () => qc.invalidateQueries({ queryKey: ['conversations'] }));
    s.on('order:updated', (o: { id: string }) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order', o.id] });
    });
    s.on('connect', () => setSocket(s));
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [me?.id, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<Session>(
    () => ({
      me,
      socket,
      has: (role) => !!me?.roles.includes(role) || (role !== 'customer' && !!me?.roles.includes('admin')),
      signOut: async () => {
        await api.auth.logout().catch(() => {});
        qc.clear();
        qc.setQueryData(['me'], null);
        router.push('/');
      },
    }),
    [me, socket, qc, router],
  );
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}

/** Client-side gate for role pages. The API enforces the same rules; this only avoids showing dead screens. */
export function RequireRole({ role, children }: { role?: Role; children: ReactNode }) {
  const { me, has } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (me === null) router.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
  }, [me, router]);
  if (me === undefined) return <Skeleton style={{ height: 160 }} />;
  if (!me) return null;
  if (role && !has(role))
    return (
      <div style={{ maxWidth: 440, margin: '0 auto', padding: '64px 0' }}>
        <Empty icon="lock" title={"This area isn't available for your account."} body="If you think this is a mistake, contact support." />
      </div>
    );
  return <>{children}</>;
}
