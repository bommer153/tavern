# Security

## Controls in place

- **Passwords:** scrypt (N=2^15, per-user salt) compared with `timingSafeEqual`. Login gives the same response whether or not the email exists.
- **Sessions:**
  - 15-minute JWT access tokens.
  - Refresh tokens are 32 random bytes, stored only as a SHA-256 hash, rotated on every use, and grouped in families.
  - Reusing a rotated token after a 10-second grace window revokes the whole family.
  - Password reset, suspension and "sign out everywhere" revoke all sessions.
- **Token storage:** web keeps HTTP-only `SameSite=Lax` cookies (`Secure` in production) and never uses localStorage. Mobile uses Expo SecureStore (Keychain or Keystore).
- **CSRF:** a cookie-authenticated write must come with an `Origin` in `CORS_ORIGINS`.
- **Authorization:** a global guard loads roles and status from the database on every request, so a suspension takes effect immediately.
  - Moderators get trust-and-safety access only, and cannot act on staff accounts.
  - Admin finance, catalog and settings routes are admin-only.
  - A resource the caller doesn't own returns 404, so its existence isn't leaked.
- **Validation:** every body and query goes through a Zod schema. Prices, amounts, roles and status are never accepted from the client.
- **Money:**
  - Transactions are required, and balance decrements are conditional (`$gte`).
  - Retryable actions use idempotency keys with unique indexes.
  - The ledger is append-only, and reconciliation can be run at any time.
  - Webhooks are HMAC-verified, rejected outside a 5-minute window, de-duplicated by event ID, and confirmed server-to-server with the provider before any coins are credited.
- **Uploads:** 5 MB limit, file type taken from magic bytes (the client's MIME type is ignored), random keys, no SVG.
- **Rate limiting:** `@nestjs/throttler`, global plus stricter limits on auth, password reset, messaging and uploads.
- **Privacy:**
  - Payout account numbers are `select: false` and masked in responses.
  - No game credentials are ever requested. The UI warns against sharing them, and companions must acknowledge this.
- **Eligibility:** the paid marketplace is 18+. The age is checked from the date of birth at registration, the minimum age is configurable, and companions must acknowledge they are adults.
- **Audit:** admin actions on applications, orders, wallets, gifts, packages, games, payouts, settings and user status write `auditLogs`. Moderation writes `moderationActions`.
- **Voice:** LiveKit tokens last 10 minutes and are scoped to one room. Publishing rights depend on the member's role. Bans block both rejoining and new tokens.

## Production checklist

1. `NODE_ENV=production`, a random `JWT_SECRET` of at least 48 bytes, `COOKIE_SECURE=true`, and `COOKIE_DOMAIN=.tavern.ph` when the web app and API share a parent domain.
2. `PAYMENT_PROVIDER=paymongo`. The dev provider is rejected by environment validation.
3. Put the API behind TLS (the proxy is trusted for one hop). Lock `CORS_ORIGINS` to the real web origins.
4. Atlas: IP access list or private endpoint, a least-privilege DB user, backups enabled.
5. `STORAGE_DRIVER=supabase` with a public-read and server-write bucket.
6. Have counsel review the Terms, Privacy Policy and Guidelines (Philippine Data Privacy Act).

## Known limitations

- Age verification is self-declared. Plan stronger KYC for companions before scaling payouts.
- In-process presence, rate-limit counters and scheduled sweeps are single-instance (see architecture, remaining work).
- Web pages rely on API authorization. The Next.js proxy only redirects signed-out visitors as a convenience.
