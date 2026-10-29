// All Mongoose schemas. See docs/database.md for relationships and rationale.
// Money: integer centavos (PHP). Coins: integers. Ledgers are append-only.
import { InferSchemaType, Schema, Types } from 'mongoose';
import {
  ACCOUNT_STATUSES,
  APPLICATION_STATUSES,
  COSMETIC_KINDS,
  COSMETIC_UNLOCKS,
  GIFT_CONTEXTS,
  GIFT_RARITIES,
  ORDER_STATUSES,
  PAYOUT_STATUSES,
  REPORT_TARGETS,
  ROLES,
  ROOM_CATEGORIES,
  ROOM_ROLES,
  SERVICE_CATEGORIES,
} from '@tavern/shared';

const ref = (model: string, required = true) => ({ type: Schema.Types.ObjectId, ref: model, required });
const opts = { timestamps: true } as const;
const immutable = { timestamps: { createdAt: true, updatedAt: false } } as const;

// ---------- Identity ----------
export const UserSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    username: { type: String, required: true, trim: true },
    usernameLower: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, maxlength: 40 },
    avatarUrl: String,
    bio: { type: String, maxlength: 500 },
    birthDate: { type: Date, required: true },
    roles: { type: [{ type: String, enum: ROLES }], default: ['customer'] },
    status: { type: String, enum: ACCOUNT_STATUSES, default: 'active' },
    statusReason: String,
    emailVerifiedAt: Date,
    settings: {
      timezone: { type: String, default: 'Asia/Manila' },
      language: { type: String, default: 'en' },
      currency: { type: String, default: 'PHP' },
    },
    notificationPrefs: { type: Map, of: Boolean, default: {} },
    // Equipped cosmetics are keys into the cosmetics catalog; ownership is checked when they are set.
    appearance: {
      frame: { type: String, default: null },
      background: String,
      followRoomTheme: { type: Boolean, default: true },
      animated: { type: Boolean, default: true },
      intensity: { type: Number, default: 70 },
      parallax: { type: Boolean, default: true },
    },
  },
  opts,
);
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ usernameLower: 1 }, { unique: true });
UserSchema.index({ roles: 1, status: 1 });

export const SessionSchema = new Schema(
  {
    userId: ref('User'),
    familyId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    client: { type: String, enum: ['web', 'mobile'], required: true },
    userAgent: String,
    expiresAt: { type: Date, required: true },
    replacedAt: Date,
    revokedAt: Date,
  },
  immutable,
);
SessionSchema.index({ tokenHash: 1 }, { unique: true });
SessionSchema.index({ userId: 1, familyId: 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // expired sessions have no further use

export const EmailTokenSchema = new Schema(
  {
    userId: ref('User'),
    purpose: { type: String, enum: ['verify', 'reset'], required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  immutable,
);
EmailTokenSchema.index({ tokenHash: 1 }, { unique: true });
EmailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const BlockSchema = new Schema({ blockerId: ref('User'), blockedId: ref('User') }, immutable);
BlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
BlockSchema.index({ blockedId: 1 });

// ---------- Catalog ----------
export const GameSchema = new Schema(
  {
    slug: { type: String, required: true },
    name: { type: String, required: true },
    iconUrl: String,
    coverUrl: String,
    platforms: [String],
    ranks: [String],
    roles: [String],
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  opts,
);
GameSchema.index({ slug: 1 }, { unique: true });

// ---------- Companions ----------
export const CompanionProfileSchema = new Schema(
  {
    userId: ref('User'),
    headline: { type: String, default: '' },
    bio: { type: String, default: '' },
    bannerUrl: String,
    // Bounded (max 10) so embedding is safe; read with every card.
    games: [{ _id: false, gameId: ref('Game'), rank: String, roles: [String] }],
    languages: [String],
    playstyles: [String],
    categories: [{ type: String, enum: SERVICE_CATEGORIES }],
    voiceAvailable: { type: Boolean, default: true },
    status: { type: String, enum: ['approved', 'suspended'], default: 'approved' },
    featured: { type: Boolean, default: false },
    online: { type: Boolean, default: false },
    lastSeenAt: Date,
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    completedOrders: { type: Number, default: 0 },
    followerCount: { type: Number, default: 0 },
    startingPriceCentavos: { type: Number, default: null },
    /** Bumped inside booking transactions so concurrent bookings for one companion conflict and retry. */
    bookingSeq: { type: Number, default: 0 },
    approvedAt: Date,
  },
  opts,
);
CompanionProfileSchema.index({ userId: 1 }, { unique: true });
CompanionProfileSchema.index({ status: 1, featured: -1, ratingAvg: -1 });
CompanionProfileSchema.index({ status: 1, 'games.gameId': 1, startingPriceCentavos: 1 });
CompanionProfileSchema.index({ status: 1, online: -1, completedOrders: -1 });
CompanionProfileSchema.index({ status: 1, approvedAt: -1 });

export const CompanionApplicationSchema = new Schema(
  {
    userId: ref('User'),
    status: { type: String, enum: APPLICATION_STATUSES, default: 'submitted' },
    displayName: String,
    headline: String,
    introduction: String,
    games: [{ _id: false, gameId: ref('Game'), rank: String, roles: [String] }],
    categories: [String],
    languages: [String],
    proposedPriceCentavos: Number,
    voiceCapable: Boolean,
    acknowledgements: { type: Map, of: Boolean },
    reviewedBy: ref('User', false),
    reviewedAt: Date,
    decisionNote: String,
  },
  opts,
);
CompanionApplicationSchema.index({ userId: 1, createdAt: -1 });
CompanionApplicationSchema.index({ status: 1, createdAt: 1 });

export const CompanionServiceSchema = new Schema(
  {
    companionId: ref('User'),
    gameId: ref('Game'),
    category: { type: String, enum: SERVICE_CATEGORIES, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    includes: [String],
    excludes: [String],
    pricePerUnitCentavos: { type: Number, required: true, min: 0 },
    unitMinutes: { type: Number, required: true, min: 15 },
    maxUnits: { type: Number, default: 4 },
    cancellationPolicy: String,
    active: { type: Boolean, default: true },
  },
  opts,
);
CompanionServiceSchema.index({ companionId: 1, active: 1 });
CompanionServiceSchema.index({ category: 1, active: 1 });

export const FollowSchema = new Schema({ followerId: ref('User'), companionId: ref('User') }, immutable);
FollowSchema.index({ followerId: 1, companionId: 1 }, { unique: true });
FollowSchema.index({ companionId: 1 });

// ---------- Orders ----------
export const OrderSchema = new Schema(
  {
    orderNo: { type: String, required: true },
    customerId: ref('User'),
    companionId: ref('User'),
    serviceId: ref('CompanionService'),
    // Snapshot so later service edits never change what was bought.
    service: {
      title: String,
      category: String,
      gameId: Schema.Types.ObjectId,
      gameName: String,
      pricePerUnitCentavos: Number,
      unitMinutes: Number,
    },
    units: { type: Number, required: true },
    durationMinutes: { type: Number, required: true },
    scheduledStart: Date,
    /** Reserved interval used for overlap checks. */
    slotStart: { type: Date, required: true },
    slotEnd: { type: Date, required: true },
    status: { type: String, enum: ORDER_STATUSES, required: true },
    amounts: {
      subtotal: { type: Number, required: true },
      serviceFee: { type: Number, required: true },
      total: { type: Number, required: true },
      commissionPercent: { type: Number, required: true },
      commission: { type: Number, required: true },
      companionEarning: { type: Number, required: true },
    },
    paidWithCoins: { type: Number, default: 0 },
    notes: String,
    gameDetails: { ign: String, server: String },
    idempotencyKey: { type: String, required: true },
    acceptedAt: Date,
    startedAt: Date,
    endsAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    conversationId: ref('Conversation', false),
    reviewed: { type: Boolean, default: false },
  },
  opts,
);
OrderSchema.index({ orderNo: 1 }, { unique: true });
OrderSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true });
OrderSchema.index({ customerId: 1, createdAt: -1 });
OrderSchema.index({ companionId: 1, status: 1, slotStart: 1 });
OrderSchema.index({ status: 1, endsAt: 1 });

export const OrderEventSchema = new Schema(
  { orderId: ref('Order'), from: String, to: String, actorId: ref('User', false), note: String },
  immutable,
);
OrderEventSchema.index({ orderId: 1, createdAt: 1 });

export const ReviewSchema = new Schema(
  {
    orderId: ref('Order'),
    companionId: ref('User'),
    authorId: ref('User'),
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: String,
    hidden: { type: Boolean, default: false },
  },
  opts,
);
ReviewSchema.index({ orderId: 1 }, { unique: true });
ReviewSchema.index({ companionId: 1, createdAt: -1 });

// ---------- Messaging ----------
export const ConversationSchema = new Schema(
  {
    type: { type: String, enum: ['direct', 'order'], required: true },
    orderId: ref('Order', false),
    memberIds: [{ type: Schema.Types.ObjectId, ref: 'User' }], // always exactly 2
    /** Sorted member ids joined; unique key for direct conversations. */
    directKey: String,
    lastMessageAt: Date,
    lastMessagePreview: String,
  },
  opts,
);
ConversationSchema.index({ directKey: 1 }, { unique: true, partialFilterExpression: { type: 'direct' } });
ConversationSchema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { type: 'order' } });

export const ConversationMemberSchema = new Schema(
  {
    conversationId: ref('Conversation'),
    userId: ref('User'),
    lastReadAt: { type: Date, default: () => new Date(0) },
    lastMessageAt: Date, // denormalized for inbox sorting
    muted: { type: Boolean, default: false },
  },
  opts,
);
ConversationMemberSchema.index({ conversationId: 1, userId: 1 }, { unique: true });
ConversationMemberSchema.index({ userId: 1, lastMessageAt: -1 });

export const MessageSchema = new Schema(
  {
    conversationId: ref('Conversation'),
    senderId: ref('User'),
    body: { type: String, required: true, maxlength: 2000 },
    clientId: { type: String, required: true },
    attachments: [{ _id: false, url: String, mime: String, width: Number, height: Number }],
  },
  immutable,
);
MessageSchema.index({ senderId: 1, clientId: 1 }, { unique: true }); // retry idempotency
MessageSchema.index({ conversationId: 1, createdAt: -1 });

// ---------- Voice rooms ----------
export const VoiceRoomSchema = new Schema(
  {
    hostId: ref('User'),
    title: { type: String, required: true },
    description: String,
    rules: String,
    category: { type: String, enum: ROOM_CATEGORIES, required: true },
    gameId: ref('Game', false),
    privacy: { type: String, enum: ['public', 'invite'], required: true },
    capacity: { type: Number, default: 50 },
    chatEnabled: { type: Boolean, default: true },
    coverUrl: String,
    /** Shared environment chosen by the host; members may override it for their own view when allowPersonal. */
    theme: { background: { type: String, default: null }, allowPersonal: { type: Boolean, default: true } },
    status: { type: String, enum: ['live', 'closed'], default: 'live' },
    participantCount: { type: Number, default: 0 },
    speakerCount: { type: Number, default: 0 },
    closedAt: Date,
  },
  opts,
);
VoiceRoomSchema.index({ status: 1, privacy: 1, participantCount: -1 });

export const VoiceRoomMemberSchema = new Schema(
  {
    roomId: ref('VoiceRoom'),
    userId: ref('User'),
    role: { type: String, enum: ROOM_ROLES, required: true },
    handRaised: { type: Boolean, default: false },
    present: { type: Boolean, default: true },
    bannedAt: Date,
  },
  opts,
);
VoiceRoomMemberSchema.index({ roomId: 1, userId: 1 }, { unique: true });
VoiceRoomMemberSchema.index({ roomId: 1, present: 1, role: 1 });

export const RoomInvitationSchema = new Schema(
  { roomId: ref('VoiceRoom'), inviterId: ref('User'), inviteeId: ref('User') },
  immutable,
);
RoomInvitationSchema.index({ roomId: 1, inviteeId: 1 }, { unique: true });

export const RoomMessageSchema = new Schema(
  { roomId: ref('VoiceRoom'), senderId: ref('User'), body: { type: String, maxlength: 500 } },
  immutable,
);
RoomMessageSchema.index({ roomId: 1, createdAt: -1 });
RoomMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 }); // ephemeral room chat

// ---------- Economy ----------
export const GiftSchema = new Schema(
  {
    name: { type: String, required: true },
    coinCost: { type: Number, required: true, min: 1 },
    imageUrl: { type: String, required: true },
    animation: String,
    category: { type: String, default: 'classic' },
    rarity: { type: String, enum: GIFT_RARITIES, default: 'common' },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  opts,
);

export const CoinPackageSchema = new Schema(
  {
    coins: { type: Number, required: true, min: 1 },
    bonusCoins: { type: Number, default: 0 },
    priceCentavos: { type: Number, required: true, min: 100 },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  opts,
);

/** Balance summary; the ledger (walletTransactions) is the source of truth for history. */
export const WalletSchema = new Schema(
  { userId: ref('User'), balance: { type: Number, default: 0, min: 0 } },
  opts,
);
WalletSchema.index({ userId: 1 }, { unique: true });

export const WALLET_TX_TYPES = ['topup', 'order_payment', 'order_refund', 'gift_sent', 'cosmetic_purchase', 'adjustment'] as const;
export const WalletTransactionSchema = new Schema(
  {
    userId: ref('User'),
    type: { type: String, enum: WALLET_TX_TYPES, required: true },
    amount: { type: Number, required: true }, // signed coins
    balanceAfter: { type: Number, required: true },
    description: String,
    refType: String,
    refId: Schema.Types.ObjectId,
    idempotencyKey: String,
    actorId: ref('User', false),
  },
  immutable,
);
WalletTransactionSchema.index({ userId: 1, createdAt: -1 });
WalletTransactionSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
WalletTransactionSchema.index({ refType: 1, refId: 1 });

export const GiftTransactionSchema = new Schema(
  {
    senderId: ref('User'),
    recipientId: ref('User'),
    giftId: ref('Gift'),
    giftName: String,
    unitCost: Number,
    quantity: Number,
    totalCoins: Number,
    context: { type: String, enum: GIFT_CONTEXTS },
    contextId: Schema.Types.ObjectId,
    recipientEarningCentavos: { type: Number, default: 0 },
    idempotencyKey: { type: String, required: true },
  },
  immutable,
);
GiftTransactionSchema.index({ senderId: 1, idempotencyKey: 1 }, { unique: true });
GiftTransactionSchema.index({ recipientId: 1, createdAt: -1 });

// Catalog of seat frames and room backgrounds. Artwork lives in the client (keyed by `key`) or object storage, never in Mongo.
export const CosmeticSchema = new Schema(
  {
    key: { type: String, required: true },
    kind: { type: String, enum: COSMETIC_KINDS, required: true },
    name: { type: String, required: true, maxlength: 40 },
    description: { type: String, default: '', maxlength: 200 },
    category: { type: String, default: 'classic' },
    rarity: { type: String, enum: GIFT_RARITIES, default: 'common' },
    unlock: { type: String, enum: COSMETIC_UNLOCKS, default: 'purchase' },
    priceCoins: { type: Number, default: 0, min: 0 },
    available: { type: Boolean, default: true },
    renderer: { type: String, enum: ['css', 'webgl'], default: 'css' },
    version: { type: Number, default: 1 },
    sortOrder: { type: Number, default: 0 },
  },
  opts,
);
CosmeticSchema.index({ key: 1 }, { unique: true });
CosmeticSchema.index({ kind: 1, available: 1, sortOrder: 1 });

/** Entitlements: one row per owned cosmetic. The unique index makes double purchases impossible. */
export const UserCosmeticSchema = new Schema(
  {
    userId: ref('User'),
    cosmeticId: ref('Cosmetic'),
    key: { type: String, required: true },
    source: { type: String, enum: ['purchase', 'event', 'grant'], required: true },
    priceCoins: { type: Number, default: 0 },
    grantedBy: ref('User', false),
  },
  immutable,
);
UserCosmeticSchema.index({ userId: 1, cosmeticId: 1 }, { unique: true });
UserCosmeticSchema.index({ userId: 1, createdAt: -1 });

export const PaymentTransactionSchema = new Schema(
  {
    userId: ref('User'),
    purpose: { type: String, enum: ['coin_topup'], required: true },
    packageId: ref('CoinPackage'),
    coins: { type: Number, required: true },
    amountCentavos: { type: Number, required: true },
    currency: { type: String, default: 'PHP' },
    provider: { type: String, enum: ['paymongo', 'dev'], required: true },
    providerRef: String, // checkout session id
    checkoutUrl: String,
    providerPaymentId: String,
    status: { type: String, enum: ['pending', 'paid', 'failed', 'expired', 'refunded'], default: 'pending' },
    idempotencyKey: { type: String, required: true },
    paidAt: Date,
  },
  opts,
);
PaymentTransactionSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
PaymentTransactionSchema.index({ provider: 1, providerRef: 1 }, { unique: true, partialFilterExpression: { providerRef: { $type: 'string' } } });
PaymentTransactionSchema.index({ userId: 1, createdAt: -1 });

/** Processed provider webhook events; unique id blocks duplicate deliveries. */
export const WebhookEventSchema = new Schema(
  { provider: String, eventId: String, type: String },
  immutable,
);
WebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

// Companion cash earnings (centavos) — separate from coins.
export const EarningsAccountSchema = new Schema(
  {
    companionId: ref('User'),
    pending: { type: Number, default: 0, min: 0 },
    available: { type: Number, default: 0, min: 0 },
    lifetime: { type: Number, default: 0 },
    paidOut: { type: Number, default: 0 },
  },
  opts,
);
EarningsAccountSchema.index({ companionId: 1 }, { unique: true });

export const EARNING_TYPES = ['order_earning', 'gift_earning', 'payout', 'payout_reversal', 'reversal', 'adjustment'] as const;
export const EarningsEntrySchema = new Schema(
  {
    companionId: ref('User'),
    type: { type: String, enum: EARNING_TYPES, required: true },
    amountCentavos: { type: Number, required: true }, // signed
    status: { type: String, enum: ['pending', 'available', 'settled', 'reversed'], required: true },
    availableAt: Date,
    refType: String,
    refId: Schema.Types.ObjectId,
    note: String,
  },
  immutable,
);
EarningsEntrySchema.index({ companionId: 1, createdAt: -1 });
EarningsEntrySchema.index({ status: 1, availableAt: 1 });
EarningsEntrySchema.index({ refType: 1, refId: 1, type: 1 }, { unique: true, partialFilterExpression: { refId: { $exists: true } } });

export const PayoutRequestSchema = new Schema(
  {
    companionId: ref('User'),
    amountCentavos: { type: Number, required: true },
    method: { type: String, enum: ['gcash', 'maya', 'bank'], required: true },
    accountName: String,
    accountNumberMasked: String,
    accountNumber: { type: String, select: false },
    status: { type: String, enum: PAYOUT_STATUSES, default: 'requested' },
    idempotencyKey: { type: String, required: true },
    reviewedBy: ref('User', false),
    note: String,
  },
  opts,
);
PayoutRequestSchema.index({ companionId: 1, idempotencyKey: 1 }, { unique: true });
PayoutRequestSchema.index({ status: 1, createdAt: 1 });

// ---------- Notifications ----------
export const NotificationSchema = new Schema(
  {
    userId: ref('User'),
    type: { type: String, required: true },
    title: String,
    body: String,
    link: String,
    readAt: Date,
  },
  immutable,
);
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, readAt: 1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 }); // history kept 180 days

export const PushTokenSchema = new Schema({ userId: ref('User'), token: String, platform: String }, opts);
PushTokenSchema.index({ token: 1 }, { unique: true });
PushTokenSchema.index({ userId: 1 });

// ---------- Trust & safety / admin ----------
export const ReportSchema = new Schema(
  {
    reporterId: ref('User'),
    targetType: { type: String, enum: REPORT_TARGETS, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reason: String,
    details: String,
    status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
    resolvedBy: ref('User', false),
    resolution: String,
  },
  opts,
);
ReportSchema.index({ status: 1, createdAt: 1 });

export const ModerationActionSchema = new Schema(
  { actorId: ref('User'), targetUserId: ref('User', false), action: String, reason: String, reportId: ref('Report', false) },
  immutable,
);
ModerationActionSchema.index({ targetUserId: 1, createdAt: -1 });

export const PlatformSettingSchema = new Schema({ _id: String, value: Schema.Types.Mixed }, opts);

export const AuditLogSchema = new Schema(
  { actorId: ref('User', false), action: String, targetType: String, targetId: String, data: Schema.Types.Mixed, ip: String },
  immutable,
);
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1 });

export const MODELS = {
  User: UserSchema,
  Session: SessionSchema,
  EmailToken: EmailTokenSchema,
  Block: BlockSchema,
  Game: GameSchema,
  CompanionProfile: CompanionProfileSchema,
  CompanionApplication: CompanionApplicationSchema,
  CompanionService: CompanionServiceSchema,
  Follow: FollowSchema,
  Order: OrderSchema,
  OrderEvent: OrderEventSchema,
  Review: ReviewSchema,
  Conversation: ConversationSchema,
  ConversationMember: ConversationMemberSchema,
  Message: MessageSchema,
  VoiceRoom: VoiceRoomSchema,
  VoiceRoomMember: VoiceRoomMemberSchema,
  RoomInvitation: RoomInvitationSchema,
  RoomMessage: RoomMessageSchema,
  Gift: GiftSchema,
  CoinPackage: CoinPackageSchema,
  Cosmetic: CosmeticSchema,
  UserCosmetic: UserCosmeticSchema,
  Wallet: WalletSchema,
  WalletTransaction: WalletTransactionSchema,
  GiftTransaction: GiftTransactionSchema,
  PaymentTransaction: PaymentTransactionSchema,
  WebhookEvent: WebhookEventSchema,
  EarningsAccount: EarningsAccountSchema,
  EarningsEntry: EarningsEntrySchema,
  PayoutRequest: PayoutRequestSchema,
  Notification: NotificationSchema,
  PushToken: PushTokenSchema,
  Report: ReportSchema,
  ModerationAction: ModerationActionSchema,
  PlatformSetting: PlatformSettingSchema,
  AuditLog: AuditLogSchema,
} as const;

/** Collection names follow docs/database.md (camelCase plural). */
export const collectionName = (model: string) =>
  model[0]!.toLowerCase() + model.slice(1).replace(/y$/, 'ie') + 's';

type Doc<S> = InferSchemaType<S> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type UserDoc = Doc<typeof UserSchema>;
export type CompanionProfileDoc = Doc<typeof CompanionProfileSchema>;
export type ServiceDoc = Doc<typeof CompanionServiceSchema>;
export type OrderDoc = Doc<typeof OrderSchema>;
export type GameDoc = Doc<typeof GameSchema>;
export type VoiceRoomDoc = Doc<typeof VoiceRoomSchema>;
export type ConversationDoc = Doc<typeof ConversationSchema>;
