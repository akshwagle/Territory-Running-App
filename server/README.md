# Territory Run server — auth and profile/privacy

Email/password accounts, Google sign-in/linking, mailbox verification, password
recovery and session management. Plain JavaScript on Node 22.12+ (verified
22.19.0), Express 5.3.0 and PostgreSQL 16.15. The Android app reuses these endpoints; browser Google try-out remains an owner-run development tool.

## Database: reuse auth_tokens, no step-02 schema change

The auth-complete step kept **27** tables without changing either earlier migration.
The separately approved step-04 profile/privacy migration now brings the total to **30**; see below. The proposed action-token table/migration was deleted
without being applied. No rollback, new table, new enum, new column, new index or
new CHECK is needed. users.verified_at and auth_tokens.ip_hash already exist.

- Refresh sessions use auth_tokens.kind=REFRESH and their existing family fields.
- Email verification uses kind=EMAIL_VERIFY, expires after 24 hours, and leaves
  family_id null.
- Password reset uses kind=PASSWORD_RESET, expires after 30 minutes, and leaves
  family_id null. Only SHA-256 digests of 32 random bytes are stored.
- A new request marks every earlier unused token of that same kind/user used_at.
  It does not invalidate the other action kind. Confirmation is single-use via
  used_at. User-row locks serialize issuance, confirmation and credential changes.
- Existing uniqueness, FK cascades and non-REFRESH/null-family CHECKs are reused.
  Service code validates digest format and lifetimes; no hardening migration is
  proposed or applied in this step.

The earlier migration 20261112000000_auth_foundation added auth_identities,
nullable users.password_hash, users.suspended_at and refresh-family metadata.
Its original ER summary remains in docs/PHASE4_AUTH_VERIFICATION.md. The auth-complete step added no physical database objects.

## Setup and environment

Use ~/Desktop/Territory-Running-App. Preserve the existing ignored server/.env;
for a fresh clone only, copy .env.example once and replace its placeholders.
The local PostgreSQL route uses port 55432; Docker's example uses 5432. Docker
remains unverified. Install dependencies, generate Prisma, and deploy the existing
migrations through the documented commands; there is no new step-02 migration.

```sh
npm ci --prefix server
npm run db:generate --prefix server
npm run db:migrate --prefix server
npm run db:seed --prefix server
# In your own Terminal, after PostgreSQL is running:
npm start --prefix server
```

The API defaults to 127.0.0.1:4000. Agents must not start/stop long-running
services for this step; the owner starts the exact Terminal commands supplied.

Environment names only (real values stay in ignored env files):

| Purpose | Names |
| --- | --- |
| Database/tests | DATABASE_URL, DIRECT_URL, DATABASE_URL_TEST, DATABASE_URL_API_TEST |
| Seed | ADMIN_EMAIL, ADMIN_PASSWORD |
| HTTP/CORS/general limit | HOST, PORT, CORS_ORIGINS, API_RATE_LIMIT_MAX, API_RATE_LIMIT_WINDOW_MS |
| Session secrets | JWT_ACCESS_SECRET, REFRESH_TOKEN_DERIVATION_SECRET |
| Google | GOOGLE_WEB_CLIENT_ID |
| Mail | MAIL_TRANSPORT, WEB_BASE_URL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM |
| Environment/run gate | NODE_ENV, REQUIRE_VERIFIED_EMAIL_FOR_RUNS |
| Local Google helper only | GOOGLE_TEST_PORT, GOOGLE_TEST_API_URL |

Both session secrets must be independent random values of at least 32 UTF-8
bytes; placeholders and equal secrets are rejected. New server dependencies are
exact-pinned google-auth-library 11.3.4 and nodemailer 10.5.0. Google requires
Node 22+, so server engines now match the repository's >=22.12 baseline. Existing
Zod 4.6.7 and jose 6.2.17 stay pinned. No frontend/Capacitor dependency changed.

MAIL_TRANSPORT defaults to outbox in development and SMTP in production.
Production rejects outbox and requires a valid HTTPS WEB_BASE_URL and all SMTP
settings. Port 465 uses implicit TLS; other ports require STARTTLS. Logging/debug
are disabled, and connection/greeting/socket timeouts are bounded. Outbox writes
private JSON messages to ignored .local/mail-outbox/ (directory 0700, files 0600).
These files contain sensitive links: do not share or commit them.

The short text/HTML messages use flat Clay & Pine colours and no images. Links
are WEB_BASE_URL/verify?token=... and WEB_BASE_URL/reset?token=.... Those production
web pages are intentionally deferred to step 11; the app deep-link handling is
step 03. Opening a link never issues a session or signs somebody in.

REQUIRE_VERIFIED_EMAIL_FOR_RUNS defaults true in production and false in
development. It is validated/exported for the future run routes; no run endpoint
is introduced here.

## Endpoints

All bodies are strict, uncompressed UTF-8 JSON, limited to 16 KiB. Unknown fields
are rejected. All errors use {error:{code,message}}. Auth responses are no-store;
no cookies are used. POST and DELETE are permitted through the existing explicit
CORS allowlist; Date is exposed. Helmet protections remain enabled.

| Endpoint | Body / auth | Result |
| --- | --- | --- |
| POST /api/auth/register | {email,password,displayName} | 201 session envelope |
| POST /api/auth/login | {email,password} | 200 session envelope |
| POST /api/auth/refresh | {refreshToken} | 200 rotated session |
| POST /api/auth/logout | {refreshToken} | 204, family revoked; idempotent |
| POST /api/auth/google | {idToken} | 200 session envelope |
| POST /api/auth/google/link | {idToken}; Bearer | 200 {identities} |
| GET /api/auth/identities | Bearer; no query fields | 200 {identities}, current user only |
| POST /api/auth/verify-email/request | {}; Bearer | 202 generic message |
| POST /api/auth/verify-email/confirm | {token}; optional Bearer | 200 message, never a login |
| POST /api/auth/password/forgot | {email} | 202 identical generic message |
| POST /api/auth/password/reset | {token,newPassword}; optional Bearer | 200 message, all sessions revoked |
| POST /api/auth/password/change | {currentPassword,newPassword}; Bearer | 200 message; retain current family only |
| GET /api/auth/sessions | Bearer; no query fields | 200 {sessions} |
| DELETE /api/auth/sessions/:id | Bearer; UUID family id, empty body | 204; another user's/unknown family returns 404 |
| GET /api/me | Bearer | id,email,displayName,createdAt,emailVerified only |

Session envelopes contain accessToken,refreshToken,expiresIn,user. Identity lists
contain only the owner's id/provider/emailAtSignup/createdAt/lastUsedAt fields;
Google sub and credential/token hashes are not returned. Sessions contain family
id,createdAt,lastUsedAt,deviceLabel,current. Times/counts are derived from token
rows; no counters are stored. The session whose family matches sid has current:true.

The step-03 app reads emailVerified from GET /api/me. This boolean is derived
from the signed-in user's existing users.verified_at in the existing middleware
query. No schema change or other response field was added; session-envelope
user objects keep their original four fields.

Example requests (placeholders only):

```sh
curl -X POST http://127.0.0.1:4000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"runner@example.test","password":"REPLACE_WITH_PASSWORD"}'
curl -X POST http://127.0.0.1:4000/api/auth/verify-email/request -H 'Authorization: Bearer REPLACE_WITH_ACCESS_TOKEN' -H 'Content-Type: application/json' -d '{}'
curl -X POST http://127.0.0.1:4000/api/auth/verify-email/confirm -H 'Content-Type: application/json' -d '{"token":"REPLACE_WITH_EMAIL_TOKEN"}'
curl -X POST http://127.0.0.1:4000/api/auth/password/forgot -H 'Content-Type: application/json' -d '{"email":"runner@example.test"}'
curl -X POST http://127.0.0.1:4000/api/auth/password/reset -H 'Content-Type: application/json' -d '{"token":"REPLACE_WITH_RESET_TOKEN","newPassword":"REPLACE_WITH_NEW_PASSWORD"}'
curl -X POST http://127.0.0.1:4000/api/auth/password/change -H 'Authorization: Bearer REPLACE_WITH_ACCESS_TOKEN' -H 'Content-Type: application/json' -d '{"currentPassword":"REPLACE_WITH_PASSWORD","newPassword":"REPLACE_WITH_NEW_PASSWORD"}'
curl -X POST http://127.0.0.1:4000/api/auth/google -H 'Content-Type: application/json' -d '{"idToken":"REPLACE_WITH_GOOGLE_ID_TOKEN"}'
curl -X POST http://127.0.0.1:4000/api/auth/google/link -H 'Authorization: Bearer REPLACE_WITH_ACCESS_TOKEN' -H 'Content-Type: application/json' -d '{"idToken":"REPLACE_WITH_GOOGLE_ID_TOKEN"}'
curl http://127.0.0.1:4000/api/auth/identities -H 'Authorization: Bearer REPLACE_WITH_ACCESS_TOKEN'
curl http://127.0.0.1:4000/api/auth/sessions -H 'Authorization: Bearer REPLACE_WITH_ACCESS_TOKEN'
curl -X DELETE http://127.0.0.1:4000/api/auth/sessions/REPLACE_WITH_FAMILY_UUID -H 'Authorization: Bearer REPLACE_WITH_ACCESS_TOKEN'
```

Do not paste real credentials/tokens into shared commands or shell history.
The owner-run auth-proof.js helper passes sensitive curl values through stdin
and redacts tokens and fixture email addresses in its output.

## Passwords, access tokens and refresh rotation

Native async scrypt uses N=32768,r=8,p=3, a random 16-byte salt, a 32-byte key and
64 MiB maxmem. Constant-time comparison; unknown users still do scrypt. Passwords
are 10–128 code points, not trimmed/normalized, with a small common-password
denylist. Legacy cost-12 bcrypt upgrades after successful login. Seed reruns
preserve existing passwords and create new admin credentials with scrypt.

Email is trimmed/lowercased once on the server; plus aliases are preserved;
local parts are ASCII dot-atoms <=64 chars, Unicode domains become IDNA ASCII,
and canonical length is <=254. Unsafe/trailing/consecutive dots and Unicode
local parts are rejected. Display names are NFKC-normalized and unsafe/reserved
names rejected. Registration creates user+identity+session transactionally;
database unique indexes arbitrate races, without an email availability pre-check.

Access JWTs use HS256 and live 900 seconds. Payload keys are **exactly sub,sid,iat,
exp**; sid is the refresh-family UUID. Missing sid, extras, tampering, wrong
signature, future/expired times or an inactive family are rejected. Old three-
claim access tokens are 401 and require sign-in again; no data migration is needed.
Auth middleware checks the account status and an active, unrevoked refresh leaf
in one SQL query using the existing family index. Logout, session revoke and
password changes therefore invalidate affected access tokens immediately.

Refresh tokens last 30 days. Initial values are 32 random bytes. Successors use
HMAC-SHA-256 with REFRESH_TOKEN_DERIVATION_SECRET and exact JSON input
['refresh-successor-v1',parentToken,successorId]. The fresh UUID is the successor
row id and parent.replaced_by_id. Only digests persist. One retry within 10
seconds recomputes the same successor and constant-time compares its SHA-256;
grace_replayed_at persists that redemption across processes/restarts. Further
in-window retries fail without revocation; later reuse revokes the family.

All credential/session mutations lock the user first. Password change verifies
the current password and revokes every other family, retaining current sid.
Password reset verifies the mailbox through the action token, sets/replaces the
PASSWORD identity, marks verified_at and revokes all refresh families immediately.
This also gives Google-only users their first password. Pending reset links are
invalidated on a password change/reset. No confirm/reset response contains tokens.

## Google verification and linking policy

verifyGoogleIdToken wraps google-auth-library. Production checks signature,
audience against GOOGLE_WEB_CLIENT_ID, issuer, strict server expiry and
email_verified. All automated tests inject a mocked verifier with a fake client
ID; adapter tests use a fake library client. No test makes a live Google request.
Never use email alone to match a returning Google sign-in: use (GOOGLE,sub).

An authoritative Google email is @gmail.com or has a nonempty signed Workspace
hd claim. For such a collision with an existing PASSWORD account:

- If already verified, attach Google while preserving its password and sessions.
- If unverified, clear the password hash, remove the inactive PASSWORD identity,
  revoke every prior refresh family and pending mailbox token, then attach Google
  and mark the email verified. This neutralizes a pre-registered password.

For any other verified Google email colliding with a PASSWORD account, return
ACCOUNT_LINK_REQUIRED with the instruction to sign in with the password and link
Google from Settings. No state changes, revocation or second user are performed.
A Google-only collision with a different sub gets the generic sign-in error.
Two subjects with the same email are never merged.

Explicit Google linking requires a valid active access token and a freshly
verified Google ID token. An unused sub may be attached, including when its email
differs from the signed-in account, as authorized. A sub already attached to the
same user returns the identity list idempotently; one attached to anyone else is
never moved, even when emails match. Another Google sub with the same email is
rejected. Linking is rate limited and lists only the current user's methods.
New non-authoritative Google-only accounts must verify their mailbox separately;
Google's historical email_verified does not set our verified_at for that case.

## Mail delivery, limits and threat notes

Forgot requests take a fixed 250 ms response delay and perform no membership
lookup before their identical 202 body. Lookup, token transaction and mail happen
only after the response finishes. Account existence cannot select a different
response path; event-loop/network load can still affect wall-clock latency.
The process-local mail queue holds up to 256 tasks; failed delivery logs only a
fixed reason tag. Jobs/outstanding SMTP sends are not durable across a crash;
retry the request to receive a fresh link. Outbox is development-only.

Auth endpoints retain the 50-request/15-minute IP backstop and the general API
limiter. Each route gets its own account/email bucket: 10/15 minutes for core
sign-in/refresh/logout/Google sign-in; 5/15 minutes for mailbox, password, Google
link and session writes. Public Google/unknown-token buckets use IP identity.
Mailbox buckets are canonical email or token owner, shared across IPs. Responses
include Retry-After when limited. Process-local rate limits need a shared store
before multiple production instances.

Invalid/missing auth is 401; suspended/deletion-requested accounts get specific
403 codes. AUTH-10 errors distinguish expired (410), replaced/used (409), wrong
purpose (400), unknown (404) and a different signed-in account (403), with a next
step. Optional Bearer on confirmation/reset must be valid if supplied and cannot
belong to another user. These links never log somebody in by themselves.

Protected: transactional identities, indexed uniqueness, constant-time hashes,
rotated sessions, immediate revocation, strict input bounds, account ownership,
explicit CORS and token-free logs. Not yet: MFA, distributed limits/durable mail
jobs, production TLS/proxy/SMTP deployment, run recording, native auth/deep-link
UI or verification/reset web pages. Immediate signup success still reveals signup
success despite generic failure responses. Production traffic must use HTTPS.

## Verify and try one real Google sign-in

```sh
node server/scripts/reset-test-databases.js all
npm test --prefix server
npm run test:api --prefix server
npm test --prefix web
npm run lint --prefix web
npm run build --prefix web
npm run build --prefix mobile
```

The DB/API suites use distinct guarded *_test databases. They never reset or
write development. The curl proof also uses only the API test database:

```sh
node server/scripts/auth-proof.js
```

Run it in your Terminal as requested; it uses real curl against an owner-run
short-lived listener, with mocked Google and mail delivery, and cleans its own
proof account. Tokens and fixture emails are redacted; a private transcript is
saved to ignored .local/auth-complete/curl-proof.log. It does not prove a real
Google sign-in or SMTP delivery.

For one real Google sign-in, use a test account; it creates/links a development
account using the policy above. In your Google Cloud Web OAuth client, authorize
**http://localhost:5174** as a JavaScript origin. If the consent app is in Testing,
add your Google test account to its test users. The real Web client ID stays in
server/.env and is neither printed nor displayed by this helper.

In Terminal 1 (the owner starts PostgreSQL/API; stop any older API yourself first):

```sh
cd ~/Desktop/Territory-Running-App
./scripts/local-postgres.sh start
npm start --prefix server
```

In Terminal 2:

```sh
cd ~/Desktop/Territory-Running-App
npm run auth:google:try --prefix server
```

Open http://localhost:5174 on the Mac, choose the Google account and look for
Google sign-in passed plus /api/me accepted. End this test session revokes the
family. Google renders its official button; tokens live only in page memory,
never browser storage or console. The helper binds loopback, checks Host/Origin
and a per-page nonce, and proxies only three fixed local API operations. It uses
Barlow and Clay & Pine styling without changing web/mobile source. Override
GOOGLE_TEST_PORT and GOOGLE_TEST_API_URL only for another localhost port/API.
Press Ctrl+C in your Terminals when done; the agent does not stop your services.

The owner verified a real Google sign-in at http://localhost:5174: the API issued
a session and /api/me accepted it. Actual SMTP delivery remains unverified.
Automated tests still use fakes; the helper needs no pasted ID token. No Android
permission, APK, native UI, Google services key file or phone flow changed in
this server step.


## Step 04: profile, privacy, consent and data ownership

The reviewed `20261113000000_profile_privacy` migration adds three tables and
seven columns to existing tables (30 application tables total). It was tested
on disposable databases, then applied to development only after a verified
private pg_dump backup and the owner's second go. Existing account sign-in and
Settings passed afterwards. Complete SQL object inventory, proof output and
phone results: [profile/privacy review](../docs/PHASE4_PROFILE_PRIVACY_REVIEW.md).

All endpoints below require a signed, active `sub/sid` session, use `no-store`
and strict Zod validation, and never require email verification. Writes are
limited per account per process. Authentication JWT and `/api/me` fields stay
unchanged. Bodies cannot select another account.

| Method/path | Contract |
| --- | --- |
| GET /api/me/profile | Own profile, avatar options and available home regions |
| PATCH /api/me/profile | Nonempty subset: displayName, avatarId, avatarColor, preferredUnits, bio, homeRegionId (nullable) |
| GET/PATCH /api/me/privacy | profileVisibility PUBLIC/FOLLOWERS/PRIVATE, appearOnLeaderboards and shareRouteShapes |
| GET /api/users/:id/profile | 404 unless shared `canView` permits this viewer; own profile always visible |
| GET /api/admin/users/:id/name-history | ADMIN only; history of an existing account, otherwise 403/404 |
| GET /api/me/consents | Current notices/revisions and complete append-only history |
| POST /api/me/consents | `{type, version, accepted}`; type LOCATION/TERMS/PRIVACY |
| DELETE /api/me | Exact `confirmation: "DELETE"` plus either password or fresh idToken, never both; 204 |
| POST /api/me/export | Empty object; 202 with export metadata, existing active export reused |
| GET /api/me/export/:id | 202 while pending, JSON attachment when ready, 404 for foreign/missing/expired/deleted resources |

Names use NFKC, trim/collapse spaces and 3–24 Unicode code points. Letter, mark,
number, space, period, apostrophe and hyphen characters are allowed. A small
whole-word denylist rejects profanity; admin/administrator/support/territoryrun
are reserved. This is deliberately a small local filter, not comprehensive
language moderation. Canonical advisory locks serialize every signup, Google
and profile name claim. Signup/Google add readable numeric suffixes (then bounded
random suffixes); profile edits return 409 rather than silently changing the
chosen name. Previous names are reserved to their owner for exactly 720 hours;
deleting that account erases its history and reservation. History is admin-only.
Avatar IDs are 0–11; colours are the five Clay & Pine palette values. Units are
km/mi; bio is at most 140 code points; homeRegionId must identify a current region.

Privacy defaults are PRIVATE, excluded from leaderboards and routes hidden.
`shareRouteShapes` is the inverse of existing `hide_route`; no duplicate column.
PUBLIC is viewable by everyone, FOLLOWERS by the owner and followers, PRIVATE by
the owner only. Following someone is not the same as being followed. Admin has
no implicit profile-view bypass. `mapIdentity` keeps the ownership ID and masks
the name to Runner; `leaderboardIdentity` also respects opt-out. Actual map and
leaderboard reads arrive in step 05 and must reuse these helpers.

Set `LOCATION_CONSENT_VERSION`, `TERMS_VERSION` and `PRIVACY_POLICY_VERSION`
(default `2026-11-13`, safe 1–32-character labels), and bump the applicable label
when changing notice text. Before accepting after an earlier recorded state,
send that notice's `etag` from GET as the `If-Match` header. Exact latest-state
retries are no-ops; stale acceptance cannot undo a newer withdrawal. Withdrawal
is always allowed, including an older text version. History uses identity order
and a database timestamp taken after the user lock. `recordingPermission` checks
all current versions; `locationAcceptedAt` evaluates the applicable consent at a
point's time. Neither helper trusts a future recording client by itself: step 05
must validate point times and reject points captured after withdrawal. Old runs
are untouched by a policy bump.

Deletion verifies the password outside the transaction then rechecks the hash,
or verifies the Google token exactly as login plus iat within 300 seconds
(30 seconds future skew) and ownership of its exact Google sub. A matching email
alone never authorizes deletion. It serializes account work and team changes,
clears surviving prev_owner_id references and matching login attempts, scrubs
known aliases from surviving flag/notification text, transfers CAPTAIN to the
longest-standing member (joined_at, user_id tie-break), or disbands an empty
team. SystemRole is never promoted. Root deletion captures aliases before
cascades; the reviewed trigger alone redacts audit IDs/notes. It erases sessions,
PII, runs/points, consents/history and export keys atomically. A valid signed
access-token retry for an already removed account returns 204; other operations
remain rejected. No victim notification is created. After commit, registered
work is aborted and encrypted artifacts are unlinked. Development outbox messages
are also removed: a private owner-UUID/filename cleanup journal is prepared under the
account lock, and messages are deleted only after the root deletion commits.
Rollback keeps message bytes intact. New messages carry their owner's UUID;
legacy development copies are matched to that account's canonical email. Queued
verification/reset delivery takes the same account-work lock and rechecks the
user and token before publishing, so it cannot send after deletion. A failed
file cleanup can be retried by DELETE; startup/hourly cleanup also retries the
journal after checking the committed account state. Messages belonging to other
accounts are preserved. SMTP mailbox copies already delivered are outside the
app's control. Future workers must take
`lockAccountWork` and recheck the user before publication, including across API
processes. Actual ACTIVE recording and claim jobs are deferred to step 05.

Exports contain only explicitly selected own fields, runs/points, consents,
flags, team membership/catalog and notifications. Other runners use Runner;
flag and notification free text is omitted; notification titles are neutral. No other
user coordinates, member lists, invite codes, push tokens, passwords, hashes,
session credentials or export keys are included. JSON is encrypted with
AES-256-GCM before writing to private `server/storage/exports/<uuid>.enc`
(directory0700, files0600). Each random 32-byte key exists only in its owner's
cascading metadata row. Deletion destroys that key even if unlink fails. Export
creation/publication/download share the account-work lock with deletion; a
worker cannot publish after deletion. Startup and hourly cleanup erase expired
metadata/keys/files and orphan ciphertext; pending jobs restart on API startup.
One active PENDING/READY export is enforced by a partial unique index. Failed or
missing artifacts permit another request. Expiry is exactly 24 hours.

`PROFILE_WRITE_LIMIT` defaults to 30 per 15 minutes per operation/account;
`EXPORT_REQUEST_LIMIT` defaults to 3 per 15 minutes; deletion is 5 per 15 minutes.
The existing API/IP limits also apply. These limits and background queues are
per process, not a distributed worker service. Large exports currently build in
memory. Production deployment needs storage sizing, backup retention and a
shared queue/rate limiter as traffic grows. Deletion removes live data; existing
operator backups and copies already shared outside the app need their own
retention policy. Real SMTP delivery is still unverified.

Run the guarded proofs (Postgres already running, disposable *_test DBs only):

```sh
node server/scripts/reset-test-databases.js all
npm test --prefix server
npm run test:api --prefix server
node server/scripts/profile-proof.js
```

The curl helper uses a finite temporary listener and removes its test account
and private artifacts. Automated Google and mail verifiers stay mocked. Start
or stop the actual development services only in the owner's Terminal.
