# Territory Run — Phase 2

Phase 1's PostgreSQL schema is accepted and unchanged. Phase 2 adds a minimal Express API, a functional React download page and a Capacitor Android shell. Phase 2 is in progress; UI redesign, login, running features, maps, hosting and deployment are outside this phase.

Everything lives in **`/Users/akshwagle/Desktop/Territory-Running-App`** (`~/Desktop/Territory-Running-App`). Every phase uses this one folder. There is no root npm workspace. Application code is plain JavaScript; native Android source is generated Java/Gradle/XML.

| Folder | Contents |
| --- | --- |
| `server/` | Prisma database, Express `src/`, API tests, release registrar, ignored `storage/apk/` |
| `web/` | Vite/React download page, CSS, Vitest + Testing Library tests |
| `mobile/` | Vite/React shell, Capacitor config, committed `android/` project source |
| `scripts/` | Local PostgreSQL lifecycle, database setup helper, debug APK build |
| `.local/` | Ignored PostgreSQL build/data, Gradle/npm caches and verification logs |

## Prerequisites and pinned versions

Use Node **22.12+** (verified **22.19.0**) and npm (verified **10.9.3**). Dependencies are exact-pinned in each folder's package.json and lockfile. PostgreSQL **16.15** and Prisma **6.19.3** remain unchanged.

| Component | Version |
| --- | --- |
| Express | 5.3.0 |
| React / React DOM | 19.3.1 |
| Vite | 8.3.8 |
| Capacitor core / CLI / Android | 8.6.0 |
| Temurin JDK | 21.0.13 |
| Android compileSdk / targetSdk | 36 / 36 (minimum API 24) |
| Android Gradle plugin / wrapper | 8.13.0 / 8.14.3 |

The verified JDK is `/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home`; the SDK is `/Users/akshwagle/Library/Android/sdk`; adb is **37.0.1**. Install `platforms;android-36` and `build-tools;35.0.0` through Android Studio SDK Manager. The APK script disables SDK auto-downloads and never accepts licences. It defaults `JAVA_HOME` and `ANDROID_HOME` to those locations when they are unset, so it works from any Terminal.

## Install and environment

For a fresh clone, use the permanent project path. If it already exists, use that checkout instead of cloning over it:

```sh
git clone --branch main https://github.com/akshwagle/Territory-Running-App.git "$HOME/Desktop/Territory-Running-App"
cd "$HOME/Desktop/Territory-Running-App"
cp server/.env.example server/.env
cp web/.env.example web/.env.local
cp mobile/.env.example mobile/.env.local
npm ci --prefix server
npm ci --prefix web
npm ci --prefix mobile
```

Edit the ignored env files. The committed examples use safe placeholders and PostgreSQL port 5432 for Docker; this machine's verified local PostgreSQL uses **55432**. Keep application/migration URLs on `territory`, DB tests on `territory_test`, and API tests on a different disposable database, `territory_api_test`. Percent-encode reserved characters in URL credentials. Private admin passwords must fit bcrypt's 72-byte input limit. Never overwrite a working private env file when updating the checkout.

The environment variable names are:

| Location | Names |
| --- | --- |
| `server/.env` — database | `DATABASE_URL`, `DIRECT_URL`, `DATABASE_URL_TEST`, `DATABASE_URL_API_TEST` |
| `server/.env` — seed | `ADMIN_EMAIL`, `ADMIN_PASSWORD` |
| `server/.env` — Docker | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` |
| `server/.env` — API | `HOST`, `PORT`, `CORS_ORIGINS`, `API_RATE_LIMIT_MAX`, `API_RATE_LIMIT_WINDOW_MS` |
| `web/.env.local`, `mobile/.env.local` | `VITE_API_URL` |
| Build/lifecycle process overrides | `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_USER_HOME`, `GRADLE_USER_HOME`, `LOCAL_POSTGRES_PORT` |

`VITE_API_URL` is an HTTP(S) origin, defaults to `http://localhost:4000`, and is embedded at build time. Rebuild after changing it. Do not put secrets in any `VITE_` variable. `CORS_ORIGINS` is a comma-separated exact allowlist; the example includes `http://localhost:5173`, `http://127.0.0.1:5173`, `https://localhost`, `http://localhost`, and `capacitor://localhost`. Requests from other origins receive 403. Non-browser requests without an Origin header are allowed.

## API

Start PostgreSQL using the verified non-Docker instructions below, then from `server/`:

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
npm start
# Or: npm run dev
```

Default listener: `127.0.0.1:4000`. Startup validates configuration without echoing values. SIGINT/SIGTERM close the HTTP server and Prisma connection gracefully. Helmet adds security headers, `/api` is rate limited, and request logs include only method, fixed route label, status and duration. Logs omit URLs, query strings, headers, bodies and credentials.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/health` | Real trivial DB query; 200 `{status:"ok",db:"up",time}` or 503 `{status:"degraded",db:"down",time}` |
| `GET /api/releases/latest` | Highest active version code; six camelCase release fields; 404 `NO_RELEASE` if none |
| `GET` / `HEAD /downloads/:file` | APK attachment from `server/storage/apk`; strict filename validation, no listing, traversal or escaping symlinks |

All API errors use `{ "error": { "code": "...", "message": "..." } }`; `/api/health` deliberately uses the exact health envelope specified above on 503. No stack traces or database messages are returned. The API has no authentication/user endpoints in this phase.

## Web download page

```sh
cd ~/Desktop/Territory-Running-App/web
npm run dev
npm test
npm run lint
npm run build
```

Open `http://localhost:5173`. The page handles loading, retryable errors, no release yet, and a real release with its version/date/changelog, download link, SHA-256 copy control and honest Android installation instructions. CSS is functional and responsive; the redesign belongs to Phase 3.

## Android shell and APK

```sh
cd ~/Desktop/Territory-Running-App/mobile
npm run apk:debug
```

This builds the web assets, runs the pinned `cap sync android`, writes ignored `android/local.properties` from `ANDROID_HOME`, then runs `./gradlew assembleDebug`. Gradle's default cache is inside ignored `.local/gradle`; Android tool preferences default to `.local/android-user`, with an ignored symlink to the existing debug key so no keystore is generated. The APK is:

```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

The permanent appId is **`com.territoryrunning.app`** and appName is **Territory Run**. `mobile/app-version.json` is the one source for native `versionName`/`versionCode` and the displayed app version. Bump both there before a new release, rebuild, then register with matching values. Package.json versions are npm package metadata, not Android version inputs.

The shell displays its title, app version, configured API origin and live health status. The only Android platform permission is `INTERNET`. AndroidX also merges the app-private signature permission `com.territoryrunning.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` to protect its receivers; it grants no location, camera or other device access. This standard framework entry is retained rather than removing its receiver protection. HTTP and WebView mixed content are enabled only by the debug manifest/code; the main/release configuration denies cleartext. The script reuses the existing Android debug keystore and refuses to create one. Release signing is not done yet.

## Register and verify a local release

After the real debug APK has built:

```sh
cd ~/Desktop/Territory-Running-App/server
npm run release:register -- --file ../mobile/android/app/build/outputs/apk/debug/app-debug.apk --version-name 0.1.0 --version-code 1 --changelog "First Android shell with API connectivity status."
npm start
```

The registrar validates the file and version arguments, copies to `server/storage/apk/territory-run-0.1.0.apk`, computes SHA-256 from the copied bytes and upserts by version code. Earlier releases remain active; latest selects the highest code. Registrations are serialized and version-name collisions across codes are rejected so an existing release's download is not overwritten. A version name must be a safe semantic version of at most 20 characters; the Android version code is a positive integer up to 2100000000. Only `.gitkeep` is tracked in storage; no APK is committed.

In a second Terminal:

```sh
curl -i http://127.0.0.1:4000/api/health
curl -i http://127.0.0.1:4000/api/releases/latest
curl -I http://127.0.0.1:4000/downloads/territory-run-0.1.0.apk
ls -lh ../mobile/android/app/build/outputs/apk/debug/app-debug.apk
shasum -a 256 ../mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

## Tests

The unchanged 23 DB tests use `DATABASE_URL_TEST`. API tests use `DATABASE_URL_API_TEST` with the same URL/identity/empty-database/PostgreSQL-16 guards before migrations. Neither suite writes to development. Create both disposable databases once; recreate each before rerunning its suite. Do not use an application database for resets.

```sh
# From repo root; local PostgreSQL binaries and relocated libpq:
export PATH="$PWD/.local/postgres16/bin:$PATH"
export DYLD_LIBRARY_PATH="$PWD/.local/postgres16/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
# Create the API test database once:
createdb -h 127.0.0.1 -p 55432 -U territory -W territory_api_test
# Before rerunning each suite, recreate only its corresponding disposable DB:
dropdb -h 127.0.0.1 -p 55432 -U territory -W --if-exists territory_test
createdb -h 127.0.0.1 -p 55432 -U territory -W territory_test
dropdb -h 127.0.0.1 -p 55432 -U territory -W --if-exists territory_api_test
createdb -h 127.0.0.1 -p 55432 -U territory -W territory_api_test
npm test --prefix server
npm run test:api --prefix server
npm test --prefix web
npm run lint --prefix web
npm run build --prefix web
npm run apk:debug --prefix mobile
```

For Docker, create/reset the two test databases with `docker compose --env-file server/.env exec postgres sh -c 'createdb -U "$POSTGRES_USER" territory_api_test'` and analogous `dropdb`/`createdb` commands. Docker remains unverified here. Test APK fixtures are generated only in ignored temporary storage and never registered as development app releases.

## What is not done

No login, run recording, maps, hex claiming, user features, polished UI, hosting, deployment or physical-phone validation in this phase. The phone guide below is for the project owner to run. There are no production credentials in the repository, and APKs, keystores, env files, local.properties, caches and build outputs remain ignored.

## PostgreSQL setup reference

### A. Docker Compose (provided, unverified here)

Run from the repository root:

```sh
docker compose --env-file server/.env up -d --wait
docker compose --env-file server/.env exec postgres sh -c 'createdb -U "$POSTGRES_USER" territory_test'
```

Compose creates `territory` on first initialization; the second command creates the separate test database. The server binds only to `127.0.0.1`. Data persists in the named volume. Initialization variables affect a new volume, not an existing cluster.

### B. Local PostgreSQL 16 (verified non-Docker route)

The relocated installation and existing data are already initialized on this machine:

```text
.local/
  postgres16/           # installed PostgreSQL 16 binaries, libraries and share files
  postgresql-16.15/     # source build
  pgdata/               # preserved development and disposable test databases
  run/                  # private Unix socket directory
  postgres.log          # server log
```

Use these commands from the project root; the script also works from another working directory because it resolves paths from its own location:

```sh
./scripts/local-postgres.sh start
./scripts/local-postgres.sh status
./scripts/local-postgres.sh stop
./scripts/local-postgres.sh start
```

`start` waits for readiness, binds only to `127.0.0.1`, and defaults to port **55432**. `stop` uses a clean fast shutdown and waits for completion. `status` prints the running process and readiness; a stopped cluster returns exit code 3. Running `start` on an already running cluster succeeds without starting a second server. Set `LOCAL_POSTGRES_PORT` consistently on these commands if using a different port, and update all three connection URLs to match. The script sets the bundled-library search path for the relocated macOS client tools. It never initializes or deletes data, creates databases or resets tests.

For a **fresh local installation only**, obtain PostgreSQL 16 inside `.local/`. This requires a C compiler and `make` (Xcode Command Line Tools on macOS, or the usual build tools on Linux). From the repository root:

```sh
mkdir -p .local
curl -fL https://ftp.postgresql.org/pub/source/v16.15/postgresql-16.15.tar.bz2 -o .local/postgresql-16.15.tar.bz2
tar -xjf .local/postgresql-16.15.tar.bz2 -C .local
PG_INSTALL_PREFIX="$PWD/.local/postgres16"
(
  cd .local/postgresql-16.15
  ./configure --prefix="$PG_INSTALL_PREFIX" --without-icu --without-readline --without-zlib
  make -j4
  make install
)
export PATH="$PWD/.local/postgres16/bin:$PATH"
export DYLD_LIBRARY_PATH="$PWD/.local/postgres16/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
initdb -D "$PWD/.local/pgdata" -U territory -A scram-sha-256 --pwprompt
./scripts/local-postgres.sh start
createdb -h 127.0.0.1 -p 55432 -U territory -W territory
createdb -h 127.0.0.1 -p 55432 -U territory -W territory_test
```

Enter the same private password used in `server/.env`; set its URL ports and `POSTGRES_PORT` to `55432`. Do not repeat initialization for the existing moved cluster. Local builds, archives, data, logs, sockets and verification transcripts all stay in ignored `.local/` and are never committed. If an agent sandbox blocks PostgreSQL shared memory or process signals, run the lifecycle script in a normal Terminal; migration and tests still run from this repository.


## Database migration and seed reference

From `server/`:

```sh
npm run db:generate
npm run db:validate
npm run db:migrate
npm run db:seed
npm run db:seed
```

Migrations use `DIRECT_URL`; seed uses `DATABASE_URL`. Use **migrations**, not `prisma db push`: eight CHECK constraints, two partial unique indexes, identity definitions and the audit trigger live in the reviewed SQL migration. Prisma maintains `updated_at` on writes; direct SQL must supply it on inserts and maintain it on updates. All timestamps are `TIMESTAMPTZ(6)`. UUID `id` defaults are database-generated with `gen_random_uuid()`; `run_points.id` and `login_attempts.id` are BIGINT identity columns.

The seed transaction upserts six tunable settings, four badges, one ADMIN, one UPCOMING season (starting seven days after the first seed) and a demo region. It creates no runs. Reruns preserve tuned settings, admin credentials, season dates/status and region identity. Badge catalog descriptions/criteria/thresholds are reconciled by code. An existing non-admin at `ADMIN_EMAIL` causes a rollback rather than silent privilege escalation. A changed `ADMIN_EMAIL` creates a different admin; a changed `ADMIN_PASSWORD` does not rotate an existing password.

| Setting | Initial value | Meaning |
| --- | ---: | --- |
| `h3_resolution` | 11 | Territory cell resolution |
| `claim_cooldown_minutes` | 30 | Recapture cooldown in minutes |
| `max_speed_mps` | 8.5 | Speed threshold in metres/second |
| `max_gps_jump_m` | 100 | GPS jump threshold in metres |
| `min_gps_accuracy_m` | 30 | GPS accuracy threshold in metres |
| `decay_days` | 14 | Territory decay interval in days |

Badges: `TOTAL_DISTANCE_10KM` (`TOTAL_DISTANCE`, 10000 metres), `HEX_COUNT_100` (`HEX_COUNT`, 100), `STREAK_DAYS_7` (`STREAK_DAYS`, 7), `RUN_COUNT_10` (`RUN_COUNT`, 10). Settings store text; validation/interpretation, territory decay, consent, account erasure and run-point purging are later-phase service work.

## Database test reference

`DATABASE_URL_TEST` must point to an **empty PostgreSQL 16 database** with schema `public`, distinct from both application and migration databases. The runner checks this before applying the committed migration. It refuses identical URLs, aliases with the same database name, connection-parameter overrides and populated databases. It never resets databases automatically.

```sh
cd server
npm test
```

The Node test runner and `pg` prove the complete 26-table contract (every column, type, nullability, default, enum, key, index and foreign-key delete action), all CHECK constraints, idempotent uploads, team/season uniqueness, deletion behavior, append-only audit history, Prisma timestamps and seed idempotency. They exercise **10 simultaneous physical PostgreSQL connections** against unowned, expired and cooldown-protected hexes, and **two simultaneous transactions claiming a sorted batch of 40 hexes**. Lock/statement timeouts and rejected-promise checks fail the suite on errors or deadlocks.

Before rerunning, recreate **only the disposable test database**. For local PostgreSQL, run from the repository root and substitute your actual role/port:

```sh
export PATH="$PWD/.local/postgres16/bin:$PATH"
export DYLD_LIBRARY_PATH="$PWD/.local/postgres16/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
dropdb -h 127.0.0.1 -p 55432 -U territory -W --if-exists territory_test
createdb -h 127.0.0.1 -p 55432 -U territory -W territory_test
```

For Docker:

```sh
docker compose --env-file server/.env exec postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists territory_test'
docker compose --env-file server/.env exec postgres sh -c 'createdb -U "$POSTGRES_USER" territory_test'
```

Do not use a development/production database for these commands. Tests leave their fixtures in the disposable test database for inspection.

Connect to the development database with `psql` and verify the requested count:

```sql
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> '_prisma_migrations';
-- 26
```

## Schema and migration notes

| Module | Tables |
| --- | --- |
| Auth/privacy | users, auth_tokens, user_privacy_settings |
| Teams/follows/badges | teams, team_members, follows, badges, user_badges |
| Seasons/stats | seasons, season_scores, user_stats |
| Runs/anti-cheat | runs, run_points, run_flags |
| Territory | hex_ownership, run_hexes |
| Zones/regions | restricted_zones, restricted_zone_hexes, regions, region_cells |
| Devices/notifications | devices, notifications |
| Standalone | admin_actions, login_attempts, game_settings, app_releases |

Exactly **26** application tables. No extra counters: current ownership and leaderboards are queried at read time; `user_stats` is rebuildable and `season_scores` is frozen at season end. There are intentionally no foreign keys on `run_hexes.h3_index`, `run_hexes.prev_owner_id`, `region_cells.parent_h3` or the standalone tables. Deleting a runner cascades their own runs and run_hexes; another runner's `prev_owner_id` history survives, as does `admin_actions`.

The owner corrected the diagram's `zones.id` abbreviation to `restricted_zones.id` for both zone references and confirmed `runs.ended_at > started_at` is a database CHECK. Minor diagram labels follow the written spec. All 26 tables and their columns are checked against an independent transcription in `server/db-tests/schema-contract.js`.

The conditional claim upsert used in the concurrency tests is:

```sql
INSERT INTO hex_ownership (h3_index, owner_id, run_id, cooldown_until)
VALUES ($1, $2, $3, $4)
ON CONFLICT (h3_index) DO UPDATE
SET owner_id = EXCLUDED.owner_id, run_id = EXCLUDED.run_id,
    claimed_at = now(), cooldown_until = EXCLUDED.cooldown_until
WHERE hex_ownership.cooldown_until <= now();
```

Always sort batch cells numerically by `h3_index` before taking locks, and use one transaction for the batch. Store H3 values as `BigInt` or decimal strings in Node; do not round BIGINT values through JavaScript `Number`. Auth tokens must be SHA-256 digests before insertion; the database never needs raw tokens.

Prisma and its client are pinned together at 6.19.3. A scoped `deepmerge-ts` override to 8.0.2 removes the transitive recursive-merge advisory while preserving Prisma 6; client generation, validation and migrations are verified with it. Prisma 6 still accepts the seed command in `package.json` and emits a Prisma 7 deprecation notice; this phase intentionally stays on version 6.
