import { Body, Controller, Get, HttpCode, Inject, Injectable, Logger, Module, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AccessToken, RoomServiceClient, TrackType } from 'livekit-server-sdk';
import { z } from 'zod';
import { createRoomSchema, type RoomRole, type RoomThemeInput, roomThemeSchema, type VoiceRoom } from '@tavern/shared';
import { ENV, type Env } from '../config.js';
import { AppError, type AuthUser, badRequest, conflict, CurrentUser, forbidden, notFound, ObjectIdPipe, Public, ZodPipe } from '../common/http.js';
import { CosmeticsModule, CosmeticsService } from '../cosmetics/cosmetics.module.js';
import { InjectM, type M } from '../db/database.module.js';
import { NotificationsService } from '../notifications/notifications.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

const SPEAKING: RoomRole[] = ['host', 'moderator', 'speaker'];
const lkRoom = (id: string) => `room_${id}`;
const pub = (u: any) => ({ id: String(u?._id), username: u?.username ?? '', displayName: u?.displayName ?? 'Unknown', avatarUrl: u?.avatarUrl ?? undefined, roles: u?.roles ?? [] });

@Injectable()
export class VoiceService {
  private log = new Logger('Voice');
  private lk: RoomServiceClient | null;
  constructor(
    @Inject(ENV) private env: Env,
    private rt: RealtimeGateway,
    private notifications: NotificationsService,
    private cosmetics: CosmeticsService,
    @InjectM('VoiceRoom') private rooms: M<'VoiceRoom'>,
    @InjectM('VoiceRoomMember') private members: M<'VoiceRoomMember'>,
    @InjectM('RoomInvitation') private invitations: M<'RoomInvitation'>,
    @InjectM('RoomMessage') private roomMessages: M<'RoomMessage'>,
    @InjectM('User') private users: M<'User'>,
    @InjectM('Game') private games: M<'Game'>,
  ) {
    const ok = env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET;
    this.lk = ok ? new RoomServiceClient(env.LIVEKIT_URL!.replace(/^ws/, 'http'), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET) : null;
  }

  /** LiveKit admin calls are best-effort: our DB is the source of truth for membership and roles. */
  private async lkCall(fn: (c: RoomServiceClient) => Promise<unknown>) {
    if (!this.lk) return;
    try {
      await fn(this.lk);
    } catch (e) {
      this.log.warn(`LiveKit call failed: ${(e as Error).message}`);
    }
  }

  async toDto(r: any): Promise<VoiceRoom> {
    const [host, game] = await Promise.all([
      this.users.findById(r.hostId, { username: 1, displayName: 1, avatarUrl: 1, roles: 1 }).lean(),
      r.gameId ? this.games.findById(r.gameId, { name: 1, slug: 1 }).lean() : null,
    ]);
    return {
      id: String(r._id),
      title: r.title,
      description: r.description ?? '',
      rules: r.rules ?? '',
      category: r.category,
      game: game ? { id: String(game._id), name: game.name, slug: game.slug } : undefined,
      host: pub(host),
      privacy: r.privacy,
      capacity: r.capacity,
      participantCount: r.participantCount,
      speakerCount: r.speakerCount,
      chatEnabled: r.chatEnabled,
      status: r.status,
      coverUrl: r.coverUrl ?? undefined,
      theme: { background: r.theme?.background ?? null, allowPersonal: r.theme?.allowPersonal ?? true },
    };
  }

  async list(q: { category?: string; game?: string }) {
    const filter: Record<string, unknown> = { status: 'live', privacy: 'public' };
    if (q.category) filter.category = q.category;
    if (q.game) {
      const g = await this.games.findOne({ slug: q.game }).lean();
      filter.gameId = g?._id ?? null;
    }
    const rows = await this.rooms.find(filter).sort({ participantCount: -1, createdAt: -1 }).limit(60).lean();
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  async create(userId: string, b: any) {
    if (await this.rooms.exists({ hostId: userId, status: 'live' })) throw conflict('ROOM_LIMIT', 'Close your current room before opening another');
    if (b.gameId && !(await this.games.exists({ _id: b.gameId, active: true }))) throw badRequest('INVALID_GAME', 'Game not available');
    const room = await this.rooms.create({ ...b, hostId: userId, participantCount: 1, speakerCount: 1 });
    await this.members.create({ roomId: room._id, userId, role: 'host', present: true });
    return this.toDto(room.toObject());
  }

  private async room(id: string) {
    const r = await this.rooms.findById(id).lean();
    if (!r) throw notFound('Room');
    return r;
  }

  private async canView(r: any, userId: string) {
    if (r.privacy === 'public' || String(r.hostId) === userId) return true;
    return !!(await this.invitations.exists({ roomId: r._id, inviteeId: userId })) || !!(await this.members.exists({ roomId: r._id, userId, bannedAt: null }));
  }

  async detail(id: string, userId: string) {
    const r = await this.room(id);
    if (!(await this.canView(r, userId))) throw notFound('Room');
    const [members, mine] = await Promise.all([
      this.members.find({ roomId: id, present: true, bannedAt: null }).limit(r.capacity).populate('userId', 'username displayName avatarUrl roles appearance.frame').lean(),
      this.members.findOne({ roomId: id, userId }).lean(),
    ]);
    return {
      ...(await this.toDto(r)),
      members: members.map((m: any) => ({ user: pub(m.userId), role: m.role, handRaised: m.handRaised, frame: m.userId?.appearance?.frame ?? undefined })),
      myRole: mine && mine.present && !mine.bannedAt ? mine.role : null,
    };
  }

  private async recount(roomId: string) {
    const [participantCount, speakerCount] = await Promise.all([
      this.members.countDocuments({ roomId, present: true, bannedAt: null }),
      this.members.countDocuments({ roomId, present: true, bannedAt: null, role: { $in: SPEAKING } }),
    ]);
    await this.rooms.updateOne({ _id: roomId }, { participantCount, speakerCount });
    this.rt.toRoom(roomId, 'room:members', { roomId });
    return participantCount;
  }

  async join(id: string, userId: string) {
    const r = await this.room(id);
    if (r.status !== 'live') throw badRequest('ROOM_CLOSED', 'This room has ended');
    const existing = await this.members.findOne({ roomId: id, userId }).lean();
    if (existing?.bannedAt) throw forbidden('You were removed from this room');
    if (!(await this.canView(r, userId))) throw forbidden('This room is invite-only');
    if (!existing?.present) {
      // Atomic capacity reservation: only increments while below capacity.
      const ok = await this.rooms.updateOne({ _id: id, status: 'live', participantCount: { $lt: r.capacity } }, { $inc: { participantCount: 1 } });
      if (!ok.modifiedCount) throw new AppError(409, 'ROOM_FULL', 'This room is full');
    }
    const role = existing?.role ?? (String(r.hostId) === userId ? 'host' : 'listener');
    await this.members.updateOne({ roomId: id, userId }, { role, present: true, handRaised: false }, { upsert: true });
    await this.recount(id);
    return { role };
  }

  async token(id: string, userId: string) {
    if (!this.env.LIVEKIT_URL || !this.env.LIVEKIT_API_KEY || !this.env.LIVEKIT_API_SECRET)
      throw new AppError(503, 'VOICE_UNAVAILABLE', 'Voice is temporarily unavailable. You can still use room chat.');
    const r = await this.room(id);
    const m = await this.members.findOne({ roomId: id, userId, present: true, bannedAt: null }).lean();
    if (r.status !== 'live' || !m) throw forbidden('Join the room first');
    const user = await this.users.findById(userId, { displayName: 1, avatarUrl: 1 }).lean();
    const canPublish = SPEAKING.includes(m.role as RoomRole);
    const at = new AccessToken(this.env.LIVEKIT_API_KEY, this.env.LIVEKIT_API_SECRET, {
      identity: userId,
      name: user?.displayName,
      metadata: JSON.stringify({ avatarUrl: user?.avatarUrl, role: m.role }),
      ttl: '10m', // short-lived; clients request a fresh token to reconnect
    });
    at.addGrant({ roomJoin: true, room: lkRoom(id), canPublish, canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: false });
    return { token: await at.toJwt(), url: this.env.LIVEKIT_URL, canPublish };
  }

  async leave(id: string, userId: string) {
    const r = await this.members.updateOne({ roomId: id, userId, present: true }, { present: false, handRaised: false });
    if (!r.modifiedCount) return;
    await this.lkCall((c) => c.removeParticipant(lkRoom(id), userId));
    if ((await this.recount(id)) === 0) await this.close(id, userId, true);
  }

  async raiseHand(id: string, userId: string, raised: boolean) {
    const r = await this.members.updateOne({ roomId: id, userId, present: true, bannedAt: null, role: 'listener' }, { handRaised: raised });
    if (!r.matchedCount) throw badRequest('INVALID', 'Only listeners in the room can raise a hand');
    this.rt.toRoom(id, 'room:members', { roomId: id });
  }

  /** Host may do anything; moderators may manage speakers/listeners but not other moderators or the host. */
  private async authorize(id: string, actorId: string, targetId?: string, allowRoles: string[] = []) {
    const r = await this.room(id);
    if (r.status !== 'live') throw badRequest('ROOM_CLOSED', 'This room has ended');
    const actor = await this.members.findOne({ roomId: id, userId: actorId, bannedAt: null }).lean();
    const isPlatformMod = allowRoles.some((x) => x === 'admin' || x === 'moderator');
    if (!isPlatformMod && (!actor || !['host', 'moderator'].includes(actor.role))) throw forbidden();
    const target = targetId ? await this.members.findOne({ roomId: id, userId: targetId }).lean() : null;
    if (targetId && !target) throw notFound('Participant');
    if (target && !isPlatformMod && actor!.role === 'moderator' && ['host', 'moderator'].includes(target.role)) throw forbidden();
    if (target?.role === 'host' && !isPlatformMod) throw forbidden('The host cannot be changed');
    return { r, actor, target };
  }

  async setRole(id: string, actorId: string, actorRoles: string[], targetId: string, role: 'moderator' | 'speaker' | 'listener') {
    const { actor } = await this.authorize(id, actorId, targetId, actorRoles);
    if (role === 'moderator' && actor?.role !== 'host') throw forbidden('Only the host can assign moderators');
    await this.members.updateOne({ roomId: id, userId: targetId }, { role, handRaised: false });
    await this.lkCall((c) => c.updateParticipant(lkRoom(id), targetId, { permission: { canPublish: role !== 'listener', canSubscribe: true, canPublishData: false } }));
    this.rt.toUser(targetId, 'room:role', { roomId: id, role });
    await this.recount(id);
  }

  async mute(id: string, actorId: string, actorRoles: string[], targetId: string) {
    await this.authorize(id, actorId, targetId, actorRoles);
    await this.lkCall(async (c) => {
      const p = await c.getParticipant(lkRoom(id), targetId);
      for (const t of p.tracks.filter((t) => t.type === TrackType.AUDIO)) await c.mutePublishedTrack(lkRoom(id), targetId, t.sid, true);
    });
    this.rt.toUser(targetId, 'room:muted', { roomId: id });
  }

  async remove(id: string, actorId: string, actorRoles: string[], targetId: string) {
    await this.authorize(id, actorId, targetId, actorRoles);
    await this.members.updateOne({ roomId: id, userId: targetId }, { present: false, bannedAt: new Date(), handRaised: false });
    await this.lkCall((c) => c.removeParticipant(lkRoom(id), targetId));
    this.rt.toUser(targetId, 'room:removed', { roomId: id });
    this.rt.kickFromRoom(targetId, id);
    await this.recount(id);
  }

  async invite(id: string, actorId: string, actorRoles: string[], inviteeId: string) {
    const { r } = await this.authorize(id, actorId, undefined, actorRoles);
    if (!(await this.users.exists({ _id: inviteeId, status: 'active' }))) throw notFound('User');
    await this.invitations.updateOne({ roomId: id, inviteeId }, { inviterId: actorId }, { upsert: true });
    await this.notifications.notify(inviteeId, 'room', 'Voice room invitation', `You're invited to "${r.title}"`, `/rooms/${id}`);
  }

  /** Host or room moderator picks the shared environment; it must be in their own collection (or null for the default). */
  async setTheme(id: string, actorId: string, actorRoles: string[], t: RoomThemeInput) {
    await this.authorize(id, actorId, undefined, actorRoles);
    if (t.background && !(await this.cosmetics.owns(actorId, t.background, 'background'))) throw forbidden('Unlock this background before using it as the room theme');
    await this.rooms.updateOne({ _id: id }, { theme: t });
    this.rt.toRoom(id, 'room:members', { roomId: id });
  }

  async close(id: string, actorId: string, system = false, actorRoles: string[] = []) {
    const r = await this.room(id);
    const platformMod = actorRoles.includes('admin') || actorRoles.includes('moderator');
    if (!system && String(r.hostId) !== actorId && !platformMod) throw forbidden('Only the host can close this room');
    await this.rooms.updateOne({ _id: id, status: 'live' }, { status: 'closed', closedAt: new Date(), participantCount: 0, speakerCount: 0 });
    await this.members.updateMany({ roomId: id, present: true }, { present: false, handRaised: false });
    await this.lkCall((c) => c.deleteRoom(lkRoom(id)));
    this.rt.toRoom(id, 'room:closed', { roomId: id });
  }

  async chatHistory(id: string, userId: string) {
    const r = await this.room(id);
    if (!(await this.canView(r, userId))) throw notFound('Room');
    const rows = await this.roomMessages.find({ roomId: id }).sort({ createdAt: -1 }).limit(50).populate('senderId', 'displayName').lean();
    return rows.reverse().map((m: any) => ({ id: String(m._id), sender: { id: String(m.senderId?._id), displayName: m.senderId?.displayName }, body: m.body, createdAt: m.createdAt }));
  }

  async chat(id: string, userId: string, body: string) {
    const r = await this.room(id);
    if (!r.chatEnabled || r.status !== 'live') throw badRequest('CHAT_DISABLED', 'Chat is disabled in this room');
    if (!(await this.members.exists({ roomId: id, userId, present: true, bannedAt: null }))) throw forbidden('Join the room first');
    const m = await this.roomMessages.create({ roomId: id, senderId: userId, body });
    const u = await this.users.findById(userId, { displayName: 1 }).lean();
    this.rt.toRoom(id, 'room:message', { id: String(m._id), sender: { id: userId, displayName: u?.displayName }, body, createdAt: m.createdAt });
  }
}

const idBody = z.object({ userId: z.string().length(24) });

@ApiTags('voice-rooms')
@Controller('voice-rooms')
class VoiceController {
  constructor(private voice: VoiceService) {}

  @Public()
  @Get()
  list(@Query('category') category?: string, @Query('game') game?: string) {
    return this.voice.list({ category, game });
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createRoomSchema)) b: any) {
    return this.voice.create(u.id, b);
  }

  @Get(':id')
  detail(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string) {
    return this.voice.detail(id, u.id);
  }

  @Post(':id/join')
  @HttpCode(200)
  join(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string) {
    return this.voice.join(id, u.id);
  }

  @Post(':id/token')
  @HttpCode(200)
  token(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string) {
    return this.voice.token(id, u.id);
  }

  @Post(':id/leave')
  @HttpCode(204)
  leave(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string) {
    return this.voice.leave(id, u.id);
  }

  @Post(':id/hand')
  @HttpCode(204)
  hand(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(z.object({ raised: z.boolean() }))) b: { raised: boolean }) {
    return this.voice.raiseHand(id, u.id, b.raised);
  }

  @Post(':id/members/:userId/role')
  @HttpCode(204)
  role(
    @CurrentUser() u: AuthUser,
    @Param('id', ObjectIdPipe) id: string,
    @Param('userId', ObjectIdPipe) target: string,
    @Body(new ZodPipe(z.object({ role: z.enum(['moderator', 'speaker', 'listener']) }))) b: { role: 'moderator' | 'speaker' | 'listener' },
  ) {
    return this.voice.setRole(id, u.id, u.roles, target, b.role);
  }

  @Post(':id/members/:userId/mute')
  @HttpCode(204)
  mute(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Param('userId', ObjectIdPipe) target: string) {
    return this.voice.mute(id, u.id, u.roles, target);
  }

  @Post(':id/members/:userId/remove')
  @HttpCode(204)
  remove(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Param('userId', ObjectIdPipe) target: string) {
    return this.voice.remove(id, u.id, u.roles, target);
  }

  @Post(':id/invite')
  @HttpCode(204)
  invite(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(idBody)) b: { userId: string }) {
    return this.voice.invite(id, u.id, u.roles, b.userId);
  }

  @Post(':id/theme')
  @HttpCode(204)
  theme(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(roomThemeSchema)) b: RoomThemeInput) {
    return this.voice.setTheme(id, u.id, u.roles, b);
  }

  @Post(':id/close')
  @HttpCode(204)
  close(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string) {
    return this.voice.close(id, u.id, false, u.roles);
  }

  @Get(':id/messages')
  messages(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string) {
    return this.voice.chatHistory(id, u.id);
  }

  @Post(':id/messages')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 10_000 } })
  chat(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(z.object({ body: z.string().trim().min(1).max(500) }))) b: { body: string }) {
    return this.voice.chat(id, u.id, b.body);
  }
}

@Module({ imports: [CosmeticsModule], controllers: [VoiceController], providers: [VoiceService], exports: [VoiceService] })
export class VoiceModule {}
