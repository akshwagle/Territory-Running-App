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

## Step 02: auth complete

| ID | Scenario | Where implemented | Test name | Status |
| --- | --- | --- | --- | --- |
| AUTH-10 | Expired, replaced, used and wrong-purpose email/reset links provide a next step; a different active user cannot consume the token; links never sign in | server/src/auth/actions.js, server/src/auth/routes.js, existing auth_tokens kinds EMAIL_VERIFY/PASSWORD_RESET | AUTH-10 expired, replaced, used and wrong-purpose links give a next step; a different signed-in account cannot consume a link | PASS in the 58-test API suite; browser/native deep-link UI remains for later steps |

Step 02 also tests the exact sub/sid/iat/exp access contract, immediate family
revocation, current-session flags, Google authority/linking/collision rules,
parallel subject uniqueness, token resend/single use and secret-free logging.
All Google checks in automated tests use mocks, never the real client ID or a
live Google identity verification call.

## Step 03: Android authentication

| ID | Scenario | Where implemented | Test name | Status |
| --- | --- | --- | --- | --- |
| AUTH-03 | Expired access while backgrounded/in a request; single-flight refresh and one replay; late 401s do not rotate again | mobile/src/auth/api-client.js, controller.js, pending-work.js | AUTH-03 parallel expired requests share one refresh and replay each request exactly once; AUTH-03 background/resume validates against the server and refreshes once without trusting the phone clock | PASS automated; real point uploads are deferred to step 05 |
| AUTH-04 | Offline/timeout/server/rate failures during refresh preserve the encrypted session and pause work; only refresh 401 clears it | mobile/src/auth/api-client.js, controller.js | AUTH-04 offline refresh failure preserves the saved session; AUTH-04 offline restoration preserves credentials and data, pauses work, then resumes after reconnection | PASS automated |
| AUTH-06 | Independent session families and current-session labels/revocation | mobile/src/pages/settings-pages.jsx, auth/controller.js; existing server session ownership checks | AUTH-06 separate phone sessions remain independent when one family is revoked; AUTH-06 sessions label This device and revoke only another family, with loading and success | PASS automated; cross-device one-active-run enforcement and ACTIVE status explicitly deferred to step 05 |
| AUTH-07 | Session expiry/reset/revocation must keep encrypted unsent work and resume only its owner | mobile/src/auth/pending-work.js, vault.js, controller.js | AUTH-07 session expiry keeps unsent data encrypted and re-login resumes the same owner | PASS automated; integration with real recording/uploads deferred to step 05 |
| AUTH-08 | Sign-out warns about unsent data, offers upload/keep, and requires a second discard confirmation | mobile/src/pages/settings-pages.jsx, auth/pending-work.js | AUTH-08 unsent-data warning offers upload/keep and requires a second discard confirmation; AUTH-08 explicit sign-out keeps pending data; failed upload never signs out or discards it | PASS automated; no fake runs created |
| AUTH-09 | Cancelled/unavailable/unverified Google sign-in, missing token and native provider errors remain visible; email login is available | mobile/src/auth/google-adapter.js, controller.js, pages/auth-pages.jsx | AUTH-09 SIGN_IN_CANCELED gives a friendly Google error without exposing native details; AUTH-09 Google GOOGLE_EMAIL_UNVERIFIED leaves email login available; AUTH-09 account-reauth failure gives account/app guidance without claiming the user must re-add an account | PASS automated and native Google sign-in passed on the owner's phone after the missing Android OAuth client was created; temporary diagnostics removed, clear errors retained |
| AUTH-10 | Expired/used/wrong-purpose/different-account deep links show next steps and never log in; a newer link cannot inherit an earlier link's success | mobile/src/auth/deep-links.js, App.jsx, pages/auth-pages.jsx; server auth actions | AUTH-10 reset expired link displays the next step and never logs in; AUTH-10 verification checks a different-account link even when the signed-in email is already verified; AUTH-10 an older reset response cannot consume a newer warm link or show success for it | PASS automated; verification and reset links passed on the phone, invalid/replaced-link cases covered automatically |
| AUTH-12 | Suspended/deletion-requested account messages pause work without deleting saved data | mobile/src/auth/api-client.js, controller.js | AUTH-12 account deletion/suspension pauses work and preserves the separate encrypted journal | PASS automated |
| AUTH-13 | Known secure-session format upgrades migrate; invalid/future formats sign out without clearing unsent data | mobile/src/auth/vault.js, pending-work.js | AUTH-13 migrate older/unknown session formats never alter unsent data; AUTH-13 future older/unknown session formats never alter unsent data | PASS automated; phone secure storage probe and force-stop/cold-reopen persistence passed, format migrations covered automatically |

Pending-data sources have a generic registration interface. This auth step does
not implement point upload endpoints, run recording or an ACTIVE run status.
All automated native Google and server-verifier calls are mocked. The owner
confirmed real native Google success separately. Email signup, verification,
logout/login, wrong-password rejection, reset, sessions and cold-reopen
persistence also passed on the phone. Real uploads and cross-device active-run
enforcement remain explicitly deferred to step 05.
