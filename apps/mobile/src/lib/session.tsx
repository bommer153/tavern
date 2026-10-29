import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Me, Role } from '@tavern/shared';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { api, ApiError, setSignedOutHandler, SOCKET_URL, tokens } from './api';
import { toAppRoute } from './links';

export { toAppRoute };

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, retry: (n, e) => !(e instanceof ApiError && e.status > 0 && e.status < 500) && n < 2 },
  },
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

interface Session {
  ready: boolean;
  me: Me | null;
  socket: Socket | null;
  has: (r: Role) => boolean;
  signIn: (t: { accessToken?: string; refreshToken?: string; user: Me }) => Promise<void>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<Session>(null as unknown as Session);
export const useSession = () => useContext(Ctx);

/** Registers for push after sign-in. Permission is requested here, after the user is in the app — never on first launch. */
export async function registerPush() {
  try {
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync('default', { name: 'Default', importance: Notifications.AndroidImportance.HIGH });
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.notifications.registerPushToken(data, Platform.OS);
  } catch {
    // Push is optional (simulators, missing EAS project id); in-app notifications still work.
  }
}

function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    tokens.load().then((t) => {
      setHasToken(!!t);
      setReady(true);
    });
    setSignedOutHandler(() => {
      setHasToken(false);
      qc.clear();
    });
  }, [qc]);

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.users.me(), enabled: hasToken });

  // Socket lifecycle follows auth + app foreground state, so it reconnects after backgrounding.
  useEffect(() => {
    if (!me.data) return;
    let s: Socket | null = null;
    const connect = () => {
      s?.disconnect();
      s = io(SOCKET_URL, { transports: ['websocket'], auth: { token: tokens.access() } });
      s.on('auth_error', async () => {
        if (await api.users.me().then(() => true).catch(() => false)) connect(); // refreshed token
      });
      s.on('notification', () => qc.invalidateQueries({ queryKey: ['notifications'] }));
      s.on('message:new', () => qc.invalidateQueries({ queryKey: ['conversations'] }));
      s.on('order:updated', (o: { id: string }) => {
        qc.invalidateQueries({ queryKey: ['orders'] });
        qc.invalidateQueries({ queryKey: ['order', o.id] });
      });
      setSocket(s);
    };
    connect();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && !s?.connected) connect();
    });
    return () => {
      sub.remove();
      s?.disconnect();
      setSocket(null);
    };
  }, [me.data?.id, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push taps deep-link into the app (only for signed-in users).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const link = r.notification.request.content.data?.link;
      if (typeof link === 'string' && tokens.access()) router.push(toAppRoute(link) as never);
    });
    return () => sub.remove();
  }, []);

  const signIn = useCallback(
    async (t: { accessToken?: string; refreshToken?: string; user: Me }) => {
      await tokens.save(t.accessToken!, t.refreshToken!);
      qc.setQueryData(['me'], t.user);
      setHasToken(true);
      void registerPush();
    },
    [qc],
  );
  const signOut = useCallback(async () => {
    await api.auth.logout((await tokens.refresh()) ?? undefined).catch(() => {});
    await tokens.clear();
    qc.clear();
    setHasToken(false);
    router.replace('/sign-in');
  }, [qc]);

  const value = useMemo<Session>(
    () => ({
      ready: ready && (!hasToken || !me.isPending),
      me: hasToken ? (me.data ?? null) : null,
      socket,
      has: (r) => !!me.data?.roles.includes(r) || (r !== 'customer' && !!me.data?.roles.includes('admin')),
      signIn,
      signOut,
    }),
    [ready, hasToken, me.data, me.isPending, socket, signIn, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
