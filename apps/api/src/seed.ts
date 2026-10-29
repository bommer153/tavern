// Development seed: catalog, gifts, coin packages, staff and demo accounts.
// Usage: pnpm db:seed   (idempotent; refuses to run in production)
import './load-env.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AppModule } from './app.module.js';
import { hashPassword } from './auth/crypto.js';
import { loadEnv } from './config.js';
import { Db } from './db/database.module.js';

const env = loadEnv();
if (env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');

const app = await NestFactory.createApplicationContext(AppModule.with(env), { logger: ['error', 'warn'] });
await app.init();
const m = (name: string) => app.get<Model<any>>(getModelToken(name));
const db = app.get(Db);

const GAMES = [
  { slug: 'mlbb', name: 'Mobile Legends: Bang Bang', platforms: ['mobile'], ranks: ['Warrior', 'Elite', 'Master', 'Grandmaster', 'Epic', 'Legend', 'Mythic', 'Mythical Glory'], roles: ['Tank', 'Fighter', 'Assassin', 'Mage', 'Marksman', 'Support', 'Jungler', 'Roamer'] },
  { slug: 'valorant', name: 'Valorant', platforms: ['pc'], ranks: ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'], roles: ['Duelist', 'Initiator', 'Controller', 'Sentinel'] },
  { slug: 'dota2', name: 'Dota 2', platforms: ['pc'], ranks: ['Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'], roles: ['Carry', 'Mid', 'Offlane', 'Soft Support', 'Hard Support'] },
  { slug: 'wild-rift', name: 'League of Legends: Wild Rift', platforms: ['mobile'], ranks: ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster', 'Challenger'], roles: ['Baron', 'Jungle', 'Mid', 'Dragon', 'Support'] },
  { slug: 'pubg', name: 'PUBG', platforms: ['pc', 'mobile', 'console'], ranks: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Crown', 'Ace', 'Conqueror'], roles: ['Fragger', 'Support', 'Scout', 'IGL'] },
  { slug: 'codm', name: 'Call of Duty: Mobile', platforms: ['mobile'], ranks: ['Rookie', 'Veteran', 'Elite', 'Pro', 'Master', 'Grandmaster', 'Legendary'], roles: ['Slayer', 'Anchor', 'Objective', 'Support'] },
  { slug: 'free-fire', name: 'Free Fire', platforms: ['mobile'], ranks: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Heroic', 'Grandmaster'], roles: ['Rusher', 'Sniper', 'Support', 'IGL'] },
];

// imageUrl holds either an image URL or a single emoji glyph (rendered natively on web and mobile).
const GIFTS = [
  ['Rose', 1, '🌹', 'common'],
  ['Heart', 5, '💜', 'common'],
  ['Gaming Controller', 10, '🎮', 'common'],
  ['Star', 20, '⭐', 'rare'],
  ['Teddy Bear', 50, '🧸', 'rare'],
  ['Magic Potion', 99, '🧪', 'epic'],
  ['Golden Crown', 199, '👑', 'epic'],
  ['Legendary Sword', 499, '🗡️', 'legendary'],
  ['Dragon', 999, '🐉', 'legendary'],
  ['Legendary Treasure Chest', 1999, '💎', 'legendary'],
] as const;

const PACKAGES = [
  [60, 0, 6_000],
  [150, 10, 15_000],
  [300, 30, 30_000],
  [600, 80, 60_000],
  [1500, 250, 150_000],
] as const;

const DEV_PASSWORD = 'tavern-dev-123';

async function upsertUser(email: string, username: string, displayName: string, roles: string[]) {
  const users = m('User');
  const existing = await users.findOne({ email });
  if (existing) return existing;
  const u = await users.create({
    email,
    username,
    usernameLower: username.toLowerCase(),
    displayName,
    passwordHash: await hashPassword(DEV_PASSWORD),
    birthDate: new Date('1996-03-14'),
    roles,
    emailVerifiedAt: new Date(),
  });
  await m('Wallet').updateOne({ userId: u._id }, {}, { upsert: true });
  return u;
}

for (const [i, g] of GAMES.entries()) await m('Game').updateOne({ slug: g.slug }, { $set: { ...g, sortOrder: i, active: true } }, { upsert: true });
for (const [i, [name, coinCost, imageUrl, rarity]] of GIFTS.entries())
  await m('Gift').updateOne({ name }, { $set: { coinCost, imageUrl, rarity, category: 'classic', sortOrder: i, active: true } }, { upsert: true });
for (const [i, [coins, bonusCoins, priceCentavos]] of PACKAGES.entries())
  await m('CoinPackage').updateOne({ coins }, { $set: { bonusCoins, priceCentavos, sortOrder: i, active: true } }, { upsert: true });

const games = new Map((await m('Game').find().lean()).map((g: any) => [g.slug, g]));
await upsertUser('admin@tavern.local', 'tavern_admin', 'Tavern Admin', ['customer', 'admin']);
await upsertUser('mod@tavern.local', 'tavern_mod', 'Tavern Moderator', ['customer', 'moderator']);
const player = await upsertUser('player@tavern.local', 'demo_player', 'Demo Player', ['customer']);

// Give the demo player starter coins through the ledger so reconciliation stays clean.
if (!(await m('WalletTransaction').exists({ userId: player._id, idempotencyKey: 'seed:starter' })))
  await db.tx(async (session) => {
    const w = await m('Wallet').findOneAndUpdate({ userId: player._id }, { $inc: { balance: 2000 } }, { returnDocument: 'after', upsert: true, session });
    await m('WalletTransaction').create([{ userId: player._id, type: 'adjustment', amount: 2000, balanceAfter: w.balance, description: 'Development starter coins', idempotencyKey: 'seed:starter' }], { session });
  });

const COMPANIONS = [
  { username: 'kaiser_ml', name: 'Kaiser', headline: 'Mythical Glory jungler · chill comms', game: 'mlbb', rank: 'Mythical Glory', roles: ['Jungler', 'Assassin'], langs: ['Filipino', 'English'], price: 12_000, cat: 'ranked_duo', featured: true },
  { username: 'luna_val', name: 'Luna', headline: 'Immortal sentinel main. Patient coach.', game: 'valorant', rank: 'Immortal', roles: ['Sentinel', 'Controller'], langs: ['English', 'Filipino'], price: 20_000, cat: 'coaching', featured: true },
  { username: 'tito_dota', name: 'Tito Ramon', headline: 'Ancient pos 5 — warding is love', game: 'dota2', rank: 'Ancient', roles: ['Hard Support'], langs: ['Filipino', 'Cebuano'], price: 9_000, cat: 'casual_mabar', featured: false },
  { username: 'mika_wr', name: 'Mika', headline: 'Wild Rift Challenger mid laner', game: 'wild-rift', rank: 'Challenger', roles: ['Mid', 'Support'], langs: ['English'], price: 15_000, cat: 'ranked_duo', featured: true },
  { username: 'jett_codm', name: 'Jett', headline: 'Legendary slayer, party games anytime', game: 'codm', rank: 'Legendary', roles: ['Slayer'], langs: ['Filipino', 'English'], price: 8_000, cat: 'party_companion', featured: false },
  { username: 'ria_ff', name: 'Ria', headline: 'Grandmaster IGL · voice hangouts', game: 'free-fire', rank: 'Grandmaster', roles: ['IGL', 'Support'], langs: ['Filipino'], price: 7_000, cat: 'voice_companion', featured: false },
];

for (const c of COMPANIONS) {
  const u = await upsertUser(`${c.username}@tavern.local`, c.username, c.name, ['customer', 'companion']);
  const game = games.get(c.game);
  await m('CompanionProfile').updateOne(
    { userId: u._id },
    {
      $setOnInsert: {
        headline: c.headline,
        bio: `${c.name} here! ${c.headline}. Book a session and let's climb together — respectful vibes only.`,
        games: [{ gameId: game._id, rank: c.rank, roles: c.roles }],
        languages: c.langs,
        playstyles: ['Chill', 'Tryhard'],
        voiceAvailable: true,
        status: 'approved',
        featured: c.featured,
        approvedAt: new Date(),
        ratingAvg: 4.5 + Math.random() * 0.5,
        ratingCount: 10 + Math.floor(Math.random() * 90),
        completedOrders: 20 + Math.floor(Math.random() * 200),
      },
    },
    { upsert: true },
  );
  if (!(await m('CompanionService').exists({ companionId: u._id }))) {
    await m('CompanionService').create([
      {
        companionId: u._id,
        gameId: game._id,
        category: c.cat,
        title: { ranked_duo: 'Ranked Duo', coaching: 'Gaming Coach', casual_mabar: 'Casual Mabar', party_companion: 'Party Companion', voice_companion: 'Voice Companion' }[c.cat],
        description: `One hour of ${game.name} with ${c.name}. Voice comms on Discord-style in-app voice.`,
        includes: ['Voice comms during the match', 'Post-game tips'],
        excludes: ['Account sharing or piloting', 'Rank guarantees'],
        pricePerUnitCentavos: c.price,
        unitMinutes: 60,
        maxUnits: 4,
        cancellationPolicy: 'Free cancellation until accepted.',
      },
      {
        companionId: u._id,
        gameId: game._id,
        category: 'casual_mabar',
        title: 'Casual Mabar (30 min)',
        description: 'Quick casual games, no pressure.',
        includes: ['Unranked games'],
        excludes: ['Account sharing or piloting'],
        pricePerUnitCentavos: Math.round(c.price / 2),
        unitMinutes: 30,
        maxUnits: 6,
        cancellationPolicy: 'Free cancellation until accepted.',
      },
    ]);
  }
  const svcs = await m('CompanionService').find({ companionId: u._id, active: true }).lean();
  await m('CompanionProfile').updateOne(
    { userId: u._id },
    { startingPriceCentavos: Math.min(...svcs.map((s: any) => s.pricePerUnitCentavos)), categories: [...new Set(svcs.map((s: any) => s.category))] },
  );
}

const host = await m('User').findOne({ usernameLower: 'kaiser_ml' });
if (!(await m('VoiceRoom').exists({ hostId: host._id, status: 'live' }))) {
  const room = await m('VoiceRoom').create({
    hostId: host._id,
    title: 'MLBB Mythic grind — LF 5th',
    description: 'Chill ranked lobby. Jump in, raise your hand to talk.',
    rules: 'Be kind. No toxicity. No selling accounts.',
    category: 'ranked',
    gameId: games.get('mlbb')._id,
    privacy: 'public',
    capacity: 50,
  });
  await m('VoiceRoomMember').create({ roomId: room._id, userId: host._id, role: 'host', present: true });
}

console.log(`Seed complete.
  Admin:     admin@tavern.local / ${DEV_PASSWORD}
  Moderator: mod@tavern.local / ${DEV_PASSWORD}
  Player:    player@tavern.local / ${DEV_PASSWORD}  (2000 coins)
  Companion: kaiser_ml@tavern.local / ${DEV_PASSWORD}`);
await app.close();
