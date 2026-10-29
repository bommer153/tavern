import { Body, Controller, Global, HttpCode, Inject, Module, Post, Req, Res } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@tavern/shared';
import { ENV, type Env } from '../config.js';
import { AppError, type AuthUser, CurrentUser, Public, ZodPipe } from '../common/http.js';
import { ACCESS_COOKIE, REFRESH_COOKIE, SESSION_HINT_COOKIE } from './auth.guard.js';
import { AuthService, type Client, type IssuedTokens } from './auth.service.js';
import { Mailer } from './mailer.js';

const clientOf = (req: Request): Client => (req.headers['x-tavern-client'] === 'mobile' ? 'mobile' : 'web');

@ApiTags('auth')
@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(
    private auth: AuthService,
    @Inject(ENV) private env: Env,
  ) {}

  private cookie(maxAgeMs: number, path = '/'): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      domain: this.env.COOKIE_DOMAIN,
      path,
      maxAge: maxAgeMs,
    };
  }

  /** Web gets HTTP-only cookies only; mobile gets tokens in the body for SecureStore. */
  private respond(req: Request, res: Response, t: IssuedTokens) {
    if (clientOf(req) === 'mobile') return t;
    res.cookie(ACCESS_COOKIE, t.accessToken, this.cookie(this.env.ACCESS_TOKEN_TTL_SECONDS * 1000));
    res.cookie(REFRESH_COOKIE, t.refreshToken, this.cookie(this.env.REFRESH_TOKEN_TTL_DAYS * 86400_000, '/api/v1/auth'));
    // Non-secret hint so the web proxy can redirect signed-out visitors; never used for authorization.
    res.cookie(SESSION_HINT_COOKIE, '1', { ...this.cookie(this.env.REFRESH_TOKEN_TTL_DAYS * 86400_000), httpOnly: false });
    return { user: t.user };
  }

  @Public()
  @Post('register')
  async register(@Body(new ZodPipe(registerSchema)) b: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(req, res, await this.auth.register(b, clientOf(req), req.headers['user-agent']));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(loginSchema)) b: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(req, res, await this.auth.login(b.email, b.password, clientOf(req), req.headers['user-agent']));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(@Body(new ZodPipe(refreshSchema)) b: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = b.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new AppError(401, 'SESSION_EXPIRED', 'Please sign in again');
    return this.respond(req, res, await this.auth.refresh(token, req.headers['user-agent']));
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodPipe(refreshSchema)) b: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(b.refreshToken ?? req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(ACCESS_COOKIE, this.cookie(0));
    res.clearCookie(REFRESH_COOKIE, this.cookie(0, '/api/v1/auth'));
    res.clearCookie(SESSION_HINT_COOKIE, { ...this.cookie(0), httpOnly: false });
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@CurrentUser() u: AuthUser) {
    await this.auth.revokeAll(u.id);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(204)
  verify(@Body(new ZodPipe(verifyEmailSchema)) b: { token: string }) {
    return this.auth.verifyEmail(b.token);
  }

  @Post('resend-verification')
  @HttpCode(204)
  resend(@CurrentUser() u: AuthUser) {
    return this.auth.resendVerification(u.id);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(204)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  forgot(@Body(new ZodPipe(forgotPasswordSchema)) b: { email: string }) {
    return this.auth.forgotPassword(b.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  reset(@Body(new ZodPipe(resetPasswordSchema)) b: { token: string; password: string }) {
    return this.auth.resetPassword(b.token, b.password);
  }
}

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ENV],
      useFactory: (env: Env) => ({ secret: env.JWT_SECRET }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, Mailer],
  exports: [AuthService, Mailer],
})
export class AuthModule {}
