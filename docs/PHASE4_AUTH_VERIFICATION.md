# Phase 4 step 1 — authentication verification

All work is in `/Users/akshwagle/Desktop/Territory-Running-App`, on the existing
`feat/web-landing-page` branch. No staging, commits, branch switching, push or PR.
Development received only the reviewed migration; all automated/live HTTP tests
used the guarded disposable databases. The migration file is unchanged since approval.

## Development migration

The repository lifecycle script actually ran:
```text
waiting for server to start.... done
server started
127.0.0.1:55432 - accepting connections
```

Actual `npm run db:migrate --prefix server` output excerpt (routine notices omitted):
```text
> territory-running-database@0.1.0 db:migrate
> prisma migrate deploy

Datasource "db": PostgreSQL database "territory", schema "public" at "127.0.0.1:55432"

2 migrations found in prisma/migrations

Applying migration `20261112000000_auth_foundation`

The following migration(s) have been applied:

migrations/
  └─ 20261112000000_auth_foundation/
    └─ migration.sql

All migrations have been successfully applied.
```

Actual read-only development verification:
```text
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> '_prisma_migrations';
{ count: '27' }
[
  {
    migration_name: '20261111000000_init',
    applied: true,
    not_rolled_back: true
  },
  {
    migration_name: '20261112000000_auth_foundation',
    applied: true,
    not_rolled_back: true
  }
]
```

`npm run db:generate --prefix server` regenerated Prisma Client 6.19.3.
The original Phase 1 migration is unchanged. Only the new identity table is added;
the three reviewed auth CHECKs and lower(email) expression index are in raw SQL.

## Database suite — real output

`node server/scripts/reset-test-databases.js all` recreated only `territory_test`
and `territory_api_test` after URL/name guards. The DB suite proves Phase 1's 26
tables before applying the auth upgrade, then verifies all 27 final tables.
```text

> territory-running-database@0.1.0 test
> node --test --test-concurrency=1 db-tests/*.test.js

TAP version 13
# Subtest: Phase 1 creates exactly 26 tables; auth upgrade creates exactly 27 application tables
ok 1 - Phase 1 creates exactly 26 tables; auth upgrade creates exactly 27 application tables
  ---
  duration_ms: 1465.467875
  type: 'test'
  ...
# Verified application table count: Phase 1 = 26; Phase 4 auth = 27
# Subtest: auth migration backfills identities and revokes legacy refresh rows without changing password-reset rows
ok 2 - auth migration backfills identities and revokes legacy refresh rows without changing password-reset rows
  ---
  duration_ms: 2.472333
  type: 'test'
  ...
# Subtest: auth identities enforce provider/subject uniqueness and user FK; nullable password has no SQL identity CHECK
ok 3 - auth identities enforce provider/subject uniqueness and user FK; nullable password has no SQL identity CHECK
  ---
  duration_ms: 13.262542
  type: 'test'
  ...
# Subtest: auth refresh family, rotation and grace CHECKs reject invalid states; hashes are unique and successor FK is enforced
ok 4 - auth refresh family, rotation and grace CHECKs reject invalid states; hashes are unique and successor FK is enforced
  ---
  duration_ms: 27.835208
  type: 'test'
  ...
# Subtest: AUTH-01 unique lower(email) expression index is valid and active alongside the original lowercase CHECK
ok 5 - AUTH-01 unique lower(email) expression index is valid and active alongside the original lowercase CHECK
  ---
  duration_ms: 4.579417
  type: 'test'
  ...
# Subtest: all 27 tables match the independent column, type and nullability contract
ok 6 - all 27 tables match the independent column, type and nullability contract
  ---
  duration_ms: 9.781208
  type: 'test'
  ...
# Subtest: all eleven enums match the specified values and order
ok 7 - all eleven enums match the specified values and order
  ---
  duration_ms: 1.492333
  type: 'test'
  ...
# Subtest: UUID defaults, timestamp defaults, identity columns and all explicit defaults match the spec
ok 8 - UUID defaults, timestamp defaults, identity columns and all explicit defaults match the spec
  ---
  duration_ms: 1.901625
  type: 'test'
  ...
# Subtest: all primary/unique keys, ordinary indexes and both partial unique indexes match the spec
ok 9 - all primary/unique keys, ordinary indexes and both partial unique indexes match the spec
  ---
  duration_ms: 2.653541
  type: 'test'
  ...
# Subtest: all foreign keys and delete actions match, with no foreign keys on deliberate history/standalone fields
ok 10 - all foreign keys and delete actions match, with no foreign keys on deliberate history/standalone fields
  ---
  duration_ms: 1.076125
  type: 'test'
  ...
# Subtest: populated test database guard refuses reuse without changing any data
ok 11 - populated test database guard refuses reuse without changing any data
  ---
  duration_ms: 0.897583
  type: 'test'
  ...
# Subtest: duplicate run upload and duplicate point chunk are rejected; other users may reuse a client ID
ok 12 - duplicate run upload and duplicate point chunk are rejected; other users may reuse a client ID
  ---
  duration_ms: 6.088417
  type: 'test'
  ...
# Subtest: follows rejects self-follow and duplicate edges while accepting a real follow
ok 13 - follows rejects self-follow and duplicate edges while accepting a real follow
  ---
  duration_ms: 7.197875
  type: 'test'
  ...
# Subtest: only one ACTIVE season is permitted, including updates; multiple UPCOMING/ENDED seasons are allowed
ok 14 - only one ACTIVE season is permitted, including updates; multiple UPCOMING/ENDED seasons are allowed
  ---
  duration_ms: 10.264916
  type: 'test'
  ...
# Subtest: one CAPTAIN per team and one team_members row per runner are enforced
ok 15 - one CAPTAIN per team and one team_members row per runner are enforced
  ---
  duration_ms: 8.519375
  type: 'test'
  ...
# Subtest: runs rejects non-increasing times, negative distance and non-positive duration
ok 16 - runs rejects non-increasing times, negative distance and non-positive duration
  ---
  duration_ms: 14.251667
  type: 'test'
  ...
# Subtest: lowercase email, positive badge threshold and season time CHECK constraints reject invalid writes
ok 17 - lowercase email, positive badge threshold and season time CHECK constraints reject invalid writes
  ---
  duration_ms: 18.603459
  type: 'test'
  ...
# Subtest: reporter reason CHECK and SET NULL references on zone/reporter/resolver deletion work
ok 18 - reporter reason CHECK and SET NULL references on zone/reporter/resolver deletion work
  ---
  duration_ms: 12.071375
  type: 'test'
  ...
# Subtest: user deletion cascades dependent data but preserves audit and another runner’s prev_owner_id history
ok 19 - user deletion cascades dependent data but preserves audit and another runner’s prev_owner_id history
  ---
  duration_ms: 5.50075
  type: 'test'
  ...
# Subtest: admin_actions is append-only: UPDATE, DELETE and TRUNCATE are rejected by PostgreSQL
ok 20 - admin_actions is append-only: UPDATE, DELETE and TRUNCATE are rejected by PostgreSQL
  ---
  duration_ms: 8.345083
  type: 'test'
  ...
# Subtest: 10-runner concurrency: one winner for an unowned/expired hex; live cooldown cannot be stolen; no errors/deadlocks
ok 21 - 10-runner concurrency: one winner for an unowned/expired hex; live cooldown cannot be stolen; no errors/deadlocks
  ---
  duration_ms: 20.027083
  type: 'test'
  ...
# Subtest: two-connection batch concurrency: sorted h3_index claims finish with one owner per hex and no errors/deadlocks
ok 22 - two-connection batch concurrency: sorted h3_index claims finish with one owner per hex and no errors/deadlocks
  ---
  duration_ms: 8.661792
  type: 'test'
  ...
# Subtest: Prisma maintains updated_at on users, user_stats and game_settings
ok 23 - Prisma maintains updated_at on users, user_stats and game_settings
  ---
  duration_ms: 17.35525
  type: 'test'
  ...
# Subtest: seed runs twice idempotently: scrypt admin/identity, correct defaults/badges, stable dates, preserved tuning and no fake runs
ok 24 - seed runs twice idempotently: scrypt admin/identity, correct defaults/badges, stable dates, preserved tuning and no fake runs
  ---
  duration_ms: 538.073458
  type: 'test'
  ...
# Subtest: test guard rejects identical URLs before connecting
ok 25 - test guard rejects identical URLs before connecting
  ---
  duration_ms: 0.775375
  type: 'test'
  ...
# Subtest: test guard rejects the same database through different credentials, host aliases and schemas
ok 26 - test guard rejects the same database through different credentials, host aliases and schemas
  ---
  duration_ms: 0.171208
  type: 'test'
  ...
# Subtest: test guard rejects migration database reuse, missing URLs and connection overrides
ok 27 - test guard rejects migration database reuse, missing URLs and connection overrides
  ---
  duration_ms: 0.170917
  type: 'test'
  ...
1..27
# tests 27
# suites 0
# pass 27
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2341.855916
```

## API suite — real output

The final API rerun followed `node server/scripts/reset-test-databases.js api`.
This includes the original 11 API tests, all auth edge cases, a fresh-process
grace retry, transaction rollback and general/auth limiter coverage.
```text

> territory-running-database@0.1.0 test:api
> node --test --test-concurrency=1 api-tests/*.test.js

TAP version 13
# Subtest: health returns 200 after a real database query
ok 1 - health returns 200 after a real database query
  ---
  duration_ms: 656.108333
  type: 'test'
  ...
# Subtest: health returns the specified 503 envelope when the database is unreachable
ok 2 - health returns the specified 503 envelope when the database is unreachable
  ---
  duration_ms: 6.614208
  type: 'test'
  ...
# Subtest: latest returns the standard NO_RELEASE error when empty
ok 3 - latest returns the standard NO_RELEASE error when empty
  ---
  duration_ms: 4.188833
  type: 'test'
  ...
# Subtest: latest selects highest active version code and ignores a newer inactive release
ok 4 - latest selects highest active version code and ignores a newer inactive release
  ---
  duration_ms: 7.9145
  type: 'test'
  ...
# Subtest: APK GET and HEAD have Android content type and attachment headers
ok 5 - APK GET and HEAD have Android content type and attachment headers
  ---
  duration_ms: 3.8715
  type: 'test'
  ...
# Subtest: downloads reject traversal, encoded forms, malformed encodings, non-APK files and directories
ok 6 - downloads reject traversal, encoded forms, malformed encodings, non-APK files and directories
  ---
  duration_ms: 9.341208
  type: 'test'
  ...
# Subtest: CORS permits all configured web/Capacitor origins and rejects an unlisted origin
ok 7 - CORS permits all configured web/Capacitor origins and rejects an unlisted origin
  ---
  duration_ms: 4.099834
  type: 'test'
  ...
# Subtest: rate limits and unexpected database failures use standard errors without secret details
ok 8 - rate limits and unexpected database failures use standard errors without secret details
  ---
  duration_ms: 4.471042
  type: 'test'
  ...
# Subtest: request logs exclude query strings, credentials, headers and filenames
ok 9 - request logs exclude query strings, credentials, headers and filenames
  ---
  duration_ms: 1.101416
  type: 'test'
  ...
# Subtest: invalid startup environment and registration arguments fail clearly without echoing credentials
ok 10 - invalid startup environment and registration arguments fail clearly without echoing credentials
  ---
  duration_ms: 1.159042
  type: 'test'
  ...
# Subtest: register creates an atomic password identity and hashed session; login and /api/me return only public fields
ok 11 - register creates an atomic password identity and hashed session; login and /api/me return only public fields
  ---
  duration_ms: 281.154
  type: 'test'
  ...
# Subtest: AUTH-01 simultaneous case/space variants create exactly one account and return generic duplicate failures
ok 12 - AUTH-01 simultaneous case/space variants create exactly one account and return generic duplicate failures
  ---
  duration_ms: 167.48425
  type: 'test'
  ...
# Subtest: registration rolls back the user when identity creation conflicts; no account without an identity is left behind
ok 13 - registration rolls back the user when identity creation conflicts; no account without an identity is left behind
  ---
  duration_ms: 256.315917
  type: 'test'
  ...
# Subtest: the general API limiter still covers auth and /api/me in addition to the stricter auth limits
ok 14 - the general API limiter still covers auth and /api/me in addition to the stricter auth limits
  ---
  duration_ms: 131.334916
  type: 'test'
  ...
# Subtest: duplicate registration, wrong password and unknown email have identical generic error responses
ok 15 - duplicate registration, wrong password and unknown email have identical generic error responses
  ---
  duration_ms: 507.985917
  type: 'test'
  ...
# Subtest: weak passwords, unknown fields, missing bodies, malformed JSON and oversized bodies are rejected without writes
ok 16 - weak passwords, unknown fields, missing bodies, malformed JSON and oversized bodies are rejected without writes
  ---
  duration_ms: 7.734208
  type: 'test'
  ...
# Subtest: strict auth rate limits normalize IP/email keys and an IP backstop covers changing emails
ok 17 - strict auth rate limits normalize IP/email keys and an IP backstop covers changing emails
  ---
  duration_ms: 505.591375
  type: 'test'
  ...
# Subtest: /api/me rejects missing, malformed, incorrectly signed, expired and extra-claim access tokens
ok 18 - /api/me rejects missing, malformed, incorrectly signed, expired and extra-claim access tokens
  ---
  duration_ms: 132.582833
  type: 'test'
  ...
# Subtest: AUTH-02 two simultaneous refreshes rotate once and return the identical HMAC successor; one grace redemption only
ok 19 - AUTH-02 two simultaneous refreshes rotate once and return the identical HMAC successor; one grace redemption only
  ---
  duration_ms: 138.443166
  type: 'test'
  ...
# Subtest: AUTH-02 grace retry after a simulated process restart recovers the exact successor using only persisted hashes and UUID
ok 20 - AUTH-02 grace retry after a simulated process restart recovers the exact successor using only persisted hashes and UUID
  ---
  duration_ms: 277.794333
  type: 'test'
  ...
# Subtest: AUTH-02 retry after the grace window revokes the whole family and rejects its current successor
ok 21 - AUTH-02 retry after the grace window revokes the whole family and rejects its current successor
  ---
  duration_ms: 144.416292
  type: 'test'
  ...
# Subtest: AUTH-02 a different parent token cannot redeem grace; a changed derivation secret fails closed
ok 22 - AUTH-02 a different parent token cannot redeem grace; a changed derivation secret fails closed
  ---
  duration_ms: 136.109917
  type: 'test'
  ...
# Subtest: logout revokes only its family, is idempotent and prevents refreshing descendants
ok 23 - logout revokes only its family, is idempotent and prevents refreshing descendants
  ---
  duration_ms: 268.417917
  type: 'test'
  ...
# Subtest: refresh rejects malformed and expired tokens
ok 24 - refresh rejects malformed and expired tokens
  ---
  duration_ms: 130.793667
  type: 'test'
  ...
# Subtest: AUTH-05 server Date, expiresIn and JWT expiry ignore a phone clock hours ahead or behind
ok 25 - AUTH-05 server Date, expiresIn and JWT expiry ignore a phone clock hours ahead or behind
  ---
  duration_ms: 130.133375
  type: 'test'
  ...
# Subtest: AUTH-11 email edge forms normalize consistently and unsafe or reserved display names are rejected
ok 26 - AUTH-11 email edge forms normalize consistently and unsafe or reserved display names are rejected
  ---
  duration_ms: 401.605709
  type: 'test'
  ...
# Subtest: AUTH-12 suspended or deletion-requested accounts cannot refresh or use /api/me and receive specific codes
ok 27 - AUTH-12 suspended or deletion-requested accounts cannot refresh or use /api/me and receive specific codes
  ---
  duration_ms: 269.757542
  type: 'test'
  ...
# Subtest: legacy bcrypt passwords upgrade to scrypt on login without losing the password identity
ok 28 - legacy bcrypt passwords upgrade to scrypt on login without losing the password identity
  ---
  duration_ms: 702.055167
  type: 'test'
  ...
# Subtest: auth logs exclude passwords, refresh/access/ID tokens, hashes, authorization and supplied URLs on success and failure
ok 29 - auth logs exclude passwords, refresh/access/ID tokens, hashes, authorization and supplied URLs on success and failure
  ---
  duration_ms: 393.785375
  type: 'test'
  ...
# Subtest: release registration copies exact bytes, hashes them and idempotently upserts without deactivating older releases
ok 30 - release registration copies exact bytes, hashes them and idempotently upserts without deactivating older releases
  ---
  duration_ms: 9.550375
  type: 'test'
  ...
# Subtest: auth startup requires two different secrets of at least 32 UTF-8 bytes without echoing values
ok 31 - auth startup requires two different secrets of at least 32 UTF-8 bytes without echoing values
  ---
  duration_ms: 4.472583
  type: 'test'
  ...
# Subtest: scrypt uses independent 16-byte salts, documented fixed costs and constant-time derived-key verification
ok 32 - scrypt uses independent 16-byte salts, documented fixed costs and constant-time derived-key verification
  ---
  duration_ms: 765.254667
  type: 'test'
  ...
# Subtest: AUTH-02 successor derivation binds exact parent, persisted UUID, domain and separate secret; hashes compare safely
ok 33 - AUTH-02 successor derivation binds exact parent, persisted UUID, domain and separate secret; hashes compare safely
  ---
  duration_ms: 0.991083
  type: 'test'
  ...
# Subtest: AUTH-11 email policy accepts 254 characters, rejects 255, preserves plus aliases and handles Unicode consistently
ok 34 - AUTH-11 email policy accepts 254 characters, rejects 255, preserves plus aliases and handles Unicode consistently
  ---
  duration_ms: 1.500792
  type: 'test'
  ...
1..34
# tests 34
# suites 0
# pass 34
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6740.65025
```

## Startup and live curl — real output, tokens redacted

`npm start --prefix server` ran as a temporary process with explicit test secrets
and DATABASE_URL/DIRECT_URL targeting `territory_api_test`. Curl received sensitive
request values through stdin, not command-line arguments. The proof account was
removed and the temporary process shut down. The user's existing API was untouched.
```text
> territory-running-database@0.1.0 start
> node src/index.js

API listening at http://127.0.0.1:60548
Live curl target: territory_api_test only, http://127.0.0.1:60548
curl POST /api/auth/register -> HTTP 201
{"accessToken":"[REDACTED]","refreshToken":"[REDACTED]","expiresIn":900,"user":{"id":"35cc44d5-2523-43fc-885f-e23365770d09","email":"curl-proof-c600a954-e0e7-483e-833a-99b37605e4ce@example.test","displayName":"Curl Proof Runner","createdAt":"2026-11-11T22:07:04.876Z"}}
curl POST /api/auth/login -> HTTP 200
{"accessToken":"[REDACTED]","refreshToken":"[REDACTED]","expiresIn":900,"user":{"id":"35cc44d5-2523-43fc-885f-e23365770d09","email":"curl-proof-c600a954-e0e7-483e-833a-99b37605e4ce@example.test","displayName":"Curl Proof Runner","createdAt":"2026-11-11T22:07:04.876Z"}}
curl GET /api/me -> HTTP 200
{"id":"35cc44d5-2523-43fc-885f-e23365770d09","email":"curl-proof-c600a954-e0e7-483e-833a-99b37605e4ce@example.test","displayName":"Curl Proof Runner","createdAt":"2026-11-11T22:07:04.876Z"}
curl POST /api/auth/refresh -> HTTP 200
{"accessToken":"[REDACTED]","refreshToken":"[REDACTED]","expiresIn":900,"user":{"id":"35cc44d5-2523-43fc-885f-e23365770d09","email":"curl-proof-c600a954-e0e7-483e-833a-99b37605e4ce@example.test","displayName":"Curl Proof Runner","createdAt":"2026-11-11T22:07:04.876Z"}}
curl POST /api/auth/logout -> HTTP 204
(empty body)
curl POST /api/auth/refresh -> HTTP 401
{"error":{"code":"INVALID_REFRESH_TOKEN","message":"This session cannot be renewed. Please sign in again."}}
Live curl proof passed: register, login, me, refresh, logout and post-logout rejection.
Temporary API stopped; proof account removed from API test database.
API shutting down.
```

## Static checks and dependencies

Actual output:
```text
Syntax check passed: 20 JavaScript files; package JSON and lockfile parse successfully.
Lint script: not configured. Build script: not configured (plain Node.js server).
```

`git diff --check` passed. Prisma schema validation passed. Exact new dependencies:
`zod` 4.6.7 and `jose` 6.2.17. Runtime CommonJS Zod loading and jose HS256 sign/verify
passed on Node 22.19.0 with Express 5.3.0. npm reported zero audit vulnerabilities.

## Decisions and limits

- Native async scrypt: N=32768, r=8, p=3, 16-byte random salts, 32-byte key,
  64 MiB maxmem; constant-time key/hash comparisons. New admin hashes use scrypt;
  existing cost-12 bcrypt hashes upgrade only on successful login.
- Access tokens: jose HS256, exactly sub/iat/exp, 900 seconds. Refresh: 30 days;
  initial tokens are 32 random bytes; successors use the owner-approved HMAC design.
- Fresh successor UUID = successor.id = parent.replaced_by_id. The HMAC input is
  JSON.stringify(['refresh-successor-v1', exactParentToken, successorId]), keyed
  by the independent REFRESH_TOKEN_DERIVATION_SECRET. Grace recomputes it and
  constant-time compares SHA-256 against the persisted child hash. One persisted
  grace redemption within 10 seconds; later replay revokes the family.
- User-row locking serializes rotation and revocation; no token cache is needed.
- Reused auth_tokens; added the six approved fields and users.suspended_at;
  only auth_identities is new (27 tables). No Google code; GOOGLE enum reserved.
  Never auto-link a future Google identity by matching email.
- CORS retains the exact allowlist/Helmet policy, adding POST for auth and
  exposing Date for clock-independent client scheduling. No cookies.
- Unicode email domains use IDNA; Unicode local parts are rejected consistently;
  canonical addresses max 254. Display names use NFKC with unsafe/reserved rejection.
- Duplicate registration/wrong-password/unknown-email failures are identical.
  Immediate successful enrollment still reveals signup success; full workflow
  indistinguishability would require an email-verification flow.
- Rate limits are process-local; logout revokes refresh families, while existing
  access JWTs expire within 15 minutes. No mobile UI/physical-phone test was added.
- The root README and AGENTS.md remain untouched, including their older phase/table
  notes, because the owner reserved those files for Phase 3. Current schema details
  and the plain-text ER update are in server/README.md.

## Later commit plan — nothing staged or committed

1. `feat(db): add auth identities and refresh tokens`
   - server/prisma/schema.prisma
   - server/prisma/migrations/20261112000000_auth_foundation/migration.sql
2. `test(db): cover new auth constraints`
   - server/db-tests/schema-contract.js
   - server/db-tests/database.test.js (schema/constraint/upgrade portions)
3. `feat(api): password hashing, tokens and auth config`
   - server/package.json; server/package-lock.json; server/.env.example
   - server/src/config.js
   - server/src/auth/passwords.js; server/src/auth/tokens.js; server/src/auth/validation.js
   - server/prisma/seed.js
   - server/db-tests/database.test.js (scrypt import/seed assertions)
4. `feat(api): register, login, refresh and logout endpoints`
   - server/src/auth/service.js; server/src/auth/routes.js
   - server/src/app.js (auth router, Date/CORS/body-error integration)
5. `feat(api): /api/me and auth middleware`
   - server/src/auth/middleware.js
   - server/src/app.js (requireAuth import and /api/me route)
6. `test(api): auth endpoint, rotation and log-safety tests + docs(server): auth README`
   - server/api-tests/api.test.js; server/api-tests/auth-cases.js
   - server/api-tests/auth-unit.test.js; server/api-tests/restart-refresh.js
   - server/scripts/reset-test-databases.js
   - server/README.md; docs/EDGE_CASES.md; docs/PHASE4_AUTH_VERIFICATION.md

The two shared files above need partial staging on the later commit day; no
index splitting/staging has been done today. Keep server/.env and
.local/phase4/FILES.txt ignored/uncommitted. The ledger lists every changed file.

## Final working-tree preservation

Verified after implementation:

- Branch remains `feat/web-landing-page`, HEAD `15a4c73`.
- All 114 protected source files are byte/mode unchanged from the baseline.
- The original Phase 1 migration and approved auth migration are unchanged.
- Index remains empty; no commits/staging/branch change/push/PR.
- All 24 shareable Phase 4 files are under server/ or docs/ and appear in the ledger.
- server/.env and .local/phase4/FILES.txt are gitignored.
- AGENTS.md and web/ entries below are the 25 pre-existing Phase 3 changes, untouched.

Actual `git status --short --untracked-files=all`:

```text
 M AGENTS.md
 M server/.env.example
 M server/api-tests/api.test.js
 M server/db-tests/database.test.js
 M server/db-tests/schema-contract.js
 M server/package-lock.json
 M server/package.json
 M server/prisma/schema.prisma
 M server/prisma/seed.js
 M server/src/app.js
 M server/src/config.js
 M web/package.json
 M web/src/App.jsx
 M web/src/App.test.jsx
 M web/src/test-setup.js
 M web/vite.config.js
?? docs/EDGE_CASES.md
?? docs/PHASE4_AUTH_VERIFICATION.md
?? server/README.md
?? server/api-tests/auth-cases.js
?? server/api-tests/auth-unit.test.js
?? server/api-tests/restart-refresh.js
?? server/prisma/migrations/20261112000000_auth_foundation/migration.sql
?? server/scripts/reset-test-databases.js
?? server/src/auth/middleware.js
?? server/src/auth/passwords.js
?? server/src/auth/routes.js
?? server/src/auth/service.js
?? server/src/auth/tokens.js
?? server/src/auth/validation.js
?? web/README.md
?? web/THIRD_PARTY_NOTICES.md
?? web/scripts/bundle-sizes.js
?? web/src/components/FAQ.jsx
?? web/src/components/HowItWorks.jsx
?? web/src/components/InstallGuide.jsx
?? web/src/components/PhoneIllustration.jsx
?? web/src/components/ReleaseCard.test.jsx
?? web/src/components/Reveal.jsx
?? web/src/components/Roadmap.jsx
?? web/src/components/TerritoryMap.jsx
?? web/src/components/TerritoryMap.test.jsx
?? web/src/document.test.js
?? web/src/hooks/usePresentationMotion.js
?? web/src/hooks/usePresentationMotion.test.js
?? web/src/hooks/useRelease.test.js
?? web/src/hooks/useScrolled.js
?? web/src/hooks/useStickyPresence.js
?? web/src/motion-features.js
```

Actual `git diff --cached --stat`: empty output.
