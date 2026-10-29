import { Body, Controller, Get, Module, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { payoutRequestSchema } from '@tavern/shared';
import { type AuthUser, badRequest, CurrentUser, Roles, ZodPipe } from '../common/http.js';
import { Db, InjectM, type M } from '../db/database.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { EarningsService } from './earnings.service.js';

@ApiTags('earnings')
@Controller()
@Roles('companion')
class EarningsController {
  constructor(
    private earnings: EarningsService,
    private db: Db,
    @InjectM('PayoutRequest') private payouts: M<'PayoutRequest'>,
  ) {}

  @Get('earnings')
  summary(@CurrentUser() u: AuthUser) {
    return this.earnings.summary(u.id);
  }

  @Get('earnings/entries')
  entries(@CurrentUser() u: AuthUser, @Query('page') page = '1') {
    return this.earnings.list(u.id, Math.max(1, Number(page) || 1));
  }

  @Post('payouts')
  async request(@CurrentUser() u: AuthUser, @Body(new ZodPipe(payoutRequestSchema)) b: any) {
    const existing = await this.payouts.findOne({ companionId: u.id, idempotencyKey: b.idempotencyKey }).lean();
    if (existing) return { id: String(existing._id) };
    const { minPayoutCentavos } = await this.db.settings();
    if (b.amountCentavos < minPayoutCentavos) throw badRequest('BELOW_MINIMUM', 'Amount is below the minimum payout');
    if (await this.payouts.exists({ companionId: u.id, status: { $in: ['requested', 'under_review', 'approved', 'processing'] } }))
      throw badRequest('PAYOUT_IN_PROGRESS', 'You already have a payout in progress');
    const id = new Types.ObjectId();
    await this.db.tx(async (session) => {
      await this.earnings.reserveForPayout(u.id, b.amountCentavos, id, session);
      await this.payouts.create(
        [
          {
            _id: id,
            companionId: u.id,
            amountCentavos: b.amountCentavos,
            method: b.method,
            accountName: b.accountName,
            accountNumber: b.accountNumber,
            accountNumberMasked: '•••• ' + b.accountNumber.slice(-4),
            idempotencyKey: b.idempotencyKey,
          },
        ],
        { session },
      );
    });
    return { id: String(id) };
  }

  @Get('payouts/me')
  async mine(@CurrentUser() u: AuthUser) {
    const rows = await this.payouts.find({ companionId: u.id }).sort({ createdAt: -1 }).limit(50).lean();
    return rows.map((p) => ({ id: String(p._id), amountCentavos: p.amountCentavos, status: p.status, method: p.method, account: p.accountNumberMasked, note: p.note, createdAt: p.createdAt }));
  }
}

@Module({ imports: [WalletModule], controllers: [EarningsController] })
export class EarningsModule {}
