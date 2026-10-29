import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '@tavern/shared';
import { ENV, type Env } from '../config.js';
import { AppError, type AuthUser, forbidden, IS_OPTIONAL_AUTH, IS_PUBLIC, ROLES_KEY } from '../common/http.js';
import { InjectM, type M } from '../db/database.module.js';
import { AuthService } from './auth.service.js';

export const ACCESS_COOKIE = 'tv_at';
export const REFRESH_COOKIE = 'tv_rt';
export const SESSION_HINT_COOKIE = 'tv_session';

export function bearerOrCookie(req: { headers: Record<string, unknown>; cookies?: Record<string, string> }) {
  const h = req.headers.authorization;
  if (typeof h === 'string' && h.startsWith('Bearer ')) return { token: h.slice(7), viaCookie: false };
  const c = req.cookies?.[ACCESS_COOKIE];
  return c ? { token: c, viaCookie: true } : null;
}

/** Global guard: authenticates every route unless @Public, then enforces @Roles. Roles/status are read from DB, never trusted from the token. */
@Injectable()
export class AuthGuard implements CanActivate {
  private origins: Set<string>;
  constructor(
    private reflector: Reflector,
    private auth: AuthService,
    @Inject(ENV) env: Env,
    @InjectM('User') private users: M<'User'>,
  ) {
    this.origins = new Set(env.CORS_ORIGINS.split(',').map((s) => s.trim()));
  }

  async canActivate(ctx: ExecutionContext) {
    if (ctx.getType() !== 'http') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const optional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH, targets);
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();

    const found = bearerOrCookie(req);
    if (!found) {
      if (optional) return true;
      throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in');
    }
    // CSRF: cookie-authenticated writes must come from an allowed origin.
    if (found.viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (!origin || !this.origins.has(origin)) throw forbidden('Cross-site request blocked');
    }
    let sub: string;
    try {
      sub = (await this.auth.verifyAccess(found.token)).sub;
    } catch {
      if (optional) return true;
      throw new AppError(401, 'TOKEN_EXPIRED', 'Session expired');
    }
    const user = await this.users.findById(sub, { roles: 1, status: 1 }).lean();
    if (!user || user.status !== 'active') throw new AppError(401, 'UNAUTHENTICATED', 'Account unavailable');
    req.user = { id: sub, roles: user.roles as Role[] };

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (required?.length && !req.user.roles.includes('admin') && !required.some((r) => req.user!.roles.includes(r)))
      throw forbidden();
    return true;
  }
}
