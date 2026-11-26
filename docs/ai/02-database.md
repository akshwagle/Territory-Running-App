# Database

PostgreSQL 16, Prisma 6 (exact versions in server/package.json). Source of truth: `server/prisma/schema.prisma` and the ER diagram. 30 tables. Do not add/drop/rename tables or columns, indexes included, without owner approval (AGENTS.md).

## Tables (by area)
- Identity: `users`, `auth_identities`, `auth_tokens`, `login_attempts`, `devices`, `display_name_history`
- Privacy/consent: `user_privacy_settings`, `user_consents`, `data_exports`
- Runs: `runs`, `run_points`, `run_flags`, `run_hexes`
- Territory: `hex_ownership` (exactly one row per hex), `restricted_zones`, `restricted_zone_hexes`, `regions`, `region_cells`
- Social: `follows`, `teams`, `team_members`
- Game: `seasons`, `season_scores` (frozen end-of-season snapshot, never written live), `user_stats` (documented cache), `badges`, `user_badges`, `game_settings`
- Ops: `notifications`, `admin_actions`, `app_releases`

## Enums
SystemRole RUNNER|ADMIN; TokenKind REFRESH|PASSWORD_RESET|EMAIL_VERIFY; AuthProvider PASSWORD|GOOGLE; ProfileVisibility PUBLIC|FOLLOWERS|PRIVATE; ConsentType LOCATION|TERMS|PRIVACY; ExportStatus PENDING|READY|FAILED; TeamRole CAPTAIN|MEMBER; SeasonStatus UPCOMING|ACTIVE|ENDED; BadgeCriteria TOTAL_DISTANCE|HEX_COUNT|STREAK_DAYS|RUN_COUNT; RunStatus UPLOADING|PENDING|VALID|FLAGGED|REJECTED|ACTIVE|PENDING_VALIDATION; HexOutcome CAPTURED|REFRESHED|ON_COOLDOWN|RESTRICTED; FlagReason SPEED_LIMIT|GPS_JUMP|VEHICLE_PATTERN|MOCK_LOCATION|RESTRICTED_ZONE|USER_REPORT; FlagStatus OPEN|DISMISSED|CONFIRMED; NotificationType HEX_LOST|RUN_VALIDATED|RUN_FLAGGED|BADGE_EARNED|SEASON_ENDED|SYSTEM.

## Invariants
- Counts (hexes held, leaderboards, totals) are DERIVED by query at read time. No new counter columns beyond `user_stats` and `season_scores`.
- One owner per hex. Claims are transactional and concurrency-safe (conditional upsert); proven by the concurrent-claim SQL test. Never weaken it.
- `runs.ended_at > started_at` is a DB CHECK. Finish is idempotent.
- Cascading delete of a user removes their data; export and deletion flows must keep working when you add anything.
- Distances in metres, durations in seconds, timestamps UTC `timestamptz`, coordinates WGS84. Convert only at the edge (UI).
- Stats day/month buckets are UTC today (no stored time zone). Say so in UI copy if it matters.

## Working rules
- Use Prisma for CRUD; raw SQL only for hot or atomic paths (claims, leaderboards) and always parameterised.
- Every list query: explicit `select`, stable order, cursor or capped pagination, no N+1 (batch with `in`/joins).
- Test DB is disposable and distinct from DATABASE_URL/DIRECT_URL; tests refuse a populated DB; recreate with `node scripts/reset-test-databases.js api` (see server README). Local Postgres: `scripts/local-postgres.sh start`. The bare `.local/postgres16/bin/psql` has a broken library path; use Prisma or the helper scripts.
- Seed is transactional and idempotent. No fake runs.
- Migrations: never edit an applied migration. New change = new migration + backup + owner approval + DB tests.

## Schema proposals (NOT approved, do not implement)
Draft these in `docs/SCHEMA_PROPOSAL.md` when task T14 runs: goals (user_id, metric, target, period, status); gear (user_id, name, start distance, retired) + runs.gear_id; challenges + participants; clubs; kudos/comments; notification_preferences (user_id, type, enabled); device_tokens (push); notification enum values FOLLOWER and TEAM_EVENT. For each: purpose, columns/types, FK/cascade, indexes, privacy impact, export/delete impact, migration plan, tests, rollback.
