import { Injectable } from '@nestjs/common';
import type { ClientSession, Types } from 'mongoose';
import { AppError } from '../common/http.js';
import { InjectM, type M } from '../db/database.module.js';
import type { WALLET_TX_TYPES } from '../db/schemas.js';

type TxType = (typeof WALLET_TX_TYPES)[number];
interface Entry {
  userId: string | Types.ObjectId;
  coins: number; // positive magnitude
  type: TxType;
  description: string;
  refType?: string;
  refId?: Types.ObjectId;
  idempotencyKey?: string;
  actorId?: string;
}

/**
 * Coin wallet. Every balance change writes an immutable ledger row in the same transaction.
 * Callers must pass a session from Db.tx() so the debit/credit and their related records commit together.
 */
@Injectable()
export class WalletService {
  constructor(
    @InjectM('Wallet') private wallets: M<'Wallet'>,
    @InjectM('WalletTransaction') private ledger: M<'WalletTransaction'>,
  ) {}

  async debit(e: Entry, session: ClientSession) {
    if (!Number.isInteger(e.coins) || e.coins <= 0) throw new AppError(400, 'INVALID_AMOUNT', 'Invalid amount');
    // Conditional decrement is atomic: concurrent spends can never push the balance below zero.
    const w = await this.wallets.findOneAndUpdate(
      { userId: e.userId, balance: { $gte: e.coins } },
      { $inc: { balance: -e.coins } },
      { returnDocument: 'after', session },
    );
    if (!w) throw new AppError(402, 'INSUFFICIENT_FUNDS', 'Not enough coins. Top up your wallet to continue.');
    await this.write(e, -e.coins, w.balance, session);
    return w.balance;
  }

  async credit(e: Entry, session: ClientSession) {
    if (!Number.isInteger(e.coins) || e.coins <= 0) throw new AppError(400, 'INVALID_AMOUNT', 'Invalid amount');
    const w = await this.wallets.findOneAndUpdate(
      { userId: e.userId },
      { $inc: { balance: e.coins } },
      { returnDocument: 'after', upsert: true, session },
    );
    await this.write(e, e.coins, w!.balance, session);
    return w!.balance;
  }

  private write(e: Entry, amount: number, balanceAfter: number, session: ClientSession) {
    return this.ledger.create(
      [
        {
          userId: e.userId,
          type: e.type,
          amount,
          balanceAfter,
          description: e.description,
          refType: e.refType,
          refId: e.refId,
          idempotencyKey: e.idempotencyKey,
          actorId: e.actorId,
        },
      ],
      { session },
    );
  }

  async balance(userId: string) {
    return (await this.wallets.findOne({ userId }).lean())?.balance ?? 0;
  }

  async history(userId: string, page: number, limit = 30) {
    const filter = { userId };
    const [items, total] = await Promise.all([
      this.ledger.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.ledger.countDocuments(filter),
    ]);
    return {
      items: items.map((t) => ({
        id: String(t._id),
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        description: t.description ?? '',
        refId: t.refId ? String(t.refId) : undefined,
        createdAt: t.createdAt,
      })),
      page,
      total,
      hasMore: page * limit < total,
    };
  }

  /** Reconciliation: wallets whose balance differs from the sum of their ledger. */
  async reconcile() {
    const sums = await this.ledger.aggregate<{ _id: Types.ObjectId; sum: number }>([
      { $group: { _id: '$userId', sum: { $sum: '$amount' } } },
    ]);
    const bySum = new Map(sums.map((s) => [String(s._id), s.sum]));
    const wallets = await this.wallets.find({}, { userId: 1, balance: 1 }).lean();
    const mismatches = wallets
      .filter((w) => (bySum.get(String(w.userId)) ?? 0) !== w.balance)
      .map((w) => ({ userId: String(w.userId), balance: w.balance, ledgerSum: bySum.get(String(w.userId)) ?? 0 }));
    return { wallets: wallets.length, mismatches };
  }
}
