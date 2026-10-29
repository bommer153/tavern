# Architecture

## Shape

```
 Web (Next.js)  ──cookies──┐                       ┌── MongoDB (replica set / Atlas)
                           ├──> NestJS API /api/v1 ├── LiveKit (voice transport; API only mints tokens + admin calls)
 Mobile (Expo) ──bearer────┘    + Socket.IO        ├── PayMongo (checkout + signed webhooks)
                                                   ├── SMTP (verification / reset mail)
                                                   ├── Expo Push
                                                   └── Supabase Storage (media) | local disk in dev
```

- **The API is the only trusted component.** It owns prices, balances, order state, timers, roles and permissions. The clients only render data and send intents. The Zod request schemas in `@tavern/shared` are reused by the forms, but validation always runs again on the server.
- **One API for both clients.** Web authenticates with HTTP-only cookies. Mobile sends `x-tavern-client: mobile` and receives tokens in the response body, which it keeps in SecureStore.
- **Real-time:** Socket.IO carries application events: `message:new`, `typing`, `notification`, `order:updated`, and `room:*` metadata, gifts and chat. Audio goes only through LiveKit.

## API modules (apps/api/src)

| Module | Responsibility |
| --- | --- |
| `auth` | scrypt passwords, JWT access (15 min), rotating refresh sessions, email tokens, global `AuthGuard` (roles/status read from DB every request) |
| `users` | profile, blocks, public profile; game catalog read |
| `companions` | discovery search/sections, detail, follows, reviews list, self-service profile/services, applications |
| `orders` | `order-rules.ts` (state machine, pricing — pure), `orders.service.ts` (booking txn, transitions, sweeps, disputes, reviews) |
| `wallet` | coin wallet + immutable ledger, gifts |
| `earnings` | companion cash earnings (centavos), settlement job, payout reservations |
| `payments` | provider abstraction (`paymongo`, `dev`), checkout, webhook verification, idempotent fulfilment |
| `messaging` | conversations, membership, persisted idempotent messages |
| `voice` | rooms, membership, roles, capacity, invites, LiveKit token + RoomService moderation, room chat |
| `notifications` | persisted notifications + Expo push delivery |
| `realtime` | Socket.IO gateway (auth on connect, user rooms, presence) |
| `admin` | moderation (moderator+) and admin-only catalog/finance/settings endpoints |
| `uploads` | image uploads with magic-byte sniffing |

### Key flows

**Booking.** The server validates the service, the companion's status and blocks, and that the companion is online (orders always start now; there is no scheduling or order type). Then, in one transaction, it:
1. bumps `companionProfiles.bookingSeq`, so concurrent bookings for the same companion write-conflict and retry;
2. rejects overlapping active orders;
3. debits coins with a `$gte`-guarded decrement;
4. writes the ledger row;
5. inserts the order with a snapshot of the service;
6. inserts the order event.

The client's `idempotencyKey`, unique per customer, makes double-submits return the same order.

**Order states.** `assertTransition(from, to, actor)` is the single gate. Transitions are applied with `updateOne({_id, status: from})` inside a transaction, so concurrent changes fail closed.

**Timers.** `startedAt` and `endsAt` are set by the server. Clients render a countdown from `serverNow`, correcting for skew. A sweep auto-completes sessions after a grace period and cancels and refunds stale requests. *Shortcut: the sweep is an in-process interval, so it needs a worker before running multiple instances.*

**Money.** Coins and cash are kept apart:
- The wallet holds coins, and every change writes an immutable ledger row.
- Companion earnings are in centavos. They start `pending`, become `available` after `settlementHoldHours` unless the order is disputed, and are reserved atomically for payouts.
- `GET /admin/reconcile` checks every wallet balance against its ledger sum.

**Payments.** Webhooks are handled as follows:
1. Verify the HMAC signature and a 5-minute timestamp window.
2. Skip known event IDs.
3. Re-fetch the checkout session from PayMongo and compare the amount.
4. In one transaction, record the webhook event, flip the payment from `pending` to `paid`, and credit the ledger.

## Remaining work

Prioritized:

1. **Run the external integrations for real.**
   - PayMongo sandbox top-up with a real webhook.
   - LiveKit voice on physical Android and iOS dev builds.
   - Expo push on devices.
   - Supabase upload.

   The code paths exist, but only the dev sandbox and a mocked confirmation are tested.
2. **Horizontal scaling:**
   - Socket.IO Redis adapter and shared presence.
   - Move the order sweep and earnings settlement to a single scheduled worker.
   - A shared rate-limit store.
3. **Order extensions:** `extension_requested` exists in the state machine, but there is no endpoint or UI yet.
4. **Direct card checkout for orders:** `pending_payment` is reserved for this. Today orders are paid with wallet coins only.
5. **Product gaps:**
   - Image attachments in chat.
   - Mobile screens for companion services (mobile links to web for now).
   - Mobile admin.
   - Social login.
   - Moderator appeal workflow UI.
   - Recently-played-with list.
   - Companion announcements and achievements.
6. **Type the admin API responses.** They are `any`, which shows as lint warnings. Add OpenAPI response DTOs.
7. **Mobile UI tests** with React Native Testing Library, and Detox or Maestro device flows. Today mobile is covered by typecheck, Metro bundling for both platforms, `expo-doctor` and a unit test.
8. **Legal review** of the draft Terms, Privacy Policy and Guidelines, plus the age-verification policy beyond self-declared date of birth.
