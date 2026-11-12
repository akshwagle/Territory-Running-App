# Phase 4, step 03: Android authentication review

Verified 13 November 2026 (Asia/Kolkata). Branch: `feat/app-auth`.

The Android shell now supports email signup/login, native Google sign-in,
verification and reset links, sign-in methods, password changes, sessions and
sign-out. The only API change is `emailVerified` on `GET /api/me`, derived from
`users.verified_at`; session response envelopes keep their existing fields.
That change, its ownership/projection tests and server README are a separate commit.

## Schema change summary

No tables, columns, enums, constraints, indexes or migrations were added or
changed in step 03. There are still 27 application tables. Email verification
and reset tokens remain in the existing `auth_tokens` table.

## Security and dependency decisions

- `@aparajita/capacitor-secure-storage` 8.0.1 (MIT) uses Android Keystore keys and
  AES-GCM encrypted preferences. Native sessions and the separate pending-work
  journal use it. Browser preview credentials live only in tab memory; the
  plugin's localStorage web fallback is never called.
- `@capawesome/capacitor-google-sign-in` 0.1.4 (MIT) is pinned and unmodified.
  Only the adapter imports it. It requests the Web-client audience ID token,
  sends it directly to the API and keeps that Google token in memory.
- Capgo 8.7.9 was rejected for plain SharedPreferences persistence of Google
  tokens. Its dependency, lockfile, Gradle and Capacitor entries are absent.
  No dependency was patched or vendored. See mobile/THIRD_PARTY_NOTICES.md.
- Capacitor 8.6.0, App 8.1.2, React Router 7.18.5, Barlow/Barlow Condensed 5.3.0
  and the approved test/lint tools are exact-pinned. Router 7 supports the
  installed Node 22.19; the evaluated Router 8 release required a newer Node.
- Requests time out after 15 seconds. Concurrent 401s share one refresh and each
  original request is replayed once. Only explicit refresh 401 removes expired
  credentials; offline/timeouts/429/5xx preserve them and pause pending work.
- Local pending work is account-scoped and never silently removed on sign-out,
  reset, session expiry or session-format migration. Discard needs a second
  confirmation. Registered recording modules will later use the generic hooks.
- Android backup is disabled. Debug HTTP remains debug-only; the release merged
  manifest has cleartext disabled. The final APK has INTERNET plus the existing
  app-scoped AndroidX signature receiver permission. No biometric/location,
  camera, contacts or storage permissions were added.
- Runtime audit: zero vulnerabilities. Full audit: four moderate ESLint/minimatch
  development-tool findings, zero high/critical. No automatic fix or extra
  dependency was introduced. All automated Google calls use mocks/fake client IDs.

## Phone evidence and diagnostic cleanup

The owner confirmed real native Google sign-in success. Earlier taps failed in
Google Credential Manager with `UNREGISTERED_ON_API_CONSOLE`, followed by the
misleading `[16] Account reauth failed` cancellation. The actual installed APK's
package/signing SHA-1 and Web-client configuration were checked without printing
the client ID. The owner found the Android OAuth client missing, created it in
the same project with the verified package/certificate, then confirmed success.
The agent did not change Google Cloud or switch/patch the plugin.

Owner-confirmed email checks: signup and persistent verification banner; local
outbox link confirmation and banner removal; logout/login; wrong-password
rejection; generic forgot response; reset-link password update; login with the
new password; current-session label/no current Revoke button; and force-stop /
cold-reopen session persistence. The form submits visible native-autofill values,
with regression coverage for password managers that do not emit React change events.

All temporary phase logging, the diagnostic module/test and Android console
hook were removed. The built APK's JavaScript and DEX contain no diagnostic
markers. Permanent on-screen cancellation, provider/configuration, missing-token,
network and API rejection messages remain. The cleanup APK was installed with
`adb install -r`, preserving app data; its read-only encrypted-storage/log probe
passed. The additional UI hierarchy probe could not confirm visible home text,
so it is not counted as a second independent visual phone test.

Phone instructions and the private outbox helpers are in mobile/README.md.
Layout checks at 320/360/430 px covered 11 screens, 200% text, 48px controls and
reduced motion; screenshots remain ignored under .local/.

## Deferred to step 05

- Uploading saved points.
- The cross-device one-active-run rule.
- The ACTIVE run status.

These are owner-approved deferrals: no recording/upload endpoints or ACTIVE
status exist yet. This step supplies encrypted preservation and generic hooks,
with no fake runs. A two-physical-phone run/revocation exercise was not performed;
independent session families and ownership/revocation have API/component tests.

Other limits: real SMTP delivery has not been verified (phone mail tests used
the local outbox); HTTPS App Links need hosted assetlinks.json, so custom
`territoryrun://verify` / `territoryrun://reset` links are used; server rate limits
remain per process. The APK is a debug build, not a production signing/release.
Docker is still unverified; the tests use local PostgreSQL 16. No later step was started.

## Real verification output

The following are unmodified command-output excerpts. Complete private/local
transcripts remain under ignored .local/app-auth/. Test database reset uses the
existing guards and recreates only the distinct disposable *_test databases;
development was not reset or used by the automated suites.

### Mobile tests — npm test --prefix mobile

```text
> territory-run-mobile@0.1.0 test
> vitest run


 RUN  v5.1.0 /Users/akshwagle/Desktop/Territory-Running-App/mobile


 Test Files  6 passed (6)
      Tests  102 passed (102)
   Start at  00:50:53
   Duration  2.52s (environment 45%, tests 33%, setup 14%, transform 4%, import 3%)
```

### Mobile lint — npm run lint --prefix mobile

```text
> territory-run-mobile@0.1.0 lint
> eslint .
```

### API tests — npm run test:api --prefix server

```text
1..59
# tests 59
# suites 0
# pass 59
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 16806.318375
```

### Database tests — npm test --prefix server

```text
1..28
# tests 28
# suites 0
# pass 28
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4493.342708
```

### Web tests — npm test --prefix web

```text
> territory-run-web@0.1.0 test
> vitest run


 RUN  v5.1.0 /Users/akshwagle/Desktop/Territory-Running-App/web


 Test Files  6 passed (6)
      Tests  30 passed (30)
   Start at  00:51:35
   Duration  3.43s (environment 57%, tests 26%, setup 11%, import 4%, transform 1%)
```

### Web lint — npm run lint --prefix web

```text
> territory-run-web@0.1.0 lint
> eslint .
```

### Web production build — npm run build --prefix web

```text
> territory-run-web@0.1.0 build
> vite build && node scripts/bundle-sizes.js

vite v8.3.8 building client environment for production...
transforming...
✓ 434 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                                 2.05 kB │ gzip:  0.72 kB
dist/.vite/manifest.json                                        2.26 kB │ gzip:  0.44 kB
dist/assets/barlow-condensed-latin-800-normal-e9GbPXiK.woff    18.72 kB
dist/assets/barlow-latin-400-normal-fsAxiSwU.woff              19.58 kB
dist/assets/barlow-latin-600-normal-CNwfPWQD.woff              19.88 kB
dist/assets/barlow-latin-400-normal-qiz4-Cze.woff2             22.19 kB
dist/assets/barlow-condensed-latin-800-normal-BKzMuPgK.woff2   22.46 kB
dist/assets/barlow-latin-600-normal-DILqtrty.woff2             22.77 kB
dist/assets/index-CblHU49a.css                                 27.21 kB │ gzip:  6.59 kB
dist/assets/motion-features-Br3-cQov.js                        56.14 kB │ gzip: 19.77 kB
dist/assets/index-BQhB_UB4.js                                 258.23 kB │ gzip: 81.83 kB

✓ built in 320ms

Gzip sizes (actual emitted bytes, all chunks counted):
  assets/index-BQhB_UB4.js: 80991 bytes [mobile + desktop]
  assets/index-CblHU49a.css: 6560 bytes
  assets/motion-features-Br3-cQov.js: 19599 bytes [desktop effect chunk]
Mobile JavaScript: 80991 bytes (80.99 kB gzip); limit 90000.
All JavaScript, including desktop effects: 100590 bytes (100.59 kB gzip).
All CSS: 6560 bytes (6.56 kB gzip); limit 15000.
Phones and reduced-motion sessions skip the dynamic effect chunk; see usePresentationMotion.js and its tests.
```

### Mobile production build — included in npm run apk:debug --prefix mobile

```text
> territory-run-mobile@0.1.0 apk:debug
> bash ../scripts/apk-debug.sh


> territory-run-mobile@0.1.0 build
> vite build

vite v8.3.8 building client environment for production...
transforming...
✓ 50 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                                 0.36 kB │ gzip:  0.26 kB
dist/assets/barlow-condensed-latin-800-normal-e9GbPXiK.woff    18.72 kB
dist/assets/barlow-latin-400-normal-fsAxiSwU.woff              19.58 kB
dist/assets/barlow-latin-600-normal-CNwfPWQD.woff              19.88 kB
dist/assets/barlow-latin-400-normal-qiz4-Cze.woff2             22.19 kB
dist/assets/barlow-condensed-latin-800-normal-BKzMuPgK.woff2   22.46 kB
dist/assets/barlow-latin-600-normal-DILqtrty.woff2             22.77 kB
dist/assets/index-B4CKsUVG.css                                  5.38 kB │ gzip:  1.78 kB
dist/assets/native-qgFFwmS4.js                                  0.77 kB │ gzip:  0.33 kB
dist/assets/web-cmhmzquk.js                                     0.79 kB │ gzip:  0.38 kB
dist/assets/web-BEm1MkHp.js                                     0.84 kB │ gzip:  0.40 kB
dist/assets/web-Dtn-evYc.js                                     2.29 kB │ gzip:  1.10 kB
dist/assets/base-DrwcEKDL.js                                    2.77 kB │ gzip:  0.98 kB
dist/assets/index-BXwkUYaf.js                                 309.46 kB │ gzip: 97.43 kB

✓ built in 264ms
```

### Android debug APK — Gradle completion

```text
BUILD SUCCESSFUL in 8s
184 actionable tasks: 30 executed, 154 up-to-date

Debug APK: /Users/akshwagle/Desktop/Territory-Running-App/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

### Read-only phone storage/log proof — node scripts/app-auth-phone-proof.js

```text
PASS installed app: version 0.2.0 / code 3.
PASS secure session: encrypted AES-GCM plugin record present; no raw JWT or plaintext token fields in app preferences.
PASS current app logcat: no ID/access/refresh token patterns. Raw logcat and private preferences were not printed or saved.
This read-only probe supports the owner-reported phone flow; it does not itself perform Google sign-in or prove SMTP delivery.
```

### Real curl proof — node server/scripts/auth-proof.js

```text
Curl proof: API test database only; Google verifier and email delivery are mocked. http://127.0.0.1:53563
curl POST /api/auth/register -> HTTP 201
{"accessToken":"[REDACTED]","refreshToken":"[REDACTED]","expiresIn":900,"user":{"id":"b9695a4c-9964-4530-b439-ced879f361d8","email":"[REDACTED]","displayName":"Proof Runner","createdAt":"2026-11-12T19:22:43.866Z"}}
curl POST /api/auth/verify-email/request -> HTTP 202
{"message":"If verification is needed, an email will arrive shortly."}
curl POST /api/auth/verify-email/confirm -> HTTP 200
{"message":"Email verified. Return to the app; this link does not sign you in."}
curl POST /api/auth/password/forgot -> HTTP 202
{"message":"If an account exists, a password reset email will arrive shortly."}
curl POST /api/auth/password/reset -> HTTP 200
{"message":"Password updated. Sign in with your new password."}
curl GET /api/me -> HTTP 401
{"error":{"code":"UNAUTHORIZED","message":"This session has ended. Please sign in again."}}
curl POST /api/auth/login -> HTTP 200
{"accessToken":"[REDACTED]","refreshToken":"[REDACTED]","expiresIn":900,"user":{"id":"b9695a4c-9964-4530-b439-ced879f361d8","email":"[REDACTED]","displayName":"Proof Runner","createdAt":"2026-11-12T19:22:43.866Z"}}
curl POST /api/auth/google/link -> HTTP 200
{"identities":[{"id":"f7f697f6-43be-4875-926a-7a8a81da807d","provider":"PASSWORD","emailAtSignup":"[REDACTED]","createdAt":"2026-11-12T19:22:43.866Z","lastUsedAt":"2026-11-12T19:22:44.458Z"},{"id":"81777010-4060-44c5-ac2e-7c9dac0f2673","provider":"GOOGLE","emailAtSignup":"[REDACTED]","createdAt":"2026-11-12T19:22:44.472Z","lastUsedAt":"2026-11-12T19:22:44.472Z"}]}
curl GET /api/auth/identities -> HTTP 200
{"identities":[{"id":"f7f697f6-43be-4875-926a-7a8a81da807d","provider":"PASSWORD","emailAtSignup":"[REDACTED]","createdAt":"2026-11-12T19:22:43.866Z","lastUsedAt":"2026-11-12T19:22:44.458Z"},{"id":"81777010-4060-44c5-ac2e-7c9dac0f2673","provider":"GOOGLE","emailAtSignup":"[REDACTED]","createdAt":"2026-11-12T19:22:44.472Z","lastUsedAt":"2026-11-12T19:22:44.472Z"}]}
curl POST /api/auth/password/change -> HTTP 200
{"message":"Password changed. Other sessions have been signed out."}
curl GET /api/me -> HTTP 200
{"id":"b9695a4c-9964-4530-b439-ced879f361d8","email":"[REDACTED]","displayName":"Proof Runner","createdAt":"2026-11-12T19:22:43.866Z","emailVerified":true}
curl GET /api/auth/sessions -> HTTP 200
{"sessions":[{"id":"ddd336ed-e3e2-4deb-83b4-81807224d7b0","createdAt":"2026-11-12T19:22:44.458Z","lastUsedAt":"2026-11-12T19:22:44.458Z","deviceLabel":"Device / Browser","current":true}]}
curl DELETE /api/auth/sessions/ddd336ed-e3e2-4deb-83b4-81807224d7b0 -> HTTP 204
(empty body)
curl GET /api/me -> HTTP 401
{"error":{"code":"UNAUTHORIZED","message":"This session has ended. Please sign in again."}}
curl POST /api/auth/google -> HTTP 200
{"accessToken":"[REDACTED]","refreshToken":"[REDACTED]","expiresIn":900,"user":{"id":"b9695a4c-9964-4530-b439-ced879f361d8","email":"[REDACTED]","displayName":"Proof Runner","createdAt":"2026-11-12T19:22:43.866Z"}}
curl POST /api/auth/logout -> HTTP 204
(empty body)
AUTH COMPLETE CURL PROOF PASSED. No real Google flow or SMTP delivery was exercised.
Proof account removed; temporary proof listener closed.
Redacted transcript saved to .local/auth-complete/curl-proof.log
```

The curl proof used only the guarded API test database and closed its temporary
listener/removed its proof account. Google verification and mail were mocked in
that proof; the owner's separate phone confirmation establishes real native
Google sign-in. Secrets, real client IDs, passwords and private mail links are
not part of this report or Git history.
