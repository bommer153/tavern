import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().default(4000),
    MONGODB_URI: z.string().startsWith('mongodb'),
    JWT_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    WEB_URL: z.string().default('http://localhost:3000'),
    API_PUBLIC_URL: z.string().default('http://localhost:4000'),
    COOKIE_SECURE: bool.default(false),
    COOKIE_DOMAIN: z.string().optional(),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('Tavern <no-reply@tavern.local>'),
    LIVEKIT_URL: z.string().optional(),
    LIVEKIT_API_KEY: z.string().optional(),
    LIVEKIT_API_SECRET: z.string().optional(),
    PAYMENT_PROVIDER: z.enum(['paymongo', 'dev', 'none']).default('none'),
    PAYMONGO_SECRET_KEY: z.string().optional(),
    PAYMONGO_WEBHOOK_SECRET: z.string().optional(),
    STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
    SUPABASE_URL: z.string().optional(),
    SUPABASE_SERVICE_KEY: z.string().optional(),
    SUPABASE_BUCKET: z.string().default('media'),
    EXPO_ACCESS_TOKEN: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV === 'production' && e.PAYMENT_PROVIDER === 'dev')
      ctx.addIssue({ code: 'custom', path: ['PAYMENT_PROVIDER'], message: 'dev payment provider is not allowed in production' });
    if (e.PAYMENT_PROVIDER === 'paymongo' && (!e.PAYMONGO_SECRET_KEY || !e.PAYMONGO_WEBHOOK_SECRET))
      ctx.addIssue({ code: 'custom', path: ['PAYMONGO_SECRET_KEY'], message: 'PayMongo keys required' });
    if (e.STORAGE_DRIVER === 'supabase' && (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_KEY))
      ctx.addIssue({ code: 'custom', path: ['SUPABASE_URL'], message: 'Supabase storage settings required' });
  });

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const r = schema.safeParse(source);
  if (!r.success) {
    console.error('Invalid environment:\n' + r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'));
    throw new Error('Invalid environment configuration');
  }
  return r.data;
}

export const ENV = Symbol('ENV');
