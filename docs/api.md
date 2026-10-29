# API

- Base URL: `/api/v1`.
- Interactive OpenAPI: `/api/docs`. Raw JSON: `/api/docs/openapi.json`.
- Typed client: `@tavern/api-client`.

## Conventions

- **Auth:**
  - Web gets HTTP-only cookies: `tv_at` (access), `tv_rt` (refresh, path `/api/v1/auth`), plus the non-secret hint cookie `tv_session`.
  - Mobile sends `x-tavern-client: mobile`, receives `{accessToken, refreshToken}`, and then sends `Authorization: Bearer`.
- **Errors:** `{ statusCode, code, message, details? }`. Example codes: `VALIDATION_FAILED`, `INSUFFICIENT_FUNDS` (402), `SLOT_TAKEN` (409), `INVALID_TRANSITION` (409), `VOICE_UNAVAILABLE` (503).
- **Idempotency:** retryable writes take an `idempotencyKey`: orders, gifts, checkout, payouts and wallet adjustments. Messages take a `clientId` instead.
- **Rate limits:** 300 requests/min overall, 10/min on auth, 3/min on forgot-password, 30 per 10 s on message sends.
- **Pagination:** `?page=` returns `{ items, page, total, hasMore }`.

## Main routes

| Area | Routes |
| --- | --- |
| Auth | `POST auth/register · login · refresh · logout · logout-all · verify-email · resend-verification · forgot-password · reset-password` |
| Users | `GET/PATCH users/me`, `GET users/:username`, `POST/DELETE users/:id/block`, `GET games` |
| Discovery | `GET companions?game&category&language&rank&role&playstyle&voice&online&minPrice&maxPrice&minRating&sort&page`, `GET companions/sections`, `GET companions/:username`, `GET companions/:id/reviews`, `POST/DELETE companions/:id/follow`, `GET companions/following/me` |
| Companion self | `GET/PATCH companion/profile`, `GET/POST companion/services`, `PATCH companion/services/:id` |
| Applications | `GET applications/me`, `POST applications` |
| Orders | `POST orders`, `GET orders/me?as=customer|companion&status=active|past|<status>`, `GET orders/:id` (includes `serverNow`), `POST orders/:id/{accept,decline,cancel,start,complete,dispute}`, `POST orders/:id/review` |
| Wallet & gifts | `GET wallet`, `GET wallet/transactions`, `GET wallet/packages`, `GET gifts`, `POST gifts/send` |
| Cosmetics | `GET cosmetics` (public catalog), `GET cosmetics/me` (items, owned keys, appearance), `GET cosmetics/me/history`, `PATCH cosmetics/me/appearance` (equip only owned keys), `POST cosmetics/:id/purchase` (`idempotencyKey`; catalog price, one wallet transaction) |
| Payments | `POST payments/checkout`, `POST payments/webhook` (PayMongo), `GET payments/:id`, `POST payments/dev/:id/complete` (dev provider only) |
| Earnings | `GET earnings`, `GET earnings/entries`, `POST payouts`, `GET payouts/me` |
| Messaging | `GET/POST conversations`, `GET conversations/:id`, `GET/POST conversations/:id/messages`, `POST conversations/:id/read` |
| Voice | `GET/POST voice-rooms`, `GET voice-rooms/:id`, `POST voice-rooms/:id/{join,token,leave,hand,invite,theme,close}` (theme: host/room moderator, background must be owned), `POST voice-rooms/:id/members/:userId/{role,mute,remove}`, `GET/POST voice-rooms/:id/messages` |
| Notifications | `GET notifications`, `POST notifications/read`, `POST notifications/push-tokens` |
| Trust & safety | `POST reports`; moderator+: `GET admin/reports`, `POST admin/reports/:id/resolve`, `GET admin/users`, `POST admin/users/:id/status`, `GET admin/rooms` |
| Admin only | `GET admin/overview`, `POST admin/users/:id/roles`, `GET admin/applications`, `POST admin/applications/:id/decision`, `POST admin/companions/:id/feature`, `GET admin/orders`, `POST admin/orders/:id/resolve`, `GET admin/payments · ledger · reconcile`, `POST admin/wallet-adjustments`, `GET/POST/PATCH admin/gifts · packages · games · cosmetics`, `POST admin/cosmetics/:id/grant`, `GET admin/payouts`, `POST admin/payouts/:id/status`, `GET/PATCH admin/settings`, `GET admin/audit-logs` |
| Uploads | `POST uploads/image` (multipart `file`, ≤5 MB, PNG/JPEG/WebP verified by magic bytes) |

## Socket.IO events

- Connect to `API_PUBLIC_URL` (path `/socket.io`). The web client authenticates with its cookie; mobile passes `auth: { token }`.
- Server to client: `notification`, `message:new`, `typing`, `order:updated`, `room:members`, `room:role`, `room:muted`, `room:removed`, `room:closed`, `room:gift`, `room:message`, `auth_error`.
- Client to server: `typing {conversationId}`, `room:subscribe {roomId}` (only allowed for members), `room:unsubscribe`.
