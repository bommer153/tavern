import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { OrdersService } from '../src/orders/orders.service.js';
import { EarningsService } from '../src/earnings/earnings.service.js';
import { companion, type Ctx, key, seedGame, startApp, type TestUser, user } from './helpers.js';

let ctx: Ctx;
let admin: TestUser;
let gameId: string;
beforeAll(async () => {
  ctx = await startApp();
  admin = await user(ctx, { roles: ['customer', 'admin'] });
  gameId = await seedGame(ctx);
});
afterAll(() => ctx?.stop());

const balance = async (u: TestUser) => (await u.get('/wallet').expect(200)).body.balance as number;

describe('companion marketplace', () => {
  it('application requires verified email and admin approval grants the companion role', async () => {
    const unverified = await user(ctx, { verified: false });
    const r = await unverified.post('/applications', {
      displayName: 'X', headline: 'x', introduction: 'x'.repeat(30), games: [{ gameId, roles: [] }], categories: ['coaching'], languages: ['English'],
      proposedPriceCentavos: 10000, voiceCapable: false, acknowledgements: { adult: true, noAccountSharing: true, nonRomantic: true, guidelines: true },
    }).expect(400);
    expect(r.body.code).toBe('EMAIL_NOT_VERIFIED');

    const c = await companion(ctx, admin, gameId, { price: 12_000 });
    const me = await c.get('/users/me').expect(200);
    expect(me.body.roles).toContain('companion');
    const detail = await ctx.http().get(`/api/v1/companions/${c.username}`).expect(200);
    expect(detail.body.services).toHaveLength(1);
    expect(detail.body.startingPriceCentavos).toBe(12_000);
  });

  it('filters by game, category and price', async () => {
    const slug = (await ctx.conn.collection('games').findOne({ _id: new Types.ObjectId(gameId) }))!.slug;
    const all = await ctx.http().get(`/api/v1/companions?game=${slug}&category=ranked_duo`).expect(200);
    expect(all.body.items.length).toBeGreaterThan(0);
    const none = await ctx.http().get(`/api/v1/companions?game=${slug}&maxPrice=100`).expect(200);
    expect(none.body.items).toHaveLength(0);
    await ctx.http().get('/api/v1/companions?limit=1000').expect(400);
  });

  it('follow is idempotent and counted once', async () => {
    const c = await companion(ctx, admin, gameId);
    const fan = await user(ctx);
    await fan.post(`/companions/${c.id}/follow`).expect(204);
    await fan.post(`/companions/${c.id}/follow`).expect(204);
    const d = await fan.get(`/companions/${c.username}`).expect(200);
    expect(d.body.followerCount).toBe(1);
    expect(d.body.isFollowing).toBe(true);
    expect((await fan.get('/companions/following/me')).body).toHaveLength(1);
  });
});

describe('booking workflow', () => {
  it('runs the full happy path with server-calculated price, chat, timer, earnings and review', async () => {
    const c = await companion(ctx, admin, gameId, { price: 10_000 });
    const cust = await user(ctx, { coins: 500 });
    // Client-supplied price/status fields are ignored by validation.
    const created = await cust.post('/orders', { serviceId: c.serviceId, units: 2, idempotencyKey: key(), total: 1, status: 'completed' }).expect(201);
    const o = created.body;
    expect(o.status).toBe('pending_acceptance');
    expect(o.amounts).toMatchObject({ subtotal: 20_000, total: 20_000, commission: 4_000, companionEarning: 16_000 });
    expect(o.paidWithCoins).toBe(200);
    expect(await balance(cust)).toBe(300);

    // Customer cannot accept their own order; companion can.
    await cust.post(`/orders/${o.id}/accept`).expect(403);
    const accepted = (await c.post(`/orders/${o.id}/accept`).expect(200)).body;
    expect(accepted.conversationId).toBeTruthy();
    await cust.post(`/conversations/${accepted.conversationId}/messages`, { body: 'gg', clientId: key() }).expect(201);

    const started = (await c.post(`/orders/${o.id}/start`).expect(200)).body;
    expect(new Date(started.endsAt).getTime() - new Date(started.startedAt).getTime()).toBe(120 * 60_000);
    // Companion cannot end before the server timer; customer can confirm completion.
    expect((await c.post(`/orders/${o.id}/complete`).expect(400)).body.code).toBe('SESSION_NOT_OVER');
    await cust.post(`/orders/${o.id}/complete`).expect(200);

    const earnings = (await c.get('/earnings').expect(200)).body;
    expect(earnings).toMatchObject({ pendingCentavos: 16_000, availableCentavos: 0, completedOrders: 1 });

    await cust.post(`/orders/${o.id}/review`, { rating: 4, comment: 'Great' }).expect(204);
    await cust.post(`/orders/${o.id}/review`, { rating: 5 }).expect(400);
    const d = (await ctx.http().get(`/api/v1/companions/${c.username}`)).body;
    expect(d.ratingAvg).toBe(4);
    expect(d.ratingCount).toBe(1);

    // Other users cannot see the order or its conversation.
    const stranger = await user(ctx);
    await stranger.get(`/orders/${o.id}`).expect(404);
    await stranger.get(`/conversations/${accepted.conversationId}/messages`).expect(404);
  });

  it('rejects bookings without enough coins and leaves the balance untouched', async () => {
    const c = await companion(ctx, admin, gameId);
    const cust = await user(ctx, { coins: 50 });
    const r = await cust.post('/orders', { serviceId: c.serviceId, units: 1, idempotencyKey: key() }).expect(402);
    expect(r.body.code).toBe('INSUFFICIENT_FUNDS');
    expect(await balance(cust)).toBe(50);
    expect(await ctx.conn.collection('orders').countDocuments({ customerId: new Types.ObjectId(cust.id) })).toBe(0);
  });

  it('double submission with the same idempotency key creates one order and one charge', async () => {
    const c = await companion(ctx, admin, gameId);
    const cust = await user(ctx, { coins: 1000 });
    const k = key();
    const results = await Promise.all([1, 2, 3].map(() => cust.post('/orders', { serviceId: c.serviceId, units: 1, idempotencyKey: k })));
    const ids = new Set(results.filter((r) => r.status === 201).map((r) => r.body.id));
    expect(ids.size).toBe(1);
    expect(await balance(cust)).toBe(900);
  });

  it('concurrent bookings for the same slot: exactly one wins', async () => {
    const c = await companion(ctx, admin, gameId);
    const buyers = await Promise.all([1, 2, 3, 4].map(() => user(ctx, { coins: 1000 })));
    const res = await Promise.all(buyers.map((b) => b.post('/orders', { serviceId: c.serviceId, units: 1, idempotencyKey: key() })));
    expect(res.filter((r) => r.status === 201)).toHaveLength(1);
    expect(res.filter((r) => r.status === 409).every((r) => r.body.code === 'SLOT_TAKEN')).toBe(true);
    const balances = await Promise.all(buyers.map(balance));
    expect(balances.sort()).toEqual([1000, 1000, 1000, 900]);
  });

  it('one order flow: offline companions and scheduled times are refused', async () => {
    const c = await companion(ctx, admin, gameId, { online: false });
    const cust = await user(ctx, { coins: 1000 });
    expect((await cust.post('/orders', { serviceId: c.serviceId, units: 1, idempotencyKey: key() }).expect(400)).body.code).toBe('COMPANION_OFFLINE');
    const online = await companion(ctx, admin, gameId);
    const later = new Date(Date.now() + 86400_000).toISOString();
    await cust.post('/orders', { serviceId: online.serviceId, units: 1, scheduledStart: later, idempotencyKey: key() }).expect(400);
    expect(await balance(cust)).toBe(1000);
  });

  it('decline refunds coins; invalid transitions are rejected', async () => {
    const c = await companion(ctx, admin, gameId);
    const cust = await user(ctx, { coins: 300 });
    const o = (await cust.post('/orders', { serviceId: c.serviceId, units: 1, idempotencyKey: key() }).expect(201)).body;
    await c.post(`/orders/${o.id}/start`).expect(409);
    await c.post(`/orders/${o.id}/decline`, { reason: 'busy' }).expect(200);
    expect(await balance(cust)).toBe(300);
    await c.post(`/orders/${o.id}/accept`).expect(409);
    // Refund cannot be applied twice even if decline is retried.
    await c.post(`/orders/${o.id}/decline`).expect(409);
    expect(await balance(cust)).toBe(300);
  });

  it('dispute → admin refund reverses the pending earning', async () => {
    const c = await companion(ctx, admin, gameId);
    const cust = await user(ctx, { coins: 300 });
    const o = (await cust.post('/orders', { serviceId: c.serviceId, units: 1, idempotencyKey: key() })).body;
    await c.post(`/orders/${o.id}/accept`).expect(200);
    await c.post(`/orders/${o.id}/start`).expect(200);
    await cust.post(`/orders/${o.id}/complete`).expect(200);
    expect(await balance(cust)).toBe(200);
    await cust.post(`/orders/${o.id}/dispute`).expect(400); // reason required
    await cust.post(`/orders/${o.id}/dispute`, { reason: 'No show' }).expect(200);
    await admin.post(`/admin/orders/${o.id}/resolve`, { outcome: 'refund', note: 'Verified' }).expect(200);
    expect(await balance(cust)).toBe(300);
    expect((await c.get('/earnings')).body.pendingCentavos).toBe(0);
    const recon = (await admin.get('/admin/reconcile').expect(200)).body;
    expect(recon.mismatches).toEqual([]);
  });

  it('server sweep auto-completes finished sessions and expires stale requests', async () => {
    const c = await companion(ctx, admin, gameId);
    const cust = await user(ctx, { coins: 300 });
    const o = (await cust.post('/orders', { serviceId: c.serviceId, units: 1, idempotencyKey: key() })).body;
    await c.post(`/orders/${o.id}/accept`).expect(200);
    await c.post(`/orders/${o.id}/start`).expect(200);
    const svc = ctx.app.get(OrdersService);
    await svc.sweep(new Date(Date.now() + 2 * 3600_000));
    expect((await cust.get(`/orders/${o.id}`)).body.status).toBe('completed');

    const c2 = await companion(ctx, admin, gameId);
    const o2 = (await cust.post('/orders', { serviceId: c2.serviceId, units: 1, idempotencyKey: key() })).body;
    await svc.sweep(new Date(Date.now() + 3600_000));
    expect((await cust.get(`/orders/${o2.id}`)).body.status).toBe('cancelled');
    expect(await balance(cust)).toBe(200);
  });
});

describe('earnings and payouts', () => {
  it('settles after the hold, reserves on request, releases on rejection', async () => {
    const c = await companion(ctx, admin, gameId, { price: 20_000 });
    const cust = await user(ctx, { coins: 1000 });
    const o = (await cust.post('/orders', { serviceId: c.serviceId, units: 1, idempotencyKey: key() })).body;
    await c.post(`/orders/${o.id}/accept`);
    await c.post(`/orders/${o.id}/start`);
    await cust.post(`/orders/${o.id}/complete`).expect(200);
    const payout = { amountCentavos: 16_000, method: 'gcash', accountName: 'Pro', accountNumber: '09171234567', idempotencyKey: key() };
    expect((await c.post('/payouts', payout).expect(402)).body.code).toBe('INSUFFICIENT_EARNINGS');

    await ctx.app.get(EarningsService).settleMatured(new Date(Date.now() + 100 * 3600_000));
    expect((await c.get('/earnings')).body).toMatchObject({ pendingCentavos: 0, availableCentavos: 16_000 });

    const p = (await c.post('/payouts', payout).expect(201)).body;
    await c.post('/payouts', payout).expect(201); // idempotent replay
    expect((await c.get('/earnings')).body.availableCentavos).toBe(0);
    expect((await c.get('/payouts/me')).body[0].account).toBe('•••• 4567');
    await admin.post(`/admin/payouts/${p.id}/status`, { status: 'paid' }).expect(409); // must go through review
    await admin.post(`/admin/payouts/${p.id}/status`, { status: 'rejected', note: 'Name mismatch' }).expect(204);
    expect((await c.get('/earnings')).body.availableCentavos).toBe(16_000);
  });

  it('companions only see their own earnings', async () => {
    const other = await user(ctx);
    await other.get('/earnings').expect(403);
  });
});
