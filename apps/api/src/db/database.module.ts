import { Global, Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection, InjectModel, MongooseModule } from '@nestjs/mongoose';
import type { ClientSession, Connection, InferSchemaType, Model } from 'mongoose';
import { ENV, type Env } from '../config.js';
import { collectionName, MODELS } from './schemas.js';

export type M<K extends keyof typeof MODELS> = Model<InferSchemaType<(typeof MODELS)[K]>>;
export const InjectM = (name: keyof typeof MODELS) => InjectModel(name);

/** Central, admin-editable settings with safe defaults. */
export const SETTING_DEFAULTS = {
  commissionPercent: 20, // platform share of service price
  serviceFeePercent: 0, // charged to customer on top
  coinValueCentavos: 100, // 1 coin = ₱1.00 when spending on services
  giftSharePercent: 50, // share of gift coin value credited to companion earnings
  settlementHoldHours: 72, // dispute window before earnings become available
  disputeWindowHours: 48,
  autoCompleteGraceMinutes: 15,
  minPayoutCentavos: 100_00,
  minimumAge: 18,
} as const;
export type Settings = { -readonly [K in keyof typeof SETTING_DEFAULTS]: number };

@Injectable()
export class Db implements OnApplicationBootstrap {
  private log = new Logger('Db');
  constructor(
    @InjectConnection() public conn: Connection,
    @InjectM('PlatformSetting') private settingsModel: M<'PlatformSetting'>,
    @InjectM('AuditLog') private audits: M<'AuditLog'>,
  ) {}

  /** Refuse to run without transaction support; never fall back to unsafe balance updates. */
  async onApplicationBootstrap() {
    const hello = await this.conn.db!.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid')
      throw new Error(
        'MongoDB must be a replica set (transactions are required). Run `pnpm db:start` or use MongoDB Atlas.',
      );
    await this.conn.syncIndexes();
    this.log.log(`Connected to replica set "${hello.setName ?? 'mongos'}", indexes synced`);
  }

  /** Runs fn in a transaction, retrying transient errors (write conflicts) automatically. */
  tx<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    return this.conn.transaction(fn) as Promise<T>;
  }

  async settings(): Promise<Settings> {
    const rows = await this.settingsModel.find().lean();
    const out: Settings = { ...SETTING_DEFAULTS };
    for (const r of rows) if (String(r._id) in out && typeof r.value === 'number') out[String(r._id) as keyof Settings] = r.value;
    return out;
  }

  async saveSettings(patch: Partial<Settings>) {
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in SETTING_DEFAULTS) || typeof v !== 'number' || v < 0) continue;
      await this.settingsModel.updateOne({ _id: k }, { value: v }, { upsert: true });
    }
    return this.settings();
  }

  audit(actorId: string | null, action: string, targetType: string, targetId: string, data?: unknown, session?: ClientSession) {
    return this.audits.create([{ actorId: actorId ?? undefined, action, targetType, targetId, data }], { session });
  }
}

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ uri: env.MONGODB_URI, autoIndex: false }),
    }),
    MongooseModule.forFeature(Object.entries(MODELS).map(([name, schema]) => ({ name, schema, collection: collectionName(name) }))),
  ],
  providers: [Db],
  exports: [MongooseModule, Db],
})
export class DatabaseModule {}

