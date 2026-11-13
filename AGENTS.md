# Territory Running App

Mobile-first running game for a college project that must also support real users.
Runners record GPS runs over H3 resolution-11 cells (about 50 m across).
Each cell traversed by a valid run becomes territory; another runner can capture it
after its cooldown. The project includes seasons, teams, follows, badges,
anti-cheat flags, notifications, privacy controls and administration.

## Stack
- Website: React.
- Backend: Node.js 22.12+ and Express 5 (plain JavaScript).
- Database: PostgreSQL 16, Prisma 6 (exact version in server/package.json).
- Mobile: Capacitor wraps the React app into an Android APK downloaded from the website.
- Phase 3 and Phase 4 step 03 are merged; step 04 profile/privacy is implemented and phone-verified on feat/profile-privacy, awaiting PR review.
- Step 03: native Google and email phone checks passed; recording/uploads and cross-device ACTIVE-run rules are deferred to step 05.
- No login, runner features, UI redesign, hosting or deployment in Phase 2.

## Project layout
- The single project root is /Users/akshwagle/Desktop/Territory-Running-App (~/Desktop/Territory-Running-App).
- Build every phase in this one folder; do not use the old Documents/Codex checkout.
- /server: completed database layer plus /src Express API, /api-tests and /scripts release registration.
- /web: Vite + React download page and Vitest/Testing Library tests.
- /mobile: Vite + React + Capacitor Android shell; appId com.territoryrunning.app.
- Each folder has its own package.json; no root workspace or TypeScript.
- /.local/: gitignored PostgreSQL 16 installation, source build, data, logs and local state.
- /scripts/local-postgres.sh: repository-relative start, stop and status for local PostgreSQL.
- server/.env stays gitignored; committed examples contain placeholders only.

## Phase roadmap
1. Database: schema, migration, seed, tests (COMPLETE)
2. Website with APK download: minimal Express API, React site with a download page, a first Capacitor APK (COMPLETE)
3. Improve the website UI (COMPLETE)
4. App features: auth, run recording, hex claiming, map, leaderboard, profile
5. Feature parity with popular running apps (history, stats, shoes, goals, sharing, challenges and so on)
6. Improve the app UI
Only work on the phase you are asked to. Never start a later phase on your own.

## Rules the schema must NOT break
- Counts (hexes held, leaderboards, totals) are derived by queries at read time. Do not add counter columns beyond user_stats and season_scores, which already exist as documented caches.
- hex_ownership has exactly one row per hex. Two runners claiming the same hex at the same moment must end with exactly one owner.
- Do not add or drop tables or columns. Do not rename anything. Do not add a 5NF table.

Ask before changing the schema; the ER diagram is the source of truth.
Phase 2 must not change server/prisma/schema.prisma or migrations.
The Phase 1 owner resolved minor diagram labels in favour of the written spec:
run_flags.zone_id and restricted_zone_hexes.zone_id reference restricted_zones.id;
runs.ended_at > started_at is a database CHECK, not a service-only rule.
For this phase, follow the text for minor diagram abbreviations/labels and report
them. Pause only if following the text changes the table count or drops a table/column.

## Database conventions and invariants
- Database tables and columns: snake_case; Prisma models: PascalCase, mapped explicitly.
- Exactly 30 application tables after the approved step-04 profile/privacy migration (27 before it).
- UUID id defaults: gen_random_uuid(); bigint IDs: identity.
- All timestamps use TIMESTAMPTZ; created_at defaults to now(); Prisma maintains @updatedAt.
- Keep SQL CHECK constraints, partial unique indexes and identity definitions in migrations.
- Do not use db push: it omits hand-written SQL rules. Review every generated migration.
- Raw auth tokens never enter the database: token_hash stores a SHA-256 digest only.
- admin_actions has no foreign keys; ordinary updates/deletes/truncates are blocked. Only the reviewed account-deletion trigger may tombstone matching IDs and redact identifying notes.
- run_hexes.h3_index and prev_owner_id deliberately have no foreign keys.
- Deleting a run cascades its own run_hexes. Another runner's history row survives; account erasure clears its prev_owner_id.
- user_stats is rebuildable; season_scores is a frozen end-of-season snapshot.
- Claim territory with the documented conditional upsert; sort batch cells by h3_index.
- Read endpoints must use the shared profile canView helper and privacy choices. Step 05 must check current consent before runs/points and use account-work locks before job publication.
- Step 04 explicitly authorizes the three profile/privacy tables and seven existing-table columns; no further schema changes without review.

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
8. DB test: npm test (separate empty DATABASE_URL_TEST; runner applies migrations itself).
9. API test: npm run test:api (another empty database, DATABASE_URL_API_TEST; same guards).
10. API: cd server && npm start (HOST=127.0.0.1, PORT=4000 by default).
11. Web: cd web && npm ci && npm run dev; npm test; npm run lint; npm run build.
12. Mobile: cd mobile && npm ci && npm run apk:debug (JDK 21, Android platform 36).
13. Register: cd server && npm run release:register -- --file <apk> --version-name 0.1.0 --version-code 1.
14. Bump mobile/app-version.json for app versionName/versionCode; rebuild and register with matching values.

## Security, testing and delivery
- .env.example contains placeholders only, using port 5432. Never commit .env, credentials or tokens.
- Test against PostgreSQL 16 and a database distinct from DATABASE_URL and DIRECT_URL.
- Tests refuse an already populated test database. Recreate the disposable test DB to rerun.
- Prove table/column fidelity, constraints, cascading deletion and concurrent claims in SQL.
- Seed is transactional and idempotent; no fake runs. Keep tunables documented in README.md.
- Complete required tests before committing. Never work directly on main.
- Phase 1's six ordered commits are merged via PR #1; do not rewrite them.
- Phase 2 branch: feat/api-web-mobile-shell; PR title: "Phase 2: API shell, download website, first APK"; do not merge.
- Keep the seven requested commits in order: layout, API, registration, API tests, web, mobile, final docs.
- Config comes from environment variables; committed examples contain safe placeholders only.
- Never commit APKs/AABs, keystores, local.properties, storage APKs, node_modules or build outputs.
- Keep only .gitkeep in server/storage/apk tracked; SHA-256 is computed from the copied APK.
- CORS uses explicit origins; logs and errors never expose credentials, tokens, bodies or stack traces.
- HTTP is permitted only in debug Android builds; INTERNET is the only permission in this phase.
- apk:debug defaults JAVA_HOME/ANDROID_HOME when unset; never accept SDK licences or create keystores.
- If sandboxing blocks runtime commands, add a small scripts/ helper and ask one question at a time.
