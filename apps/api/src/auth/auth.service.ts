import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Types } from 'mongoose';
import type { Me } from '@tavern/shared';
import { ENV, type Env } from '../config.js';
import { AppError, badRequest, conflict } from '../common/http.js';
import { Db, InjectM, type M } from '../db/database.module.js';
import type { UserDoc } from '../db/schemas.js';
import { hashPassword, randomToken, sha256, verifyPassword } from './crypto.js';
import { Mailer } from './mailer.js';

export type Client = 'web' | 'mobile';
export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  user: Me;
}

export function toMe(u: UserDoc): Me {
  return {
    id: String(u._id),
    email: u.email,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl ?? undefined,
    bio: u.bio ?? undefined,
    roles: u.roles as Me['roles'],
    emailVerified: !!u.emailVerifiedAt,
    settings: {
      timezone: u.settings?.timezone ?? 'Asia/Manila',
      language: u.settings?.language ?? 'en',
      currency: u.settings?.currency ?? 'PHP',
    },
    // Hydrated docs give a Map, lean() gives a plain object.
    notificationPrefs: u.notificationPrefs instanceof Map ? Object.fromEntries(u.notificationPrefs) : ((u.notificationPrefs as Record<string, boolean>) ?? {}),
  };
}

const ageOn = (birth: Date, now = new Date()) => {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(ENV) private env: Env,
    private jwt: JwtService,
    private db: Db,
    private mailer: Mailer,
    @InjectM('User') private users: M<'User'>,
    @InjectM('Session') private sessions: M<'Session'>,
    @InjectM('EmailToken') private emailTokens: M<'EmailToken'>,
    @InjectM('Wallet') private wallets: M<'Wallet'>,
  ) {}

  async register(
    input: { email: string; username: string; displayName: string; password: string; birthDate: string },
    client: Client,
    ua?: string,
  ) {
    const birth = new Date(input.birthDate + 'T00:00:00Z');
    const { minimumAge } = await this.db.settings();
    if (ageOn(birth) < minimumAge)
      throw badRequest('AGE_REQUIREMENT', `You must be at least ${minimumAge} years old to use Tavern.`);
    if (await this.users.exists({ email: input.email })) throw conflict('EMAIL_TAKEN', 'That email is already registered');
    if (await this.users.exists({ usernameLower: input.username.toLowerCase() }))
      throw conflict('USERNAME_TAKEN', 'That username is taken');
    const user = await this.users.create({
      email: input.email,
      username: input.username,
      usernameLower: input.username.toLowerCase(),
      displayName: input.displayName,
      passwordHash: await hashPassword(input.password),
      birthDate: birth,
    });
    await this.wallets.create({ userId: user._id });
    await this.sendVerification(user as unknown as UserDoc);
    return this.issue(user as unknown as UserDoc, client, ua);
  }

  async login(email: string, password: string, client: Client, ua?: string) {
    const user = await this.users.findOne({ email }).select('+passwordHash');
    // Same error for unknown email and wrong password to avoid account enumeration.
    if (!user || !(await verifyPassword(password, user.passwordHash)))
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
    if (user.status !== 'active')
      throw new AppError(403, 'ACCOUNT_' + user.status.toUpperCase(), `This account is ${user.status}. Contact support to appeal.`);
    return this.issue(user as unknown as UserDoc, client, ua);
  }

  private async issue(user: UserDoc, client: Client, ua?: string, familyId: string = randomUUID()): Promise<IssuedTokens> {
    const refreshToken = randomToken();
    await this.sessions.create({
      userId: user._id,
      familyId,
      tokenHash: sha256(refreshToken),
      client,
      userAgent: ua?.slice(0, 200),
      expiresAt: new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86400_000),
    });
    const accessToken = await this.jwt.signAsync({ sub: String(user._id) }, { expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS });
    return { accessToken, refreshToken, user: toMe(user) };
  }

  /** Rotates the refresh token. Reuse of a rotated token revokes the whole session family. */
  async refresh(token: string, ua?: string): Promise<IssuedTokens> {
    const now = new Date();
    const hash = sha256(token);
    const session = await this.sessions.findOneAndUpdate(
      { tokenHash: hash, replacedAt: null, revokedAt: null, expiresAt: { $gt: now } },
      { replacedAt: now },
    );
    if (!session) {
      const old = await this.sessions.findOne({ tokenHash: hash });
      // Tolerate a parallel refresh race (e.g. two tabs) within 10s; anything else is token reuse.
      if (old?.replacedAt && !old.revokedAt && now.getTime() - old.replacedAt.getTime() > 10_000)
        await this.sessions.updateMany({ familyId: old.familyId }, { revokedAt: now });
      throw new AppError(401, 'SESSION_EXPIRED', 'Please sign in again');
    }
    const user = await this.users.findById(session.userId);
    if (!user || user.status !== 'active') throw new AppError(401, 'SESSION_EXPIRED', 'Please sign in again');
    return this.issue(user as unknown as UserDoc, session.client as Client, ua, session.familyId);
  }

  async logout(token?: string) {
    if (!token) return;
    const s = await this.sessions.findOne({ tokenHash: sha256(token) });
    if (s) await this.sessions.updateMany({ familyId: s.familyId }, { revokedAt: new Date() });
  }

  revokeAll(userId: string) {
    return this.sessions.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
  }

  private async createEmailToken(userId: Types.ObjectId | string, purpose: 'verify' | 'reset', ttlMs: number) {
    const token = randomToken();
    await this.emailTokens.create({ userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) });
    return token;
  }

  async sendVerification(user: UserDoc) {
    if (user.emailVerifiedAt) return;
    const token = await this.createEmailToken(user._id, 'verify', 48 * 3600_000);
    await this.mailer.send(
      user.email,
      'Verify your Tavern email',
      `Welcome to Tavern, ${user.displayName}!\n\nVerify your email: ${this.env.WEB_URL}/verify-email?token=${token}\n\nThis link expires in 48 hours.`,
    );
  }

  async resendVerification(userId: string) {
    const user = await this.users.findById(userId);
    if (user) await this.sendVerification(user as unknown as UserDoc);
  }

  private async consume(token: string, purpose: 'verify' | 'reset') {
    const t = await this.emailTokens.findOneAndUpdate(
      { tokenHash: sha256(token), purpose, usedAt: null, expiresAt: { $gt: new Date() } },
      { usedAt: new Date() },
    );
    if (!t) throw badRequest('TOKEN_INVALID', 'This link is invalid or has expired');
    return t.userId;
  }

  async verifyEmail(token: string) {
    const userId = await this.consume(token, 'verify');
    await this.users.updateOne({ _id: userId }, { emailVerifiedAt: new Date() });
  }

  async forgotPassword(email: string) {
    const user = await this.users.findOne({ email: email.toLowerCase(), status: 'active' });
    if (!user) return; // no enumeration
    const token = await this.createEmailToken(user._id, 'reset', 3600_000);
    await this.mailer.send(
      user.email,
      'Reset your Tavern password',
      `Reset your password: ${this.env.WEB_URL}/reset-password?token=${token}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
    );
  }

  async resetPassword(token: string, password: string) {
    const userId = await this.consume(token, 'reset');
    await this.users.updateOne({ _id: userId }, { passwordHash: await hashPassword(password) });
    await this.revokeAll(String(userId));
  }

  verifyAccess(token: string) {
    return this.jwt.verifyAsync<{ sub: string }>(token);
  }
}
