import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ctx, key, startApp, user } from './helpers.js';

describe('voice rooms without LiveKit configured', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await startApp();
  });
  afterAll(() => ctx?.stop());

  it('reports voice as unavailable instead of faking a token', async () => {
    const host = await user(ctx);
    const room = (await host.post('/voice-rooms', { title: 'Chill', category: 'hangout', privacy: 'public' }).expect(201)).body;
    const r = await host.post(`/voice-rooms/${room.id}/token`).expect(503);
    expect(r.body.code).toBe('VOICE_UNAVAILABLE');
  });

  it('messaging: membership, idempotent sends, blocks', async () => {
    const a = await user(ctx);
    const b = await user(ctx);
    const c = await user(ctx);
    const conv = (await a.post('/conversations', { userId: b.id }).expect(201)).body;
    const again = (await b.post('/conversations', { userId: a.id }).expect(201)).body;
    expect(again.id).toBe(conv.id);
    const clientId = key();
    const m1 = (await a.post(`/conversations/${conv.id}/messages`, { body: 'hi', clientId }).expect(201)).body;
    const m2 = (await a.post(`/conversations/${conv.id}/messages`, { body: 'hi', clientId }).expect(201)).body;
    expect(m2.id).toBe(m1.id);
    expect((await b.get('/conversations')).body[0].unread).toBe(1);
    await b.post(`/conversations/${conv.id}/read`).expect(204);
    expect((await b.get('/conversations')).body[0].unread).toBe(0);
    await c.get(`/conversations/${conv.id}/messages`).expect(404);
    await c.post(`/conversations/${conv.id}/messages`, { body: 'x', clientId: key() }).expect(404);
    await b.post(`/users/${a.id}/block`).expect(204);
    await a.post(`/conversations/${conv.id}/messages`, { body: 'hello?', clientId: key() }).expect(403);
  });

  it('notifications are persisted and can be marked read', async () => {
    const a = await user(ctx);
    const b = await user(ctx);
    const conv = (await a.post('/conversations', { userId: b.id })).body;
    await a.post(`/conversations/${conv.id}/messages`, { body: 'ping', clientId: key() }).expect(201);
    const n = (await b.get('/notifications').expect(200)).body;
    expect(n.unread).toBe(1);
    expect(n.items[0].type).toBe('message');
    await b.post('/notifications/read', {}).expect(204);
    expect((await b.get('/notifications')).body.unread).toBe(0);
  });

  it('reports go to the moderation queue', async () => {
    const a = await user(ctx);
    const b = await user(ctx);
    const mod = await user(ctx, { roles: ['customer', 'moderator'] });
    await a.post('/reports', { targetType: 'user', targetId: b.id, reason: 'spam' }).expect(204);
    const list = (await mod.get('/admin/reports').expect(200)).body;
    const r = list.items.find((x: any) => String(x.targetId) === b.id);
    await mod.post(`/admin/reports/${r.id}/resolve`, { action: 'suspend_user', note: 'Spam links' }).expect(204);
    await b.get('/users/me').expect(401);
  });
});

describe('voice rooms with LiveKit configured', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await startApp({ LIVEKIT_URL: 'ws://127.0.0.1:1', LIVEKIT_API_KEY: 'devkey', LIVEKIT_API_SECRET: 'devsecret-devsecret-devsecret-123' });
  });
  afterAll(() => ctx?.stop());

  const claims = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString());

  it('issues short-lived tokens only to members, with publish rights by role', async () => {
    const host = await user(ctx);
    const listener = await user(ctx);
    const outsider = await user(ctx);
    const room = (await host.post('/voice-rooms', { title: 'Ranked grind', category: 'ranked', privacy: 'public', capacity: 2 }).expect(201)).body;

    const ht = (await host.post(`/voice-rooms/${room.id}/token`).expect(200)).body;
    expect(ht.canPublish).toBe(true);
    const hc = claims(ht.token);
    expect(hc.video.room).toBe(`room_${room.id}`);
    expect(hc.exp - hc.nbf).toBeLessThanOrEqual(600);

    await outsider.post(`/voice-rooms/${room.id}/token`).expect(403);
    await listener.post(`/voice-rooms/${room.id}/join`).expect(200);
    const lt = (await listener.post(`/voice-rooms/${room.id}/token`).expect(200)).body;
    expect(lt.canPublish).toBe(false);
    expect(claims(lt.token).video.canPublish).toBe(false);

    // Capacity 2 is now full.
    expect((await outsider.post(`/voice-rooms/${room.id}/join`).expect(409)).body.code).toBe('ROOM_FULL');

    // Listeners can't promote themselves; host can.
    await listener.post(`/voice-rooms/${room.id}/members/${listener.id}/role`, { role: 'speaker' }).expect(403);
    await listener.post(`/voice-rooms/${room.id}/hand`, { raised: true }).expect(204);
    await host.post(`/voice-rooms/${room.id}/members/${listener.id}/role`, { role: 'speaker' }).expect(204);
    expect((await listener.post(`/voice-rooms/${room.id}/token`)).body.canPublish).toBe(true);

    // Removal bans rejoin.
    await host.post(`/voice-rooms/${room.id}/members/${listener.id}/remove`).expect(204);
    await listener.post(`/voice-rooms/${room.id}/join`).expect(403);
    await listener.post(`/voice-rooms/${room.id}/token`).expect(403);
  });

  it('invite-only rooms are hidden from non-invitees', async () => {
    const host = await user(ctx);
    const guest = await user(ctx);
    const room = (await host.post('/voice-rooms', { title: 'Squad only', category: 'gaming', privacy: 'invite' }).expect(201)).body;
    await guest.get(`/voice-rooms/${room.id}`).expect(404);
    await guest.post(`/voice-rooms/${room.id}/join`).expect(403);
    expect((await guest.get('/voice-rooms')).body.find((r: any) => r.id === room.id)).toBeUndefined();
    await host.post(`/voice-rooms/${room.id}/invite`, { userId: guest.id }).expect(204);
    await guest.post(`/voice-rooms/${room.id}/join`).expect(200);
  });
});
