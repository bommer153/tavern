import { Body, Controller, Get, Injectable, Module, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { sendGiftSchema } from '@tavern/shared';
import { type AuthUser, badRequest, CurrentUser, forbidden, notFound, Public, ZodPipe } from '../common/http.js';
import { Db, InjectM, type M } from '../db/database.module.js';
import { EarningsService } from '../earnings/earnings.service.js';
import { NotificationsService } from '../notifications/notifications.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { BlocksService, UsersModule } from '../users/users.js';
import { WalletService } from './wallet.service.js';

const isDup = (e: unknown) => (e as { code?: number })?.code === 11000;

@Injectable()
export class GiftsService {
  constructor(
    private db: Db,
    private wallet: WalletService,
    private earnings: EarningsService,
    private notifications: NotificationsService,
    private rt: RealtimeGateway,
    private blocks: BlocksService,
    @InjectM('Gift') private gifts: M<'Gift'>,
    @InjectM('GiftTransaction') private giftTx: M<'GiftTransaction'>,
    @InjectM('User') private users: M<'User'>,
    @InjectM('CompanionProfile') private profiles: M<'CompanionProfile'>,
    @InjectM('VoiceRoomMember') private roomMembers: M<'VoiceRoomMember'>,
    @InjectM('VoiceRoom') private rooms: M<'VoiceRoom'>,
    @InjectM('Order') private orders: M<'Order'>,
    @InjectM('RoomMessage') private roomMessages: M<'RoomMessage'>,
  ) {}

  async send(
    senderId: string,
    i: { giftId: string; recipientId: string; quantity: number; context: 'profile' | 'room' | 'order'; contextId?: string; idempotencyKey: string },
  ) {
    const existing = await this.giftTx.findOne({ senderId, idempotencyKey: i.idempotencyKey }).lean();
    if (existing) return { transactionId: String(existing._id), balance: await this.wallet.balance(senderId) };

    if (senderId === i.recipientId) throw badRequest('INVALID_RECIPIENT', 'You cannot send a gift to yourself');
    const gift = await this.gifts.findOne({ _id: i.giftId, active: true }).lean();
    if (!gift) throw notFound('Gift');
    const recipient = await this.users.findOne({ _id: i.recipientId, status: 'active' }).lean();
    if (!recipient) throw notFound('Recipient');
    if (await this.blocks.blockedBetween(senderId, i.recipientId)) throw forbidden('You cannot send gifts to this user');
    await this.checkContext(senderId, i);

    const companion = await this.profiles.findOne({ userId: i.recipientId, status: 'approved' }).lean();
    const s = await this.db.settings();
    const totalCoins = gift.coinCost * i.quantity; // price always from the catalog, never the client
    // Only approved companions earn cash from gifts; for everyone else a gift is recognition only.
    const earning = companion ? Math.floor((totalCoins * s.coinValueCentavos * s.giftSharePercent) / 100) : 0;

    try {
      const { txId, balance } = await this.db.tx(async (session) => {
        const id = new Types.ObjectId();
        const balance = await this.wallet.debit(
          {
            userId: senderId,
            coins: totalCoins,
            type: 'gift_sent',
            description: `${i.quantity}× ${gift.name} to ${recipient.displayName}`,
            refType: 'gift',
            refId: id,
            idempotencyKey: `gift:${i.idempotencyKey}`,
          },
          session,
        );
        await this.giftTx.create(
          [
            {
              _id: id,
              senderId,
              recipientId: i.recipientId,
              giftId: gift._id,
              giftName: gift.name,
              unitCost: gift.coinCost,
              quantity: i.quantity,
              totalCoins,
              context: i.context,
              contextId: i.contextId,
              recipientEarningCentavos: earning,
              idempotencyKey: i.idempotencyKey,
            },
          ],
          { session },
        );
        if (earning)
          await this.earnings.creditPending({ companionId: recipient._id, amountCentavos: earning, type: 'gift_earning', refType: 'gift', refId: id }, session);
        return { txId: id, balance };
      });
      // Side effects only after commit: celebrations must never precede a confirmed transaction.
      const sender = await this.users.findById(senderId, { displayName: 1, avatarUrl: 1 }).lean();
      const event = {
        transactionId: String(txId),
        gift: { id: String(gift._id), name: gift.name, imageUrl: gift.imageUrl, animation: gift.animation || undefined, rarity: gift.rarity },
        quantity: i.quantity,
        totalCoins,
        sender: { id: senderId, displayName: sender?.displayName },
        recipient: { id: i.recipientId, displayName: recipient.displayName },
      };
      if (i.context === 'room' && i.contextId) {
        this.rt.toRoom(i.contextId, 'room:gift', event);
        // Also a permanent line in the room chat log, so late joiners see it in history.
        const gift = { name: event.gift.name, imageUrl: event.gift.imageUrl, quantity: i.quantity, coins: totalCoins, recipientName: recipient.displayName };
        const m = await this.roomMessages.create({ roomId: i.contextId, senderId, body: '', gift });
        this.rt.toRoom(i.contextId, 'room:message', { id: String(m._id), sender: { id: senderId, displayName: sender?.displayName }, body: '', gift, createdAt: m.createdAt });
      }
      await this.notifications.notify(recipient._id, 'gift', 'You received a gift!', `${sender?.displayName} sent you ${i.quantity}× ${gift.name}`);
      return { transactionId: String(txId), balance };
    } catch (e) {
      if (isDup(e)) {
        const dup = await this.giftTx.findOne({ senderId, idempotencyKey: i.idempotencyKey }).lean();
        if (dup) return { transactionId: String(dup._id), balance: await this.wallet.balance(senderId) };
      }
      throw e;
    }
  }

  private async checkContext(senderId: string, i: { recipientId: string; context: string; contextId?: string }) {
    if (i.context === 'profile') {
      if (!(await this.profiles.exists({ userId: i.recipientId, status: 'approved' })))
        throw badRequest('INVALID_CONTEXT', 'Profile gifts can only be sent to companions');
      return;
    }
    if (!i.contextId) throw badRequest('INVALID_CONTEXT', 'Missing context');
    if (i.context === 'room') {
      const room = await this.rooms.exists({ _id: i.contextId, status: 'live' });
      const present = await this.roomMembers.countDocuments({
        roomId: i.contextId,
        userId: { $in: [senderId, i.recipientId] },
        present: true,
        bannedAt: null,
      });
      if (!room || present < 2) throw badRequest('INVALID_CONTEXT', 'Both users must be in the live room');
      return;
    }
    const order = await this.orders.exists({
      _id: i.contextId,
      customerId: senderId,
      companionId: i.recipientId,
      status: { $in: ['accepted', 'in_progress', 'completed'] },
    });
    if (!order) throw badRequest('INVALID_CONTEXT', 'Order gifts require an active or completed order with this companion');
  }
}

@ApiTags('wallet')
@Controller()
class WalletController {
  constructor(
    private wallet: WalletService,
    private gifts: GiftsService,
    private db: Db,
    @InjectM('CoinPackage') private packages: M<'CoinPackage'>,
    @InjectM('Gift') private giftModel: M<'Gift'>,
  ) {}

  @Get('wallet')
  async summary(@CurrentUser() u: AuthUser) {
    const [balance, s] = await Promise.all([this.wallet.balance(u.id), this.db.settings()]);
    return { balance, coinValueCentavos: s.coinValueCentavos };
  }

  @Get('wallet/transactions')
  history(@CurrentUser() u: AuthUser, @Query('page') page = '1') {
    return this.wallet.history(u.id, Math.max(1, Number(page) || 1));
  }

  @Public()
  @Get('wallet/packages')
  async listPackages() {
    const rows = await this.packages.find({ active: true }).sort({ sortOrder: 1, priceCentavos: 1 }).lean();
    return rows.map((p) => ({ id: String(p._id), coins: p.coins, bonusCoins: p.bonusCoins, priceCentavos: p.priceCentavos, active: p.active }));
  }

  @Public()
  @Get('gifts')
  async listGifts() {
    const rows = await this.giftModel.find({ active: true }).sort({ sortOrder: 1, coinCost: 1 }).lean();
    return rows.map(toGift);
  }

  @Post('gifts/send')
  send(@CurrentUser() u: AuthUser, @Body(new ZodPipe(sendGiftSchema)) b: any) {
    return this.gifts.send(u.id, b);
  }
}

export const toGift = (g: any) => ({
  id: String(g._id),
  name: g.name,
  coinCost: g.coinCost,
  imageUrl: g.imageUrl,
  animation: g.animation || undefined,
  category: g.category,
  rarity: g.rarity,
  active: g.active,
  sortOrder: g.sortOrder,
});

@Module({
  imports: [UsersModule],
  controllers: [WalletController],
  providers: [WalletService, GiftsService, EarningsService],
  exports: [WalletService, EarningsService],
})
export class WalletModule {}
