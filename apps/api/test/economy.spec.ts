import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from '../src/payments/payments.module.js';
import { companion, type Ctx, key, seedGame, startApp, type TestUser, user } from './helpers.js';

let ctx: Ctx;
let admin: TestUser;
let gameId: string;
let giftId: string;
let packageId: string;
beforeAll(async () => {
  ctx = await startApp();
  admin = await user(ctx, { roles: ['customer', 'admin'] });
  gameId = await seedGame(ctx);
  giftId = (await admin.post('/admin/gifts', { name: 'Rose', coinCost: 30, imageUrl: '/gifts/rose.png' }).expect(201)).body.id;
  packageId = (await admin.post('/admin/packages', { coins: 100, bonusCoins: 10, priceCentavos: 10_000 }).expect(201)).body.id;
});
afterAll(() => ctx?.stop());

const balance = async (u: TestUser) => (await u.get('/wallet').expect(200)).body.balance as number;

describe('gifts', () => {
  it('debits catalog price, credits companion earnings share, and is idempotent', async () => {
    const c = await companion(ctx, admin, gameId);
    const fan = await user(ctx, { coins: 100 });
    const k = key();
    const body = { giftId, recipientId: c.id, quantity: 2, context: 'profile', idempotencyKey: k, coinCost: 0 };
    const r1 = (await fan.post('/gifts/send', body).expect(201)).body;
    const r2 = (await fan.post('/gifts/send', body).expect(201)).body;
    expect(r2.transactionId).toBe(r1.transactionId);
    expect(await balance(fan)).toBe(40);
    // 60 coins × ₱1 × 50% share = ₱30.00
    expect((await c.get('/earnings')).body.pendingCentavos).toBe(3_000);
    const hist = (await fan.get('/wallet/transactions')).body.items;
    expect(hist[0]).toMatchObject({ type: 'gift_sent', amount: -60, balanceAfter: 40 });
  });

  it('concurrent spends never overdraw the wallet', async () => {
    const c = await companion(ctx, admin, gameId);
    const fan = await user(ctx, { coins: 100 });
    const res = await Promise.all(
      Array.from({ length: 6 }, () => fan.post('/gifts/send', { giftId, recipientId: c.id, quantity: 1, context: 'profile', idempotencyKey: key() })),
    );
    expect(res.filter((r) => r.status === 201)).toHaveLength(3);
    expect(res.filter((r) => r.status === 402)).toHaveLength(3);
    expect(await balance(fan)).toBe(10);
    expect((await admin.get('/admin/reconcile')).body.mismatches).toEqual([]);
  });

  it('rejects self-gifts, non-companion profile gifts, blocked users and inactive gifts', async () => {
    const a = await user(ctx, { coins: 100 });
    const b = await user(ctx);
    await a.post('/gifts/send', { giftId, recipientId: a.id, context: 'profile', idempotencyKey: key() }).expect(400);
    await a.post('/gifts/send', { giftId, recipientId: b.id, context: 'profile', idempotencyKey: key() }).expect(400);
    const c = await companion(ctx, admin, gameId);
    await c.post(`/users/${a.id}/block`).expect(204);
    await a.post('/gifts/send', { giftId, recipientId: c.id, context: 'profile', idempotencyKey: key() }).expect(403);
    await admin.patch(`/admin/gifts/${giftId}`, { active: false }).expect(200);
    const c2 = await companion(ctx, admin, gameId);
    await a.post('/gifts/send', { giftId, recipientId: c2.id, context: 'profile', idempotencyKey: key() }).expect(404);
    await admin.patch(`/admin/gifts/${giftId}`, { active: true }).expect(200);
    expect(await balance(a)).toBe(100);
  });
});

describe('payments', () => {
  it('dev sandbox checkout credits coins exactly once', async () => {
    const u = await user(ctx);
    const k = key();
    const co = (await u.post('/payments/checkout', { packageId, idempotencyKey: k }).expect(201)).body;
    expect(co.checkoutUrl).toContain('/wallet/dev-checkout/');
    const again = (await u.post('/payments/checkout', { packageId, idempotencyKey: k }).expect(201)).body;
    expect(again.paymentId).toBe(co.paymentId);
    await Promise.all([1, 2, 3].map(() => u.post(`/payments/dev/${co.paymentId}/complete`)));
    expect(await balance(u)).toBe(110);
    expect((await u.get(`/payments/${co.paymentId}`)).body.status).toBe('paid');
    const other = await user(ctx);
    await other.post(`/payments/dev/${co.paymentId}/complete`).expect(404);
  });
});

describe('PayMongo webhook', () => {
  const secret = 'whsk_test_secret';
  let pctx: Ctx;
  beforeAll(async () => {
    pctx = await startApp({ PAYMENT_PROVIDER: 'paymongo', PAYMONGO_SECRET_KEY: 'sk_test_x', PAYMONGO_WEBHOOK_SECRET: secret });
  });
  afterAll(() => pctx?.stop());

  const sign = (raw: string, t = Math.floor(Date.now() / 1000), s = secret) =>
    `t=${t},te=${createHmac('sha256', s).update(`${t}.${raw}`).digest('hex')},li=`;

  it('verifies signatures, confirms with the provider, and ignores duplicate events', async () => {
    const u = await user(pctx);
    const { Types } = await import('mongoose');
    const pay = await pctx.conn.collection('paymentTransactions').insertOne({
      userId: new Types.ObjectId(u.id), purpose: 'coin_topup', coins: 50, amountCentavos: 5_000, currency: 'PHP', provider: 'paymongo',
      providerRef: 'cs_test_1', status: 'pending', idempotencyKey: key(), createdAt: new Date(), updatedAt: new Date(),
    });
    const svc = pctx.app.get(PaymentsService);
    const confirm = vi.spyOn(svc.provider!, 'confirmPaid').mockResolvedValue({ paid: true, providerPaymentId: 'pay_1' });
    const raw = JSON.stringify({ data: { id: 'evt_1', attributes: { type: 'checkout_session.payment.paid', data: { id: 'cs_test_1' } } } });

    await pctx.http().post('/api/v1/payments/webhook').set('Content-Type', 'application/json').set('Paymongo-Signature', sign(raw, undefined, 'wrong')).send(raw).expect(403);
    await pctx.http().post('/api/v1/payments/webhook').set('Content-Type', 'application/json').set('Paymongo-Signature', sign(raw, 1_000_000)).send(raw).expect(403);
    expect(await balance(u)).toBe(0);

    for (let i = 0; i < 3; i++)
      await pctx.http().post('/api/v1/payments/webhook').set('Content-Type', 'application/json').set('Paymongo-Signature', sign(raw)).send(raw).expect(200);
    expect(await balance(u)).toBe(50);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect((await pctx.conn.collection('paymentTransactions').findOne({ _id: pay.insertedId }))!.status).toBe('paid');

    // A validly signed event the provider does not confirm credits nothing.
    confirm.mockResolvedValue({ paid: false });
    await pctx.conn.collection('paymentTransactions').insertOne({
      userId: new Types.ObjectId(u.id), purpose: 'coin_topup', coins: 999, amountCentavos: 99_900, currency: 'PHP', provider: 'paymongo',
      providerRef: 'cs_test_2', status: 'pending', idempotencyKey: key(), createdAt: new Date(), updatedAt: new Date(),
    });
    const raw2 = JSON.stringify({ data: { id: 'evt_2', attributes: { type: 'checkout_session.payment.paid', data: { id: 'cs_test_2' } } } });
    await pctx.http().post('/api/v1/payments/webhook').set('Content-Type', 'application/json').set('Paymongo-Signature', sign(raw2)).send(raw2).expect(200);
    expect(await balance(u)).toBe(50);
  });
});
