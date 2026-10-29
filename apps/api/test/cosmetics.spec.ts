import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ctx, key, startApp, type TestUser, user } from './helpers.js';

let ctx: Ctx;
let admin: TestUser;
const item = async (u: TestUser, k: string) => ((await u.get('/cosmetics/me').expect(200)).body.items as any[]).find((c) => c.key === k);
const balance = async (u: TestUser) => (await u.get('/wallet').expect(200)).body.balance as number;

beforeAll(async () => {
  ctx = await startApp();
  admin = await user(ctx, { roles: ['customer', 'admin'] });
});
afterAll(() => ctx?.stop());

describe('cosmetics', () => {
  it('seeds the curated catalog and gives everyone the free items and the default background', async () => {
    const u = await user(ctx);
    const col = (await u.get('/cosmetics/me').expect(200)).body;
    expect(col.items.length).toBeGreaterThan(10);
    expect(col.owned).toEqual(expect.arrayContaining(['hearth', 'pilot-light', 'studio']));
    expect(col.owned).not.toContain('sovereign');
    expect(col.appearance).toMatchObject({ frame: null, background: 'hearth', followRoomTheme: true });
  });

  it('charges the catalog price once, records the ledger, and is idempotent', async () => {
    const u = await user(ctx, { coins: 1000 });
    const circuit = await item(u, 'circuit');
    const k = key();
    const r1 = (await u.post(`/cosmetics/${circuit.id}/purchase`, { idempotencyKey: k, priceCoins: 1 }).expect(200)).body;
    const r2 = (await u.post(`/cosmetics/${circuit.id}/purchase`, { idempotencyKey: key() }).expect(200)).body;
    expect(r1.balance).toBe(1000 - circuit.priceCoins);
    expect(r2.balance).toBe(r1.balance);
    expect((await u.get('/wallet/transactions')).body.items[0]).toMatchObject({ type: 'cosmetic_purchase', amount: -circuit.priceCoins });
    expect((await u.get('/cosmetics/me')).body.owned).toContain('circuit');
  });

  it('concurrent purchases of one item charge once', async () => {
    const u = await user(ctx, { coins: 5000 });
    const orbit = await item(u, 'pulse-orbit');
    const res = await Promise.all(Array.from({ length: 5 }, () => u.post(`/cosmetics/${orbit.id}/purchase`, { idempotencyKey: key() })));
    expect(res.every((r) => r.status === 200)).toBe(true);
    expect(await balance(u)).toBe(5000 - orbit.priceCoins);
    expect((await admin.get('/admin/reconcile')).body.mismatches).toEqual([]);
  });

  it('refuses unaffordable, event-only and unowned items', async () => {
    const u = await user(ctx, { coins: 10 });
    await u.post(`/cosmetics/${(await item(u, 'sovereign')).id}/purchase`, { idempotencyKey: key() }).expect(402);
    await u.post(`/cosmetics/${(await item(u, 'frostbite')).id}/purchase`, { idempotencyKey: key() }).expect(400);
    await u.patch('/cosmetics/me/appearance', { frame: 'sovereign' }).expect(403);
    await u.patch('/cosmetics/me/appearance', { background: 'arena' }).expect(403);
    const a = (await u.patch('/cosmetics/me/appearance', { frame: 'neon-hex', background: 'studio', intensity: 40 }).expect(200)).body;
    expect(a).toMatchObject({ frame: 'neon-hex', background: 'studio', intensity: 40 });
    expect((await u.patch('/cosmetics/me/appearance', { frame: null }).expect(200)).body.frame).toBeNull();
  });

  it('admin grants event items; the catalog is admin-managed', async () => {
    const u = await user(ctx);
    const frost = await item(u, 'frostbite');
    await u.post(`/admin/cosmetics/${frost.id}/grant`, { userId: u.id }).expect(403);
    await admin.post(`/admin/cosmetics/${frost.id}/grant`, { userId: u.id }).expect(204);
    await u.patch('/cosmetics/me/appearance', { frame: 'frostbite' }).expect(200);
    await admin.post('/admin/cosmetics', { key: 'free-thing', kind: 'frame', name: 'X', unlock: 'purchase', priceCoins: 0 }).expect(400);
    const made = (await admin.post('/admin/cosmetics', { key: 'test-frame', kind: 'frame', name: 'Test', unlock: 'purchase', priceCoins: 50 }).expect(201)).body;
    await admin.patch(`/admin/cosmetics/${made.id}`, { priceCoins: 0 }).expect(400);
    expect((await admin.patch(`/admin/cosmetics/${made.id}`, { available: false }).expect(200)).body).toMatchObject({ available: false, priceCoins: 50 });
  });

  it('room theme: host only, must own the background; frames show on members', async () => {
    const host = await user(ctx, { coins: 2000 });
    const guest = await user(ctx);
    await host.patch('/cosmetics/me/appearance', { frame: 'pilot-light' }).expect(200);
    const room = (await host.post('/voice-rooms', { title: 'Theme test', category: 'hangout', privacy: 'public' }).expect(201)).body;
    await guest.post(`/voice-rooms/${room.id}/join`).expect(200);
    await guest.post(`/voice-rooms/${room.id}/theme`, { background: 'studio', allowPersonal: true }).expect(403);
    await host.post(`/voice-rooms/${room.id}/theme`, { background: 'nebula', allowPersonal: true }).expect(403);
    await host.post(`/cosmetics/${(await item(host, 'nebula')).id}/purchase`, { idempotencyKey: key() }).expect(200);
    await host.post(`/voice-rooms/${room.id}/theme`, { background: 'nebula', allowPersonal: false }).expect(204);
    const d = (await guest.get(`/voice-rooms/${room.id}`).expect(200)).body;
    expect(d.theme).toEqual({ background: 'nebula', allowPersonal: false });
    expect(d.members.find((m: any) => m.user.id === host.id).frame).toBe('pilot-light');
    await host.post(`/voice-rooms/${room.id}/theme`, { background: null, allowPersonal: true }).expect(204);
  });
});
