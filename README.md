# Territory Running App — Phase 1

Database layer only: PostgreSQL 16, Prisma **6.19.3**, Node.js **20+**. There is no API, website or mobile app in this phase. The project context, six-phase roadmap and future-agent rules are in [AGENTS.md](AGENTS.md).

## Verification status

**Verified:** local PostgreSQL **16.15** on `127.0.0.1:55432`, with the build and data relocated into this repository’s ignored `.local/`. `scripts/local-postgres.sh` starts, stops and reports status using repository-relative paths. Migration, seed and all database tests were run from `/Users/akshwagle/Desktop/Territory-Running-App`. Real local connection strings remain in ignored `server/.env`.

**Not verified:** the Docker route below, because Docker is unavailable in this environment. The verified local route uses a PostgreSQL 16.15 source build. No database schema or Phase 2 features were changed during close-out.

## 1. Clone, install and configure

```sh
git clone --branch main https://github.com/akshwagle/Territory-Running-App.git "$HOME/Desktop/Territory-Running-App"
cd "$HOME/Desktop/Territory-Running-App"
cp server/.env.example server/.env
cd server
npm ci
cd ..
```

The permanent project root is **`~/Desktop/Territory-Running-App`** (`/Users/akshwagle/Desktop/Territory-Running-App` on this machine). Every phase is developed in this one folder. Do not use the previous Documents/Codex checkout. `/server` contains the completed database layer; `/web` and `/mobile` are reserved for Phase 2 and are not created during close-out.

Edit `server/.env` before proceeding. Its committed example contains placeholders only and defaults to port **5432**, matching Compose. Replace every `YOUR_...` value. Keep the database credentials consistent across `POSTGRES_USER`, `POSTGRES_PASSWORD` and the URL credentials. Percent-encode reserved characters in URL usernames/passwords. Use a private admin password of at most 72 UTF-8 bytes, bcrypt's input limit.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Application/seed connection to development database `territory` |
| `DIRECT_URL` | Direct migration connection to that same development database |
| `DATABASE_URL_TEST` | Direct connection to a different, disposable database: `territory_test` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Initial ADMIN identity; password hashed with bcrypt cost 12 |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Compose initialization values (`POSTGRES_DB=territory`) |
| `POSTGRES_PORT` | Host port for Compose, default `5432` |

For the verified local server, set the three URL ports and `POSTGRES_PORT` to **55432** instead. Never commit `.env`, credentials, tokens or anything under `.local/`. The reusable `scripts/local-postgres.sh` is committed; it replaces the old one-off `start-postgres16.py`.

## 2. Start PostgreSQL 16 — choose one route

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

## 3. Generate, migrate and seed

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

## 4. Run database tests

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
