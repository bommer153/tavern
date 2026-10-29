import { Body, Controller, Get, Headers, HttpCode, Inject, Injectable, Logger, Module, Param, Post, Req } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { checkoutSchema } from '@tavern/shared';
import { ENV, type Env } from '../config.js';
import { AppError, type AuthUser, badRequest, CurrentUser, forbidden, notFound, ObjectIdPipe, Public, ZodPipe } from '../common/http.js';
import { Db, InjectM, type M } from '../db/database.module.js';
import { NotificationsService } from '../notifications/notifications.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { WalletService } from '../wallet/wallet.service.js';

export interface VerifiedEvent {
  eventId: string;
  type: string;
  providerRef: string;
}
export interface PaymentProvider {
  name: 'paymongo' | 'dev';
  createCheckout(p: { id: string; amountCentavos: number; description: string }): Promise<{ providerRef: string; checkoutUrl: string }>;
  /** Throws if the signature is invalid. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): VerifiedEvent;
  /** Trusted server-to-server confirmation; never rely on the webhook body alone. */
  confirmPaid(providerRef: string, expectedCentavos: number): Promise<{ paid: boolean; providerPaymentId?: string }>;
}

class PayMongoProvider implements PaymentProvider {
  name = 'paymongo' as const;
  private base = 'https://api.paymongo.com/v1';
  constructor(private env: Env) {}

  private async call(path: string, init?: RequestInit) {
    const res = await fetch(this.base + path, {
      ...init,
      headers: {
        Authorization: 'Basic ' + Buffer.from(this.env.PAYMONGO_SECRET_KEY + ':').toString('base64'),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    const json = (await res.json()) as any;
    if (!res.ok) throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', json?.errors?.[0]?.detail ?? 'Payment provider error');
    return json;
  }

  async createCheckout(p: { id: string; amountCentavos: number; description: string }) {
    const json = await this.call('/checkout_sessions', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [{ amount: p.amountCentavos, currency: 'PHP', name: p.description, quantity: 1 }],
            payment_method_types: ['gcash', 'paymaya', 'card', 'grab_pay'],
            description: p.description,
            reference_number: p.id,
            success_url: `${this.env.WEB_URL}/wallet?payment=${p.id}`,
            cancel_url: `${this.env.WEB_URL}/wallet?payment=${p.id}&cancelled=1`,
          },
        },
      }),
    });
    return { providerRef: json.data.id as string, checkoutUrl: json.data.attributes.checkout_url as string };
  }

  verifyWebhook(raw: Buffer, headers: Record<string, string | undefined>): VerifiedEvent {
    const header = headers['paymongo-signature'] ?? '';
    const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
    const t = parts.t;
    if (!t || Math.abs(Date.now() / 1000 - Number(t)) > 300) throw forbidden('Stale or missing webhook signature');
    const expected = createHmac('sha256', this.env.PAYMONGO_WEBHOOK_SECRET!).update(`${t}.${raw.toString('utf8')}`).digest('hex');
    const given = parts.li || parts.te || '';
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) throw forbidden('Invalid webhook signature');
    const body = JSON.parse(raw.toString('utf8'));
    return { eventId: body.data.id, type: body.data.attributes.type, providerRef: body.data.attributes.data?.id };
  }

  async confirmPaid(providerRef: string, expectedCentavos: number) {
    const json = await this.call(`/checkout_sessions/${providerRef}`);
    const payment = (json.data.attributes.payments ?? []).find((p: any) => p.attributes.status === 'paid');
    return { paid: !!payment && payment.attributes.amount === expectedCentavos, providerPaymentId: payment?.id };
  }
}

/** Development sandbox only (refused in production by env validation). Completes via an explicit button in the web app. */
class DevProvider implements PaymentProvider {
  name = 'dev' as const;
  constructor(private env: Env) {}
  async createCheckout(p: { id: string }) {
    return { providerRef: `dev_${p.id}`, checkoutUrl: `${this.env.WEB_URL}/wallet/dev-checkout/${p.id}` };
  }
  verifyWebhook(): VerifiedEvent {
    throw forbidden('Dev provider has no webhooks');
  }
  async confirmPaid() {
    return { paid: true, providerPaymentId: `dev_pay_${Date.now()}` };
  }
}

@Injectable()
export class PaymentsService {
  private log = new Logger('Payments');
  readonly provider: PaymentProvider | null;
  constructor(
    @Inject(ENV) private env: Env,
    private db: Db,
    private wallet: WalletService,
    private notifications: NotificationsService,
    @InjectM('PaymentTransaction') private payments: M<'PaymentTransaction'>,
    @InjectM('CoinPackage') private packages: M<'CoinPackage'>,
    @InjectM('WebhookEvent') private webhookEvents: M<'WebhookEvent'>,
  ) {
    this.provider = env.PAYMENT_PROVIDER === 'paymongo' ? new PayMongoProvider(env) : env.PAYMENT_PROVIDER === 'dev' ? new DevProvider(env) : null;
  }

  async checkout(userId: string, packageId: string, idempotencyKey: string) {
    if (!this.provider) throw new AppError(503, 'PAYMENTS_UNAVAILABLE', 'Top-ups are not available right now');
    const existing = await this.payments.findOne({ userId, idempotencyKey }).lean();
    if (existing?.checkoutUrl) return { paymentId: String(existing._id), checkoutUrl: existing.checkoutUrl };
    const pkg = await this.packages.findOne({ _id: packageId, active: true }).lean();
    if (!pkg) throw notFound('Coin package');
    const payment = await this.payments.create({
      userId,
      purpose: 'coin_topup',
      packageId: pkg._id,
      coins: pkg.coins + pkg.bonusCoins,
      amountCentavos: pkg.priceCentavos,
      provider: this.provider.name,
      idempotencyKey,
    });
    const { providerRef, checkoutUrl } = await this.provider.createCheckout({
      id: String(payment._id),
      amountCentavos: pkg.priceCentavos,
      description: `Tavern ${pkg.coins + pkg.bonusCoins} coins`,
    });
    await this.payments.updateOne({ _id: payment._id }, { providerRef, checkoutUrl });
    return { paymentId: String(payment._id), checkoutUrl };
  }

  /** Idempotent: only the first call for a pending payment credits coins. */
  async fulfill(paymentId: Types.ObjectId, providerPaymentId?: string, webhookEvent?: VerifiedEvent) {
    const credited = await this.db.tx(async (session) => {
      if (webhookEvent) await this.webhookEvents.create([{ provider: this.provider!.name, eventId: webhookEvent.eventId, type: webhookEvent.type }], { session });
      const p = await this.payments.findOneAndUpdate({ _id: paymentId, status: 'pending' }, { status: 'paid', paidAt: new Date(), providerPaymentId }, { session, returnDocument: 'after' });
      if (!p) return null;
      await this.wallet.credit(
        { userId: p.userId, coins: p.coins, type: 'topup', description: `Top-up ${p.coins} coins`, refType: 'payment', refId: p._id, idempotencyKey: `topup:${p._id}` },
        session,
      );
      return p;
    });
    if (credited) await this.notifications.notify(credited.userId, 'payment', 'Top-up successful', `${credited.coins} coins were added to your wallet.`, '/wallet');
    return !!credited;
  }

  async handleWebhook(raw: Buffer | undefined, headers: Record<string, string | undefined>) {
    if (!this.provider || !raw) throw badRequest('NO_PROVIDER', 'Webhook not configured');
    const event = this.provider.verifyWebhook(raw, headers);
    if (event.type !== 'checkout_session.payment.paid') return { received: true };
    if (await this.webhookEvents.exists({ provider: this.provider.name, eventId: event.eventId })) return { received: true, duplicate: true };
    const payment = await this.payments.findOne({ provider: this.provider.name, providerRef: event.providerRef }).lean();
    if (!payment) return { received: true, unknown: true };
    const { paid, providerPaymentId } = await this.provider.confirmPaid(event.providerRef, payment.amountCentavos);
    if (!paid) {
      this.log.warn(`Webhook for ${payment._id} not confirmed by provider`);
      return { received: true, unconfirmed: true };
    }
    try {
      await this.fulfill(payment._id, providerPaymentId, event);
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e; // duplicate delivery raced us
    }
    return { received: true };
  }

  async devComplete(userId: string, paymentId: string) {
    if (this.provider?.name !== 'dev' || this.env.NODE_ENV === 'production') throw forbidden('Sandbox completion is disabled');
    const p = await this.payments.findOne({ _id: paymentId, userId, provider: 'dev' }).lean();
    if (!p) throw notFound('Payment');
    const { providerPaymentId } = await this.provider.confirmPaid(p.providerRef!, p.amountCentavos);
    await this.fulfill(p._id, providerPaymentId);
  }

  async get(userId: string, id: string) {
    const p = await this.payments.findOne({ _id: id, userId }).lean();
    if (!p) throw notFound('Payment');
    return { id: String(p._id), status: p.status, coins: p.coins, amountCentavos: p.amountCentavos, provider: p.provider };
  }
}

@ApiTags('payments')
@Controller('payments')
class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Post('checkout')
  checkout(@CurrentUser() u: AuthUser, @Body(new ZodPipe(checkoutSchema)) b: any) {
    return this.payments.checkout(u.id, b.packageId, b.idempotencyKey);
  }

  @Public()
  @SkipThrottle()
  @ApiExcludeEndpoint()
  @Post('webhook')
  @HttpCode(200)
  webhook(@Req() req: { rawBody?: Buffer }, @Headers() headers: Record<string, string>) {
    return this.payments.handleWebhook(req.rawBody, headers);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string) {
    return this.payments.get(u.id, id);
  }

  @Post('dev/:id/complete')
  @HttpCode(204)
  devComplete(@CurrentUser() u: AuthUser, @Param('id', ObjectIdPipe) id: string) {
    return this.payments.devComplete(u.id, id);
  }
}

@Module({ imports: [WalletModule], controllers: [PaymentsController], providers: [PaymentsService], exports: [PaymentsService] })
export class PaymentsModule {}
