# Backend API

Node.js 22.12+, Express 5, plain JavaScript (no TypeScript), Prisma 6, PostgreSQL 16. Layout: `server/src/{auth,profile,runs,community,...}` each with routes/service/validation; `app.js` wires routes; `config.js` reads env; `index.js` boots. Tests: `server/api-tests`, `server/db-tests`; smoke: `npm run e2e:smoke --prefix server`.

## Route inventory (all under /api; verify in code before relying on it)
- Public/ops: GET /health /live /ready /releases/latest; GET /downloads/:file (APK).
- Auth (04): POST register login refresh logout google google/link verify-email/request|confirm password/forgot|reset|change; GET identities sessions; DELETE sessions/:id.
- Me/profile/privacy: GET /me, profile and privacy endpoints, GET /me/consents, POST /me/consents, POST /me/export, GET /me/export/:id, DELETE /me, GET users/:id/profile, PUT|DELETE users/:id/follow, GET me/followers|following.
- Runs: POST / (start), POST /:id/points, POST /:id/signals, POST /:id/finish, POST /:id/end-stale, GET / (history, filters, cursor), GET /:id, GET /:id/claim, DELETE /:id, GET me/run-splits/:id.
- Territory: GET /territory/me, GET /territory/hexes (bbox, privacy-filtered).
- Community: GET community/leaderboard|team-leaderboard|season|feed|search; teams: POST teams, POST teams/join|leave, GET teams/me, GET teams/me/members, DELETE teams/me/members/:id.
- Stats: GET me/stats/overview|records|achievements.
- Notifications: GET me/notifications, GET unread-count, POST :id/read, POST read-all.
- Admin: GET admin/users/:id/name-history (ADMIN only).

## Conventions
- Every route except health/live/ready, releases/latest, downloads and auth entry points requires a Bearer access token. Scope every read/write by the authenticated user; other people's ids give 404, not 403 (no existence leaks).
- Validate every input (type, range, length, enum) in the module's `validation.js`; reject unknown shapes with a 4xx using the existing error envelope in `app.js`. Never echo input back in errors.
- Caps: lists have a max page size (runs, territory 200, notifications 50, community lists). Never return unbounded arrays.
- Rate limits on auth, uploads and run points (see config). Request size limits on. Request ids on every response/log.
- Logs are structured and contain no PII, tokens, bodies or stack traces.
- Run finish = one transaction: validate -> flag or claim hexes -> stats -> badges -> notifications. Idempotent: repeating finish returns the same result.
- Privacy via `canView`/privacy helpers for any data about another runner. Leaderboards only rank runners with appear_on_leaderboards.
- Config only from env (`config.js`); production guards reject http CORS origins and loopback hosts. New env vars go in `.env.example` (placeholders) and docs/DEPLOYMENT.md.

## Performance targets
p95 < 300 ms for reads, < 500 ms for run point batches on a small instance; batch inserts (`createMany`); index-friendly filters; cache nothing that is user-private; compress JSON (gzip) in production; payloads small (select only fields the UI shows).

## Adding or changing an endpoint (checklist)
1. Does it need schema change? If yes STOP (02). 2. Validation + auth + scoping. 3. Service function with transaction where needed. 4. API tests: success, validation failure, anon 401, other-user 404, caps. 5. Update the inventory above and mobile api-client. 6. Keep export/delete flows correct.
