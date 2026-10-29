# Deployment & external services

Separate environments (development, staging, production) each have their own database, API keys, LiveKit project, PayMongo account mode and EAS build profile.

## MongoDB Atlas

1. Create an M10+ cluster (replica set by default, so transactions work) in an Asia-Pacific region close to the Philippines, such as Singapore.
2. Create a DB user with `readWrite` on the `tavern` database, and add API server IPs to the access list (or use a private endpoint).
3. Set `MONGODB_URI=mongodb+srv://USER:PASS@cluster.xxxx.mongodb.net/tavern?retryWrites=true&w=majority`.
4. On first boot the API verifies replica-set support and syncs indexes.
5. Seed staging only, with `pnpm db:seed`, which refuses `NODE_ENV=production`. For production, create the admin account by registering, then run `db.users.updateOne({email}, {$set:{roles:['customer','admin']}})` once.
6. Enable continuous backup.

## LiveKit (voice)

- **Local:** `docker compose -f infrastructure/docker/docker-compose.yml up livekit`, then `LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=secret`. Physical phones need your LAN IP and UDP 7882 reachable.
- **Cloud:** create a LiveKit Cloud project, then set `LIVEKIT_URL=wss://<project>.livekit.cloud` and the key and secret.
- Without these variables, `POST /voice-rooms/:id/token` returns `503 VOICE_UNAVAILABLE`. The UI says so, and room chat keeps working.

## PayMongo (sandbox, then live)

1. Use test keys: `PAYMENT_PROVIDER=paymongo`, `PAYMONGO_SECRET_KEY=sk_test_…`.
2. Create a webhook for event `checkout_session.payment.paid` pointing at `https://<api>/api/v1/payments/webhook`, and set its secret as `PAYMONGO_WEBHOOK_SECRET`.
3. Local testing: expose the API with `ngrok http 4000` (bundled with Laragon) and register the ngrok URL as the webhook.
4. Pay with PayMongo's test GCash, Maya or card flow. Coins are credited only after the signed webhook arrives and the server re-fetches the checkout session and sees `paid` with a matching amount.
5. Going live: swap to live keys and a live webhook. Payouts to companions are a **manual** process today. Admins move requests through review, then pay externally and mark them `paid`. No automatic disbursement is claimed.

## Email

SMTP settings come from `SMTP_*`. In development, Laragon's Mailpit captures mail on :1025, viewable at http://localhost:8025. In production, use a transactional provider with SPF and DKIM set up.

## Media storage

Set `STORAGE_DRIVER=supabase`, `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`, and create a public bucket named by `SUPABASE_BUCKET`. The default `local` driver writes to `apps/api/uploads` and is for development only.

## Backend (API)

- Docker: `docker build -f infrastructure/docker/api.Dockerfile -t tavern-api .`, then run it with the API environment.
- Any Node 24 host works: Fly.io, Render, Railway, ECS or a VM.
- Health check: `GET /api/v1/games`.
- Run **one instance** until the Socket.IO Redis adapter and a separate worker for the order and earnings sweeps are added.
- WebSockets must be allowed through the load balancer, with sticky sessions if you scale out.

## Web

Deploy `apps/web` to Vercel or any Node host (`pnpm --filter @tavern/web build && next start`). Set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL`. Serve the web app and API from the same parent domain (for example `tavern.ph` and `api.tavern.ph`) so the cookies are first-party.

## Mobile (Android & iOS)

Prerequisites: an Expo account, `npx eas-cli@latest login`, and `eas init` in `apps/mobile` (this writes `extra.eas.projectId`, which push tokens need).

| Goal | Command |
| --- | --- |
| Dev build (includes LiveKit/WebRTC native modules) | `eas build --profile development --platform android` (or `ios`), install, then `npx expo start --dev-client` |
| Local native build | `npx expo run:android` / `npx expo run:ios` (generates `android/`/`ios/`, git-ignored) |
| Internal test build | `eas build --profile preview` |
| Store build | `eas build --profile production --platform all` |
| Store submission | `eas submit --platform android|ios` |

Notes:
- **Expo Go** runs everything except voice. The room screen detects the missing native module and says a development build is needed.
- **Microphone:**
  - iOS: the `NSMicrophoneUsageDescription` string is set.
  - Android: `RECORD_AUDIO` is requested with a rationale, only on first unmute.
  - Test both on real devices.
- **Background audio** is *not* configured. Voice reconnects when the app returns to the foreground. Enabling background audio needs `UIBackgroundModes: audio` on iOS and a foreground service on Android, which must be evaluated explicitly.
- **Push:** use physical devices. Configure FCM credentials (Android) and an APNs key (iOS) in EAS. Notification taps deep-link to orders, chats and rooms (`src/lib/links.ts`).
- **Deep links:** the scheme is `tavern://`. Android also declares `https://tavern.ph/c/*`. Host `/.well-known/assetlinks.json` and the Apple app-site-association file before enabling verified links.
- **Stores:** the app declares 18+ content. Coins are a consumable virtual currency. Review Apple and Google rules on digital goods and in-app purchase before store release, because coin top-ups currently use PayMongo checkout.
