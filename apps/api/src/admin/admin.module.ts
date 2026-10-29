import { Body, Controller, Get, HttpCode, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { z } from 'zod';
import { ACCOUNT_STATUSES, COSMETIC_KINDS, COSMETIC_UNLOCKS, GIFT_RARITIES, PAYOUT_STATUSES, ROLES, reportSchema } from '@tavern/shared';
import { AuthService, toMe } from '../auth/auth.service.js';
import { type AuthUser, badRequest, conflict, CurrentUser, forbidden, notFound, ObjectIdPipe, Roles, ZodPipe } from '../common/http.js';
import { CompanionsModule } from '../companions/companions.module.js';
import { CompanionsService } from '../companions/companions.service.js';
import { CosmeticsModule, CosmeticsService, toCosmetic } from '../cosmetics/cosmetics.module.js';
import { Db, InjectM, type M, SETTING_DEFAULTS } from '../db/database.module.js';
import { EarningsService } from '../earnings/earnings.service.js';
import { NotificationsService } from '../notifications/notifications.js';
import { OrdersModule } from '../orders/orders.module.js';
import { OrdersService } from '../orders/orders.service.js';
import { toGame } from '../users/users.js';
import { VoiceModule, VoiceService } from '../voice/voice.module.js';
import { toGift, WalletModule } from '../wallet/wallet.module.js';
import { WalletService } from '../wallet/wallet.service.js';

const page = (p?: string) => Math.max(1, Number(p) || 1);
const LIMIT = 25;
async function paged(model: any, filter: object, p: number, map: (x: any) => any = (x) => x, populate?: [string, string][]) {
  let q = model.find(filter).sort({ createdAt: -1 }).skip((p - 1) * LIMIT).limit(LIMIT);
  for (const [path, fields] of populate ?? []) q = q.populate(path, fields);
  const [rows, total] = await Promise.all([q.lean(), model.countDocuments(filter)]);
  return { items: rows.map(map), page: p, total, hasMore: p * LIMIT < total };
}

/** Payout lifecycle; rejected/failed release the reserved funds back to available. */
const PAYOUT_NEXT: Record<string, string[]> = {
  requested: ['under_review', 'approved', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['processing', 'rejected'],
  processing: ['paid', 'failed'],
};

const giftBody = z.object({
  name: z.string().min(1).max(40),
  coinCost: z.number().int().min(1).max(1_000_000),
  imageUrl: z.string().min(1).max(500),
  animation: z.string().max(500).optional(), // '' clears it
  category: z.string().max(30).optional(),
  rarity: z.enum(GIFT_RARITIES).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
const cosmeticFields = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/).max(40),
  kind: z.enum(COSMETIC_KINDS),
  name: z.string().min(1).max(40),
  description: z.string().max(200).optional(),
  category: z.string().max(30).optional(),
  rarity: z.enum(GIFT_RARITIES).optional(),
  unlock: z.enum(COSMETIC_UNLOCKS),
  priceCoins: z.number().int().min(0).max(1_000_000),
  available: z.boolean().optional(),
  renderer: z.enum(['css', 'webgl']).optional(),
  sortOrder: z.number().int().optional(),
});
const cosmeticBody = cosmeticFields.refine((c) => c.unlock !== 'purchase' || c.priceCoins > 0, 'Items for sale need a price');
const packageBody = z.object({
  coins: z.number().int().min(1),
  bonusCoins: z.number().int().min(0).optional(),
  priceCentavos: z.number().int().min(100),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
const gameBody = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(40),
  name: z.string().min(1).max(60),
  iconUrl: z.string().max(500).optional(),
  coverUrl: z.string().max(500).optional(),
  platforms: z.array(z.string().max(20)).max(6).optional(),
  ranks: z.array(z.string().max(40)).max(20).optional(),
  roles: z.array(z.string().max(30)).max(12).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
const settingsBody = z.object(Object.fromEntries(Object.keys(SETTING_DEFAULTS).map((k) => [k, z.number().min(0).max(1_000_000).optional()])));

/** Endpoints shared by moderators and admins: trust & safety only, no financial access. */
@ApiTags('moderation')
@Controller()
class ModerationController {
  constructor(
    private db: Db,
    private auth: AuthService,
    private notifications: NotificationsService,
    private voice: VoiceService,
    @InjectM('Report') private reports: M<'Report'>,
    @InjectM('ModerationAction') private actions: M<'ModerationAction'>,
    @InjectM('User') private users: M<'User'>,
    @InjectM('Review') private reviews: M<'Review'>,
    @InjectM('VoiceRoom') private rooms: M<'VoiceRoom'>,
    @InjectM('Message') private messages: M<'Message'>,
  ) {}

  @Post('reports')
  @HttpCode(204)
  async report(@CurrentUser() u: AuthUser, @Body(new ZodPipe(reportSchema)) b: any) {
    if (await this.reports.exists({ reporterId: u.id, targetType: b.targetType, targetId: b.targetId, status: 'open' })) return;
    await this.reports.create({ reporterId: u.id, ...b });
  }

  @Roles('moderator')
  @Get('admin/reports')
  async listReports(@Query('status') status = 'open', @Query('page') p?: string) {
    return paged(this.reports, { status }, page(p), (r) => ({ ...r, id: String(r._id) }), [['reporterId', 'username displayName']]);
  }

  @Roles('moderator')
  @Post('admin/reports/:id/resolve')
  @HttpCode(204)
  async resolveReport(
    @CurrentUser() u: AuthUser,
    @Param('id', ObjectIdPipe) id: string,
    @Body(new ZodPipe(z.object({ action: z.enum(['dismiss', 'warn', 'suspend_user', 'hide_review', 'close_room']), note: z.string().min(1).max(500) }))) b: any,
  ) {
    const report = await this.reports.findOne({ _id: id, status: 'open' });
    if (!report) throw notFound('Report');
    let targetUserId: any = report.targetType === 'user' ? report.targetId : undefined;
    if (report.targetType === 'message') targetUserId = (await this.messages.findById(report.targetId).lean())?.senderId;
    if (b.action === 'suspend_user') {
      if (!targetUserId) throw badRequest('INVALID', 'No user to suspend for this report');
      await this.setStatus(u, String(targetUserId), 'suspended', b.note);
    } else if (b.action === 'hide_review') {
      if (report.targetType !== 'review') throw badRequest('INVALID', 'Report is not about a review');
      await this.reviews.updateOne({ _id: report.targetId }, { hidden: true });
    } else if (b.action === 'close_room') {
      if (report.targetType !== 'room') throw badRequest('INVALID', 'Report is not about a room');
      await this.voice.close(String(report.targetId), u.id, false, u.roles);
    } else if (b.action === 'warn' && targetUserId) {
      await this.notifications.notify(targetUserId, 'safety', 'Community guidelines warning', b.note, '/legal/guidelines');
    }
    report.status = b.action === 'dismiss' ? 'dismissed' : 'resolved';
    report.resolvedBy = u.id as any;
    report.resolution = `${b.action}: ${b.note}`;
    await report.save();
    await this.actions.create({ actorId: u.id, targetUserId, action: b.action, reason: b.note, reportId: report._id });
  }

  @Roles('moderator')
  @Get('admin/users')
  async listUsers(@Query('q') q?: string, @Query('status') status?: string, @Query('role') role?: string, @Query('page') p?: string) {
    const filter: Record<string, unknown> = {};
    if (q) filter.$or = [{ email: q.toLowerCase() }, { usernameLower: { $regex: '^' + q.toLowerCase().replace(/[^a-z0-9_]/g, '') } }];
    if (status) filter.status = status;
    if (role) filter.roles = role;
    return paged(this.users, filter, page(p), (x) => ({ ...toMe(x), status: x.status, createdAt: x.createdAt }));
  }

  @Roles('moderator')
  @Post('admin/users/:id/status')
  @HttpCode(204)
  async status(
    @CurrentUser() u: AuthUser,
    @Param('id', ObjectIdPipe) id: string,
    @Body(new ZodPipe(z.object({ status: z.enum(ACCOUNT_STATUSES), reason: z.string().min(1).max(500) }))) b: any,
  ) {
    await this.setStatus(u, id, b.status, b.reason);
  }

  private async setStatus(actor: AuthUser, id: string, status: string, reason: string) {
    if (id === actor.id) throw badRequest('INVALID', 'You cannot change your own status');
    const target = await this.users.findById(id).lean();
    if (!target) throw notFound('User');
    // Moderators cannot act on staff accounts.
    if (!actor.roles.includes('admin') && target.roles.some((r) => r === 'admin' || r === 'moderator')) throw forbidden('Only admins can change staff accounts');
    await this.users.updateOne({ _id: id }, { status, statusReason: reason });
    if (status !== 'active') await this.auth.revokeAll(id);
    await this.actions.create({ actorId: actor.id, targetUserId: id, action: `status.${status}`, reason });
    await this.db.audit(actor.id, `user.status.${status}`, 'User', id, { reason });
  }

  @Roles('moderator')
  @Get('admin/rooms')
  async liveRooms() {
    const rows = await this.rooms.find({ status: 'live' }).sort({ participantCount: -1 }).limit(100).lean();
    return Promise.all(rows.map((r) => this.voice.toDto(r)));
  }
}

/** Admin-only: catalog, finance, applications, settings. */
@ApiTags('admin')
@Controller('admin')
@Roles('admin')
class AdminController {
  constructor(
    private db: Db,
    private companions: CompanionsService,
    private orders: OrdersService,
    private wallet: WalletService,
    private earnings: EarningsService,
    private notifications: NotificationsService,
    private cosmeticsSvc: CosmeticsService,
    @InjectM('User') private users: M<'User'>,
    @InjectM('Cosmetic') private cosmetics: M<'Cosmetic'>,
    @InjectM('CompanionApplication') private applications: M<'CompanionApplication'>,
    @InjectM('CompanionProfile') private profiles: M<'CompanionProfile'>,
    @InjectM('Order') private orderModel: M<'Order'>,
    @InjectM('PaymentTransaction') private payments: M<'PaymentTransaction'>,
    @InjectM('WalletTransaction') private ledger: M<'WalletTransaction'>,
    @InjectM('Gift') private gifts: M<'Gift'>,
    @InjectM('CoinPackage') private packages: M<'CoinPackage'>,
    @InjectM('Game') private games: M<'Game'>,
    @InjectM('PayoutRequest') private payouts: M<'PayoutRequest'>,
    @InjectM('AuditLog') private audits: M<'AuditLog'>,
    @InjectM('Report') private reports: M<'Report'>,
    @InjectM('VoiceRoom') private rooms: M<'VoiceRoom'>,
  ) {}

  @Get('overview')
  async overview() {
    const since = new Date(Date.now() - 30 * 86400_000);
    const [users, companions, pendingApplications, activeOrders, disputes, openReports, liveRooms, pendingPayouts, revenue] = await Promise.all([
      this.users.countDocuments(),
      this.profiles.countDocuments({ status: 'approved' }),
      this.applications.countDocuments({ status: { $in: ['submitted', 'under_review'] } }),
      this.orderModel.countDocuments({ status: { $in: ['pending_acceptance', 'accepted', 'in_progress'] } }),
      this.orderModel.countDocuments({ status: 'disputed' }),
      this.reports.countDocuments({ status: 'open' }),
      this.rooms.countDocuments({ status: 'live' }),
      this.payouts.countDocuments({ status: { $in: ['requested', 'under_review', 'approved', 'processing'] } }),
      this.payments.aggregate([{ $match: { status: 'paid', paidAt: { $gte: since } } }, { $group: { _id: null, total: { $sum: '$amountCentavos' } } }]),
    ]);
    return { users, companions, pendingApplications, activeOrders, disputes, openReports, liveRooms, pendingPayouts, topupRevenue30dCentavos: revenue[0]?.total ?? 0 };
  }

  @Post('users/:id/roles')
  @HttpCode(204)
  async roles(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(z.object({ roles: z.array(z.enum(ROLES)).min(1) }))) b: any) {
    if (id === u.id && !b.roles.includes('admin')) throw badRequest('INVALID', 'You cannot remove your own admin role');
    if (b.roles.includes('companion') && !(await this.profiles.exists({ userId: id }))) throw badRequest('INVALID', 'Approve a companion application instead');
    await this.users.updateOne({ _id: id }, { roles: b.roles });
    await this.db.audit(u.id, 'user.roles', 'User', id, { roles: b.roles });
  }

  @Get('applications')
  applicationsList(@Query('status') status?: string, @Query('page') p?: string) {
    return paged(this.applications, status ? { status } : { status: { $in: ['submitted', 'under_review'] } }, page(p), (a) => ({ ...a, id: String(a._id) }), [
      ['userId', 'username displayName email avatarUrl'],
      ['games.gameId', 'name'],
    ]);
  }

  @Post('applications/:id/decision')
  @HttpCode(204)
  decide(
    @CurrentUser() u: AuthUser,
    @Param('id', ObjectIdPipe) id: string,
    @Body(new ZodPipe(z.object({ decision: z.enum(['approved', 'rejected', 'under_review']), note: z.string().max(500).optional() }))) b: any,
  ) {
    return this.companions.decideApplication(id, u.id, b.decision, b.note);
  }

  @Post('companions/:userId/feature')
  @HttpCode(204)
  async feature(@CurrentUser() u: AuthUser, @Param('userId', ObjectIdPipe) userId: string, @Body(new ZodPipe(z.object({ featured: z.boolean() }))) b: any) {
    const r = await this.profiles.updateOne({ userId }, { featured: b.featured });
    if (!r.matchedCount) throw notFound('Companion');
    await this.db.audit(u.id, 'companion.feature', 'User', userId, b);
  }

  @Get('orders')
  async ordersList(@Query('status') status?: string, @Query('page') p?: string) {
    const res = await paged(this.orderModel, status ? { status } : {}, page(p));
    return { ...res, items: await Promise.all(res.items.map((o: any) => this.orders.toDto(o))) };
  }

  @Post('orders/:id/resolve')
  @HttpCode(200)
  resolve(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(z.object({ outcome: z.enum(['refund', 'release']), note: z.string().min(1).max(500) }))) b: any) {
    return this.orders.resolveDispute(id, u.id, b.outcome, b.note);
  }

  @Get('payments')
  paymentsList(@Query('status') status?: string, @Query('page') p?: string) {
    return paged(this.payments, status ? { status } : {}, page(p), (x) => ({ ...x, id: String(x._id) }), [['userId', 'username email']]);
  }

  @Get('ledger')
  ledgerList(@Query('userId') userId?: string, @Query('page') p?: string) {
    return paged(this.ledger, userId && Types.ObjectId.isValid(userId) ? { userId } : {}, page(p), (x) => ({ ...x, id: String(x._id) }), [['userId', 'username']]);
  }

  @Get('reconcile')
  reconcile() {
    return this.wallet.reconcile();
  }

  @Post('wallet-adjustments')
  @HttpCode(204)
  async adjust(
    @CurrentUser() u: AuthUser,
    @Body(new ZodPipe(z.object({ userId: z.string().length(24), amount: z.number().int().refine((n) => n !== 0), reason: z.string().min(3).max(300), idempotencyKey: z.string().min(8).max(64) }))) b: any,
  ) {
    if (await this.ledger.exists({ userId: b.userId, idempotencyKey: `adj:${b.idempotencyKey}` })) return;
    await this.db.tx(async (session) => {
      const entry = { userId: b.userId, coins: Math.abs(b.amount), type: 'adjustment' as const, description: `Adjustment: ${b.reason}`, idempotencyKey: `adj:${b.idempotencyKey}`, actorId: u.id };
      if (b.amount > 0) await this.wallet.credit(entry, session);
      else await this.wallet.debit(entry, session);
      await this.db.audit(u.id, 'wallet.adjust', 'User', b.userId, { amount: b.amount, reason: b.reason }, session);
    });
  }

  @Get('gifts')
  async giftList() {
    return (await this.gifts.find().sort({ sortOrder: 1 }).lean()).map(toGift);
  }
  @Post('gifts')
  async giftCreate(@CurrentUser() u: AuthUser, @Body(new ZodPipe(giftBody)) b: any) {
    const g = await this.gifts.create(b);
    await this.db.audit(u.id, 'gift.create', 'Gift', String(g._id), b);
    return toGift(g.toObject());
  }
  @Patch('gifts/:id')
  async giftUpdate(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(giftBody.partial())) b: any) {
    // Price changes only affect future sends; past giftTransactions keep their recorded unit cost.
    const g = await this.gifts.findByIdAndUpdate(id, { $set: b }, { returnDocument: 'after' }).lean();
    if (!g) throw notFound('Gift');
    await this.db.audit(u.id, 'gift.update', 'Gift', id, b);
    return toGift(g);
  }

  @Get('cosmetics')
  async cosmeticList() {
    return (await this.cosmetics.find().sort({ kind: 1, sortOrder: 1 }).lean()).map(toCosmetic);
  }
  @Post('cosmetics')
  async cosmeticCreate(@CurrentUser() u: AuthUser, @Body(new ZodPipe(cosmeticBody)) b: any) {
    if (await this.cosmetics.exists({ key: b.key })) throw conflict('DUPLICATE', 'An item with this key already exists');
    const c = await this.cosmetics.create(b);
    await this.db.audit(u.id, 'cosmetic.create', 'Cosmetic', String(c._id), b);
    return toCosmetic(c.toObject());
  }
  @Patch('cosmetics/:id')
  async cosmeticUpdate(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(cosmeticFields.omit({ key: true, kind: true }).partial())) b: any) {
    // Key and kind are the artwork's identity; owners keep what they bought when prices or availability change.
    const cur = await this.cosmetics.findById(id).lean();
    if (!cur) throw notFound('Item');
    if ((b.unlock ?? cur.unlock) === 'purchase' && (b.priceCoins ?? cur.priceCoins) <= 0) throw badRequest('INVALID', 'Items for sale need a price');
    const c = (await this.cosmetics.findByIdAndUpdate(id, { $set: b, $inc: { version: 1 } }, { returnDocument: 'after' }).lean())!;
    await this.db.audit(u.id, 'cosmetic.update', 'Cosmetic', id, b);
    return toCosmetic(c);
  }
  @Post('cosmetics/:id/grant')
  @HttpCode(204)
  cosmeticGrant(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(z.object({ userId: z.string().length(24) }))) b: { userId: string }) {
    return this.cosmeticsSvc.grant(u.id, id, b.userId);
  }

  @Get('packages')
  async packageList() {
    return (await this.packages.find().sort({ sortOrder: 1, priceCentavos: 1 }).lean()).map((p) => ({ ...p, id: String(p._id) }));
  }
  @Post('packages')
  async packageCreate(@CurrentUser() u: AuthUser, @Body(new ZodPipe(packageBody)) b: any) {
    const p = await this.packages.create(b);
    await this.db.audit(u.id, 'package.create', 'CoinPackage', String(p._id), b);
    return { ...p.toObject(), id: String(p._id) };
  }
  @Patch('packages/:id')
  async packageUpdate(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(packageBody.partial())) b: any) {
    const p = await this.packages.findByIdAndUpdate(id, { $set: b }, { returnDocument: 'after' }).lean();
    if (!p) throw notFound('Package');
    await this.db.audit(u.id, 'package.update', 'CoinPackage', id, b);
    return { ...p, id: String(p._id) };
  }

  @Get('games')
  async gameList() {
    return (await this.games.find().sort({ sortOrder: 1 }).lean()).map((g) => ({ ...toGame(g), active: g.active, sortOrder: g.sortOrder }));
  }
  @Post('games')
  async gameCreate(@CurrentUser() u: AuthUser, @Body(new ZodPipe(gameBody)) b: any) {
    const g = await this.games.create(b);
    await this.db.audit(u.id, 'game.create', 'Game', String(g._id), b);
    return toGame(g.toObject());
  }
  @Patch('games/:id')
  async gameUpdate(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(gameBody.partial())) b: any) {
    const g = await this.games.findByIdAndUpdate(id, { $set: b }, { returnDocument: 'after' }).lean();
    if (!g) throw notFound('Game');
    await this.db.audit(u.id, 'game.update', 'Game', id, b);
    return toGame(g);
  }

  @Get('payouts')
  payoutList(@Query('status') status?: string, @Query('page') p?: string) {
    return paged(this.payouts, status ? { status } : {}, page(p), (x) => ({ ...x, id: String(x._id) }), [['companionId', 'username displayName email']]);
  }

  @Post('payouts/:id/status')
  @HttpCode(204)
  async payoutStatus(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(z.object({ status: z.enum(PAYOUT_STATUSES), note: z.string().max(500).optional() }))) b: any) {
    const p = await this.payouts.findById(id).lean();
    if (!p) throw notFound('Payout');
    if (!PAYOUT_NEXT[p.status]?.includes(b.status)) throw conflict('INVALID_TRANSITION', `Payout cannot move from ${p.status} to ${b.status}`);
    await this.db.tx(async (session) => {
      const r = await this.payouts.updateOne({ _id: id, status: p.status }, { status: b.status, note: b.note, reviewedBy: u.id }, { session });
      if (!r.modifiedCount) throw conflict('CONFLICT', 'Payout changed, please retry');
      if (b.status === 'rejected' || b.status === 'failed') await this.earnings.releasePayout(p.companionId, p.amountCentavos, p._id, session);
      await this.db.audit(u.id, `payout.${b.status}`, 'PayoutRequest', id, { note: b.note }, session);
    });
    await this.notifications.notify(p.companionId, 'payout', 'Payout update', `Your payout request is now ${b.status.replace('_', ' ')}.`, '/companion/earnings');
  }

  @Get('settings')
  settings() {
    return this.db.settings();
  }

  @Patch('settings')
  async saveSettings(@CurrentUser() u: AuthUser, @Body(new ZodPipe(settingsBody)) b: any) {
    if (b.commissionPercent > 100 || b.giftSharePercent > 100 || b.serviceFeePercent > 100) throw badRequest('INVALID', 'Percentages must be 0–100');
    if (b.coinValueCentavos === 0) throw badRequest('INVALID', 'Coin value must be positive');
    const s = await this.db.saveSettings(b);
    await this.db.audit(u.id, 'settings.update', 'PlatformSetting', '*', b);
    return s;
  }

  @Get('audit-logs')
  auditLogs(@Query('page') p?: string) {
    return paged(this.audits, {}, page(p), (x) => ({ ...x, id: String(x._id) }), [['actorId', 'username']]);
  }
}

@Module({ imports: [CompanionsModule, CosmeticsModule, OrdersModule, WalletModule, VoiceModule], controllers: [ModerationController, AdminController] })
export class AdminModule {}
