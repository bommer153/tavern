import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ClientSession, Types } from 'mongoose';
import { AppError } from '../common/http.js';
import { Db, InjectM, type M } from '../db/database.module.js';

/**
 * Companion cash earnings in centavos, kept apart from coin wallets.
 * Entries start "pending" and become "available" after the settlement hold, unless their order is disputed.
 */
@Injectable()
export class EarningsService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Earnings');
  private timer?: NodeJS.Timeout;

  constructor(
    private db: Db,
    @InjectM('EarningsAccount') private accounts: M<'EarningsAccount'>,
    @InjectM('EarningsEntry') private entries: M<'EarningsEntry'>,
    @InjectM('Order') private orders: M<'Order'>,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    // shortcut: in-process interval; move to a scheduled worker/queue when running multiple API instances.
    this.timer = setInterval(() => this.settleMatured().catch((e) => this.log.error(e.message)), 5 * 60_000);
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async creditPending(
    a: { companionId: Types.ObjectId | string; amountCentavos: number; type: 'order_earning' | 'gift_earning'; refType: string; refId: Types.ObjectId },
    session: ClientSession,
  ) {
    if (a.amountCentavos <= 0) return;
    const { settlementHoldHours } = await this.db.settings();
    await this.entries.create(
      [
        {
          companionId: a.companionId,
          type: a.type,
          amountCentavos: a.amountCentavos,
          status: 'pending',
          availableAt: new Date(Date.now() + settlementHoldHours * 3600_000),
          refType: a.refType,
          refId: a.refId,
        },
      ],
      { session },
    );
    await this.accounts.updateOne(
      { companionId: a.companionId },
      { $inc: { pending: a.amountCentavos, lifetime: a.amountCentavos } },
      { upsert: true, session },
    );
  }

  /** Reverses a still-pending order earning (refund after dispute). No-op if the order never earned. */
  async reverseOrderEarning(orderId: Types.ObjectId, session: ClientSession) {
    const entry = await this.entries.findOneAndUpdate(
      { refType: 'order', refId: orderId, type: 'order_earning', status: 'pending' },
      { status: 'reversed' },
      { session },
    );
    if (!entry) {
      if (await this.entries.exists({ refType: 'order', refId: orderId, type: 'order_earning' }).session(session))
        throw new AppError(409, 'EARNING_SETTLED', 'Earning already settled; use a manual adjustment');
      return;
    }
    await this.entries.create(
      [{ companionId: entry.companionId, type: 'reversal', amountCentavos: -entry.amountCentavos, status: 'settled', refType: 'order', refId: orderId }],
      { session },
    );
    await this.accounts.updateOne(
      { companionId: entry.companionId },
      { $inc: { pending: -entry.amountCentavos, lifetime: -entry.amountCentavos } },
      { session },
    );
  }

  async hasOrderEarning(orderId: Types.ObjectId, session: ClientSession) {
    return !!(await this.entries.exists({ refType: 'order', refId: orderId, type: 'order_earning' }).session(session));
  }

  /** Moves matured pending entries to available. Disputed orders stay held. */
  async settleMatured(now = new Date()) {
    const due = await this.entries.find({ status: 'pending', availableAt: { $lte: now } }).limit(500).lean();
    let settled = 0;
    for (const e of due) {
      if (e.refType === 'order') {
        const o = await this.orders.findById(e.refId, { status: 1 }).lean();
        if (o && o.status !== 'completed') continue;
      }
      await this.db.tx(async (session) => {
        const r = await this.entries.updateOne({ _id: e._id, status: 'pending' }, { status: 'available' }, { session });
        if (!r.modifiedCount) return;
        await this.accounts.updateOne(
          { companionId: e.companionId },
          { $inc: { pending: -e.amountCentavos, available: e.amountCentavos } },
          { session },
        );
        settled++;
      });
    }
    return settled;
  }

  /** Atomically reserves available balance for a payout. */
  async reserveForPayout(companionId: string, amount: number, payoutId: Types.ObjectId, session: ClientSession) {
    const acc = await this.accounts.findOneAndUpdate(
      { companionId, available: { $gte: amount } },
      { $inc: { available: -amount, paidOut: amount } },
      { session, returnDocument: 'after' },
    );
    if (!acc) throw new AppError(402, 'INSUFFICIENT_EARNINGS', 'Requested amount exceeds your available balance');
    await this.entries.create(
      [{ companionId, type: 'payout', amountCentavos: -amount, status: 'settled', refType: 'payout', refId: payoutId }],
      { session },
    );
  }

  async releasePayout(companionId: Types.ObjectId, amount: number, payoutId: Types.ObjectId, session: ClientSession) {
    await this.accounts.updateOne({ companionId }, { $inc: { available: amount, paidOut: -amount } }, { session });
    await this.entries.create(
      [{ companionId, type: 'payout_reversal', amountCentavos: amount, status: 'available', refType: 'payout', refId: payoutId }],
      { session },
    );
  }

  async summary(companionId: string) {
    const [acc, completedOrders, s] = await Promise.all([
      this.accounts.findOne({ companionId }).lean(),
      this.orders.countDocuments({ companionId, status: 'completed' }),
      this.db.settings(),
    ]);
    return {
      pendingCentavos: acc?.pending ?? 0,
      availableCentavos: acc?.available ?? 0,
      lifetimeCentavos: acc?.lifetime ?? 0,
      paidOutCentavos: acc?.paidOut ?? 0,
      completedOrders,
      commissionPercent: s.commissionPercent,
    };
  }

  async list(companionId: string, page: number, limit = 30) {
    const [items, total] = await Promise.all([
      this.entries.find({ companionId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.entries.countDocuments({ companionId }),
    ]);
    return {
      items: items.map((e) => ({ id: String(e._id), type: e.type, amountCentavos: e.amountCentavos, status: e.status, availableAt: e.availableAt, createdAt: e.createdAt })),
      page,
      total,
      hasMore: page * limit < total,
    };
  }
}
