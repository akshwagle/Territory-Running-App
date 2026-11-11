# Territory Running App — Phase 1

Database layer only: PostgreSQL 16, Prisma **6.19.3**, Node.js **20+**. There is no API, website or mobile app in this phase. The project context, six-phase roadmap and future-agent rules are in [AGENTS.md](AGENTS.md).

## Verification status

**Verified:** local PostgreSQL **16.15**, initialized with `initdb` and started with `pg_ctl` on `127.0.0.1:55432`; fresh-database migration, two seed runs, schema-contract checks, constraints and concurrent claims. Real local connection strings are in ignored `server/.env`.

**Not verified:** the Docker route below, because Docker is unavailable in this environment. The Linux apt and macOS Homebrew installer commands are alternatives for obtaining PostgreSQL 16; they were not run here. The local verification used a PostgreSQL 16.15 source build outside the repository.

## 1. Clone, install and configure

```sh
git clone https://github.com/akshwagle/Territory-Running-App.git
cd Territory-Running-App
git switch feat/database
cp server/.env.example server/.env
cd server
npm ci
cd ..
```

Edit `server/.env` before proceeding. Its committed example contains placeholders only and defaults to port **5432**, matching Compose. Replace every `YOUR_...` value. Keep the database credentials consistent across `POSTGRES_USER`, `POSTGRES_PASSWORD` and the URL credentials. Percent-encode reserved characters in URL usernames/passwords. Use a private admin password of at most 72 UTF-8 bytes, bcrypt's input limit.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Application/seed connection to development database `territory` |
| `DIRECT_URL` | Direct migration connection to that same development database |
| `DATABASE_URL_TEST` | Direct connection to a different, disposable database: `territory_test` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Initial ADMIN identity; password hashed with bcrypt cost 12 |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Compose initialization values (`POSTGRES_DB=territory`) |
| `POSTGRES_PORT` | Host port for Compose, default `5432` |

For the verified local server, set the three URL ports and `POSTGRES_PORT` to **55432** instead. Never commit `.env`, credentials, tokens, database data or local build/startup helpers.

## 2. Start PostgreSQL 16 — choose one route

### A. Docker Compose (provided, unverified here)

Run from the repository root:

```sh
docker compose --env-file server/.env up -d --wait
docker compose --env-file server/.env exec postgres sh -c 'createdb -U "$POSTGRES_USER" territory_test'
```

Compose creates `territory` on first initialization; the second command creates the separate test database. The server binds only to `127.0.0.1`. Data persists in the named volume. Initialization variables affect a new volume, not an existing cluster.

### B. Local PostgreSQL 16 (verified database route)

On Ubuntu/Debian with PostgreSQL 16 packages available:

```sh
sudo apt update
sudo apt install postgresql-16
sudo systemctl start postgresql
sudo -u postgres createuser --pwprompt --createdb territory
createdb -h 127.0.0.1 -p 5432 -U territory -W territory
createdb -h 127.0.0.1 -p 5432 -U territory -W territory_test
```

If your distribution does not provide version 16, use the [official PostgreSQL package repository instructions](https://www.postgresql.org/download/linux/ubuntu/). Set the role password to your private `POSTGRES_PASSWORD`, and set the URLs to use that role. Do not use another installed PostgreSQL major version for the tests.

On macOS, PostgreSQL 16 binaries can be installed with:

```sh
brew install postgresql@16
export PATH="$(brew --prefix postgresql@16)/bin:$PATH"
```

For an isolated local cluster (the method verified here), initialize a directory **outside this repository**. Run as your normal OS user, with PostgreSQL 16 binaries on `PATH`:

```sh
postgres --version
initdb -D /absolute/path/to/local-pg16 -U territory -A scram-sha-256 --pwprompt
pg_ctl -D /absolute/path/to/local-pg16 -l /absolute/path/to/local-pg16.log -o '-h 127.0.0.1 -p 55432' start
createdb -h 127.0.0.1 -p 55432 -U territory -W territory
createdb -h 127.0.0.1 -p 55432 -U territory -W territory_test
```

Enter the same private database password used in `server/.env`. Update its URL ports to `55432`. To stop this isolated cluster, use `pg_ctl -D /absolute/path/to/local-pg16 stop`. On Linux, PostgreSQL 16's `bin` directory is commonly `/usr/lib/postgresql/16/bin`.

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

Before rerunning, recreate **only the disposable test database**. For local PostgreSQL, substitute your actual role/port:

```sh
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
