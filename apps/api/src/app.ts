import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import type { Env } from './config.js';
import { UPLOAD_DIR } from './uploads/uploads.module.js';

export async function createApp(env: Env): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.with(env), {
    rawBody: true, // webhook signatures are computed over the raw body
    logger: env.NODE_ENV === 'test' ? ['error'] : ['log', 'warn', 'error'],
  });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({ origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: true });
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  if (env.STORAGE_DRIVER === 'local') app.useStaticAssets(UPLOAD_DIR, { prefix: '/uploads/', dotfiles: 'deny' });
  app.enableShutdownHooks();

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Tavern API')
      .setDescription('Gaming companion marketplace. Web uses HTTP-only cookies; mobile sends `x-tavern-client: mobile` and Bearer tokens.')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('tv_at')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, doc, { jsonDocumentUrl: 'api/docs/openapi.json' });
  return app;
}

export const logStartup = (env: Env) =>
  new Logger('Tavern').log(`API on ${env.API_PUBLIC_URL}/api/v1 · docs ${env.API_PUBLIC_URL}/api/docs · payments=${env.PAYMENT_PROVIDER} · voice=${env.LIVEKIT_URL ? 'livekit' : 'disabled'}`);
