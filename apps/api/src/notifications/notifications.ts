import { Body, Controller, Get, Global, HttpCode, Inject, Injectable, Logger, Module, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { ENV, type Env } from '../config.js';
import { type AuthUser, CurrentUser, paginate, ZodPipe } from '../common/http.js';
import { InjectM, type M } from '../db/database.module.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

/** Notification types users can switch off for push (in-app history is always kept). */
export const NOTIFICATION_TYPES = ['order', 'message', 'room', 'gift', 'payment', 'payout', 'safety'] as const;
type NotificationType = (typeof NOTIFICATION_TYPES)[number];

@Injectable()
export class NotificationsService {
  private log = new Logger('Notifications');
  constructor(
    @Inject(ENV) private env: Env,
    private rt: RealtimeGateway,
    @InjectM('Notification') private notifications: M<'Notification'>,
    @InjectM('PushToken') private pushTokens: M<'PushToken'>,
    @InjectM('User') private users: M<'User'>,
  ) {}

  async notify(userId: Types.ObjectId | string, type: NotificationType, title: string, body: string, link?: string) {
    const [n] = await this.notifications.create([{ userId, type, title, body, link }]);
    this.rt.toUser(String(userId), 'notification', {
      id: String(n!._id),
      type,
      title,
      body,
      link,
      createdAt: n!.createdAt,
    });
    void this.push(String(userId), type, title, body, link);
    return n;
  }

  /** Expo push is a delivery channel only; failures never affect the stored notification. */
  private async push(userId: string, type: NotificationType, title: string, body: string, link?: string) {
    if (this.env.NODE_ENV === 'test') return;
    try {
      const user = await this.users.findById(userId, { notificationPrefs: 1 }).lean();
      const prefs = user?.notificationPrefs as unknown as Record<string, boolean> | undefined;
      if (prefs?.[`push_${type}`] === false) return;
      const tokens = await this.pushTokens.find({ userId }).lean();
      if (!tokens.length) return;
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${this.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(tokens.map((t) => ({ to: t.token, title, body, data: { link }, sound: 'default' }))),
      });
      const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      // Drop tokens Expo reports as no longer registered.
      json.data?.forEach((r, i) => {
        if (r.details?.error === 'DeviceNotRegistered') void this.pushTokens.deleteOne({ token: tokens[i]!.token });
      });
    } catch (e) {
      this.log.warn(`push failed: ${(e as Error).message}`);
    }
  }
}

@ApiTags('notifications')
@Controller('notifications')
class NotificationsController {
  constructor(
    @InjectM('Notification') private notifications: M<'Notification'>,
    @InjectM('PushToken') private pushTokens: M<'PushToken'>,
  ) {}

  @Get()
  async list(@CurrentUser() u: AuthUser, @Query('page') page = '1') {
    const p = Math.max(1, Number(page) || 1);
    const { skip, limit } = paginate(p, 30);
    const [items, total, unread] = await Promise.all([
      this.notifications.find({ userId: u.id }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.notifications.countDocuments({ userId: u.id }),
      this.notifications.countDocuments({ userId: u.id, readAt: null }),
    ]);
    return {
      items: items.map((n) => ({ id: String(n._id), type: n.type, title: n.title, body: n.body, link: n.link, readAt: n.readAt, createdAt: n.createdAt })),
      page: p,
      total,
      unread,
      hasMore: skip + items.length < total,
    };
  }

  @Post('read')
  @HttpCode(204)
  async read(@CurrentUser() u: AuthUser, @Body(new ZodPipe(z.object({ ids: z.array(z.string().length(24)).max(100).optional() }))) b: { ids?: string[] }) {
    await this.notifications.updateMany({ userId: u.id, readAt: null, ...(b.ids ? { _id: { $in: b.ids } } : {}) }, { readAt: new Date() });
  }

  @Post('push-tokens')
  @HttpCode(204)
  async register(
    @CurrentUser() u: AuthUser,
    @Body(new ZodPipe(z.object({ token: z.string().min(10).max(200), platform: z.enum(['ios', 'android']) }))) b: { token: string; platform: string },
  ) {
    await this.pushTokens.updateOne({ token: b.token }, { userId: u.id, platform: b.platform }, { upsert: true });
  }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
