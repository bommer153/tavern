// Portable domain contracts shared by api, web and mobile.
// Business rules (pricing, transitions, authorization) live only in apps/api.
import { z } from 'zod';

export const ROLES = ['customer', 'companion', 'moderator', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ACCOUNT_STATUSES = ['active', 'suspended', 'deactivated'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const SERVICE_CATEGORIES = [
  'ranked_duo',
  'casual_mabar',
  'coaching',
  'party_companion',
  'voice_companion',
  'custom_session',
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  ranked_duo: 'Ranked Duo',
  casual_mabar: 'Casual Mabar',
  coaching: 'Gaming Coach',
  party_companion: 'Party Companion',
  voice_companion: 'Voice Companion',
  custom_session: 'Custom Gaming Session',
};

export const ORDER_STATUSES = [
  'pending_payment',
  'pending_acceptance',
  'accepted',
  'in_progress',
  'extension_requested',
  'completed',
  'cancelled',
  'declined',
  'disputed',
  'refund_pending',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Pending Payment',
  pending_acceptance: 'Pending Acceptance',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  extension_requested: 'Extension Requested',
  completed: 'Completed',
  cancelled: 'Cancelled',
  declined: 'Declined',
  disputed: 'Disputed',
  refund_pending: 'Refund Pending',
  refunded: 'Refunded',
};

export const APPLICATION_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const PAYOUT_STATUSES = ['requested', 'under_review', 'approved', 'processing', 'paid', 'rejected', 'failed'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const GIFT_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type GiftRarity = (typeof GIFT_RARITIES)[number];

export const ROOM_CATEGORIES = ['gaming', 'hangout', 'ranked', 'coaching', 'community'] as const;
export const ROOM_ROLES = ['host', 'moderator', 'speaker', 'listener'] as const;
export type RoomRole = (typeof ROOM_ROLES)[number];

export const REPORT_TARGETS = ['user', 'message', 'room', 'order', 'review'] as const;

/** Money is stored as integer centavos; coins are integers. */
export const formatPhp = (centavos: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100);

// ---------- Auth ----------
const password = z.string().min(8, 'At least 8 characters').max(128);
export const registerSchema = z.object({
  email: z.email().max(254).transform((s) => s.toLowerCase()),
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscores only'),
  displayName: z.string().trim().min(1).max(40),
  password,
  birthDate: z.iso.date(),
  acceptTerms: z.literal(true, { error: 'You must accept the terms' }),
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({ email: z.email().transform((s) => s.toLowerCase()), password: z.string().min(1) });
export type LoginInput = z.infer<typeof loginSchema>;
export const forgotPasswordSchema = z.object({ email: z.email() });
export const resetPasswordSchema = z.object({ token: z.string().min(10), password });
export const verifyEmailSchema = z.object({ token: z.string().min(10) });
export const refreshSchema = z.object({ refreshToken: z.string().min(10).optional() });

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.url().optional(),
  settings: z
    .object({
      timezone: z.string().max(64).optional(),
      language: z.string().max(10).optional(),
      currency: z.literal('PHP').optional(),
    })
    .optional(),
  notificationPrefs: z.record(z.string(), z.boolean()).optional(),
});

// ---------- Companions ----------
export const companionGameSchema = z.object({
  gameId: z.string().length(24),
  rank: z.string().max(40).optional(),
  roles: z.array(z.string().max(30)).max(5).default([]),
});
export const companionApplicationSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  headline: z.string().max(80),
  introduction: z.string().min(20).max(1000),
  games: z.array(companionGameSchema).min(1).max(10),
  categories: z.array(z.enum(SERVICE_CATEGORIES)).min(1),
  languages: z.array(z.string().max(20)).min(1).max(6),
  proposedPriceCentavos: z.number().int().min(1000).max(10_000_00),
  voiceCapable: z.boolean(),
  acknowledgements: z.object({
    adult: z.literal(true),
    noAccountSharing: z.literal(true),
    nonRomantic: z.literal(true),
    guidelines: z.literal(true),
  }),
});
export type CompanionApplicationInput = z.infer<typeof companionApplicationSchema>;

export const updateCompanionProfileSchema = z.object({
  headline: z.string().max(80).optional(),
  bio: z.string().max(1000).optional(),
  bannerUrl: z.url().optional(),
  games: z.array(companionGameSchema).max(10).optional(),
  languages: z.array(z.string().max(20)).max(6).optional(),
  playstyles: z.array(z.string().max(30)).max(6).optional(),
  voiceAvailable: z.boolean().optional(),
});

export const serviceSchema = z.object({
  gameId: z.string().length(24),
  category: z.enum(SERVICE_CATEGORIES),
  title: z.string().trim().min(3).max(60),
  description: z.string().max(1000),
  includes: z.array(z.string().max(100)).max(10).default([]),
  excludes: z.array(z.string().max(100)).max(10).default([]),
  pricePerUnitCentavos: z.number().int().min(1000).max(10_000_00),
  unitMinutes: z.number().int().min(15).max(240),
  maxUnits: z.number().int().min(1).max(12),
  cancellationPolicy: z.string().max(500).default('Free cancellation before the companion accepts.'),
  active: z.boolean().default(true),
});
export type ServiceInput = z.input<typeof serviceSchema>;

export const companionQuerySchema = z.object({
  q: z.string().max(60).optional(),
  game: z.string().max(40).optional(), // game slug
  category: z.enum(SERVICE_CATEGORIES).optional(),
  language: z.string().max(20).optional(),
  rank: z.string().max(40).optional(),
  role: z.string().max(30).optional(),
  playstyle: z.string().max(30).optional(),
  voice: z.coerce.boolean().optional(),
  online: z.coerce.boolean().optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  sort: z.enum(['featured', 'rating', 'popular', 'new', 'price_asc', 'price_desc']).default('featured'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});
export type CompanionQuery = z.input<typeof companionQuerySchema>;

// ---------- Orders ----------
export const createOrderSchema = z.object({
  serviceId: z.string().length(24),
  units: z.number().int().min(1).max(12),
  /** Orders always start now. Kept only to reject older clients that still send a time, instead of silently booking "now". */
  scheduledStart: z.string().optional().refine((v) => !v, 'Scheduling is no longer available. Order when the companion is online.').optional(),
  notes: z.string().max(500).optional(),
  gameDetails: z.object({ ign: z.string().max(40).optional(), server: z.string().max(40).optional() }).optional(),
  idempotencyKey: z.string().min(8).max(64),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export const orderActionSchema = z.object({ reason: z.string().max(500).optional() });
export const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(1000).optional() });

// ---------- Wallet / gifts / payments ----------
export const GIFT_CONTEXTS = ['profile', 'room', 'order'] as const;
export const sendGiftSchema = z.object({
  giftId: z.string().length(24),
  recipientId: z.string().length(24),
  quantity: z.number().int().min(1).max(99).default(1),
  context: z.enum(GIFT_CONTEXTS),
  contextId: z.string().length(24).optional(),
  idempotencyKey: z.string().min(8).max(64),
});
export type SendGiftInput = z.input<typeof sendGiftSchema>;
export const checkoutSchema = z.object({ packageId: z.string().length(24), idempotencyKey: z.string().min(8).max(64) });
export const payoutRequestSchema = z.object({
  amountCentavos: z.number().int().min(100_00),
  method: z.enum(['gcash', 'maya', 'bank']),
  accountName: z.string().max(80),
  accountNumber: z.string().max(40),
  idempotencyKey: z.string().min(8).max(64),
});

// ---------- Messaging ----------
export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  clientId: z.string().min(8).max(64),
});
export const startConversationSchema = z.object({ userId: z.string().length(24) });

// ---------- Voice rooms ----------
export const createRoomSchema = z.object({
  title: z.string().trim().min(3).max(60),
  description: z.string().max(500).default(''),
  rules: z.string().max(1000).default(''),
  category: z.enum(ROOM_CATEGORIES),
  gameId: z.string().length(24).optional(),
  privacy: z.enum(['public', 'invite']),
  capacity: z.number().int().min(2).max(200).default(50),
  chatEnabled: z.boolean().default(true),
});
export type CreateRoomInput = z.input<typeof createRoomSchema>;

// ---------- Cosmetics ----------
export const COSMETIC_KINDS = ['frame', 'background'] as const;
export type CosmeticKind = (typeof COSMETIC_KINDS)[number];
/** free: everyone owns it · purchase: bought with coins · event/grant: unlocked by an event or staff, never sold. */
export const COSMETIC_UNLOCKS = ['free', 'purchase', 'event', 'grant'] as const;
export type CosmeticUnlock = (typeof COSMETIC_UNLOCKS)[number];
/** Built-in default room environment; always owned, used when nothing else is chosen. */
export const DEFAULT_BACKGROUND = 'hearth';

export const appearanceSchema = z.object({
  frame: z.string().max(40).nullable().optional(),
  background: z.string().max(40).optional(),
  followRoomTheme: z.boolean().optional(),
  animated: z.boolean().optional(),
  intensity: z.number().int().min(20).max(100).optional(),
  parallax: z.boolean().optional(),
});
export type AppearanceInput = z.infer<typeof appearanceSchema>;
export const roomThemeSchema = z.object({ background: z.string().max(40).nullable(), allowPersonal: z.boolean() });
export type RoomThemeInput = z.infer<typeof roomThemeSchema>;

// ---------- Moderation ----------
export const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().length(24),
  reason: z.enum(['harassment', 'spam', 'scam', 'inappropriate', 'underage', 'other']),
  details: z.string().max(1000).optional(),
});

// ---------- Response shapes ----------
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  roles: Role[];
}
export interface Me extends PublicUser {
  email: string;
  emailVerified: boolean;
  bio?: string;
  settings: { timezone: string; language: string; currency: string };
  notificationPrefs: Record<string, boolean>;
}
export interface Game {
  id: string;
  slug: string;
  name: string;
  iconUrl?: string;
  coverUrl?: string;
  platforms: string[];
  ranks: string[];
  roles: string[];
}
export interface CompanionCard {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  headline: string;
  verified: boolean;
  online: boolean;
  busy: boolean;
  games: { gameId: string; slug: string; name: string; rank?: string; roles: string[] }[];
  languages: string[];
  ratingAvg: number;
  ratingCount: number;
  startingPriceCentavos: number | null;
  categories: ServiceCategory[];
  voiceAvailable: boolean;
}
export interface Service {
  id: string;
  companionId: string;
  gameId: string;
  category: ServiceCategory;
  title: string;
  description: string;
  includes: string[];
  excludes: string[];
  pricePerUnitCentavos: number;
  unitMinutes: number;
  maxUnits: number;
  cancellationPolicy: string;
  active: boolean;
}
export interface CompanionDetail extends CompanionCard {
  bio: string;
  bannerUrl?: string;
  playstyles: string[];
  services: Service[];
  followerCount: number;
  isFollowing: boolean;
  completedOrders: number;
}
export interface Order {
  id: string;
  orderNo: string;
  customer: PublicUser;
  companion: PublicUser;
  service: { id: string; title: string; category: ServiceCategory; unitMinutes: number; gameName: string };
  units: number;
  durationMinutes: number;
  scheduledStart?: string;
  status: OrderStatus;
  amounts: { subtotal: number; serviceFee: number; total: number; commission: number; companionEarning: number };
  paidWithCoins: number;
  notes?: string;
  startedAt?: string;
  endsAt?: string;
  completedAt?: string;
  conversationId?: string;
  reviewed: boolean;
  createdAt: string;
}
export interface Paginated<T> {
  items: T[];
  page: number;
  total: number;
  hasMore: boolean;
}
export interface Gift {
  id: string;
  name: string;
  coinCost: number;
  imageUrl: string;
  category: string;
  rarity: GiftRarity;
  active: boolean;
  sortOrder: number;
}
export interface CoinPackage {
  id: string;
  coins: number;
  bonusCoins: number;
  priceCentavos: number;
  active: boolean;
}
export interface WalletSummary {
  balance: number;
  coinValueCentavos: number;
}
export interface LedgerEntry {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  refId?: string;
  createdAt: string;
}
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  clientId: string;
  createdAt: string;
}
export interface Conversation {
  id: string;
  type: 'direct' | 'order';
  orderId?: string;
  other: PublicUser;
  lastMessage?: string;
  lastMessageAt?: string;
  unread: number;
}
export interface VoiceRoom {
  id: string;
  title: string;
  description: string;
  rules: string;
  category: string;
  game?: { id: string; name: string; slug: string };
  host: PublicUser;
  privacy: 'public' | 'invite';
  capacity: number;
  participantCount: number;
  speakerCount: number;
  chatEnabled: boolean;
  status: 'live' | 'closed';
  coverUrl?: string;
  theme: RoomThemeInput;
}
export interface RoomMember {
  user: PublicUser;
  role: RoomRole;
  handRaised: boolean;
  /** Equipped seat frame key, if any. */
  frame?: string;
}
export interface Cosmetic {
  id: string;
  key: string;
  kind: CosmeticKind;
  name: string;
  description: string;
  category: string;
  rarity: GiftRarity;
  unlock: CosmeticUnlock;
  priceCoins: number;
  available: boolean;
  /** How the client draws it: 'css' is always available, 'webgl' adds an optional Three.js layer. */
  renderer: 'css' | 'webgl';
  version: number;
  sortOrder: number;
}
export interface Appearance {
  frame: string | null;
  background: string;
  followRoomTheme: boolean;
  animated: boolean;
  intensity: number;
  parallax: boolean;
}
export interface CosmeticCollection {
  items: Cosmetic[];
  /** Keys the user can equip: free items plus entitlements. */
  owned: string[];
  appearance: Appearance;
}
export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  readAt?: string;
  createdAt: string;
}
export interface EarningsSummary {
  pendingCentavos: number;
  availableCentavos: number;
  lifetimeCentavos: number;
  paidOutCentavos: number;
  completedOrders: number;
  commissionPercent: number;
}
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}
export * from './icons';
