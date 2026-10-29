import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.controller.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AllExceptionsFilter } from './common/http.js';
import { CompanionsModule } from './companions/companions.module.js';
import { CosmeticsModule } from './cosmetics/cosmetics.module.js';
import { ENV, type Env } from './config.js';
import { DatabaseModule } from './db/database.module.js';
import { EarningsModule } from './earnings/earnings.module.js';
import { MessagingModule } from './messaging/messaging.module.js';
import { NotificationsModule } from './notifications/notifications.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { RealtimeModule } from './realtime/realtime.gateway.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { UsersModule } from './users/users.js';
import { VoiceModule } from './voice/voice.module.js';
import { WalletModule } from './wallet/wallet.module.js';

@Global()
@Module({})
class EnvModule {
  static with(env: Env): DynamicModule {
    return { module: EnvModule, providers: [{ provide: ENV, useValue: env }], exports: [ENV] };
  }
}

@Module({})
export class AppModule {
  static with(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        EnvModule.with(env),
        ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }], skipIf: () => env.NODE_ENV === 'test' }),
        DatabaseModule,
        AuthModule,
        RealtimeModule,
        NotificationsModule,
        UsersModule,
        CompanionsModule,
        OrdersModule,
        WalletModule,
        CosmeticsModule,
        EarningsModule,
        PaymentsModule,
        MessagingModule,
        VoiceModule,
        UploadsModule,
        AdminModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    };
  }
}
