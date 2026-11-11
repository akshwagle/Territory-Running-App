# Territory Running App

Mobile-first running game for a college project that must also support real users.
Runners record GPS runs over H3 resolution-11 cells (about 50 m across).
Each cell traversed by a valid run becomes territory; another runner can capture it
after its cooldown. The project includes seasons, teams, follows, badges,
anti-cheat flags, notifications, privacy controls and administration.

## Stack
- Website: React.
- Backend: Node.js 20+ and Express.
- Database: PostgreSQL 16, Prisma 6 (exact version in server/package.json).
- Mobile: Capacitor wraps the React app into an Android APK downloaded from the website.
- Monorepo; Phase 1 contains database work only. No API, web or mobile implementation.

## Project layout
- The single project root is /Users/akshwagle/Desktop/Territory-Running-App (~/Desktop/Territory-Running-App).
- Build every phase in this one folder; do not use the old Documents/Codex checkout.
- /server: completed Phase 1 database schema, migration, seed and tests.
- /web and /mobile: reserved for Phase 2; do not create them during close-out.
- /.local/: gitignored PostgreSQL 16 installation, source build, data, logs and local state.
- /scripts/local-postgres.sh: repository-relative start, stop and status for local PostgreSQL.
- server/.env stays gitignored; committed examples contain placeholders only.

## Phase roadmap
1. Database: schema, migration, seed, tests (THIS PHASE)
2. Website with APK download: minimal Express API, React site with a download page, a first Capacitor APK
3. Improve the website UI
4. App features: auth, run recording, hex claiming, map, leaderboard, profile
5. Feature parity with popular running apps (history, stats, shoes, goals, sharing, challenges and so on)
6. Improve the app UI
Only work on the phase you are asked to. Never start a later phase on your own.

## Rules the schema must NOT break
- Counts (hexes held, leaderboards, totals) are derived by queries at read time. Do not add counter columns beyond user_stats and season_scores, which already exist as documented caches.
- hex_ownership has exactly one row per hex. Two runners claiming the same hex at the same moment must end with exactly one owner.
- Do not add or drop tables or columns. Do not rename anything. Do not add a 5NF table.

Ask before changing the schema; the ER diagram is the source of truth.
The Phase 1 owner resolved minor diagram labels in favour of the written spec:
run_flags.zone_id and restricted_zone_hexes.zone_id reference restricted_zones.id;
runs.ended_at > started_at is a database CHECK, not a service-only rule.
For this phase, follow the text for minor diagram abbreviations/labels and report
them. Pause only if following the text changes the table count or drops a table/column.

## Database conventions and invariants
- Database tables and columns: snake_case; Prisma models: PascalCase, mapped explicitly.
- Exactly 26 application tables. UUID id defaults: gen_random_uuid(); bigint IDs: identity.
- All timestamps use TIMESTAMPTZ; created_at defaults to now(); Prisma maintains @updatedAt.
- Keep SQL CHECK constraints, partial unique indexes and identity definitions in migrations.
- Do not use db push: it omits hand-written SQL rules. Review every generated migration.
- Raw auth tokens never enter the database: token_hash stores a SHA-256 digest only.
- admin_actions is append-only and has no foreign keys; audit data outlives users.
- run_hexes.h3_index and prev_owner_id deliberately have no foreign keys.
- Deleting a run cascades its own run_hexes; another runner's prev_owner_id history survives.
- user_stats is rebuildable; season_scores is a frozen end-of-season snapshot.
- Claim territory with the documented conditional upsert; sort batch cells by h3_index.
- Service rules (consent, validation, restricted areas, erasure and point purging) belong to later phases.

## Commands (from repository root)
1. Copy server/.env.example to server/.env and set every required variable locally.
2. Start local PostgreSQL: ./scripts/local-postgres.sh start
   Status/stop: ./scripts/local-postgres.sh status or ./scripts/local-postgres.sh stop
   Docker alternative (unverified): docker compose --env-file server/.env up -d --wait
3. Install: cd server && npm ci
4. Generate client: npm run db:generate
5. Migrate: npm run db:migrate (DIRECT_URL targets the development database).
6. Seed: npm run db:seed (ADMIN_EMAIL and ADMIN_PASSWORD must be configured).
7. Validate schema: npm run db:validate
8. Test: npm test (separate empty DATABASE_URL_TEST; runner applies migrations itself).

## Security, testing and delivery
- .env.example contains placeholders only, using port 5432. Never commit .env, credentials or tokens.
- Test against PostgreSQL 16 and a database distinct from DATABASE_URL and DIRECT_URL.
- Tests refuse an already populated test database. Recreate the disposable test DB to rerun.
- Prove table/column fidelity, constraints, cascading deletion and concurrent claims in SQL.
- Seed is transactional and idempotent; no fake runs. Keep tunables documented in README.md.
- Complete required tests before committing. Never work directly on main.
- Phase 1's six ordered commits are merged via PR #1; do not rewrite them.
- Close-out branch: chore/project-location; no Phase 2 work.
- Close-out PR title: "Phase 1 close-out: project location and local Postgres script"; do not merge.
