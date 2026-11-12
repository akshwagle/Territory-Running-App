# Auth complete — step 02 implementation and verification

Branch: feat/auth-complete. PR #6 was confirmed MERGED on GitHub before
`git checkout main && git pull`; all 149 source/private fingerprints were
preserved during that transition. The real GOOGLE_WEB_CLIENT_ID remains
in ignored server/.env, unchanged and unprinted.

## Revised database decision: reuse auth_tokens

The discarded action-token migration was never applied and has been deleted.
schema.prisma matches main exactly. Table count remains **27**. No new table,
column, enum, constraint, index, migration or rollback was introduced.

Verification/reset rows live in auth_tokens using EMAIL_VERIFY/PASSWORD_RESET.
Each contains a unique SHA-256 token_hash, expires_at, used_at, created_at and
ip_hash; family_id stays null, as the existing CHECK requires. Verification
lasts 24 hours and reset 30 minutes. A new request marks earlier unused tokens
of the same kind/user used_at. User-row locking and single-use checks protect
concurrent requests/confirmations. Existing users.verified_at is reused.

## Approved access contract and Google rules

- Access payload exactly sub,sid,iat,exp; sid is the refresh-family UUID.
- One middleware query combines user status and the indexed active-family check.
  Revoked families invalidate otherwise valid access JWTs immediately.
- Missing sid and extra/tampered claims are 401. No migration for old access JWTs.
- Password change retains current sid and revokes every other family. Password
  reset revokes every family. Session listing sets current:true for current sid.
- Google library verification is wrapped and injectable. All automated tests use
  a fake client ID and mocked verifier/library client; no live Google calls.
- Returning Google identities match (GOOGLE,sub). Automatic verified-password
  linking/unverified-password takeover requires authoritative Gmail or signed hd.
- Unverified takeover clears the password, removes its inactive PASSWORD method,
  revokes prior families/pending action tokens and attaches Google atomically.
- Non-authoritative password-account collision returns ACCOUNT_LINK_REQUIRED
  without state changes; Google-only collisions with a different sub are generic.
- Explicit authenticated POST /api/auth/google/link never moves another user's
  subject; unused subjects may link even with a differing email. Same-user links
  are idempotent; distinct subjects with the same email are not merged.
- GET /api/auth/identities and session list/revoke are scoped to the current user.

## Mail, configuration and operational limits

Native scrypt and exact-pinned Zod/jose remain. Added only google-auth-library
11.3.4 and nodemailer 10.5.0; Node baseline is >=22.12.0, verified 22.19.0.
npm reported zero audit vulnerabilities (one transitive node-domexception
deprecation notice; no extra dependency was added to silence it).

SMTP requires TLS, suppresses library logs/debug and uses bounded timeouts.
Development outbox files are private and ignored in .local/mail-outbox/.
Forgot requests perform the same fixed 250ms response path without looking up
the account; lookup/issuance/delivery are queued only after the generic 202 ends.
The 256-task mail queue is process-local/non-durable; failed jobs require retry.
Rate limits are independent per route/account/email, with a global IP backstop;
they need shared storage before multi-instance production deployment.

REQUIRE_VERIFIED_EMAIL_FOR_RUNS defaults true in production, false in development;
it is configuration for future run endpoints, not an implemented running feature.
Verification/reset pages and app deep links remain for steps 11/03 respectively.
Links never issue a session. Error/status applicability follows the resource:
public credential endpoints have no missing-session requirement; owned sessions
hide unknown/other-owner IDs behind the same 404. Existing auth status codes
are tested for protected routes, including suspended accounts.

## Real automated output

The first parallel run hit the existing 30s seed-test deadline; the independent
DB rerun below passed without changing that timeout or seed code. The API suite
below is the final run after the added independent-limit/Google-race/helper tests.

### Database tests
```text

> territory-running-database@0.1.0 test
> node --test --test-concurrency=1 db-tests/*.test.js

TAP version 13
# Subtest: Phase 1 creates exactly 26 tables; auth upgrade creates exactly 27 application tables
ok 1 - Phase 1 creates exactly 26 tables; auth upgrade creates exactly 27 application tables
  ---
  duration_ms: 48332.976917
  type: 'test'
  ...
# Verified application table count: Phase 1 = 26; Phase 4 auth = 27
# Subtest: auth migration backfills identities and revokes legacy refresh rows without changing password-reset rows
ok 2 - auth migration backfills identities and revokes legacy refresh rows without changing password-reset rows
  ---
  duration_ms: 2.635375
  type: 'test'
  ...
# Subtest: auth identities enforce provider/subject uniqueness and user FK; nullable password has no SQL identity CHECK
ok 3 - auth identities enforce provider/subject uniqueness and user FK; nullable password has no SQL identity CHECK
  ---
  duration_ms: 15.221
  type: 'test'
  ...
# Subtest: auth refresh family, rotation and grace CHECKs reject invalid states; hashes are unique and successor FK is enforced
ok 4 - auth refresh family, rotation and grace CHECKs reject invalid states; hashes are unique and successor FK is enforced
  ---
  duration_ms: 27.643583
  type: 'test'
  ...
# Subtest: verification/reset reuse auth_tokens with null families, unique hashes, atomic single use and cascading deletion
ok 5 - verification/reset reuse auth_tokens with null families, unique hashes, atomic single use and cascading deletion
  ---
  duration_ms: 10.785459
  type: 'test'
  ...
# Subtest: AUTH-01 unique lower(email) expression index is valid and active alongside the original lowercase CHECK
ok 6 - AUTH-01 unique lower(email) expression index is valid and active alongside the original lowercase CHECK
  ---
  duration_ms: 1.832625
  type: 'test'
  ...
# Subtest: all 27 tables match the independent column, type and nullability contract
ok 7 - all 27 tables match the independent column, type and nullability contract
  ---
  duration_ms: 9.452125
  type: 'test'
  ...
# Subtest: all eleven enums match the specified values and order
ok 8 - all eleven enums match the specified values and order
  ---
  duration_ms: 1.539833
  type: 'test'
  ...
# Subtest: UUID defaults, timestamp defaults, identity columns and all explicit defaults match the spec
ok 9 - UUID defaults, timestamp defaults, identity columns and all explicit defaults match the spec
  ---
  duration_ms: 2.42825
  type: 'test'
  ...
# Subtest: all primary/unique keys, ordinary indexes and both partial unique indexes match the spec
ok 10 - all primary/unique keys, ordinary indexes and both partial unique indexes match the spec
  ---
  duration_ms: 2.726375
  type: 'test'
  ...
# Subtest: all foreign keys and delete actions match, with no foreign keys on deliberate history/standalone fields
ok 11 - all foreign keys and delete actions match, with no foreign keys on deliberate history/standalone fields
  ---
  duration_ms: 0.86875
  type: 'test'
  ...
# Subtest: populated test database guard refuses reuse without changing any data
ok 12 - populated test database guard refuses reuse without changing any data
  ---
  duration_ms: 1.119125
  type: 'test'
  ...
# Subtest: duplicate run upload and duplicate point chunk are rejected; other users may reuse a client ID
ok 13 - duplicate run upload and duplicate point chunk are rejected; other users may reuse a client ID
  ---
  duration_ms: 6.3465
  type: 'test'
  ...
# Subtest: follows rejects self-follow and duplicate edges while accepting a real follow
ok 14 - follows rejects self-follow and duplicate edges while accepting a real follow
  ---
  duration_ms: 7.353208
  type: 'test'
  ...
# Subtest: only one ACTIVE season is permitted, including updates; multiple UPCOMING/ENDED seasons are allowed
ok 15 - only one ACTIVE season is permitted, including updates; multiple UPCOMING/ENDED seasons are allowed
  ---
  duration_ms: 10.285167
  type: 'test'
  ...
# Subtest: one CAPTAIN per team and one team_members row per runner are enforced
ok 16 - one CAPTAIN per team and one team_members row per runner are enforced
  ---
  duration_ms: 10.768666
  type: 'test'
  ...
# Subtest: runs rejects non-increasing times, negative distance and non-positive duration
ok 17 - runs rejects non-increasing times, negative distance and non-positive duration
  ---
  duration_ms: 12.825167
  type: 'test'
  ...
# Subtest: lowercase email, positive badge threshold and season time CHECK constraints reject invalid writes
ok 18 - lowercase email, positive badge threshold and season time CHECK constraints reject invalid writes
  ---
  duration_ms: 17.421833
  type: 'test'
  ...
# Subtest: reporter reason CHECK and SET NULL references on zone/reporter/resolver deletion work
ok 19 - reporter reason CHECK and SET NULL references on zone/reporter/resolver deletion work
  ---
  duration_ms: 10.759542
  type: 'test'
  ...
# Subtest: user deletion cascades dependent data but preserves audit and another runner’s prev_owner_id history
ok 20 - user deletion cascades dependent data but preserves audit and another runner’s prev_owner_id history
  ---
  duration_ms: 4.79725
  type: 'test'
  ...
# Subtest: admin_actions is append-only: UPDATE, DELETE and TRUNCATE are rejected by PostgreSQL
ok 21 - admin_actions is append-only: UPDATE, DELETE and TRUNCATE are rejected by PostgreSQL
  ---
  duration_ms: 7.285542
  type: 'test'
  ...
# Subtest: 10-runner concurrency: one winner for an unowned/expired hex; live cooldown cannot be stolen; no errors/deadlocks
ok 22 - 10-runner concurrency: one winner for an unowned/expired hex; live cooldown cannot be stolen; no errors/deadlocks
  ---
  duration_ms: 18.142375
  type: 'test'
  ...
# Subtest: two-connection batch concurrency: sorted h3_index claims finish with one owner per hex and no errors/deadlocks
ok 23 - two-connection batch concurrency: sorted h3_index claims finish with one owner per hex and no errors/deadlocks
  ---
  duration_ms: 8.8565
  type: 'test'
  ...
# Subtest: Prisma maintains updated_at on users, user_stats and game_settings
ok 24 - Prisma maintains updated_at on users, user_stats and game_settings
  ---
  duration_ms: 17.417916
  type: 'test'
  ...
# Subtest: seed runs twice idempotently: scrypt admin/identity, correct defaults/badges, stable dates, preserved tuning and no fake runs
ok 25 - seed runs twice idempotently: scrypt admin/identity, correct defaults/badges, stable dates, preserved tuning and no fake runs
  ---
  duration_ms: 536.636333
  type: 'test'
  ...
# Subtest: test guard rejects identical URLs before connecting
ok 26 - test guard rejects identical URLs before connecting
  ---
  duration_ms: 0.759666
  type: 'test'
  ...
# Subtest: test guard rejects the same database through different credentials, host aliases and schemas
ok 27 - test guard rejects the same database through different credentials, host aliases and schemas
  ---
  duration_ms: 0.183208
  type: 'test'
  ...
# Subtest: test guard rejects migration database reuse, missing URLs and connection overrides
ok 28 - test guard rejects migration database reuse, missing URLs and connection overrides
  ---
  duration_ms: 0.192167
  type: 'test'
  ...
1..28
# tests 28
# suites 0
# pass 28
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 49162.956208
```

### API tests (Google mocked)
```text

> territory-running-database@0.1.0 test:api
> node --test --test-concurrency=1 api-tests/*.test.js

TAP version 13
# Subtest: health returns 200 after a real database query
ok 1 - health returns 200 after a real database query
  ---
  duration_ms: 941.093833
  type: 'test'
  ...
# Subtest: health returns the specified 503 envelope when the database is unreachable
ok 2 - health returns the specified 503 envelope when the database is unreachable
  ---
  duration_ms: 6.863791
  type: 'test'
  ...
# Subtest: latest returns the standard NO_RELEASE error when empty
ok 3 - latest returns the standard NO_RELEASE error when empty
  ---
  duration_ms: 3.847709
  type: 'test'
  ...
# Subtest: latest selects highest active version code and ignores a newer inactive release
ok 4 - latest selects highest active version code and ignores a newer inactive release
  ---
  duration_ms: 5.531834
  type: 'test'
  ...
# Subtest: APK GET and HEAD have Android content type and attachment headers
ok 5 - APK GET and HEAD have Android content type and attachment headers
  ---
  duration_ms: 3.635875
  type: 'test'
  ...
# Subtest: downloads reject traversal, encoded forms, malformed encodings, non-APK files and directories
ok 6 - downloads reject traversal, encoded forms, malformed encodings, non-APK files and directories
  ---
  duration_ms: 7.647542
  type: 'test'
  ...
# Subtest: CORS permits all configured web/Capacitor origins and rejects an unlisted origin
ok 7 - CORS permits all configured web/Capacitor origins and rejects an unlisted origin
  ---
  duration_ms: 3.950917
  type: 'test'
  ...
# Subtest: rate limits and unexpected database failures use standard errors without secret details
ok 8 - rate limits and unexpected database failures use standard errors without secret details
  ---
  duration_ms: 4.19775
  type: 'test'
  ...
# Subtest: request logs exclude query strings, credentials, headers and filenames
ok 9 - request logs exclude query strings, credentials, headers and filenames
  ---
  duration_ms: 1.080458
  type: 'test'
  ...
# Subtest: invalid startup environment and registration arguments fail clearly without echoing credentials
ok 10 - invalid startup environment and registration arguments fail clearly without echoing credentials
  ---
  duration_ms: 1.1655
  type: 'test'
  ...
# Subtest: register creates an atomic password identity and hashed session; login and /api/me return only public fields
ok 11 - register creates an atomic password identity and hashed session; login and /api/me return only public fields
  ---
  duration_ms: 260.640291
  type: 'test'
  ...
# Subtest: AUTH-01 simultaneous case/space variants create exactly one account and return generic duplicate failures
ok 12 - AUTH-01 simultaneous case/space variants create exactly one account and return generic duplicate failures
  ---
  duration_ms: 165.267542
  type: 'test'
  ...
# Subtest: registration rolls back the user when identity creation conflicts; no account without an identity is left behind
ok 13 - registration rolls back the user when identity creation conflicts; no account without an identity is left behind
  ---
  duration_ms: 253.978917
  type: 'test'
  ...
# Subtest: the general API limiter still covers auth and /api/me in addition to the stricter auth limits
ok 14 - the general API limiter still covers auth and /api/me in addition to the stricter auth limits
  ---
  duration_ms: 134.570584
  type: 'test'
  ...
# Subtest: duplicate registration, wrong password and unknown email have identical generic error responses
ok 15 - duplicate registration, wrong password and unknown email have identical generic error responses
  ---
  duration_ms: 47688.12025
  type: 'test'
  ...
# Subtest: weak passwords, unknown fields, missing bodies, malformed JSON and oversized bodies are rejected without writes
ok 16 - weak passwords, unknown fields, missing bodies, malformed JSON and oversized bodies are rejected without writes
  ---
  duration_ms: 13.025625
  type: 'test'
  ...
# Subtest: strict auth rate limits normalize IP/email keys and an IP backstop covers changing emails
ok 17 - strict auth rate limits normalize IP/email keys and an IP backstop covers changing emails
  ---
  duration_ms: 528.367708
  type: 'test'
  ...
# Subtest: /api/me rejects missing, malformed, incorrectly signed, expired and extra-claim access tokens
ok 18 - /api/me rejects missing, malformed, incorrectly signed, expired and extra-claim access tokens
  ---
  duration_ms: 135.779792
  type: 'test'
  ...
# Subtest: AUTH-02 two simultaneous refreshes rotate once and return the identical HMAC successor; one grace redemption only
ok 19 - AUTH-02 two simultaneous refreshes rotate once and return the identical HMAC successor; one grace redemption only
  ---
  duration_ms: 145.425167
  type: 'test'
  ...
# Subtest: AUTH-02 grace retry after a simulated process restart recovers the exact successor using only persisted hashes and UUID
ok 20 - AUTH-02 grace retry after a simulated process restart recovers the exact successor using only persisted hashes and UUID
  ---
  duration_ms: 310.871541
  type: 'test'
  ...
# Subtest: AUTH-02 retry after the grace window revokes the whole family and rejects its current successor
ok 21 - AUTH-02 retry after the grace window revokes the whole family and rejects its current successor
  ---
  duration_ms: 140.822625
  type: 'test'
  ...
# Subtest: AUTH-02 a different parent token cannot redeem grace; a changed derivation secret fails closed
ok 22 - AUTH-02 a different parent token cannot redeem grace; a changed derivation secret fails closed
  ---
  duration_ms: 138.903959
  type: 'test'
  ...
# Subtest: logout revokes only its family, is idempotent and prevents refreshing descendants
ok 23 - logout revokes only its family, is idempotent and prevents refreshing descendants
  ---
  duration_ms: 274.040458
  type: 'test'
  ...
# Subtest: refresh rejects malformed and expired tokens
ok 24 - refresh rejects malformed and expired tokens
  ---
  duration_ms: 135.207459
  type: 'test'
  ...
# Subtest: AUTH-05 server Date, expiresIn and JWT expiry ignore a phone clock hours ahead or behind
ok 25 - AUTH-05 server Date, expiresIn and JWT expiry ignore a phone clock hours ahead or behind
  ---
  duration_ms: 136.800958
  type: 'test'
  ...
# Subtest: AUTH-11 email edge forms normalize consistently and unsafe or reserved display names are rejected
ok 26 - AUTH-11 email edge forms normalize consistently and unsafe or reserved display names are rejected
  ---
  duration_ms: 394.448042
  type: 'test'
  ...
# Subtest: AUTH-12 suspended or deletion-requested accounts cannot refresh or use /api/me and receive specific codes
ok 27 - AUTH-12 suspended or deletion-requested accounts cannot refresh or use /api/me and receive specific codes
  ---
  duration_ms: 259.324625
  type: 'test'
  ...
# Subtest: legacy bcrypt passwords upgrade to scrypt on login without losing the password identity
ok 28 - legacy bcrypt passwords upgrade to scrypt on login without losing the password identity
  ---
  duration_ms: 692.754708
  type: 'test'
  ...
# Subtest: auth logs exclude passwords, refresh/access/ID tokens, hashes, authorization and supplied URLs on success and failure
ok 29 - auth logs exclude passwords, refresh/access/ID tokens, hashes, authorization and supplied URLs on success and failure
  ---
  duration_ms: 421.324333
  type: 'test'
  ...
# Subtest: sid is signed, required, bound to its user and checked with user status in one indexed-family query
ok 30 - sid is signed, required, bound to its user and checked with user status in one indexed-family query
  ---
  duration_ms: 368.800917
  type: 'test'
  ...
# Subtest: verification uses EMAIL_VERIFY for 24 hours, resend invalidates only earlier unused verification tokens and confirmation never signs in
ok 31 - verification uses EMAIL_VERIFY for 24 hours, resend invalidates only earlier unused verification tokens and confirmation never signs in
  ---
  duration_ms: 238.821083
  type: 'test'
  ...
# Subtest: forgot has the same 202 body and fixed response path for known/unknown email; reset expires in 30 minutes and resend invalidates earlier links
ok 32 - forgot has the same 202 body and fixed response path for known/unknown email; reset expires in 30 minutes and resend invalidates earlier links
  ---
  duration_ms: 298.4845
  type: 'test'
  ...
# Subtest: AUTH-10 expired, replaced, used and wrong-purpose links give a next step; a different signed-in account cannot consume a link
ok 33 - AUTH-10 expired, replaced, used and wrong-purpose links give a next step; a different signed-in account cannot consume a link
  ---
  duration_ms: 1808.866625
  type: 'test'
  ...
# Subtest: password reset verifies the mailbox, replaces credentials and immediately revokes every access/refresh family
ok 34 - password reset verifies the mailbox, replaces credentials and immediately revokes every access/refresh family
  ---
  duration_ms: 1750.459333
  type: 'test'
  ...
# Subtest: password change retains the current sid family and kills all other sessions immediately
ok 35 - password change retains the current sid family and kills all other sessions immediately
  ---
  duration_ms: 1460.996958
  type: 'test'
  ...
# Subtest: Google sign-in validates mocked audience, issuer, expiry, verified email and stable sub without live verification
ok 36 - Google sign-in validates mocked audience, issuer, expiry, verified email and stable sub without live verification
  ---
  duration_ms: 15.667333
  type: 'test'
  ...
# Subtest: authoritative Gmail/Workspace Google identities link verified password accounts without changing their password
ok 37 - authoritative Gmail/Workspace Google identities link verified password accounts without changing their password
  ---
  duration_ms: 446.021292
  type: 'test'
  ...
# Subtest: authoritative Google takeover removes an unverified password credential and revokes all pre-registered sessions
ok 38 - authoritative Google takeover removes an unverified password credential and revokes all pre-registered sessions
  ---
  duration_ms: 379.377334
  type: 'test'
  ...
# Subtest: non-authoritative Google collision returns ACCOUNT_LINK_REQUIRED with no state changes; password login then explicit link succeeds
ok 39 - non-authoritative Google collision returns ACCOUNT_LINK_REQUIRED with no state changes; password login then explicit link succeeds
  ---
  duration_ms: 351.118
  type: 'test'
  ...
# Subtest: Google subjects never move between users or merge by email; linking is authenticated and an unused differing email may be linked explicitly
ok 40 - Google subjects never move between users or merge by email; linking is authenticated and an unused differing email may be linked explicitly
  ---
  duration_ms: 336.900584
  type: 'test'
  ...
# Subtest: Google-only users set their first password using a mailbox reset link
ok 41 - Google-only users set their first password using a mailbox reset link
  ---
  duration_ms: 285.111125
  type: 'test'
  ...
# Subtest: parallel first Google sign-ins create one identity/user; a subject cannot be linked concurrently to two users
ok 42 - parallel first Google sign-ins create one identity/user; a subject cannot be linked concurrently to two users
  ---
  duration_ms: 258.360417
  type: 'test'
  ...
# Subtest: sessions list marks the current family, excludes other users and revocation is owned, idempotent and immediate
ok 43 - sessions list marks the current family, excludes other users and revocation is owned, idempotent and immediate
  ---
  duration_ms: 348.400542
  type: 'test'
  ...
# Subtest: new protected endpoints reject missing/bad auth, invalid bodies/params and unknown query fields
ok 44 - new protected endpoints reject missing/bad auth, invalid bodies/params and unknown query fields
  ---
  duration_ms: 124.785334
  type: 'test'
  ...
# Subtest: separate per-email action limits do not consume other endpoint budgets
ok 45 - separate per-email action limits do not consume other endpoint budgets
  ---
  duration_ms: 128.739083
  type: 'test'
  ...
# Subtest: complete auth logs never include emails, Google ID/access/refresh/action tokens, passwords or hashes
ok 46 - complete auth logs never include emails, Google ID/access/refresh/action tokens, passwords or hashes
  ---
  duration_ms: 347.436125
  type: 'test'
  ...
# Subtest: confirmation, reset, change and session deletion each enforce an independent per-account write limit
ok 47 - confirmation, reset, change and session deletion each enforce an independent per-account write limit
  ---
  duration_ms: 47556.16975
  type: 'test'
  ...
# Subtest: new account resources reject suspended sessions and identity lists never expose another user’s methods
ok 48 - new account resources reject suspended sessions and identity lists never expose another user’s methods
  ---
  duration_ms: 257.36
  type: 'test'
  ...
# Subtest: release registration copies exact bytes, hashes them and idempotently upserts without deactivating older releases
ok 49 - release registration copies exact bytes, hashes them and idempotently upserts without deactivating older releases
  ---
  duration_ms: 8.263417
  type: 'test'
  ...
# Subtest: Google library adapter forwards the audience and ID token to a mocked verifier; claim checks reject invalid input
ok 50 - Google library adapter forwards the audience and ID token to a mocked verifier; claim checks reject invalid input
  ---
  duration_ms: 1.707959
  type: 'test'
  ...
# Subtest: SMTP mailer uses pinned nodemailer behind an injected transport with TLS and no logging
ok 51 - SMTP mailer uses pinned nodemailer behind an injected transport with TLS and no logging
  ---
  duration_ms: 0.240791
  type: 'test'
  ...
# Subtest: development outbox writes private messages and failure logs contain only fixed reason tags
ok 52 - development outbox writes private messages and failure logs contain only fixed reason tags
  ---
  duration_ms: 6.017458
  type: 'test'
  ...
# Subtest: verified-email run policy follows environment defaults and production SMTP/URL validation hides values
ok 53 - verified-email run policy follows environment defaults and production SMTP/URL validation hides values
  ---
  duration_ms: 0.531042
  type: 'test'
  ...
# Subtest: real-Google development helper has local-only CSRF-protected proxying without live Google requests or stored tokens
ok 54 - real-Google development helper has local-only CSRF-protected proxying without live Google requests or stored tokens
  ---
  duration_ms: 15.665875
  type: 'test'
  ...
# Subtest: auth startup requires two different secrets of at least 32 UTF-8 bytes without echoing values
ok 55 - auth startup requires two different secrets of at least 32 UTF-8 bytes without echoing values
  ---
  duration_ms: 4.553125
  type: 'test'
  ...
# Subtest: scrypt uses independent 16-byte salts, documented fixed costs and constant-time derived-key verification
ok 56 - scrypt uses independent 16-byte salts, documented fixed costs and constant-time derived-key verification
  ---
  duration_ms: 738.424958
  type: 'test'
  ...
# Subtest: AUTH-02 successor derivation binds exact parent, persisted UUID, domain and separate secret; hashes compare safely
ok 57 - AUTH-02 successor derivation binds exact parent, persisted UUID, domain and separate secret; hashes compare safely
  ---
  duration_ms: 0.722542
  type: 'test'
  ...
# Subtest: AUTH-11 email policy accepts 254 characters, rejects 255, preserves plus aliases and handles Unicode consistently
ok 58 - AUTH-11 email policy accepts 254 characters, rejects 255, preserves plus aliases and handles Unicode consistently
  ---
  duration_ms: 1.403333
  type: 'test'
  ...
1..58
# tests 58
# suites 0
# pass 58
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 111473.749542
```

### Web tests, lint and builds
```text

> territory-run-web@0.1.0 test
> vitest run


 RUN  v5.1.0 /Users/akshwagle/Desktop/Territory-Running-App/web


 Test Files  6 passed (6)
      Tests  30 passed (30)
   Start at  11:08:10
   Duration  2.76s (environment 75%, tests 13%, setup 8%, import 3%, transform 1%)

> territory-run-web@0.1.0 lint
> eslint .

> territory-run-web@0.1.0 build
> vite build && node scripts/bundle-sizes.js

vite v8.3.8 building client environment for production...
transforming...
✓ 434 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                                 2.05 kB │ gzip:  0.72 kB
dist/.vite/manifest.json                                        2.26 kB │ gzip:  0.44 kB
dist/assets/barlow-condensed-latin-800-normal-e9GbPXiK.woff    18.72 kB
dist/assets/barlow-latin-400-normal-fsAxiSwU.woff              19.58 kB
dist/assets/barlow-latin-600-normal-CNwfPWQD.woff              19.88 kB
dist/assets/barlow-latin-400-normal-qiz4-Cze.woff2             22.19 kB
dist/assets/barlow-condensed-latin-800-normal-BKzMuPgK.woff2   22.46 kB
dist/assets/barlow-latin-600-normal-DILqtrty.woff2             22.77 kB
dist/assets/index-CblHU49a.css                                 27.21 kB │ gzip:  6.59 kB
dist/assets/motion-features-DmRYqAga.js                        56.14 kB │ gzip: 19.76 kB
dist/assets/index-DBJdFU4m.js                                 258.23 kB │ gzip: 81.83 kB

✓ built in 1.38s

Gzip sizes (actual emitted bytes, all chunks counted):
  assets/index-CblHU49a.css: 6560 bytes
  assets/index-DBJdFU4m.js: 80994 bytes [mobile + desktop]
  assets/motion-features-DmRYqAga.js: 19599 bytes [desktop effect chunk]
Mobile JavaScript: 80994 bytes (80.99 kB gzip); limit 90000.
All JavaScript, including desktop effects: 100593 bytes (100.59 kB gzip).
All CSS: 6560 bytes (6.56 kB gzip); limit 15000.
Phones and reduced-motion sessions skip the dynamic effect chunk; see usePresentationMotion.js and its tests.
```

### Mobile build
```text

> territory-run-mobile@0.1.0 build
> vite build

vite v8.3.8 building client environment for production...
transforming...
✓ 15 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.36 kB │ gzip:  0.26 kB
dist/assets/index-rC_SXRVg.css    0.52 kB │ gzip:  0.30 kB
dist/assets/index-DDDnQGDx.js   220.30 kB │ gzip: 68.95 kB

✓ built in 680ms
```

No mobile test/lint script is configured. No server lint/build script is
configured (plain Node); all 30 server JavaScript files passed node --check.
Web/mobile source and private frontend env files are unchanged. No APK build
or physical-phone auth UI validation was claimed in this server-only step.

## Owner-run curl proof

The owner ran `node server/scripts/auth-proof.js` in Terminal and supplied the
following real output. The helper used the guarded API test database, mocked
Google/mail, redacted sensitive values, removed its fixture and closed its
temporary listener. This proves the HTTP flows, not live Google verification or
SMTP delivery. The current helper also saves a private redacted transcript to
ignored .local/auth-complete/curl-proof.log.

```text
Curl proof: API test database only; Google verifier and email delivery are mocked. http://127.0.0.1:53649
curl POST /api/auth/register -> HTTP 201
{"accessToken":"[REDACTED]","refreshToken":"[REDACTED]","expiresIn":900,"user":{"id":"0147676b-277e-4f2a-b5c6-e1c4dfc95cd7","email":"[REDACTED]","displayName":"Proof Runner","createdAt":"2026-11-12T05:41:08.355Z"}}
curl POST /api/auth/verify-email/request -> HTTP 202
{"message":"If verification is needed, an email will arrive shortly."}
curl POST /api/auth/verify-email/confirm -> HTTP 200
{"message":"Email verified. Return to the app; this link does not sign you in."}
curl POST /api/auth/password/forgot -> HTTP 202
{"message":"If an account exists, a password reset email will arrive shortly."}
curl POST /api/auth/password/reset -> HTTP 200
{"message":"Password updated. Sign in with your new password."}
curl GET /api/me -> HTTP 401
{"error":{"code":"UNAUTHORIZED","message":"This session has ended. Please sign in again."}}
curl POST /api/auth/login -> HTTP 200
{"accessToken":"[REDACTED]","refreshToken":"[REDACTED]","expiresIn":900,"user":{"id":"0147676b-277e-4f2a-b5c6-e1c4dfc95cd7","email":"[REDACTED]","displayName":"Proof Runner","createdAt":"2026-11-12T05:41:08.355Z"}}
curl POST /api/auth/google/link -> HTTP 200
{"identities":[{"id":"765413c1-4eb9-46b2-ba68-8fdfd07b42c5","provider":"PASSWORD","emailAtSignup":"[REDACTED]","createdAt":"2026-11-12T05:41:08.355Z","lastUsedAt":"2026-11-12T05:41:08.945Z"},{"id":"fdd7e2ed-2918-4302-9ce8-343f8517943d","provider":"GOOGLE","emailAtSignup":"[REDACTED]","createdAt":"2026-11-12T05:41:08.962Z","lastUsedAt":"2026-11-12T05:41:08.961Z"}]}
curl GET /api/auth/identities -> HTTP 200
{"identities":[{"id":"765413c1-4eb9-46b2-ba68-8fdfd07b42c5","provider":"PASSWORD","emailAtSignup":"[REDACTED]","createdAt":"2026-11-12T05:41:08.355Z","lastUsedAt":"2026-11-12T05:41:08.945Z"},{"id":"fdd7e2ed-2918-4302-9ce8-343f8517943d","provider":"GOOGLE","emailAtSignup":"[REDACTED]","createdAt":"2026-11-12T05:41:08.962Z","lastUsedAt":"2026-11-12T05:41:08.961Z"}]}
curl POST /api/auth/password/change -> HTTP 200
{"message":"Password changed. Other sessions have been signed out."}
curl GET /api/me -> HTTP 200
{"id":"0147676b-277e-4f2a-b5c6-e1c4dfc95cd7","email":"[REDACTED]","displayName":"Proof Runner","createdAt":"2026-11-12T05:41:08.355Z"}
curl GET /api/auth/sessions -> HTTP 200
{"sessions":[{"id":"c5673e14-1344-47a0-8b9f-5f913cb954dc","createdAt":"2026-11-12T05:41:08.945Z","lastUsedAt":"2026-11-12T05:41:08.945Z","deviceLabel":"Device / Browser","current":true}]}
curl DELETE /api/auth/sessions/c5673e14-1344-47a0-8b9f-5f913cb954dc -> HTTP 204
(empty body)
curl GET /api/me -> HTTP 401
{"error":{"code":"UNAUTHORIZED","message":"This session has ended. Please sign in again."}}
curl POST /api/auth/google -> HTTP 200
{"accessToken":"[REDACTED]","refreshToken":"[REDACTED]","expiresIn":900,"user":{"id":"0147676b-277e-4f2a-b5c6-e1c4dfc95cd7","email":"[REDACTED]","displayName":"Proof Runner","createdAt":"2026-11-12T05:41:08.355Z"}}
curl POST /api/auth/logout -> HTTP 204
(empty body)
AUTH COMPLETE CURL PROOF PASSED. No real Google flow or SMTP delivery was exercised.
Proof account removed; temporary proof listener closed.
```

## Real Google try-out

`npm run auth:google:try --prefix server` is an owner-run, loopback-only helper.
Authorize http://localhost:5174 in the Web OAuth client's JavaScript origins,
start the real API in another Terminal, then open that URL and choose a test
Google account. The helper checks /api/auth/google and /api/me and can end
the family. It never displays/logs the client ID or tokens and never persists
tokens in browser storage. It has fake-only proxy/CSRF/host tests.

**A real Google sign-in and actual SMTP delivery remain untested end to end.**
See server/README.md for the exact commands and setup. No long-running service
has been started or stopped by the agent; the owner controls those commands.

## Five logical commits after removing the obsolete schema commit

1. test(db): cover verification and reset tokens in auth_tokens
2. feat(api): mailer with SMTP and outbox
3. feat(api): email verification and password reset
4. feat(api): Google sign-in and account linking
5. feat(api): session list and revoke, tests and docs

Shared config/validation/session foundations precede their endpoints; route,
app and package script portions were staged with index-only patches. The owner-run
curl proof passed before the final tests/docs/session commit. No .env, .local,
build output, key material or APK is included in these commits.
