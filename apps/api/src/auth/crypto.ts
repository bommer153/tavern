import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 2 ** 15;
const derive = (password: string, salt: Buffer, n: number) =>
  new Promise<Buffer>((res, rej) =>
    scrypt(password, salt, 64, { N: n, r: 8, p: 1, maxmem: 128 * n * 8 * 2 }, (e, k) => (e ? rej(e) : res(k))),
  );

/** Format: scrypt$N$salt$hash (base64url). */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N);
  return `scrypt$${N}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, n, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !n || !salt || !hash) return false;
  const key = await derive(password, Buffer.from(salt, 'base64url'), Number(n));
  const expected = Buffer.from(hash, 'base64url');
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const randomToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
