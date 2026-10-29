import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ctx, ORIGIN, startApp, user } from './helpers.js';

let ctx: Ctx;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(() => ctx?.stop());

const reg = (over: object = {}) => ({
  email: `a${Math.random()}@test.dev`,
  username: `a${Math.floor(Math.random() * 1e8)}`,
  displayName: 'A',
  password: 'password123',
  birthDate: '1990-05-05',
  acceptTerms: true,
  ...over,
});

describe('auth', () => {
  it('rejects minors and invalid input', async () => {
    const minor = new Date(Date.now() - 17 * 365 * 86400_000).toISOString().slice(0, 10);
    const r = await ctx.http().post('/api/v1/auth/register').send(reg({ birthDate: minor })).expect(400);
    expect(r.body.code).toBe('AGE_REQUIREMENT');
    const v = await ctx.http().post('/api/v1/auth/register').send(reg({ password: 'short' })).expect(400);
    expect(v.body.code).toBe('VALIDATION_FAILED');
  });

  it('web: sets HTTP-only cookies and never returns tokens in the body', async () => {
    const r = await ctx.http().post('/api/v1/auth/register').set('Origin', ORIGIN).send(reg()).expect(201);
    expect(r.body.accessToken).toBeUndefined();
    const cookies = ([] as string[]).concat(r.headers['set-cookie'] ?? []);
    expect(cookies.some((c) => c.startsWith('tv_at=') && /HttpOnly/i.test(c))).toBe(true);
    expect(cookies.some((c) => c.startsWith('tv_rt=') && /Path=\/api\/v1\/auth/.test(c))).toBe(true);
    const agent = ctx.http();
    const at = cookies.find((c) => c.startsWith('tv_at='))!.split(';')[0]!;
    await agent.get('/api/v1/users/me').set('Cookie', at).expect(200);
    // CSRF: cookie-authenticated writes from a foreign origin are rejected.
    await ctx.http().patch('/api/v1/users/me').set('Cookie', at).set('Origin', 'https://evil.example').send({ bio: 'x' }).expect(403);
    await ctx.http().patch('/api/v1/users/me').set('Cookie', at).set('Origin', ORIGIN).send({ bio: 'x' }).expect(200);
  });

  it('sends a verification email and verifies with the token once', async () => {
    const body = reg();
    await ctx.http().post('/api/v1/auth/register').set('x-tavern-client', 'mobile').send(body).expect(201);
    const mail = ctx.mailer.outbox.find((m) => m.to === body.email.toLowerCase())!;
    const token = /token=([\w-]+)/.exec(mail.text)![1];
    await ctx.http().post('/api/v1/auth/verify-email').send({ token }).expect(204);
    await ctx.http().post('/api/v1/auth/verify-email').send({ token }).expect(400);
  });

  it('login does not reveal whether an email exists', async () => {
    const a = await ctx.http().post('/api/v1/auth/login').send({ email: 'nobody@test.dev', password: 'whatever1' }).expect(401);
    const u = await user(ctx);
    const me = await u.get('/users/me').expect(200);
    const b = await ctx.http().post('/api/v1/auth/login').send({ email: me.body.email, password: 'wrongpass' }).expect(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const u = await user(ctx);
    const r1 = await ctx.http().post('/api/v1/auth/refresh').set('x-tavern-client', 'mobile').send({ refreshToken: u.refreshToken }).expect(200);
    expect(r1.body.refreshToken).not.toBe(u.refreshToken);
    // Simulate a stolen old token used after the grace window.
    await ctx.conn.collection('sessions').updateMany({}, [{ $set: { replacedAt: { $cond: [{ $ne: ['$replacedAt', null] }, new Date(Date.now() - 60_000), '$replacedAt'] } } }]);
    await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(401);
    // The legitimate newest token is now revoked too.
    await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
  });

  it('password reset revokes existing sessions', async () => {
    const u = await user(ctx);
    const email = (await u.get('/users/me')).body.email;
    await ctx.http().post('/api/v1/auth/forgot-password').send({ email }).expect(204);
    const token = /token=([\w-]+)/.exec(ctx.mailer.outbox.filter((m) => m.to === email).at(-1)!.text)![1];
    await ctx.http().post('/api/v1/auth/reset-password').send({ token, password: 'newpassword1' }).expect(204);
    await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(401);
    await ctx.http().post('/api/v1/auth/login').send({ email, password: 'newpassword1' }).expect(200);
  });

  it('suspended users lose access immediately', async () => {
    const admin = await user(ctx, { roles: ['customer', 'admin'] });
    const u = await user(ctx);
    await admin.post(`/admin/users/${u.id}/status`, { status: 'suspended', reason: 'test' }).expect(204);
    await u.get('/users/me').expect(401);
  });
});

describe('authorization', () => {
  it('enforces roles on admin, moderator and companion routes', async () => {
    const customer = await user(ctx);
    const mod = await user(ctx, { roles: ['customer', 'moderator'] });
    await customer.get('/admin/overview').expect(403);
    await customer.get('/admin/reports').expect(403);
    await customer.get('/companion/services').expect(403);
    await customer.get('/earnings').expect(403);
    await mod.get('/admin/reports').expect(200);
    // Moderators have no financial or catalog access.
    await mod.get('/admin/ledger').expect(403);
    await mod.get('/admin/payouts').expect(403);
    await mod.patch('/admin/settings', { commissionPercent: 0 }).expect(403);
    await ctx.http().get('/api/v1/users/me').expect(401);
  });

  it('moderators cannot suspend staff', async () => {
    const mod = await user(ctx, { roles: ['customer', 'moderator'] });
    const admin = await user(ctx, { roles: ['customer', 'admin'] });
    await mod.post(`/admin/users/${admin.id}/status`, { status: 'suspended', reason: 'x' }).expect(403);
  });
});
