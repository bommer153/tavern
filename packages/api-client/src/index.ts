import type {
  Appearance,
  AppearanceInput,
  CoinPackage,
  CompanionApplicationInput,
  CompanionCard,
  CompanionDetail,
  CompanionQuery,
  Conversation,
  Cosmetic,
  CosmeticCollection,
  CreateOrderInput,
  CreateRoomInput,
  EarningsSummary,
  Game,
  Gift,
  LedgerEntry,
  LoginInput,
  Me,
  Message,
  Notification,
  Order,
  Paginated,
  RegisterInput,
  RoomMember,
  RoomThemeInput,
  SendGiftInput,
  Service,
  ServiceInput,
  VoiceRoom,
  WalletSummary,
} from '@tavern/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface ClientOptions {
  baseUrl: string; // e.g. http://localhost:4000/api/v1
  /** web: cookies carry the session. */
  credentials?: 'include';
  /** mobile: bearer tokens from SecureStore. */
  getAccessToken?: () => Promise<string | null> | string | null;
  /** Called on 401; return true if a refreshed token is now available. */
  refresh?: () => Promise<boolean>;
  headers?: Record<string, string>;
}

type Query = Record<string, string | number | boolean | undefined | null>;
const qs = (q?: Query) => {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export function createApiClient(opts: ClientOptions) {
  let refreshing: Promise<boolean> | null = null;

  async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
    const token = await opts.getAccessToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await fetch(opts.baseUrl + path, {
        method,
        headers,
        credentials: opts.credentials,
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach Tavern. Check your connection and try again.');
    }
    if (res.status === 401 && retry && opts.refresh && !path.startsWith('/auth/')) {
      refreshing ??= opts.refresh().finally(() => (refreshing = null));
      if (await refreshing) return request<T>(method, path, body, false);
    }
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.code ?? 'ERROR', data.message ?? res.statusText, data.details);
    return data as T;
  }
  const get = <T>(p: string, q?: Query) => request<T>('GET', p + qs(q));
  const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {});
  const patch = <T>(p: string, b: unknown) => request<T>('PATCH', p, b);
  const put = <T>(p: string, b: unknown) => request<T>('PUT', p, b);
  const del = <T>(p: string) => request<T>('DELETE', p);

  type Tokens = { accessToken?: string; refreshToken?: string; user: Me };

  return {
    request,
    auth: {
      register: (b: RegisterInput) => post<Tokens>('/auth/register', b),
      login: (b: LoginInput) => post<Tokens>('/auth/login', b),
      refresh: (refreshToken?: string) => post<Tokens>('/auth/refresh', { refreshToken }),
      logout: (refreshToken?: string) => post<void>('/auth/logout', { refreshToken }),
      logoutAll: () => post<void>('/auth/logout-all'),
      verifyEmail: (token: string) => post<void>('/auth/verify-email', { token }),
      resendVerification: () => post<void>('/auth/resend-verification'),
      forgotPassword: (email: string) => post<void>('/auth/forgot-password', { email }),
      resetPassword: (token: string, password: string) => post<void>('/auth/reset-password', { token, password }),
    },
    users: {
      me: () => get<Me>('/users/me'),
      update: (b: unknown) => patch<Me>('/users/me', b),
      block: (id: string) => post<void>(`/users/${id}/block`),
      unblock: (id: string) => del<void>(`/users/${id}/block`),
    },
    games: { list: () => get<Game[]>('/games') },
    companions: {
      list: (q: CompanionQuery = {}) => get<Paginated<CompanionCard>>('/companions', q as Query),
      sections: () => get<Record<string, CompanionCard[]>>('/companions/sections'),
      get: (username: string) => get<CompanionDetail>(`/companions/${username}`),
      reviews: (userId: string, page = 1) =>
        get<Paginated<{ id: string; rating: number; comment?: string; author: { displayName: string; avatarUrl?: string }; createdAt: string }>>(
          `/companions/${userId}/reviews`,
          { page },
        ),
      follow: (userId: string) => post<void>(`/companions/${userId}/follow`),
      unfollow: (userId: string) => del<void>(`/companions/${userId}/follow`),
      following: () => get<CompanionCard[]>('/companions/following/me'),
    },
    companion: {
      profile: () => get<CompanionDetail>('/companion/profile'),
      updateProfile: (b: unknown) => patch<CompanionDetail>('/companion/profile', b),
      services: () => get<Service[]>('/companion/services'),
      createService: (b: ServiceInput) => post<Service>('/companion/services', b),
      updateService: (id: string, b: Partial<ServiceInput>) => patch<Service>(`/companion/services/${id}`, b),
    },
    applications: {
      mine: () => get<{ status: string; decisionNote?: string } | null>('/applications/me'),
      submit: (b: CompanionApplicationInput) => post<{ status: string }>('/applications', b),
    },
    orders: {
      create: (b: CreateOrderInput) => post<Order>('/orders', b),
      mine: (q: { as?: 'customer' | 'companion'; status?: string; page?: number } = {}) =>
        get<Paginated<Order>>('/orders/me', q),
      get: (id: string) => get<Order & { serverNow: string }>(`/orders/${id}`),
      action: (id: string, action: 'accept' | 'decline' | 'cancel' | 'start' | 'complete' | 'dispute', reason?: string) =>
        post<Order>(`/orders/${id}/${action}`, { reason }),
      review: (id: string, b: { rating: number; comment?: string }) => post<void>(`/orders/${id}/review`, b),
    },
    wallet: {
      summary: () => get<WalletSummary>('/wallet'),
      transactions: (page = 1) => get<Paginated<LedgerEntry>>('/wallet/transactions', { page }),
      packages: () => get<CoinPackage[]>('/wallet/packages'),
    },
    gifts: {
      list: () => get<Gift[]>('/gifts'),
      send: (b: SendGiftInput) => post<{ transactionId: string; balance: number }>('/gifts/send', b),
    },
    cosmetics: {
      catalog: () => get<Cosmetic[]>('/cosmetics'),
      mine: () => get<CosmeticCollection>('/cosmetics/me'),
      history: () => get<{ key: string; source: string; priceCoins: number; createdAt: string }[]>('/cosmetics/me/history'),
      purchase: (id: string, idempotencyKey: string) => post<{ key: string; balance: number }>(`/cosmetics/${id}/purchase`, { idempotencyKey }),
      setAppearance: (b: AppearanceInput) => patch<Appearance>('/cosmetics/me/appearance', b),
    },
    payments: {
      checkout: (packageId: string, idempotencyKey: string) =>
        post<{ paymentId: string; checkoutUrl: string }>('/payments/checkout', { packageId, idempotencyKey }),
      get: (id: string) => get<{ id: string; status: string; coins: number; amountCentavos: number }>(`/payments/${id}`),
      devComplete: (id: string) => post<void>(`/payments/dev/${id}/complete`),
    },
    earnings: {
      summary: () => get<EarningsSummary>('/earnings'),
      entries: (page = 1) =>
        get<Paginated<{ id: string; type: string; amountCentavos: number; status: string; availableAt?: string; createdAt: string }>>(
          '/earnings/entries',
          { page },
        ),
      requestPayout: (b: unknown) => post<{ id: string }>('/payouts', b),
      payouts: () => get<{ id: string; amountCentavos: number; status: string; method: string; createdAt: string }[]>('/payouts/me'),
    },
    conversations: {
      list: () => get<Conversation[]>('/conversations'),
      start: (userId: string) => post<{ id: string }>('/conversations', { userId }),
      get: (id: string) => get<Conversation>(`/conversations/${id}`),
      messages: (id: string, before?: string) => get<Message[]>(`/conversations/${id}/messages`, { before }),
      send: (id: string, body: string, clientId: string) => post<Message>(`/conversations/${id}/messages`, { body, clientId }),
      read: (id: string) => post<void>(`/conversations/${id}/read`),
    },
    rooms: {
      list: (q: { category?: string; game?: string } = {}) => get<VoiceRoom[]>('/voice-rooms', q),
      create: (b: CreateRoomInput) => post<VoiceRoom>('/voice-rooms', b),
      get: (id: string) => get<VoiceRoom & { members: RoomMember[]; myRole: string | null }>(`/voice-rooms/${id}`),
      join: (id: string) => post<{ role: string }>(`/voice-rooms/${id}/join`),
      token: (id: string) => post<{ token: string; url: string; canPublish: boolean }>(`/voice-rooms/${id}/token`),
      leave: (id: string) => post<void>(`/voice-rooms/${id}/leave`),
      raiseHand: (id: string, raised: boolean) => post<void>(`/voice-rooms/${id}/hand`, { raised }),
      setRole: (id: string, userId: string, role: 'moderator' | 'speaker' | 'listener') =>
        post<void>(`/voice-rooms/${id}/members/${userId}/role`, { role }),
      mute: (id: string, userId: string) => post<void>(`/voice-rooms/${id}/members/${userId}/mute`),
      remove: (id: string, userId: string) => post<void>(`/voice-rooms/${id}/members/${userId}/remove`),
      invite: (id: string, userId: string) => post<void>(`/voice-rooms/${id}/invite`, { userId }),
      close: (id: string) => post<void>(`/voice-rooms/${id}/close`),
      setTheme: (id: string, b: RoomThemeInput) => post<void>(`/voice-rooms/${id}/theme`, b),
      messages: (id: string) => get<{ id: string; sender: { displayName: string }; body: string; createdAt: string }[]>(
        `/voice-rooms/${id}/messages`,
      ),
      sendMessage: (id: string, body: string) => post<void>(`/voice-rooms/${id}/messages`, { body }),
    },
    notifications: {
      list: (page = 1) => get<Paginated<Notification> & { unread: number }>('/notifications', { page }),
      markRead: (ids?: string[]) => post<void>('/notifications/read', { ids }),
      registerPushToken: (token: string, platform: string) => post<void>('/notifications/push-tokens', { token, platform }),
    },
    reports: { create: (b: unknown) => post<void>('/reports', b) },
    uploads: { image: (form: FormData) => request<{ url: string }>('POST', '/uploads/image', form) },
    admin: {
      overview: () => get<Record<string, number>>('/admin/overview'),
      users: (q: Query = {}) => get<Paginated<Me & { status: string; createdAt: string }>>('/admin/users', q),
      setUserStatus: (id: string, status: string, reason: string) => post<void>(`/admin/users/${id}/status`, { status, reason }),
      setUserRoles: (id: string, roles: string[]) => post<void>(`/admin/users/${id}/roles`, { roles }),
      applications: (status?: string) => get<Paginated<any>>('/admin/applications', { status }),
      decideApplication: (id: string, decision: 'approved' | 'rejected' | 'under_review', note?: string) =>
        post<void>(`/admin/applications/${id}/decision`, { decision, note }),
      orders: (q: Query = {}) => get<Paginated<Order>>('/admin/orders', q),
      resolveDispute: (id: string, outcome: 'refund' | 'release', note: string) =>
        post<void>(`/admin/orders/${id}/resolve`, { outcome, note }),
      payments: (q: Query = {}) => get<Paginated<any>>('/admin/payments', q),
      ledger: (q: Query = {}) => get<Paginated<any>>('/admin/ledger', q),
      reconcile: () => get<{ wallets: number; mismatches: any[] }>('/admin/reconcile'),
      adjustWallet: (userId: string, amount: number, reason: string, idempotencyKey: string) =>
        post<void>('/admin/wallet-adjustments', { userId, amount, reason, idempotencyKey }),
      cosmetics: () => get<Cosmetic[]>('/admin/cosmetics'),
      saveCosmetic: (b: Partial<Cosmetic>) => {
        const { id, key, kind, ...rest } = b;
        return id ? patch<Cosmetic>(`/admin/cosmetics/${id}`, rest) : post<Cosmetic>('/admin/cosmetics', { key, kind, ...rest });
      },
      grantCosmetic: (id: string, userId: string) => post<void>(`/admin/cosmetics/${id}/grant`, { userId }),
      gifts: () => get<Gift[]>('/admin/gifts'),
      saveGift: (b: Partial<Gift>) => (b.id ? patch<Gift>(`/admin/gifts/${b.id}`, b) : post<Gift>('/admin/gifts', b)),
      packages: () => get<CoinPackage[]>('/admin/packages'),
      savePackage: (b: Partial<CoinPackage>) =>
        b.id ? patch<CoinPackage>(`/admin/packages/${b.id}`, b) : post<CoinPackage>('/admin/packages', b),
      games: () => get<(Game & { active: boolean; sortOrder: number })[]>('/admin/games'),
      saveGame: (b: Partial<Game> & { active?: boolean }) =>
        b.id ? patch<Game>(`/admin/games/${b.id}`, b) : post<Game>('/admin/games', b),
      rooms: () => get<VoiceRoom[]>('/admin/rooms'),
      reports: (status?: string, page = 1) => get<Paginated<any>>('/admin/reports', { status, page }),
      resolveReport: (id: string, action: string, note: string) => post<void>(`/admin/reports/${id}/resolve`, { action, note }),
      payouts: (status?: string, page = 1) => get<Paginated<any>>('/admin/payouts', { status, page }),
      decidePayout: (id: string, status: string, note?: string) => post<void>(`/admin/payouts/${id}/status`, { status, note }),
      settings: () => get<Record<string, unknown>>('/admin/settings'),
      saveSettings: (b: Record<string, unknown>) => patch<Record<string, unknown>>('/admin/settings', b),
      featureCompanion: (userId: string, featured: boolean) => post<void>(`/admin/companions/${userId}/feature`, { featured }),
      auditLogs: (page = 1) => get<Paginated<any>>('/admin/audit-logs', { page }),
    },
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
