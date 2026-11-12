# Server authentication — Phase 4, step 1

Password accounts and refresh sessions are implemented in the Express API.
The approved migration `20261112000000_auth_foundation` is applied to the local
**development** database. Automated tests and the live curl proof use separate
**test** databases. There is no Google implementation or mobile auth UI here.

## Setup and start

Use the single project folder `~/Desktop/Territory-Running-App` and Node 22.12+
(verified 22.19.0). From that folder:

```sh
./scripts/local-postgres.sh start
npm ci --prefix server
npm run db:generate --prefix server
npm run db:migrate --prefix server
npm run db:seed --prefix server
npm start --prefix server
```

Use the existing ignored `server/.env`; never overwrite it with the example.
For a fresh clone, copy `.env.example` once and replace its placeholders. The
verified local PostgreSQL 16.15 route uses port 55432; the example uses 5432 for
Docker. Docker remains unverified. The root README documents database setup.
The API defaults to `127.0.0.1:4000`. Stop an older API before starting the new
code on that port, or override `PORT` for a second local process.

Generate two independent random secrets locally (for example, 48 random bytes
encoded as base64url for each). Each must be at least 32 UTF-8 bytes and they must
be different. Startup rejects missing/short secrets and example placeholders.
Neither secret is logged. These are server-only secrets, never VITE variables.

## Auth overview and endpoints

Every request body must be an uncompressed UTF-8 JSON object with exactly the
listed fields. The body limit is 16 KiB. Tokens travel in JSON and the Bearer
Authorization header; no cookies are set. Auth responses and `/api/me` use
`Cache-Control: no-store`. Errors use `{ "error": { "code": "...", "message": "..." } }`.

The examples below contain placeholders only. Replace them locally; do not put
real passwords or tokens in shared terminal transcripts or source files.

| Endpoint | Request example | Success |
| --- | --- | --- |
| `POST /api/auth/register` | `curl -X POST http://127.0.0.1:4000/api/auth/register -H 'Content-Type: application/json' -d '{"email":"runner@example.com","password":"REPLACE_WITH_A_STRONG_PASSWORD","displayName":"Trail Runner"}'` | 201 session envelope |
| `POST /api/auth/login` | `curl -X POST http://127.0.0.1:4000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"runner@example.com","password":"REPLACE_WITH_A_STRONG_PASSWORD"}'` | 200 session envelope |
| `POST /api/auth/refresh` | `curl -X POST http://127.0.0.1:4000/api/auth/refresh -H 'Content-Type: application/json' -d '{"refreshToken":"REPLACE_WITH_REFRESH_TOKEN"}'` | 200 rotated session envelope |
| `POST /api/auth/logout` | `curl -X POST http://127.0.0.1:4000/api/auth/logout -H 'Content-Type: application/json' -d '{"refreshToken":"REPLACE_WITH_REFRESH_TOKEN"}'` | 204, empty body; idempotent |
| `GET /api/me` | `curl http://127.0.0.1:4000/api/me -H 'Authorization: Bearer REPLACE_WITH_ACCESS_TOKEN'` | 200 public user |

The session envelope is `{accessToken, refreshToken, expiresIn, user}`. The user
projection, including `/api/me`, contains only `id`, `email`, `displayName` and
`createdAt`. The required unique username is generated internally as a random
30-character identifier; choosing/editing a public handle is a later feature.

Wrong-password login, unknown-email login and duplicate-email registration
return identical 401 `AUTH_FAILED` bodies. Internal logs distinguish fixed
reason tags without emails, passwords, tokens, hashes or request content.
Invalid fields/weak passwords return 400 `INVALID_INPUT`; oversized JSON returns
413; unsupported body encoding returns 415; limits return 429. Invalid access
returns 401 `UNAUTHORIZED`. Authenticated suspended/deletion-requested accounts
receive 403 `ACCOUNT_SUSPENDED` / `ACCOUNT_DELETED`.

## Environment variable names

Real values belong only in ignored local env files. Names only:

| Purpose | Names |
| --- | --- |
| Database and tests | `DATABASE_URL`, `DIRECT_URL`, `DATABASE_URL_TEST`, `DATABASE_URL_API_TEST` |
| Seed | `ADMIN_EMAIL`, `ADMIN_PASSWORD` |
| Listener/CORS/general limit | `HOST`, `PORT`, `CORS_ORIGINS`, `API_RATE_LIMIT_MAX`, `API_RATE_LIMIT_WINDOW_MS` |
| Access signing | `JWT_ACCESS_SECRET` |
| Refresh successor derivation | `REFRESH_TOKEN_DERIVATION_SECRET` |

## Passwords and validation

Passwords are not trimmed or normalized. Registration accepts 10–128 Unicode
code points and rejects a small case-insensitive common-password denylist.
Native asynchronous `node:crypto.scrypt` uses N=32768, r=8, p=3, a fresh 16-byte
salt and a 32-byte derived key, with `maxmem=64 MiB` (about 32 MiB working memory
per operation). Fixed-cost versioned hashes encode parameters, salt and key.
Verification uses `timingSafeEqual`; unknown accounts still perform scrypt.
New seeded admins use scrypt plus a PASSWORD identity in one transaction.
Existing bcrypt cost-12 hashes remain valid and upgrade to scrypt only after a
successful login. Seed reruns never rotate an existing password or escalate a runner.

Email is trimmed/lowercased on the server, with ASCII dot-atom local parts of at
most 64 characters. Plus addressing is preserved; dots are not removed. Unicode
local parts, quoted locals, empty labels, trailing/consecutive dots and control
characters are rejected. Unicode domains become lower-case IDNA ASCII. The
canonical address is at most 254 ASCII characters. Registration, login and rate
limiting use the same normalization. No browser normalization is trusted.
Display names are NFKC-normalized, trimmed and space-collapsed (2–60 code points).
Letters, marks, numbers, spaces, apostrophes, hyphens and periods are allowed.
Emoji, controls, zero-width/bidi formatting marks and reserved admin/support/
territory run names are rejected, including compatibility-normalized variants.

## Token lifetimes and rotation

- Access: HS256 JWT via exact-pinned `jose` 6.2.17; 900 seconds. Payload claims
  are exactly `sub`, `iat`, `exp`; verification pins the algorithm and checks
  server time, lifetime, required claims and user status.
- Refresh: 30 days from issuance/rotation. Initial tokens are 32 random bytes,
  base64url encoded. Only SHA-256 digests are persisted in `auth_tokens`.
- Rotated successors are 32-byte HMAC-SHA-256 values using the independent
  `REFRESH_TOKEN_DERIVATION_SECRET`. The exact UTF-8 HMAC input is
  `JSON.stringify(['refresh-successor-v1', parentToken, successorId])`.
- `successorId` is a fresh UUID, used as the successor row's `id` and stored in
  the parent's `replaced_by_id`. No separate nonce column or raw-token cache is
  needed. A retry uses the exact resent parent token and that persisted UUID to
  recompute the successor, then compares its SHA-256 with the stored child hash
  in constant time before returning it.
- One retry within 10 seconds may recover that identical, still-active successor.
  `grace_replayed_at` persists the single redemption across restarts/processes.
  Further retries inside the window fail with `REFRESH_RETRY_EXHAUSTED` without
  revoking the family. Reuse after the window revokes every token in the family
  and returns `REFRESH_REUSED`. Logout also revokes that family, not other logins.
- All refresh/logout/login mutations lock the user row before modifying token
  state. This serializes concurrent rotations, family revocation and account
  status changes; a successor cannot be inserted after a competing revocation.
- Expiry/grace checks use database server time; JWT validation uses API server
  time. Client Date/time headers are ignored. Responses expose the server Date
  header and `expiresIn`; step 4.2 should use these for scheduling refreshes even
  when a phone clock is wrong, while server checks remain authoritative.

Keep the derivation secret stable across restarts and API instances. A changed
secret fails hash verification during grace and revokes that family. Coordinate
secret rotation and sign users in again. Changing the JWT secret invalidates
existing access tokens. There is no persistent raw/encrypted refresh-token store.

## Protections and remaining limitations

Protected: transactional user/identity/session creation, database-authoritative
email uniqueness, password hashing, short access lifetime, rotated refresh
families with persisted replay detection, strict validation, no sensitive logs,
explicit CORS allowlist and unchanged Helmet policy. CORS adds POST for auth and
exposes Date; the origin allowlist and cookie-free policy are preserved.
Auth limits are 10 requests/15 minutes per IP + canonical email, plus 50 requests/
15 minutes per IP across auth. The existing general API limiter also applies.
IP metadata is a keyed HMAC digest with its own domain label; user-agent metadata
is truncated to 512 characters. Plain IPs are not stored in session rows.

Not yet: email ownership verification, password recovery, MFA, account-management
UI, Google login/linking, distributed rate-limit storage, production TLS/proxy
configuration and session-retention jobs. Immediate successful registration
necessarily reveals that registration succeeded; generic failures do not claim
full enumeration resistance for the overall signup workflow. Rate limits are
process-local and reset on restart. Configure a shared store before multiple
production instances; only set Express trust proxy for explicitly trusted proxies.
Access JWTs remain usable until expiry after logout unless the account is
suspended/deletion-requested. Production traffic must use HTTPS; local HTTP is
only for development. This step does not prove a physical-phone clock/UI flow.

No future Google identity may be auto-linked merely because its email matches.
A future provider implementation must verify its subject and require an explicit,
authenticated account-linking flow. Only the GOOGLE enum value is reserved now.
An account has at least one identity as an application transaction invariant,
not a SQL CHECK. `deletion_at IS NOT NULL` blocks refresh immediately; physically
deleting a user cascades tokens, so an already-erased token is simply invalid.

## Schema changes for the ER diagram

Migration: `20261112000000_auth_foundation` (the Phase 1 migration is unchanged).
Application tables: **26 -> 27**, with only `auth_identities` added; reuse
`auth_tokens`, and do not create a separate refresh_tokens table.

- New enum: AuthProvider = PASSWORD, GOOGLE.
- New auth_identities columns: id UUID PK/default gen_random_uuid(); user_id UUID
  NOT NULL FK users.id ON DELETE CASCADE; provider AuthProvider NOT NULL;
  provider_subject VARCHAR(255) NOT NULL; email_at_signup VARCHAR(255) NOT NULL;
  created_at TIMESTAMPTZ(6) NOT NULL/default now(); last_used_at TIMESTAMPTZ(6) NULL.
  Unique(provider, provider_subject); index(user_id).
- users: password_hash becomes nullable; add suspended_at TIMESTAMPTZ(6) NULL;
  add unique expression index users_email_lower_key on lower(email). Preserve
  the original lowercase CHECK and exact-email unique index.
- auth_tokens: add family_id UUID NULL, revoked_at TIMESTAMPTZ(6) NULL,
  replaced_by_id UUID NULL, user_agent TEXT NULL, ip_hash VARCHAR(64) NULL,
  grace_replayed_at TIMESTAMPTZ(6) NULL. Keep all existing columns/constraints,
  including used_at. Add index(family_id), self-FK replaced_by_id -> auth_tokens.id
  ON DELETE/UPDATE NO ACTION, and the three CHECKs below.
- auth_tokens_refresh_family_check: REFRESH requires family_id; other kinds
  require a null family_id.
- auth_tokens_rotation_state_check: a successor link requires a used REFRESH
  parent and cannot point to itself.
- auth_tokens_grace_state_check: grace redemption requires a used REFRESH parent
  with a recorded successor.

The migration backfills PASSWORD identities and preserves all password hashes.
Legacy REFRESH rows get family_id=id and are marked used/revoked because they
lack rotation history. Password-reset/email-verification rows are untouched.
No rows/tables/columns are dropped. SQL remains in the reviewed migration file.

## Tests and verification

Tests require two disposable PostgreSQL 16 databases. They reject the same URL
or database name as DATABASE_URL/DIRECT_URL and refuse populated test databases.
The reset helper validates both names, requires distinct *_test databases and
recreates only the selected disposable targets; it requires database-owner
privileges and terminates connections only to those targets.

```sh
node server/scripts/reset-test-databases.js all
npm test --prefix server
npm run test:api --prefix server
# To rerun just one suite, reset only db or api instead of all.
```

Verified: **27 DB tests**, including the original 26-table migration followed by
27-table auth upgrade, legacy backfill, all constraints and both territory races;
**34 API tests**, including auth, isolated-process grace recovery and log safety.
All passed. New tests use explicit test signing/derivation secrets, not local
private secrets. The real npm-start/curl proof ran on the API test database and
removed its proof account afterward. No lint/build script is configured for this
plain Node server; all 20 JavaScript files passed `node --check` and package/lock
JSON parsed successfully. No dependency audit vulnerabilities were reported.
See `../docs/EDGE_CASES.md` for the required ID audit and
`../docs/PHASE4_AUTH_VERIFICATION.md` for real output and the later commit plan.

No staging, commits, push, branch switching or PR was performed. Existing Phase 3
files under web/ and AGENTS.md are outside this step and remain unchanged.
