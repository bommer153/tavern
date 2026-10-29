import { Body, Controller, Get, HttpCode, Injectable, Logger, Module, OnModuleInit, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type Appearance, appearanceSchema, type AppearanceInput, type Cosmetic, type CosmeticCollection, DEFAULT_BACKGROUND } from '@tavern/shared';
import { AppError, type AuthUser, badRequest, CurrentUser, notFound, ObjectIdPipe, Public, ZodPipe } from '../common/http.js';
import { Db, InjectM, type M } from '../db/database.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { WalletService } from '../wallet/wallet.service.js';

const isDup = (e: unknown) => (e as { code?: number })?.code === 11000;

type Seed = Pick<Cosmetic, 'key' | 'kind' | 'name' | 'description' | 'category' | 'rarity' | 'unlock' | 'priceCoins' | 'renderer'>;
/** Tavern's curated collection. Inserted once (never overwritten), so admins own every later edit. Artwork is drawn by the web client per key. */
export const CURATED: Seed[] = [
  // Seat frames
  { key: 'pilot-light', kind: 'frame', name: 'Pilot Light', description: 'A thin violet neon ring that hums while you talk.', category: 'neon', rarity: 'common', unlock: 'free', priceCoins: 0, renderer: 'css' },
  { key: 'neon-hex', kind: 'frame', name: 'Neon Hex', description: 'Six bright edges, Tavern’s own shape.', category: 'neon', rarity: 'common', unlock: 'free', priceCoins: 0, renderer: 'css' },
  { key: 'circuit', kind: 'frame', name: 'Circuit Bracket', description: 'Targeting brackets and live traces from a cyber HUD.', category: 'cyber', rarity: 'rare', unlock: 'purchase', priceCoins: 300, renderer: 'css' },
  { key: 'obsidian', kind: 'frame', name: 'Obsidian', description: 'Two hairline gold rings. Quiet, expensive.', category: 'minimal', rarity: 'rare', unlock: 'purchase', priceCoins: 350, renderer: 'css' },
  { key: 'starfall', kind: 'frame', name: 'Starfall', description: 'A halo of stars with a moon on a slow orbit.', category: 'celestial', rarity: 'rare', unlock: 'purchase', priceCoins: 450, renderer: 'css' },
  { key: 'pulse-orbit', kind: 'frame', name: 'Pulse Orbit', description: 'Two energy sparks circle your seat and race when you speak.', category: 'energy', rarity: 'epic', unlock: 'purchase', priceCoins: 800, renderer: 'css' },
  { key: 'ember-crown', kind: 'frame', name: 'Ember Crown', description: 'Flame tongues rise around your seat as you talk.', category: 'elemental', rarity: 'epic', unlock: 'purchase', priceCoins: 900, renderer: 'css' },
  { key: 'frostbite', kind: 'frame', name: 'Frostbite', description: 'Ice shards from the Tavern winter event.', category: 'seasonal', rarity: 'rare', unlock: 'event', priceCoins: 0, renderer: 'css' },
  { key: 'sovereign', kind: 'frame', name: 'Sovereign', description: 'A turning aurora crowned with the Tavern sigil.', category: 'legendary', rarity: 'legendary', unlock: 'purchase', priceCoins: 2500, renderer: 'css' },
  // Room backgrounds
  { key: DEFAULT_BACKGROUND, kind: 'background', name: 'Tavern Hearth', description: 'The house hall: lantern light, arched windows and rising embers.', category: 'signature', rarity: 'common', unlock: 'free', priceCoins: 0, renderer: 'webgl' },
  { key: 'studio', kind: 'background', name: 'Dark Studio', description: 'A clean, still room. Nothing competes with the voices.', category: 'minimal', rarity: 'common', unlock: 'free', priceCoins: 0, renderer: 'css' },
  { key: 'cyber-grid', kind: 'background', name: 'Cyber Grid', description: 'An endless digital floor running to the horizon.', category: 'cyber', rarity: 'common', unlock: 'free', priceCoins: 0, renderer: 'webgl' },
  { key: 'dream', kind: 'background', name: 'Violet Dream', description: 'Soft clouds and slow light in Tavern purple.', category: 'atmosphere', rarity: 'common', unlock: 'free', priceCoins: 0, renderer: 'webgl' },
  { key: 'nebula', kind: 'background', name: 'Nebula Drift', description: 'A galaxy core with stars drifting past.', category: 'space', rarity: 'rare', unlock: 'purchase', priceCoins: 400, renderer: 'webgl' },
  { key: 'grove', kind: 'background', name: 'Lantern Grove', description: 'An enchanted forest where fireflies answer your voice.', category: 'fantasy', rarity: 'rare', unlock: 'purchase', priceCoins: 400, renderer: 'webgl' },
  { key: 'sakura-dusk', kind: 'background', name: 'Sakura Dusk', description: 'A giant moon over petals on the wind.', category: 'anime', rarity: 'rare', unlock: 'purchase', priceCoins: 450, renderer: 'webgl' },
  { key: 'neon-city', kind: 'background', name: 'Neon Rain', description: 'A cyberpunk skyline at night, rain in the signs.', category: 'cyber', rarity: 'rare', unlock: 'purchase', priceCoins: 500, renderer: 'webgl' },
  { key: 'arcade', kind: 'background', name: 'Midnight Arcade', description: 'Synth sun, chrome horizon, a grid that never ends.', category: 'retro', rarity: 'rare', unlock: 'purchase', priceCoins: 500, renderer: 'webgl' },
  { key: 'arena', kind: 'background', name: 'Grand Arena', description: 'Stadium beams sweep over the stage of a championship.', category: 'esports', rarity: 'epic', unlock: 'purchase', priceCoins: 900, renderer: 'webgl' },
  { key: 'winter-lights', kind: 'background', name: 'Winter Lights', description: 'Aurora and falling snow from the Tavern winter event.', category: 'seasonal', rarity: 'epic', unlock: 'event', priceCoins: 0, renderer: 'webgl' },
];

export const toCosmetic = (c: any): Cosmetic => ({
  id: String(c._id),
  key: c.key,
  kind: c.kind,
  name: c.name,
  description: c.description ?? '',
  category: c.category,
  rarity: c.rarity,
  unlock: c.unlock,
  priceCoins: c.priceCoins,
  available: c.available,
  renderer: c.renderer,
  version: c.version,
  sortOrder: c.sortOrder,
});

export const toAppearance = (a: any): Appearance => ({
  frame: a?.frame ?? null,
  background: a?.background ?? DEFAULT_BACKGROUND,
  followRoomTheme: a?.followRoomTheme ?? true,
  animated: a?.animated ?? true,
  intensity: a?.intensity ?? 70,
  parallax: a?.parallax ?? true,
});

@Injectable()
export class CosmeticsService implements OnModuleInit {
  private log = new Logger('Cosmetics');
  constructor(
    private db: Db,
    private wallet: WalletService,
    @InjectM('Cosmetic') private cosmetics: M<'Cosmetic'>,
    @InjectM('UserCosmetic') private owned: M<'UserCosmetic'>,
    @InjectM('User') private users: M<'User'>,
  ) {}

  async onModuleInit() {
    const res = await this.cosmetics.bulkWrite(
      CURATED.map((c, i) => ({ updateOne: { filter: { key: c.key }, update: { $setOnInsert: { ...c, sortOrder: i, available: true, version: 1 } }, upsert: true } })),
    );
    if (res.upsertedCount) this.log.log(`Added ${res.upsertedCount} curated cosmetics`);
  }

  /** True if the user may equip this key: free items and the default are open to all, everything else needs an entitlement. */
  async owns(userId: string, key: string, kind: 'frame' | 'background') {
    if (kind === 'background' && key === DEFAULT_BACKGROUND) return true;
    const c = await this.cosmetics.findOne({ key, kind }).lean();
    if (!c) return false;
    if (c.unlock === 'free' && c.available) return true;
    return !!(await this.owned.exists({ userId, cosmeticId: c._id }));
  }

  async collection(userId: string): Promise<CosmeticCollection> {
    const [mine, user] = await Promise.all([this.owned.find({ userId }, { cosmeticId: 1 }).lean(), this.users.findById(userId, { appearance: 1 }).lean()]);
    const ownedIds = mine.map((o) => o.cosmeticId);
    // Retired items stay visible to the people who own them.
    const rows = await this.cosmetics.find({ $or: [{ available: true }, { _id: { $in: ownedIds } }] }).sort({ kind: 1, sortOrder: 1 }).lean();
    const ownedSet = new Set(ownedIds.map(String));
    return {
      items: rows.map(toCosmetic),
      owned: rows.filter((c) => ownedSet.has(String(c._id)) || (c.unlock === 'free' && c.available)).map((c) => c.key),
      appearance: toAppearance(user?.appearance),
    };
  }

  /** Coins are debited and the entitlement written in one transaction; the catalog price is the only price. */
  async purchase(userId: string, cosmeticId: string, idempotencyKey: string) {
    const c = await this.cosmetics.findById(cosmeticId).lean();
    if (!c || !c.available) throw notFound('Item');
    if (await this.owned.exists({ userId, cosmeticId: c._id })) return { key: c.key, balance: await this.wallet.balance(userId) };
    if (c.unlock !== 'purchase' || c.priceCoins <= 0) throw badRequest('NOT_FOR_SALE', c.unlock === 'free' ? 'This item is already yours' : 'This item can only be unlocked through events');
    try {
      const balance = await this.db.tx(async (session) => {
        const balance = await this.wallet.debit(
          { userId, coins: c.priceCoins, type: 'cosmetic_purchase', description: `${c.name} (${c.kind})`, refType: 'cosmetic', refId: c._id, idempotencyKey: `cosmetic:${idempotencyKey}` },
          session,
        );
        await this.owned.create([{ userId, cosmeticId: c._id, key: c.key, source: 'purchase', priceCoins: c.priceCoins }], { session });
        return balance;
      });
      return { key: c.key, balance };
    } catch (e) {
      // A concurrent purchase of the same item (or a retried key) already committed: report ownership, charge nothing more.
      if (isDup(e) && (await this.owned.exists({ userId, cosmeticId: c._id }))) return { key: c.key, balance: await this.wallet.balance(userId) };
      throw e;
    }
  }

  async setAppearance(userId: string, b: AppearanceInput) {
    if (b.frame && !(await this.owns(userId, b.frame, 'frame'))) throw new AppError(403, 'NOT_OWNED', 'You don’t own that frame yet');
    if (b.background && !(await this.owns(userId, b.background, 'background'))) throw new AppError(403, 'NOT_OWNED', 'You don’t own that background yet');
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(b)) if (v !== undefined) set[`appearance.${k}`] = v;
    const u = await this.users.findByIdAndUpdate(userId, { $set: set }, { returnDocument: 'after', projection: { appearance: 1 } }).lean();
    return toAppearance(u?.appearance);
  }

  /** Staff grant for events and promotions. Idempotent: granting an owned item is a no-op. */
  async grant(actorId: string, cosmeticId: string, userId: string) {
    const c = await this.cosmetics.findById(cosmeticId).lean();
    if (!c) throw notFound('Item');
    if (!(await this.users.exists({ _id: userId }))) throw notFound('User');
    try {
      await this.owned.create({ userId, cosmeticId: c._id, key: c.key, source: c.unlock === 'event' ? 'event' : 'grant', grantedBy: actorId });
    } catch (e) {
      if (!isDup(e)) throw e;
    }
    await this.db.audit(actorId, 'cosmetic.grant', 'User', userId, { key: c.key });
  }

  async history(userId: string) {
    const rows = await this.owned.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();
    return rows.map((r) => ({ key: r.key, source: r.source, priceCoins: r.priceCoins, createdAt: r.createdAt }));
  }
}

@ApiTags('cosmetics')
@Controller('cosmetics')
class CosmeticsController {
  constructor(
    private svc: CosmeticsService,
    @InjectM('Cosmetic') private cosmetics: M<'Cosmetic'>,
  ) {}

  @Public()
  @Get()
  async catalog() {
    return (await this.cosmetics.find({ available: true }).sort({ kind: 1, sortOrder: 1 }).lean()).map(toCosmetic);
  }

  @Get('me')
  collection(@CurrentUser() u: AuthUser) {
    return this.svc.collection(u.id);
  }

  @Get('me/history')
  history(@CurrentUser() u: AuthUser) {
    return this.svc.history(u.id);
  }

  @Patch('me/appearance')
  appearance(@CurrentUser() u: AuthUser, @Body(new ZodPipe(appearanceSchema)) b: AppearanceInput) {
    return this.svc.setAppearance(u.id, b);
  }

  @Post(':id/purchase')
  @HttpCode(200)
  purchase(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string, @Body(new ZodPipe(z.object({ idempotencyKey: z.string().min(8).max(64) }))) b: { idempotencyKey: string }) {
    return this.svc.purchase(u.id, id, b.idempotencyKey);
  }
}

@Module({ imports: [WalletModule], controllers: [CosmeticsController], providers: [CosmeticsService], exports: [CosmeticsService] })
export class CosmeticsModule {}
