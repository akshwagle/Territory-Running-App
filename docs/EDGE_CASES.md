# Authentication edge-case audit

Phase 4 step 1: verified against separate PostgreSQL 16 test databases.
Integration test names below are exact and live in `server/api-tests/auth-cases.js`.

| ID | Scenario | Where implemented | Test name | Status |
| --- | --- | --- | --- | --- |
| AUTH-01 | Simultaneous registrations and case/space variants create one account; database uniqueness is authoritative | `server/src/auth/service.js`, `server/src/auth/validation.js`, migration `20261112000000_auth_foundation` | AUTH-01 simultaneous case/space variants create exactly one account and return generic duplicate failures | PASS; unique expression index also checked by DB suite |
| AUTH-02 | One rotation; identical exact-parent grace retry once within 10 seconds; recovery after a fresh process; later reuse revokes family | `server/src/auth/service.js`, `server/src/auth/tokens.js`, persisted `auth_tokens` rotation/grace fields | AUTH-02 two simultaneous refreshes rotate once and return the identical HMAC successor; one grace redemption only; AUTH-02 grace retry after a simulated process restart recovers the exact successor using only persisted hashes and UUID; AUTH-02 retry after the grace window revokes the whole family and rejects its current successor | PASS; changed-parent/secret and derivation unit tests also pass |
| AUTH-05 | Wrong phone clock cannot change server expiry; expose Date and expiresIn | `server/src/auth/tokens.js`, `server/src/auth/service.js`, `server/src/app.js` | AUTH-05 server Date, expiresIn and JWT expiry ignore a phone clock hours ahead or behind | PASS; phone UI scheduling belongs to step 4.2 |
| AUTH-11 | Email normalization/max 254; unsafe/reserved display names rejected or NFKC-normalized | `server/src/auth/validation.js` | AUTH-11 email edge forms normalize consistently and unsafe or reserved display names are rejected | PASS; 254/255 boundary also verified in `auth-unit.test.js` |
| AUTH-12 | Suspended/deletion-requested users cannot refresh and receive specific account codes | `server/src/auth/service.js`, `server/src/auth/middleware.js`, `users.suspended_at`, `users.deletion_at` | AUTH-12 suspended or deletion-requested accounts cannot refresh or use /api/me and receive specific codes | PASS; server only, no app UI in this step |
