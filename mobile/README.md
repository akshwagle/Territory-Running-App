# Android authentication — phase 4, step 03

Use the single checkout at ~/Desktop/Territory-Running-App. The app has welcome,
signup, login, Google, verification, password recovery and signed-in account
screens. Settings includes sign-in methods/linking, sessions/revocation, password
change and sign-out. Run recording remains for a later step.

## Install and configure

Use Node 22.12+ (verified 22.19.0), JDK 21, Android platform 36 and Build-Tools
35.0.0. From the project root:

```sh
npm ci --prefix server
npm ci --prefix mobile
# Fresh clone only; preserve existing private files:
cp mobile/.env.example mobile/.env.local
```

Edit the ignored mobile/.env.local locally:

- VITE_API_URL: http://MAC_WIFI_IPV4:4000 for a debug phone build. Find the Mac's
  current en0 address with `ipconfig getifaddr en0`.
- VITE_GOOGLE_WEB_CLIENT_ID: the same public Web client ID as
  GOOGLE_WEB_CLIENT_ID in server/.env. Never put a client secret in the app.
- VITE_DOWNLOAD_URL: the website download page, such as
  http://MAC_WIFI_IPV4:5173/#download. Rebuild after changing these values.

The owner starts PostgreSQL and the API in Terminal:

```sh
./scripts/local-postgres.sh start
HOST=0.0.0.0 PORT=4000 npm start --prefix server
```

The phone and Mac must share a reachable Wi-Fi network. Allow incoming
connections if macOS asks. For isolated college Wi-Fi, use the phone's hotspot
for both devices, or set VITE_API_URL=http://localhost:4000, rebuild, and run
`adb reverse tcp:4000 tcp:4000` over authorised USB debugging. A phone browser
can check http://MAC_WIFI_IPV4:4000/api/health; the app's public update check
also exercises connectivity from its WebView.

## Build and install

```sh
npm run apk:debug --prefix mobile
"${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb" install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
"${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb" shell am start -n com.territoryrunning.app/.MainActivity
```

The build is 0.2.0 / versionCode 3, from app-version.json. Installation with -r
preserves app data. Never uninstall or clear app data as an auth troubleshooting
step: unsent data must survive session loss and upgrades. The build reuses the
existing debug keystore; it never creates one or accepts SDK licences.

The APK manifest was checked: INTERNET is the only Android feature permission.
The existing app-private AndroidX signature permission remains. Unused
USE_BIOMETRIC/USE_FINGERPRINT declarations from transitive AndroidX biometric
were removed through the app manifest merger; dependencies were not patched.
HTTP/mixed content is debug-only. Backup is disabled and Capacitor bridge
payload logging is disabled.

## Google setup and dependency decisions

- @capawesome/capacitor-google-sign-in **0.1.4**, MIT, released 2026-09-02;
  peer @capacitor/core >=8.0.0. The dependency is unmodified. Only
  src/auth/google-adapter.js imports it. It uses Android Credential Manager;
  embedded WebView OAuth is never used. initialize({clientId}) receives the
  **Web** ID and passes it to GetSignInWithGoogleOption as serverClientId.
  No Android OAuth client ID needs to be embedded in this plugin's configuration.
- The Android OAuth client must be in the same Google Cloud project, with
  package com.territoryrunning.app and the current debug certificate SHA-1.
  The owner configures Google Cloud and its test users. Read the fingerprint:
  `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`.
- @aparajita/capacitor-secure-storage **8.0.1**, MIT, released 2026-09-23.
  It targets Capacitor 8, JDK 21 and Android SDK 36; no npm peer range is
  declared. Its Android implementation encrypts values with AES-GCM keys in
  Android Keystore. Both tokens are replaced as one encrypted record.
- Capgo 8.7.9 was rejected because it persists Google ID/access tokens in plain
  SharedPreferences. Its dependency, lockfile, Gradle and sync entries were
  removed; none of its code was patched or vendored. See THIRD_PARTY_NOTICES.md.
- @capacitor/app **8.1.2** supplies foreground/deep-link events. react-router
  **7.18.5** supports Node >=20 and React >=18, fitting the current baseline;
  router 8 would require a newer Node baseline. Barlow packages are **5.3.0**.

Google ID tokens stay in memory just long enough to send to /api/auth/google
or /api/auth/google/link. Only the app's session is stored in Keystore-backed
storage. No tokens go into localStorage or plain Preferences. The storage
plugin's insecure web fallback is never invoked; browser previews use memory
only and lose their sign-in when the tab is reloaded.

Each explicit Google attempt clears the app's previous Credential Manager
selection state before opening the picker. App sign-out also requests that
cleanup; it does not remove the device's Google account or change its grants.
There is no automatic native-sign-in retry loop. Provider configuration,
account reauthentication, cancellation and missing-ID-token outcomes have
separate messages; email login stays available. A provider cancellation can
mean `[16] Account reauth failed`, rather than the user pressing Cancel. That
message can also hide `UNREGISTERED_ON_API_CONSOLE`; it does not establish that
the user needs to re-add their Google account.

ACCOUNT_LINK_REQUIRED displays the server's password-login/Settings instruction.
Identities are listed from /api/auth/identities; only the signed-in user's
methods and sessions are displayed. Settings labels the current family
"This device" and offers Revoke only on other families.

## Sessions, verification and recovery

The client waits 15 seconds per HTTP request, attaches the access token and
shares one refresh among concurrent 401 responses. Each original request is
replayed at most once. A late old-token 401 reuses an already refreshed token.
Only an explicit refresh 401 clears expired credentials; network failures,
timeouts, rate limits and server failures preserve them. Suspended/deletion
states show an account message and pause work. A replayed UNAUTHORIZED asks for
sign-in again. The phone clock never decides whether a server token is valid.

GET /api/me now adds only emailVerified, derived from existing users.verified_at
in the existing middleware query. Session envelopes retain their original
fields. The banner stays until the server confirms verification; it has a
Resend action and refreshes on foreground/reconnection. Signup requests the
first verification email after saving its session. No link implicitly logs in.
Server request/response contracts are in ../server/README.md.

Until hosting and assetlinks.json exist, native links use
territoryrun://verify and territoryrun://reset. Verified HTTPS Android App
Links are not yet deployed. Tokens are kept in component memory and scrubbed
from preview route history. Expired/used/wrong-purpose/different-account links
show the server's next-step message. Reset ends all app sessions and preserves
pending data; password change retains the current family.

Development messages are private JSON files in .local/mail-outbox/. They contain
sensitive links: do not print, share or commit them. Request a fresh email on
the phone, then open its most recent matching message without printing a token:

```sh
node scripts/open-auth-mail.js verify --dry-run
node scripts/open-auth-mail.js verify
# For password recovery, after requesting a fresh reset:
node scripts/open-auth-mail.js reset
```

The helper selects only a matching message from the last 15 minutes and requires
exactly one authorised phone. It passes the URI through adb stdin and suppresses
raw command output. The direct equivalent, using a placeholder token, is:
`adb shell am start -a android.intent.action.VIEW -d "territoryrun://verify?token=REPLACE_WITH_EMAIL_TOKEN"`.

## Pending-data contract

Auth never clears the separate encrypted pending-work journal on logout,
refresh failure, account blocking or session-format migration. It tells the
user that saved data remains encrypted. Data is scoped to its account ID.
Sign-out first checks for pending work and offers Upload first, Keep encrypted,
or Discard. Discard requires a second confirmation; failed uploads leave data.

Later modules register with auth.pending.register(name, source). A source
provides count(ownerId), pause(), resume(ownerId), upload(ownerId) and
discard(ownerId, confirmation). Registration honours the current auth state.
Only server-acknowledged items may be removed by a future uploader. Auth pauses
sources while signed out/offline/blocked, and resumes only the confirmed owner.
The default encrypted journal has no uploader in this build and says so plainly.

## Deferred to step 05

- Uploading saved points.
- The cross-device one-active-run rule.
- The ACTIVE run status.

The owner approved these deferrals because no recording/upload endpoints or
ACTIVE status exist yet. This step adds only preservation and generic hooks,
with no schema change and no fake recorded runs.

## Verification

```sh
npm test --prefix mobile
npm run lint --prefix mobile
npm run build --prefix mobile
npm audit --prefix mobile
node scripts/app-auth-phone-proof.js
```

DB and API regressions use the distinct guarded *_test databases; instructions
are in the server README. All automated Google checks use mocked native/server
verifiers and fake client IDs. Native Google sign-in passed on the owner's phone.
Provider
logs correlated with both failed app attempts show `UNREGISTERED_ON_API_CONSOLE`
followed by `Account reauth failed`, before an ID token or API request. A copy
of the actual installed APK confirms the expected package/debug signing SHA-1
and the same Web client ID as the API, without printing that ID. The owner found
that the Android OAuth client was missing and created it in the same project
with the verified package/SHA-1; the subsequent native sign-in passed. The agent
made no Cloud changes and the plugin remains unchanged. All temporary JavaScript
phase logging, its source module/test and the Android console hook were removed.
The final debug APK was checked for those markers and installed with app data
preserved. Clear on-screen errors remain. Real SMTP delivery remains unverified.

Observed on the owner's Android phone: email account creation shows the
verification banner; confirming the local-outbox verification link removes it;
sign-out followed by email login returns to signed-in home. The login retry
passed after the form was changed to read visible autofill values at submit.
That retry alone does not establish the cause of the earlier rejected login.
The read-only storage probe found the saved session in the plugin's encrypted
AES-GCM format and no raw token patterns in app preferences or current app logs.
The owner also confirmed wrong-password rejection, the generic forgot-password
response, password reset through the local-outbox link, and successful login
with the new password while the verification banner stays gone. The sessions
screen correctly labels the current session without a Revoke button. After a
force-stop and cold reopen, signed-in home returns without entering credentials
and the verification banner remains gone. Detailed results and real command
output are recorded in ../docs/PHASE4_APP_AUTH_REVIEW.md.

Runtime npm audit: zero vulnerabilities. Full audit: zero high/critical and four
moderate findings in the ESLint/minimatch tooling chain. No automatic audit fix
or unapproved dependency change was made. Layout checks cover 320/360/430 px,
200% text, 48px controls and reduced motion; screenshots stay in ignored .local/.

## Repeat the phone checks

1. Build and install with the instructions above; keep the API and PostgreSQL
   running in Terminal. Check /api/health in the phone browser first.
2. Tap Continue with Google and choose a configured test Gmail. Expect signed-in
   home. Sign out before testing a separate email/alias account.
3. Create an email/password account with a new alias. Expect the persistent
   verification banner. Run `node scripts/open-auth-mail.js verify` from the
   repository root, tap Confirm email, then Return to home; the banner disappears.
4. Sign out and log in with the same credentials. A wrong password must leave
   the login screen with an error. Forgot password must return the generic
   message whether or not an account exists.
5. After requesting a reset, run `node scripts/open-auth-mail.js reset`, set a
   new private password, then log in with it. Expect verified signed-in home.
6. Open Settings → Active sessions: the current entry says This device without
   a Revoke button; other entries have Revoke. Independent-family revocation
   has automated API/component coverage; a two-physical-phone test was not run.
7. Force-stop and reopen Territory Run without clearing app data. Expect the
   saved session to restore without entering credentials. Run the read-only
   `node scripts/app-auth-phone-proof.js` for the encrypted-storage/log check.

No password, email link, token or client ID needs to be pasted into chat. Verified
HTTPS App Links need future hosting/assetlinks.json. Server rate limits remain
per process. Browser previews intentionally retain sign-in only in tab memory.


## Step 04: profile, privacy, consent and data ownership

Debug build **0.3.0 / code 4** adds Settings rows Profile, Privacy, Consent,
Export my data and Delete account. It reuses the existing single auth controller,
API client, encrypted pending-data journal and native Google adapter. No new
location, external-storage or biometric permission is added. Generated hex
avatars use the website's Clay & Pine tokens and Barlow fonts; no image uploads.
Profile choices include units, a 140-character bio and an optional region.

Consent shows plain versioned notices, ordered history and **Android edition**
with the current app version. It does not block account settings or collect
location. Privacy includes Withdraw location consent. Its generic hook stops
recording immediately, including offline; earlier points remain encrypted and
need an explicit upload/discard choice. An offline withdrawal reports that the
server write must be retried. Discard requires a second tap. A future run must
re-check server consent, versions and precise location; approximate-only is
unusable. No Android permission is requested in this step.

Deletion requires exact DELETE plus a password or fresh linked Google sign-in.
If unsent data exists it needs an extra erasure tap before the request. A failed
request preserves that data. After 204, session credentials, this account's
pending data, Google credential state and local export/cache files are removed;
other accounts' encrypted pending data is not silently erased. Interrupted local
cleanup has an encrypted retry marker and blocks use until cleanup succeeds.
The login screen confirms deletion. Use a throwaway account for this test.

Approved exact-pinned **@capacitor/share 8.0.3** and **@capacitor/filesystem 8.1.5**
are MIT, unmodified and compatible with Capacitor 8.6.0 (peer >=8). Filesystem's
transitive @capacitor/synapse 1.0.4 is ISC, locked by npm. No additional direct
dependency was added. Exports use Directory.Cache only; FileProvider exposes
only the `territory-exports/` cache subdirectory. JSON contents never enter logs
or the UI. The file remains readable while the receiving app is open and is
deleted on return to Territory Run (also on cancellation); startup removes
interrupted export cache files. A copy intentionally saved/shared to another
app is outside Territory Run's control. Browser previews cannot use native sharing.

Full npm audit: four moderate dev-tool findings in ESLint/minimatch, no high or
critical findings; no automatic dependency upgrades were made. See
[the review](../docs/PHASE4_PROFILE_PRIVACY_REVIEW.md) for real outputs and phone
results. `docs/PHASE4_APP_AUTH_REVIEW.md` remains unchanged.

### Phone check sequence (one at a time)

1. Keep PostgreSQL and the current API running in Terminal, then install the
   debug APK with `adb install -r` (preserves app data). Open Settings → Profile,
   change name/avatar/units/bio, save and reopen to check persistence.
2. Open Privacy, choose Only me, change leaderboard/route switches and save.
   Reopen to confirm; restore any choices you want to keep.
3. Open Consent, read all notices, accept current versions, and inspect history.
   Privacy → Withdraw location consent must stop the recording hook and retain
   saved points; reaccept in Consent to restore the current choices.
4. Export my data → Request export → Check export (repeat if pending) → Share JSON.
   Choose a trusted recipient or cancel, then return to Territory Run. The cache
   file must be gone. No file, coordinates or token needs to be pasted in chat.
5. Sign out and use a NEW throwaway email/alias account. Delete only that account:
   Settings → Delete account, password, type DELETE, confirm. Expect login with
   deletion confirmation; the deleted credentials cannot sign in. Automated
   tests cover the extra unsent-data tap without fabricating real runs.
6. Sign back into the original account. It must still work. Google deletion is
   covered with the mocked verifier; fresh native Google reauthentication can be
   tested on a separate throwaway Google identity if desired, never the owner's
   existing account.

### Deferred to step 05

Uploading saved points, cross-device one-active-run enforcement and an ACTIVE
run status remain deferred. This step adds consent/version/precision decisions,
recording-stop and account-job cancellation interfaces with tests; it cannot
prove real mid-run withdrawal or claim-job cancellation before those APIs exist.
Future recording sources must register the hooks, persist their paused state,
validate point times and recheck the account under the server publication lock.
Map/leaderboard endpoints must reuse shared privacy projections. No counters
or new run status were added here.

Owner-confirmed step-04 phone results: Profile and Privacy save/reopen, consent
acceptance/history and withdrawal/reacceptance, native JSON sharing, deletion of
a fresh throwaway account, then original-account sign-in with choices intact all
passed. Read-only checks found zero leftover temporary export files, deleted
credentials/outbox messages/owned rows; no private values were printed.
