import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { Mailer } from '../src/auth/mailer.js';

export const ORIGIN = 'http://localhost:3000';

export async function startApp(extraEnv: Record<string, string> = {}) {
  // A replica set is required: wallet, order and gift operations use multi-document transactions.
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const env = loadEnv({
    NODE_ENV: 'test',
    MONGODB_URI: rs.getUri('tavern_test'),
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    PAYMENT_PROVIDER: 'dev',
    ...extraEnv,
  });
  const app = await createApp(env);
  await app.init();
  const conn = app.get<Connection>(getConnectionToken());
  const http = () => request(app.getHttpServer());
  return {
    app,
    conn,
    http,
    mailer: app.get(Mailer),
    async stop() {
      await app.close();
      await rs.stop();
    },
  };
}
export type Ctx = Awaited<ReturnType<typeof startApp>>;

let n = 0;
/** Registers a mobile-style client (bearer token) and returns a small authed request helper. */
export async function user(ctx: Ctx, opts: { roles?: string[]; coins?: number; verified?: boolean } = {}) {
  n++;
  const res = await ctx
    .http()
    .post('/api/v1/auth/register')
    .set('x-tavern-client', 'mobile')
    .send({ email: `u${n}_${Date.now()}@test.dev`, username: `user${n}_${Date.now() % 100000}`, displayName: `User ${n}`, password: 'password123', birthDate: '1995-01-01', acceptTerms: true })
    .expect(201);
  const id: string = res.body.user.id;
  const users = ctx.conn.collection('users');
  const { Types } = await import('mongoose');
  const _id = new Types.ObjectId(id);
  if (opts.roles) await users.updateOne({ _id }, { $set: { roles: opts.roles } });
  if (opts.verified !== false) await users.updateOne({ _id }, { $set: { emailVerifiedAt: new Date() } });
  if (opts.coins) {
    // Seed coins through a ledger-consistent write (balance + matching ledger row).
    await ctx.conn.collection('wallets').updateOne({ userId: _id }, { $inc: { balance: opts.coins } }, { upsert: true });
    await ctx.conn.collection('walletTransactions').insertOne({ userId: _id, type: 'adjustment', amount: opts.coins, balanceAfter: opts.coins, description: 'test seed', createdAt: new Date() });
  }
  const token: string = res.body.accessToken;
  const call = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string) =>
    ctx.http()[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
  return {
    id,
    token,
    refreshToken: res.body.refreshToken as string,
    username: res.body.user.username as string,
    get: (p: string) => call('get', p),
    post: (p: string, body: object = {}) => call('post', p).send(body),
    patch: (p: string, body: object) => call('patch', p).send(body),
    put: (p: string, body: object) => call('put', p).send(body),
    del: (p: string) => call('delete', p),
  };
}
export type TestUser = Awaited<ReturnType<typeof user>>;

export async function seedGame(ctx: Ctx) {
  const r = await ctx.conn.collection('games').insertOne({ slug: `mlbb-${Date.now()}`, name: 'Mobile Legends', platforms: ['mobile'], ranks: ['Epic', 'Mythic'], roles: ['Tank', 'Mage'], active: true, sortOrder: 0 });
  return String(r.insertedId);
}

/** Creates an approved companion through the real application + admin approval flow. */
export async function companion(ctx: Ctx, admin: TestUser, gameId: string, opts: { online?: boolean; price?: number } = {}) {
  const c = await user(ctx);
  await c
    .post('/applications', {
      displayName: 'Pro Duo',
      headline: 'Mythic jungler',
      introduction: 'I have been playing ranked for five years and love coaching.',
      games: [{ gameId, rank: 'Mythic', roles: ['Mage'] }],
      categories: ['ranked_duo'],
      languages: ['English', 'Filipino'],
      proposedPriceCentavos: 15000,
      voiceCapable: true,
      acknowledgements: { adult: true, noAccountSharing: true, nonRomantic: true, guidelines: true },
    })
    .expect(201);
  const apps = await admin.get('/admin/applications').expect(200);
  const app = apps.body.items.find((a: any) => String(a.userId._id ?? a.userId) === c.id);
  await admin.post(`/admin/applications/${app.id}/decision`, { decision: 'approved' }).expect(204);
  const svc = await c
    .post('/companion/services', {
      gameId,
      category: 'ranked_duo',
      title: 'Ranked Duo',
      description: 'Climb together',
      pricePerUnitCentavos: opts.price ?? 10000,
      unitMinutes: 60,
      maxUnits: 4,
    })
    .expect(201);
  if (opts.online !== false) {
    const { Types } = await import('mongoose');
    await ctx.conn.collection('companionProfiles').updateOne({ userId: new Types.ObjectId(c.id) }, { $set: { online: true } });
  }
  return { ...c, serviceId: svc.body.id as string };
}

export const key = () => `k_${Math.random().toString(36).slice(2)}${Date.now()}`;
