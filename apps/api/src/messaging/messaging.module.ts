import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Conversation, Message } from '@tavern/shared';
import { sendMessageSchema, startConversationSchema } from '@tavern/shared';
import { type AuthUser, badRequest, CurrentUser, forbidden, notFound, ObjectIdPipe, ZodPipe } from '../common/http.js';
import { InjectM, type M } from '../db/database.module.js';
import { NotificationsService } from '../notifications/notifications.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { BlocksService, UsersModule } from '../users/users.js';

const ORDER_CHAT_OPEN = ['accepted', 'in_progress', 'extension_requested', 'completed', 'disputed'];
const toMessage = (m: any): Message => ({
  id: String(m._id),
  conversationId: String(m.conversationId),
  senderId: String(m.senderId),
  body: m.body,
  clientId: m.clientId,
  createdAt: m.createdAt.toISOString(),
});

@Injectable()
export class MessagingService {
  constructor(
    private rt: RealtimeGateway,
    private blocks: BlocksService,
    private notifications: NotificationsService,
    @InjectM('Conversation') private conversations: M<'Conversation'>,
    @InjectM('ConversationMember') private members: M<'ConversationMember'>,
    @InjectM('Message') private messages: M<'Message'>,
    @InjectM('User') private users: M<'User'>,
    @InjectM('Order') private orders: M<'Order'>,
  ) {}

  private async membership(conversationId: string, userId: string) {
    const [conv, me] = await Promise.all([
      this.conversations.findById(conversationId).lean(),
      this.members.findOne({ conversationId, userId }).lean(),
    ]);
    if (!conv || !me) throw notFound('Conversation'); // non-members cannot learn it exists
    return { conv, me };
  }

  private async toConversation(conv: any, me: any, userId: string): Promise<Conversation> {
    const otherId = conv.memberIds.find((id: unknown) => String(id) !== userId);
    const [other, unread] = await Promise.all([
      this.users.findById(otherId, { username: 1, displayName: 1, avatarUrl: 1, roles: 1 }).lean(),
      this.messages.countDocuments({ conversationId: conv._id, createdAt: { $gt: me.lastReadAt }, senderId: { $ne: userId } }).limit(99),
    ]);
    return {
      id: String(conv._id),
      type: conv.type,
      orderId: conv.orderId ? String(conv.orderId) : undefined,
      other: { id: String(otherId), username: other?.username ?? '', displayName: other?.displayName ?? 'Unknown', avatarUrl: other?.avatarUrl ?? undefined, roles: (other?.roles ?? []) as any },
      lastMessage: conv.lastMessagePreview,
      lastMessageAt: conv.lastMessageAt?.toISOString(),
      unread,
    };
  }

  async list(userId: string) {
    const mine = await this.members.find({ userId }).sort({ lastMessageAt: -1 }).limit(100).lean();
    const convs = await this.conversations.find({ _id: { $in: mine.map((m) => m.conversationId) } }).lean();
    const byId = new Map(convs.map((c) => [String(c._id), c]));
    return Promise.all(mine.filter((m) => byId.has(String(m.conversationId))).map((m) => this.toConversation(byId.get(String(m.conversationId)), m, userId)));
  }

  async get(id: string, userId: string) {
    const { conv, me } = await this.membership(id, userId);
    return this.toConversation(conv, me, userId);
  }

  async startDirect(userId: string, otherId: string) {
    if (userId === otherId) throw badRequest('INVALID', 'You cannot message yourself');
    if (!(await this.users.exists({ _id: otherId, status: 'active' }))) throw notFound('User');
    if (await this.blocks.blockedBetween(userId, otherId)) throw forbidden('You cannot message this user');
    const directKey = [userId, otherId].sort().join(':');
    let conv = await this.conversations.findOne({ type: 'direct', directKey }).lean();
    if (!conv) {
      try {
        conv = (await this.conversations.create({ type: 'direct', directKey, memberIds: [userId, otherId], lastMessageAt: new Date() })).toObject() as any;
        await this.members.insertMany([userId, otherId].map((u) => ({ conversationId: conv!._id, userId: u, lastMessageAt: new Date() })));
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e;
        conv = await this.conversations.findOne({ type: 'direct', directKey }).lean();
      }
    }
    return { id: String(conv!._id) };
  }

  async history(id: string, userId: string, before?: string) {
    await this.membership(id, userId);
    const filter: Record<string, unknown> = { conversationId: id };
    if (before) filter.createdAt = { $lt: new Date(before) };
    const rows = await this.messages.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    return rows.reverse().map(toMessage);
  }

  async send(id: string, userId: string, body: string, clientId: string) {
    const dup = await this.messages.findOne({ senderId: userId, clientId }).lean();
    if (dup) return toMessage(dup);
    const { conv } = await this.membership(id, userId);
    const otherId = String(conv.memberIds.find((m) => String(m) !== userId));
    if (await this.blocks.blockedBetween(userId, otherId)) throw forbidden('You cannot message this user');
    if (conv.type === 'order') {
      const order = await this.orders.findById(conv.orderId, { status: 1 }).lean();
      if (!order || !ORDER_CHAT_OPEN.includes(order.status)) throw forbidden('This order chat is closed');
    }
    let msg;
    try {
      msg = await this.messages.create({ conversationId: id, senderId: userId, body, clientId });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return toMessage(await this.messages.findOne({ senderId: userId, clientId }).lean());
      throw e;
    }
    const now = msg.createdAt;
    await Promise.all([
      this.conversations.updateOne({ _id: id }, { lastMessageAt: now, lastMessagePreview: body.slice(0, 120) }),
      this.members.updateMany({ conversationId: id }, { lastMessageAt: now }),
      this.members.updateOne({ conversationId: id, userId }, { lastReadAt: now }),
    ]);
    // Persisted first; only then broadcast.
    const dto = toMessage(msg);
    for (const m of conv.memberIds) this.rt.toUser(String(m), 'message:new', dto);
    const other = await this.members.findOne({ conversationId: id, userId: otherId }).lean();
    if (!other?.muted && !this.rt.isOnline(otherId)) {
      const sender = await this.users.findById(userId, { displayName: 1 }).lean();
      await this.notifications.notify(otherId, 'message', sender?.displayName ?? 'New message', body.slice(0, 100), `/messages/${id}`);
    }
    return dto;
  }

  async markRead(id: string, userId: string) {
    await this.membership(id, userId);
    await this.members.updateOne({ conversationId: id, userId }, { lastReadAt: new Date() });
  }
}

@ApiTags('conversations')
@Controller('conversations')
class MessagingController {
  constructor(private messaging: MessagingService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.messaging.list(u.id);
  }

  @Post()
  start(@CurrentUser() u: AuthUser, @Body(new ZodPipe(startConversationSchema)) b: { userId: string }) {
    return this.messaging.startDirect(u.id, b.userId);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string) {
    return this.messaging.get(id, u.id);
  }

  @Get(':id/messages')
  history(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Query('before') before?: string) {
    return this.messaging.history(id, u.id, before && !isNaN(Date.parse(before)) ? before : undefined);
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 30, ttl: 10_000 } })
  send(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(sendMessageSchema)) b: any) {
    return this.messaging.send(id, u.id, b.body, b.clientId);
  }

  @Post(':id/read')
  @HttpCode(204)
  read(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string) {
    return this.messaging.markRead(id, u.id);
  }
}

@Module({ imports: [UsersModule], controllers: [MessagingController], providers: [MessagingService] })
export class MessagingModule {}
