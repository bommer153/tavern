import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { type ClientSession, Types } from 'mongoose';
import type { CreateOrderInput, Order, OrderStatus } from '@tavern/shared';
import { AppError, badRequest, conflict, forbidden, notFound } from '../common/http.js';
import { Db, InjectM, type M } from '../db/database.module.js';
import { EarningsService } from '../earnings/earnings.service.js';
import { NotificationsService } from '../notifications/notifications.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { BlocksService } from '../users/users.js';
import { WalletService } from '../wallet/wallet.service.js';
import { type Actor, assertTransition, priceOrder } from './order-rules.js';

const ACTIVE: OrderStatus[] = ['pending_acceptance', 'accepted', 'in_progress', 'extension_requested'];
const orderNo = () => {
  const d = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `TV-${d}-${randomBytes(4).toString('hex').toUpperCase()}`;
};
const pub = (u: any) => ({ id: String(u?._id), username: u?.username, displayName: u?.displayName, avatarUrl: u?.avatarUrl, roles: u?.roles ?? [] });

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Orders');
  private timer?: NodeJS.Timeout;

  constructor(
    private db: Db,
    private wallet: WalletService,
    private earnings: EarningsService,
    private notifications: NotificationsService,
    private rt: RealtimeGateway,
    private blocks: BlocksService,
    @InjectM('Order') private orders: M<'Order'>,
    @InjectM('OrderEvent') private events: M<'OrderEvent'>,
    @InjectM('CompanionService') private services: M<'CompanionService'>,
    @InjectM('CompanionProfile') private profiles: M<'CompanionProfile'>,
    @InjectM('Game') private games: M<'Game'>,
    @InjectM('User') private users: M<'User'>,
    @InjectM('Review') private reviews: M<'Review'>,
    @InjectM('Conversation') private conversations: M<'Conversation'>,
    @InjectM('ConversationMember') private members: M<'ConversationMember'>,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    // shortcut: in-process interval; move to a scheduled worker when running multiple API instances.
    this.timer = setInterval(() => this.sweep().catch((e) => this.log.error(e.message)), 60_000);
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async toDto(o: any): Promise<Order> {
    const [customer, companion] = await Promise.all([
      this.users.findById(o.customerId, { username: 1, displayName: 1, avatarUrl: 1, roles: 1 }).lean(),
      this.users.findById(o.companionId, { username: 1, displayName: 1, avatarUrl: 1, roles: 1 }).lean(),
    ]);
    return {
      id: String(o._id),
      orderNo: o.orderNo,
      customer: pub(customer),
      companion: pub(companion),
      service: { id: String(o.serviceId), title: o.service.title, category: o.service.category, unitMinutes: o.service.unitMinutes, gameName: o.service.gameName },
      units: o.units,
      durationMinutes: o.durationMinutes,
      scheduledStart: o.scheduledStart?.toISOString(),
      status: o.status,
      amounts: { subtotal: o.amounts.subtotal, serviceFee: o.amounts.serviceFee, total: o.amounts.total, commission: o.amounts.commission, companionEarning: o.amounts.companionEarning },
      paidWithCoins: o.paidWithCoins,
      notes: o.notes,
      startedAt: o.startedAt?.toISOString(),
      endsAt: o.endsAt?.toISOString(),
      completedAt: o.completedAt?.toISOString(),
      conversationId: o.conversationId ? String(o.conversationId) : undefined,
      reviewed: !!o.reviewed,
      createdAt: o.createdAt.toISOString(),
    };
  }

  async create(customerId: string, i: CreateOrderInput) {
    const existing = await this.orders.findOne({ customerId, idempotencyKey: i.idempotencyKey }).lean();
    if (existing) return this.toDto(existing);

    const service = await this.services.findOne({ _id: i.serviceId, active: true }).lean();
    if (!service) throw notFound('Service');
    const companionId = String(service.companionId);
    if (companionId === customerId) throw badRequest('INVALID', 'You cannot book your own service');
    const [profile, companionUser, game] = await Promise.all([
      this.profiles.findOne({ userId: companionId, status: 'approved' }).lean(),
      this.users.findOne({ _id: companionId, status: 'active' }).lean(),
      this.games.findById(service.gameId).lean(),
    ]);
    if (!profile || !companionUser) throw badRequest('COMPANION_UNAVAILABLE', 'This companion is not accepting orders');
    if (await this.blocks.blockedBetween(customerId, companionId)) throw forbidden('You cannot book this companion');
    if (i.units > service.maxUnits) throw badRequest('TOO_LONG', `Maximum ${service.maxUnits} sessions per order`);

    const minutes = service.unitMinutes * i.units;
    const now = new Date();
    // One flow: every order is a session that starts now, with an online companion.
    if (!profile.online) throw badRequest('COMPANION_OFFLINE', 'This companion is offline right now. Follow them to see when they’re back.');
    const start = now;
    const end = new Date(start.getTime() + minutes * 60_000);
    const settings = await this.db.settings();
    const price = priceOrder(service.pricePerUnitCentavos, i.units, settings);
    const orderId = new Types.ObjectId();

    try {
      await this.db.tx(async (session) => {
        // Write to the companion profile so concurrent bookings for this companion conflict; the loser retries and sees the overlap.
        await this.profiles.updateOne({ userId: companionId }, { $inc: { bookingSeq: 1 } }, { session });
        const overlap = await this.orders
          .exists({ companionId, status: { $in: ACTIVE }, slotStart: { $lt: end }, slotEnd: { $gt: start } })
          .session(session);
        if (overlap) throw conflict('SLOT_TAKEN', 'The companion is already booked for that time');
        await this.wallet.debit(
          { userId: customerId, coins: price.coins, type: 'order_payment', description: `${service.title} with ${companionUser.displayName}`, refType: 'order', refId: orderId, idempotencyKey: `order:${i.idempotencyKey}` },
          session,
        );
        await this.orders.create(
          [
            {
              _id: orderId,
              orderNo: orderNo(),
              customerId,
              companionId,
              serviceId: service._id,
              service: { title: service.title, category: service.category, gameId: service.gameId, gameName: game?.name ?? '', pricePerUnitCentavos: service.pricePerUnitCentavos, unitMinutes: service.unitMinutes },
              units: i.units,
              durationMinutes: minutes,
              slotStart: start,
              slotEnd: end,
              status: 'pending_acceptance',
              amounts: { subtotal: price.subtotal, serviceFee: price.serviceFee, total: price.total, commissionPercent: price.commissionPercent, commission: price.commission, companionEarning: price.companionEarning },
              paidWithCoins: price.coins,
              notes: i.notes,
              gameDetails: i.gameDetails,
              idempotencyKey: i.idempotencyKey,
            },
          ],
          { session },
        );
        await this.events.create([{ orderId, from: 'pending_payment', to: 'pending_acceptance', actorId: customerId, note: 'Paid with wallet' }], { session });
      });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        const dup = await this.orders.findOne({ customerId, idempotencyKey: i.idempotencyKey }).lean();
        if (dup) return this.toDto(dup);
      }
      throw e;
    }
    const order = await this.orders.findById(orderId).lean();
    await this.notifications.notify(companionId, 'order', 'New order request', `${service.title} · ${i.units}× ${service.unitMinutes} min`, `/orders/${orderId}`);
    return this.toDto(order);
  }

  private async load(id: string) {
    const o = await this.orders.findById(id);
    if (!o) throw notFound('Order');
    return o;
  }

  private roleIn(o: { customerId: unknown; companionId: unknown }, userId: string): Actor | null {
    if (String(o.customerId) === userId) return 'customer';
    if (String(o.companionId) === userId) return 'companion';
    return null;
  }

  async get(id: string, userId: string, roles: string[]) {
    const o = await this.orders.findById(id).lean();
    if (!o || (!this.roleIn(o, userId) && !roles.includes('admin'))) throw notFound('Order');
    return { ...(await this.toDto(o)), serverNow: new Date().toISOString() };
  }

  async listMine(userId: string, as: 'customer' | 'companion', status: string | undefined, page: number, limit = 20) {
    const filter: Record<string, unknown> = { [as === 'companion' ? 'companionId' : 'customerId']: userId };
    if (status === 'active') filter.status = { $in: ACTIVE };
    else if (status === 'past') filter.status = { $nin: ACTIVE };
    else if (status) filter.status = status;
    const [rows, total] = await Promise.all([
      this.orders.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.orders.countDocuments(filter),
    ]);
    return { items: await Promise.all(rows.map((r) => this.toDto(r))), page, total, hasMore: page * limit < total };
  }

  /** Applies a transition with optimistic concurrency on status; extra writes run in the same transaction. */
  private async transition(
    id: string,
    to: OrderStatus,
    actor: Actor,
    actorId: string | null,
    extra: (o: any, session: ClientSession) => Promise<Record<string, unknown> | void> = async () => {},
    note?: string,
  ) {
    await this.db.tx(async (session) => {
      const o = await this.orders.findById(id).session(session);
      if (!o) throw notFound('Order');
      const from = o.status as OrderStatus;
      assertTransition(from, to, actor);
      const set = (await extra(o, session)) ?? {};
      const r = await this.orders.updateOne({ _id: o._id, status: from }, { $set: { status: to, ...set } }, { session });
      if (!r.modifiedCount) throw new AppError(409, 'CONFLICT', 'Order changed, please retry');
      await this.events.create([{ orderId: o._id, from, to, actorId: actorId ?? undefined, note }], { session });
    });
    const o = await this.orders.findById(id).lean();
    const dto = await this.toDto(o);
    for (const uid of [o!.customerId, o!.companionId]) this.rt.toUser(uid, 'order:updated', dto);
    return dto;
  }

  private refund(o: any, reason: string, session: ClientSession) {
    return this.wallet.credit(
      { userId: o.customerId, coins: o.paidWithCoins, type: 'order_refund', description: `Refund: ${o.service.title} (${reason})`, refType: 'order', refId: o._id, idempotencyKey: `refund:${o._id}` },
      session,
    );
  }

  async act(id: string, userId: string, action: 'accept' | 'decline' | 'cancel' | 'start' | 'complete' | 'dispute', reason?: string) {
    const o = await this.load(id);
    const actor = this.roleIn(o, userId);
    if (!actor) throw notFound('Order');
    const now = new Date();
    const title = o.service?.title ?? 'Order';
    switch (action) {
      case 'accept': {
        const dto = await this.transition(id, 'accepted', actor, userId, async (ord, session) => {
          const conversationId = await this.ensureOrderConversation(ord, session);
          return { acceptedAt: now, conversationId };
        });
        await this.notifications.notify(o.customerId, 'order', 'Order accepted', `${title} was accepted`, `/orders/${id}`);
        return dto;
      }
      case 'decline': {
        const dto = await this.transition(id, 'declined', actor, userId, async (ord, s) => void (await this.refund(ord, 'declined', s)), reason);
        await this.notifications.notify(o.customerId, 'order', 'Order declined', `${title} was declined. Your coins were refunded.`, `/orders/${id}`);
        return dto;
      }
      case 'cancel': {
        if (actor === 'customer' && o.status === 'accepted') {
          const startsIn = o.slotStart.getTime() - now.getTime();
          // Only orders scheduled before scheduling was removed can still be cancelled ahead of time.
          if (!o.scheduledStart || startsIn < 2 * 3600_000)
            throw badRequest('CANCELLATION_WINDOW', 'Accepted sessions can only be cancelled more than 2 hours before the start. Open a dispute if there is a problem.');
        }
        const dto = await this.transition(id, 'cancelled', actor, userId, async (ord, s) => {
          await this.refund(ord, 'cancelled', s);
          return { cancelledAt: now };
        }, reason);
        const other = actor === 'customer' ? o.companionId : o.customerId;
        await this.notifications.notify(other, 'order', 'Order cancelled', `${title} was cancelled`, `/orders/${id}`);
        return dto;
      }
      case 'start': {
        if (o.scheduledStart && now.getTime() < o.scheduledStart.getTime() - 10 * 60_000) // legacy scheduled orders
          throw badRequest('TOO_EARLY', 'You can start up to 10 minutes before the scheduled time');
        const dto = await this.transition(id, 'in_progress', actor, userId, async (ord) => ({
          startedAt: now,
          endsAt: new Date(now.getTime() + ord.durationMinutes * 60_000),
        }));
        await this.notifications.notify(o.customerId, 'order', 'Session started', `${title} has started`, `/orders/${id}`);
        return dto;
      }
      case 'complete': {
        if (actor === 'companion' && o.endsAt && now < o.endsAt)
          throw badRequest('SESSION_NOT_OVER', 'The session timer has not finished yet');
        return this.complete(id, actor, userId);
      }
      case 'dispute': {
        const { disputeWindowHours } = await this.db.settings();
        if (o.status === 'completed' && now.getTime() - (o.completedAt?.getTime() ?? 0) > disputeWindowHours * 3600_000)
          throw badRequest('DISPUTE_WINDOW_CLOSED', 'The dispute window for this order has closed');
        if (!reason) throw badRequest('REASON_REQUIRED', 'Tell us what went wrong');
        return this.transition(id, 'disputed', actor, userId, undefined, reason);
      }
    }
  }

  private async complete(id: string, actor: Actor, actorId: string | null) {
    const dto = await this.transition(id, 'completed', actor, actorId, async (ord, session) => {
      await this.earnings.creditPending({ companionId: ord.companionId, amountCentavos: ord.amounts.companionEarning, type: 'order_earning', refType: 'order', refId: ord._id }, session);
      await this.profiles.updateOne({ userId: ord.companionId }, { $inc: { completedOrders: 1 } }, { session });
      return { completedAt: new Date() };
    });
    await this.notifications.notify(dto.customer.id, 'order', 'Session complete', 'How was it? Leave a review.', `/orders/${id}`);
    return dto;
  }

  async resolveDispute(id: string, adminId: string, outcome: 'refund' | 'release', note: string) {
    if (outcome === 'refund') {
      const dto = await this.transition(id, 'refunded', 'admin', adminId, async (ord, s) => {
        await this.refund(ord, 'dispute resolved', s);
        await this.earnings.reverseOrderEarning(ord._id, s);
        await this.db.audit(adminId, 'order.refund', 'Order', id, { note }, s);
      }, note);
      await this.notifications.notify(dto.customer.id, 'payment', 'Refund approved', `Your coins for ${dto.orderNo} were refunded.`, `/orders/${id}`);
      return dto;
    }
    return this.transition(id, 'completed', 'admin', adminId, async (ord, s) => {
      if (!(await this.earnings.hasOrderEarning(ord._id, s))) {
        await this.earnings.creditPending({ companionId: ord.companionId, amountCentavos: ord.amounts.companionEarning, type: 'order_earning', refType: 'order', refId: ord._id }, s);
        await this.profiles.updateOne({ userId: ord.companionId }, { $inc: { completedOrders: 1 } }, { session: s });
      }
      await this.db.audit(adminId, 'order.release', 'Order', id, { note }, s);
      return { completedAt: ord.completedAt ?? new Date() };
    }, note);
  }

  async review(id: string, userId: string, rating: number, comment?: string) {
    await this.db.tx(async (session) => {
      const o = await this.orders.findOneAndUpdate({ _id: id, customerId: userId, status: 'completed', reviewed: false }, { reviewed: true }, { session });
      if (!o) throw badRequest('CANNOT_REVIEW', 'Only completed, unreviewed orders can be reviewed');
      await this.reviews.create([{ orderId: o._id, companionId: o.companionId, authorId: userId, rating, comment }], { session });
      await this.profiles.updateOne(
        { userId: o.companionId },
        [
          {
            $set: {
              ratingAvg: { $divide: [{ $add: [{ $multiply: ['$ratingAvg', '$ratingCount'] }, rating] }, { $add: ['$ratingCount', 1] }] },
              ratingCount: { $add: ['$ratingCount', 1] },
            },
          },
        ],
        { session, updatePipeline: true } as any,
      );
    });
  }

  private async ensureOrderConversation(o: any, session: ClientSession) {
    const existing = await this.conversations.findOne({ type: 'order', orderId: o._id }).session(session);
    if (existing) return existing._id;
    const [c] = await this.conversations.create(
      [{ type: 'order', orderId: o._id, memberIds: [o.customerId, o.companionId], lastMessageAt: new Date(), lastMessagePreview: `Order ${o.orderNo} accepted` }],
      { session },
    );
    await this.members.create(
      [o.customerId, o.companionId].map((userId) => ({ conversationId: c!._id, userId, lastMessageAt: new Date() })),
      { session, ordered: true },
    );
    return c!._id;
  }

  /** Server-authoritative timers: auto-complete finished sessions and expire stale requests. */
  async sweep(now = new Date()) {
    const { autoCompleteGraceMinutes } = await this.db.settings();
    const finished = await this.orders.find({ status: 'in_progress', endsAt: { $lt: new Date(now.getTime() - autoCompleteGraceMinutes * 60_000) } }, { _id: 1 }).limit(100).lean();
    for (const o of finished) await this.complete(String(o._id), 'system', null).catch((e) => this.log.warn(e.message));
    const stale = await this.orders.find({ status: 'pending_acceptance', slotStart: { $lt: new Date(now.getTime() - 15 * 60_000) } }).limit(100).lean();
    for (const o of stale) {
      await this.transition(String(o._id), 'cancelled', 'system', null, async (ord, s) => {
        await this.refund(ord, 'not accepted in time', s);
        return { cancelledAt: now };
      }, 'Expired').catch((e) => this.log.warn(e.message));
      await this.notifications.notify(o.customerId, 'order', 'Order expired', 'The companion did not respond in time. Your coins were refunded.', `/orders/${o._id}`);
    }
    return { completed: finished.length, expired: stale.length };
  }
}
