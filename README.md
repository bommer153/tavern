# Tavern

**Find your duo. Enter your world.** A gaming-companion marketplace and social voice platform for Filipino gamers: web, Android and iOS on one NestJS + MongoDB backend.

```
apps/
  api/      NestJS 12 REST API (/api/v1), Socket.IO, Mongoose 9, LiveKit tokens, PayMongo
  web/      Next.js 16 App Router, Tailwind 4, TanStack Query, RHF + Zod
  mobile/   Expo SDK 58, Expo Router, SecureStore, Notifications, LiveKit React Native
packages/
  shared/      Zod schemas + inferred types + enums (used by api, web, mobile)
  api-client/  Typed fetch client (cookie mode for web, bearer mode for mobile)
infrastructure/  dev replica-set launcher, docker compose (Mongo RS, LiveKit, Mailpit), API Dockerfile
docs/            architecture, database, api, security, deployment
```

## Quick start (local)

Prerequisites: Node 24+, pnpm 9, a `mongod` binary (or Docker), optionally Mailpit (bundled with Laragon) on :1025/:8025.

```bash
pnpm install
pnpm --filter @tavern/shared build && pnpm --filter @tavern/api-client build

# 1. MongoDB replica set (transactions are required — a standalone mongod is refused at startup)
pnpm db:start                       # runs mongod --replSet rs0 on :27018 using your local binary
#   `pnpm dev` also starts it in the background when MONGODB_URI points at :27018 (log: .data/mongod.log)
#   or: docker compose -f infrastructure/docker/docker-compose.yml up -d

# 2. Configure env (see .env.example for every variable)
cp .env.example apps/api/.env       # keep the API section; set JWT_SECRET
#   apps/web/.env.local  -> NEXT_PUBLIC_API_URL / NEXT_PUBLIC_SOCKET_URL
#   apps/mobile/.env     -> EXPO_PUBLIC_API_URL (use your LAN IP for a phone)

# 3. Seed development data (games, gifts, coin packages, staff + demo accounts)
pnpm db:seed

# 4. Run API (:4000, docs at /api/docs) and web (:3000)
pnpm dev

# 5. Mobile (needs a development build for voice; Expo Go works for everything else)
cd apps/mobile && npx expo start
```

Seeded accounts (password `tavern-dev-123`): `admin@tavern.local`, `mod@tavern.local`, `player@tavern.local` (2000 coins), companions `kaiser_ml@`, `luna_val@`, `tito_dota@`, … `@tavern.local`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm typecheck` | Strict TypeScript across all packages (turbo) |
| `pnpm test` | API integration tests (Vitest + Supertest on an in-memory Mongo **replica set**) and mobile unit tests |
| `pnpm --filter @tavern/web test:e2e` | Playwright journeys (desktop + mobile-web); needs API + web running and seeded |
| `pnpm --filter @tavern/web lint` | ESLint (Next config) |
| `pnpm build` | Build shared packages, API and web |
| `cd apps/mobile && npx expo export -p android` | Verify the native JS bundle compiles |

## Status

**Implemented and tested.** These have automated API tests, and the web journeys are also covered by Playwright:
- Auth: register (18+ check), login, cookie and bearer sessions, refresh rotation with reuse detection, email verification, password reset, CSRF origin check, suspension.
- Role authorization for customer, companion, moderator and admin.
- Companion applications with admin approval, services, availability, follows, discovery filters.
- Bookings paid from the coin wallet:
  - server-side pricing;
  - idempotent submits;
  - a concurrency lock so one slot can't be double-booked;
  - an explicit state machine;
  - a server timer with auto-complete and expiry sweeps;
  - refunds on decline, cancel or expiry;
  - disputes with admin refund or release;
  - reviews.
- Coin ledger: atomic, overdraft-proof, reconcilable.
- Gifts: idempotent, with a companion earnings share.
- Earnings settlement hold and the payout lifecycle.
- Dev sandbox payments, and the PayMongo webhook (signature check, provider confirmation, duplicate-event protection).
- Messaging: persisted before broadcast, idempotent, block-aware.
- Notifications with Expo push.
- Voice room membership, roles, capacity, invites and token issuance.
- Reports, moderation and audit logs.

**Implemented, waiting on external setup:**
- **LiveKit audio:** needs `LIVEKIT_*` keys, or `docker compose`'s dev server.
- **PayMongo live checkout:** needs sandbox keys and a webhook endpoint.
- **Supabase Storage:** set `STORAGE_DRIVER=supabase`.
- **Expo push:** needs an EAS project ID and a physical device.
- **Native voice on phones:** needs a development build (`eas build --profile development`).

None of these has been run end to end against the real provider. See [docs/deployment.md](docs/deployment.md).

**Demo-only:**
- The `dev` payment provider: a "sandbox" approve button that the API refuses in production.
- Local-disk uploads.
- Seeded ratings and session counts for the demo companions.

**Remaining work:** see the prioritized list in [docs/architecture.md](docs/architecture.md#remaining-work).
