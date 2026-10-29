import { Injectable } from '@nestjs/common';
import type { PipelineStage, Types } from 'mongoose';
import type { CompanionCard, CompanionDetail, CompanionQuery } from '@tavern/shared';
import { badRequest, conflict, notFound } from '../common/http.js';
import { Db, InjectM, type M } from '../db/database.module.js';
import { NotificationsService } from '../notifications/notifications.js';

type GameInfo = { slug: string; name: string };

@Injectable()
export class CompanionsService {
  constructor(
    private db: Db,
    private notifications: NotificationsService,
    @InjectM('CompanionProfile') private profiles: M<'CompanionProfile'>,
    @InjectM('CompanionService') private services: M<'CompanionService'>,
    @InjectM('CompanionApplication') private applications: M<'CompanionApplication'>,
    @InjectM('Follow') private follows: M<'Follow'>,
    @InjectM('Game') private games: M<'Game'>,
    @InjectM('User') private users: M<'User'>,
    @InjectM('Order') private orders: M<'Order'>,
    @InjectM('Review') private reviews: M<'Review'>,
  ) {}

  private async gameMap() {
    const all = await this.games.find({}, { slug: 1, name: 1 }).lean();
    return new Map<string, GameInfo>(all.map((g) => [String(g._id), { slug: g.slug, name: g.name }]));
  }

  private async busySet(ids: Types.ObjectId[]) {
    const busy = await this.orders.distinct('companionId', { companionId: { $in: ids }, status: 'in_progress' });
    return new Set(busy.map(String));
  }

  private toCard(p: any, u: any, games: Map<string, GameInfo>, busy: Set<string>): CompanionCard {
    return {
      userId: String(p.userId),
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl ?? undefined,
      headline: p.headline ?? '',
      verified: !!u.emailVerifiedAt,
      online: !!p.online,
      busy: busy.has(String(p.userId)),
      games: (p.games ?? []).map((g: any) => ({
        gameId: String(g.gameId),
        slug: games.get(String(g.gameId))?.slug ?? '',
        name: games.get(String(g.gameId))?.name ?? 'Unknown',
        rank: g.rank ?? undefined,
        roles: g.roles ?? [],
      })),
      languages: p.languages ?? [],
      ratingAvg: Math.round((p.ratingAvg ?? 0) * 10) / 10,
      ratingCount: p.ratingCount ?? 0,
      startingPriceCentavos: p.startingPriceCentavos ?? null,
      categories: p.categories ?? [],
      voiceAvailable: !!p.voiceAvailable,
    };
  }

  async search(q: CompanionQuery & { page: number; limit: number }) {
    const match: Record<string, unknown> = { status: 'approved' };
    if (q.game) {
      const g = await this.games.findOne({ slug: q.game }).lean();
      if (!g) return { items: [], page: q.page, total: 0, hasMore: false };
      match['games'] = { $elemMatch: { gameId: g._id, ...(q.rank && { rank: q.rank }), ...(q.role && { roles: q.role }) } };
    } else {
      if (q.rank) match['games.rank'] = q.rank;
      if (q.role) match['games.roles'] = q.role;
    }
    if (q.category) match.categories = q.category;
    if (q.language) match.languages = q.language;
    if (q.playstyle) match.playstyles = q.playstyle;
    if (q.voice) match.voiceAvailable = true;
    if (q.online) match.online = true;
    if (q.minRating) match.ratingAvg = { $gte: q.minRating };
    if (q.minPrice !== undefined || q.maxPrice !== undefined)
      match.startingPriceCentavos = { $ne: null, ...(q.minPrice !== undefined && { $gte: q.minPrice }), ...(q.maxPrice !== undefined && { $lte: q.maxPrice }) };

    const sort: Record<string, 1 | -1> = {
      featured: { featured: -1, online: -1, ratingAvg: -1 },
      rating: { ratingAvg: -1, ratingCount: -1 },
      popular: { completedOrders: -1, followerCount: -1 },
      new: { approvedAt: -1 },
      price_asc: { startingPriceCentavos: 1 },
      price_desc: { startingPriceCentavos: -1 },
    }[q.sort ?? 'featured'] as Record<string, 1 | -1>;

    const pipeline: PipelineStage[] = [
      { $match: match },
      { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $match: { 'user.status': 'active' } },
    ];
    if (q.q) {
      const rx = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      pipeline.push({ $match: { $or: [{ 'user.displayName': rx }, { 'user.username': rx }, { headline: rx }] } });
    }
    const skip = (q.page - 1) * q.limit;
    pipeline.push({
      $facet: {
        items: [{ $sort: { ...sort, _id: 1 } }, { $skip: skip }, { $limit: q.limit }],
        total: [{ $count: 'n' }],
      },
    });
    const [res] = await this.profiles.aggregate<{ items: any[]; total: { n: number }[] }>(pipeline);
    const items = res?.items ?? [];
    const total = res?.total[0]?.n ?? 0;
    const [games, busy] = await Promise.all([this.gameMap(), this.busySet(items.map((i) => i.userId))]);
    return { items: items.map((p) => this.toCard(p, p.user, games, busy)), page: q.page, total, hasMore: skip + items.length < total };
  }

  async sections() {
    const pick = (sort: CompanionQuery['sort'], extra: Partial<CompanionQuery> = {}) =>
      this.search({ sort, page: 1, limit: 8, ...extra } as any).then((r) => r.items);
    const [featured, topRated, popular, fresh, online] = await Promise.all([
      pick('featured'),
      pick('rating'),
      pick('popular'),
      pick('new'),
      pick('featured', { online: true }),
    ]);
    return { featured, topRated, popular, new: fresh, online };
  }

  async detail(username: string, viewerId?: string): Promise<CompanionDetail> {
    const user = await this.users.findOne({ usernameLower: username.toLowerCase(), status: 'active' }).lean();
    const profile = user && (await this.profiles.findOne({ userId: user._id, status: 'approved' }).lean());
    if (!user || !profile) throw notFound('Companion');
    return this.buildDetail(profile, user, viewerId);
  }

  async buildDetail(profile: any, user: any, viewerId?: string): Promise<CompanionDetail> {
    const [games, busy, services, isFollowing] = await Promise.all([
      this.gameMap(),
      this.busySet([user._id]),
      this.services.find({ companionId: user._id, ...(viewerId === String(user._id) ? {} : { active: true }) }).sort({ pricePerUnitCentavos: 1 }).lean(),
      viewerId ? this.follows.exists({ followerId: viewerId, companionId: user._id }) : null,
    ]);
    return {
      ...this.toCard(profile, user, games, busy),
      bio: profile.bio ?? '',
      bannerUrl: profile.bannerUrl ?? undefined,
      playstyles: profile.playstyles ?? [],
      services: services.map(toService),
      followerCount: profile.followerCount ?? 0,
      isFollowing: !!isFollowing,
      completedOrders: profile.completedOrders ?? 0,
    };
  }

  async reviewsFor(companionId: string, page: number, limit = 10) {
    const filter = { companionId, hidden: false };
    const [rows, total] = await Promise.all([
      this.reviews.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('authorId', 'displayName avatarUrl').lean(),
      this.reviews.countDocuments(filter),
    ]);
    return {
      items: rows.map((r: any) => ({
        id: String(r._id),
        rating: r.rating,
        comment: r.comment,
        author: { displayName: r.authorId?.displayName ?? 'Player', avatarUrl: r.authorId?.avatarUrl },
        createdAt: r.createdAt,
      })),
      page,
      total,
      hasMore: page * limit < total,
    };
  }

  async follow(followerId: string, companionId: string, on: boolean) {
    if (followerId === companionId) throw badRequest('INVALID', 'You cannot follow yourself');
    if (!(await this.profiles.exists({ userId: companionId, status: 'approved' }))) throw notFound('Companion');
    await this.db.tx(async (session) => {
      if (on) {
        const r = await this.follows.updateOne({ followerId, companionId }, {}, { upsert: true, session });
        if (r.upsertedCount) await this.profiles.updateOne({ userId: companionId }, { $inc: { followerCount: 1 } }, { session });
      } else {
        const r = await this.follows.deleteOne({ followerId, companionId }, { session });
        if (r.deletedCount) await this.profiles.updateOne({ userId: companionId }, { $inc: { followerCount: -1 } }, { session });
      }
    });
  }

  async following(userId: string) {
    const ids = (await this.follows.find({ followerId: userId }).sort({ createdAt: -1 }).limit(200).lean()).map((f) => f.companionId);
    const [profiles, users, games, busy] = await Promise.all([
      this.profiles.find({ userId: { $in: ids }, status: 'approved' }).lean(),
      this.users.find({ _id: { $in: ids }, status: 'active' }).lean(),
      this.gameMap(),
      this.busySet(ids),
    ]);
    const byId = new Map(users.map((u) => [String(u._id), u]));
    return profiles.filter((p) => byId.has(String(p.userId))).map((p) => this.toCard(p, byId.get(String(p.userId)), games, busy));
  }

  /** Keeps denormalized card fields (starting price, categories) in sync with active services. */
  async refreshServiceSummary(companionId: string | Types.ObjectId) {
    const active = await this.services.find({ companionId, active: true }, { pricePerUnitCentavos: 1, category: 1 }).lean();
    await this.profiles.updateOne(
      { userId: companionId },
      {
        startingPriceCentavos: active.length ? Math.min(...active.map((s) => s.pricePerUnitCentavos)) : null,
        categories: [...new Set(active.map((s) => s.category))],
      },
    );
  }

  // ----- applications -----
  async submitApplication(userId: string, input: any) {
    if (await this.profiles.exists({ userId })) throw conflict('ALREADY_COMPANION', 'You are already a companion');
    if (await this.applications.exists({ userId, status: { $in: ['submitted', 'under_review'] } }))
      throw conflict('APPLICATION_PENDING', 'Your application is already being reviewed');
    const gameIds = input.games.map((g: any) => g.gameId);
    if ((await this.games.countDocuments({ _id: { $in: gameIds }, active: true })) !== new Set(gameIds).size)
      throw badRequest('INVALID_GAME', 'One or more games are not available');
    const user = await this.users.findById(userId, { emailVerifiedAt: 1 }).lean();
    if (!user?.emailVerifiedAt) throw badRequest('EMAIL_NOT_VERIFIED', 'Verify your email before applying');
    await this.applications.create({ userId, status: 'submitted', ...input });
    return { status: 'submitted' };
  }

  async myApplication(userId: string) {
    const a = await this.applications.findOne({ userId }).sort({ createdAt: -1 }).lean();
    return a ? { status: a.status, decisionNote: a.decisionNote, createdAt: a.createdAt } : null;
  }

  async decideApplication(id: string, adminId: string, decision: 'approved' | 'rejected' | 'under_review', note?: string) {
    const app = await this.applications.findById(id);
    if (!app) throw notFound('Application');
    if (!['submitted', 'under_review'].includes(app.status)) throw conflict('ALREADY_DECIDED', 'Application already decided');
    await this.db.tx(async (session) => {
      app.status = decision;
      app.reviewedBy = adminId as any;
      app.reviewedAt = new Date();
      app.decisionNote = note;
      await app.save({ session });
      if (decision === 'approved') {
        await this.users.updateOne({ _id: app.userId }, { $addToSet: { roles: 'companion' }, displayName: app.displayName }, { session });
        await this.profiles.updateOne(
          { userId: app.userId },
          {
            $setOnInsert: {
              headline: app.headline,
              bio: app.introduction,
              games: app.games,
              languages: app.languages,
              voiceAvailable: app.voiceCapable,
              status: 'approved',
              approvedAt: new Date(),
            },
          },
          { upsert: true, session },
        );
      }
      await this.db.audit(adminId, `application.${decision}`, 'CompanionApplication', id, { note }, session);
    });
    if (decision !== 'under_review')
      await this.notifications.notify(
        app.userId,
        'safety',
        decision === 'approved' ? 'Welcome, companion!' : 'Companion application update',
        decision === 'approved' ? 'Your application was approved. Set up your services to start earning.' : `Your application was not approved.${note ? ' ' + note : ''}`,
        '/companion/dashboard',
      );
  }
}

export const toService = (s: any) => ({
  id: String(s._id),
  companionId: String(s.companionId),
  gameId: String(s.gameId),
  category: s.category,
  title: s.title,
  description: s.description ?? '',
  includes: s.includes ?? [],
  excludes: s.excludes ?? [],
  pricePerUnitCentavos: s.pricePerUnitCentavos,
  unitMinutes: s.unitMinutes,
  maxUnits: s.maxUnits,
  cancellationPolicy: s.cancellationPolicy ?? '',
  active: s.active,
});
