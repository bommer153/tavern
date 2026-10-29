# Database (MongoDB)

All schemas live in `apps/api/src/db/schemas.ts`. Collection names are camelCase plurals. Indexes are created on boot by `syncIndexes()`.

## Requirements

- **The deployment must be a replica set** (MongoDB Atlas, or `pnpm db:start` locally). The API checks this at startup and refuses to run against a standalone server. It never falls back to non-transactional balance updates.
- Money is stored as integer centavos (PHP). Coins are integers. IDs are ObjectIds.

## Collections and relationships

| Collection | Holds | Key indexes |
| --- | --- | --- |
| `users` | identity, roles, status, settings, notification prefs | `email` unique, `usernameLower` unique |
| `sessions` | refresh-token families (hashed) | `tokenHash` unique, TTL on `expiresAt` |
| `emailTokens` | verify/reset tokens (hashed, single-use) | `tokenHash` unique, TTL |
| `blocks` | blocker → blocked | unique pair, `blockedId` |
| `games` | admin-managed catalog (ranks/roles) | `slug` unique |
| `companionProfiles` | 1:1 with user; games (≤10, embedded), ratings, counters, `bookingSeq` lock | `userId` unique; compound (status, featured, rating), (status, games.gameId, price), (status, online, completedOrders) |
| `companionApplications` | application workflow | (userId, createdAt), (status, createdAt) |
| `companionServices` | priced services | (companionId, active) |
| `companionAvailability` | weekly slots + timezone (1 per companion) | `companionId` unique |
| `follows` | follower → companion | unique pair, `companionId` |
| `orders` | participants, **service snapshot**, authoritative amounts, status, timer | `orderNo` unique, (customerId, idempotencyKey) unique, (companionId, status, slotStart), (status, endsAt) |
| `orderEvents` | append-only transition log | (orderId, createdAt) |
| `reviews` | one per order | `orderId` unique, (companionId, createdAt) |
| `conversations` | direct (unique `directKey`) or order (unique `orderId`) | partial unique indexes |
| `conversationMembers` | per-user read state, sort key | (conversationId, userId) unique, (userId, lastMessageAt) |
| `messages` | persisted chat | (senderId, clientId) unique, (conversationId, createdAt) |
| `voiceRooms` / `voiceRoomMembers` / `roomInvitations` | rooms, membership & roles, invites | (roomId, userId) unique |
| `roomMessages` | ephemeral room chat | TTL 7 days |
| `gifts`, `coinPackages` | admin catalogs | — |
| `cosmetics` | seat frames & room backgrounds catalog (curated items inserted once at boot; artwork drawn by the client per `key`) | `key` unique |
| `userCosmetics` | entitlements (purchase / event / grant) | (userId, cosmeticId) unique — makes double purchases impossible |
| `wallets` | coin balance summary (`min: 0`) | `userId` unique |
| `walletTransactions` | **immutable coin ledger** | (userId, createdAt), (userId, idempotencyKey) unique partial |
| `giftTransactions` | gift sends | (senderId, idempotencyKey) unique |
| `paymentTransactions` | provider references & status | (userId, idempotencyKey) unique, (provider, providerRef) unique |
| `webhookEvents` | processed provider events | (provider, eventId) unique |
| `earningsAccounts` / `earningsEntries` | companion cash balances / entries | entries: (refType, refId, type) unique |
| `payoutRequests` | payout lifecycle (account number `select: false`) | (companionId, idempotencyKey) unique |
| `notifications` | in-app history | (userId, createdAt), TTL 180 days |
| `pushTokens` | Expo tokens | `token` unique |
| `reports`, `moderationActions`, `auditLogs`, `platformSettings` | trust & safety, admin trail, editable fees | — |

### Design choices

- **Embedded:** only small, bounded data that is read together, such as the games on a profile.
- **Referenced, with no unbounded arrays:** history (messages, ledgers, orders, notifications) lives in its own collections.
- **Denormalized counters** (rating average and count, follower count, completed orders, starting price) are updated inside the same transaction as their source write.
- **Orders keep a snapshot of the service.** Editing a service never changes an existing order's price.

## Operations

- **Backups:** use Atlas continuous backups with point-in-time recovery for production. Test a restore into staging every quarter. Locally, `mongodump --uri "$MONGODB_URI"`.
- **Migrations:** schema changes are additive, with new fields given defaults. For data backfills, write an idempotent script under `apps/api/src/migrations/` and run it once per environment with `node dist/migrations/<name>.js`. Index changes apply through `syncIndexes()` at boot, which also drops indexes that are no longer declared, so review index changes before deploying.
- **Reconciliation:** `GET /api/v1/admin/reconcile` lists any wallet whose balance differs from its ledger sum. It should always be empty.
- **Retention:** sessions and email tokens expire via TTL indexes. Room chat expires after 7 days and notifications after 180. Financial collections are never TTL'd.
