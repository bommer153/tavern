import { Global, Inject, Logger, Module } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service.js';
import { ACCESS_COOKIE } from '../auth/auth.guard.js';
import { InjectM, type M } from '../db/database.module.js';

const parseCookie = (header = '', name: string) =>
  header
    .split(';')
    .map((p) => p.trim().split('='))
    .find(([k]) => k === name)?.[1];

/**
 * Application events only (chat, typing, presence, orders, room metadata). Audio goes through LiveKit.
 * shortcut: presence counts live in process memory; add the socket.io Redis adapter + shared presence store before running >1 API instance.
 */
@WebSocketGateway({ path: '/socket.io', cors: { origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','), credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private log = new Logger('Realtime');
  private connections = new Map<string, number>();

  constructor(
    @Inject(AuthService) private auth: AuthService,
    @InjectM('ConversationMember') private members: M<'ConversationMember'>,
    @InjectM('VoiceRoomMember') private roomMembers: M<'VoiceRoomMember'>,
    @InjectM('CompanionProfile') private profiles: M<'CompanionProfile'>,
    @InjectM('User') private users: M<'User'>,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ?? parseCookie(socket.handshake.headers.cookie, ACCESS_COOKIE);
      if (!token) throw new Error('no token');
      const { sub } = await this.auth.verifyAccess(decodeURIComponent(token));
      const user = await this.users.findById(sub, { status: 1 }).lean();
      if (user?.status !== 'active') throw new Error('inactive');
      socket.data.userId = sub;
      await socket.join(`user:${sub}`);
      const n = (this.connections.get(sub) ?? 0) + 1;
      this.connections.set(sub, n);
      if (n === 1) await this.setPresence(sub, true);
    } catch {
      socket.emit('auth_error', { message: 'Please sign in again' });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket) {
    const id = socket.data.userId as string | undefined;
    if (!id) return;
    const n = (this.connections.get(id) ?? 1) - 1;
    if (n <= 0) {
      this.connections.delete(id);
      await this.setPresence(id, false);
    } else this.connections.set(id, n);
  }

  private async setPresence(userId: string, online: boolean) {
    await this.profiles.updateOne({ userId }, { online, lastSeenAt: new Date() }).catch((e) => this.log.warn(e.message));
  }

  isOnline(userId: string) {
    return this.connections.has(userId);
  }

  toUser(userId: string | { toString(): string }, event: string, data: unknown) {
    this.server?.to(`user:${String(userId)}`).emit(event, data);
  }

  toRoom(roomId: string, event: string, data: unknown) {
    this.server?.to(`room:${roomId}`).emit(event, data);
  }

  @SubscribeMessage('typing')
  async typing(@ConnectedSocket() s: Socket, @MessageBody() b: { conversationId?: string }) {
    const userId = s.data.userId as string;
    if (!b?.conversationId || !/^[a-f0-9]{24}$/.test(b.conversationId)) return;
    const all = await this.members.find({ conversationId: b.conversationId }, { userId: 1 }).lean();
    if (!all.some((m) => String(m.userId) === userId)) return;
    for (const m of all) if (String(m.userId) !== userId) this.toUser(m.userId, 'typing', { conversationId: b.conversationId, userId });
  }

  @SubscribeMessage('room:subscribe')
  async subscribeRoom(@ConnectedSocket() s: Socket, @MessageBody() b: { roomId?: string }) {
    if (!b?.roomId || !/^[a-f0-9]{24}$/.test(b.roomId)) return { ok: false };
    const m = await this.roomMembers.findOne({ roomId: b.roomId, userId: s.data.userId, bannedAt: null }).lean();
    if (!m) return { ok: false };
    await s.join(`room:${b.roomId}`);
    return { ok: true };
  }

  @SubscribeMessage('room:unsubscribe')
  async unsubscribeRoom(@ConnectedSocket() s: Socket, @MessageBody() b: { roomId?: string }) {
    if (b?.roomId) await s.leave(`room:${b.roomId}`);
  }

  /** Force a user's sockets out of a voice-room channel (removal/ban). */
  kickFromRoom(userId: string, roomId: string) {
    this.server?.in(`user:${userId}`).socketsLeave(`room:${roomId}`);
  }
}

@Global()
@Module({ providers: [RealtimeGateway], exports: [RealtimeGateway] })
export class RealtimeModule {}
