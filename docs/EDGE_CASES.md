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

## Step 04: profile, consent, privacy, deletion and export

The reviewed migration passed the disposable-database gate, then development was
backed up and migrated after the owner's second go. Existing-account sign-in and
Settings passed. Profile/privacy persistence, consent and withdrawal/reacceptance, native export
sharing, throwaway-account deletion and return to the original account passed
on the owner's phone. Read-only checks confirmed empty share cache and erased
throwaway credentials, outbox messages and owned database rows. Real run recording/claims/point uploads remain step-05 work.

| ID | Scenario | Where implemented | Test name | Status |
| --- | --- | --- | --- | --- |
| PRIV-01 | Visibility switches immediately mask names while preserving ownership relationships; followers only under FOLLOWERS | server/src/profile/privacy.js, profile.js; mobile profile/privacy pages | PRIV-01 visibility matrix covers owner follower following-only stranger anonymous and administrator; PRIV-01 privacy writes affect public profile reads immediately; followers have access only under FOLLOWERS | PASS API/helper/UI tests; future map/leaderboard reads must reuse projections |
| PRIV-02 | Withdrawal stops recording before a network request, retains encrypted earlier points, requires explicit upload/discard; timestamps reject post-withdrawal points | server/src/profile/consents.js; mobile/src/profile/consent-controls.js and pending-work.js | PRIV-02 consent history is ordered, retries are harmless, and stale acceptance cannot undo withdrawal; PRIV-02 withdrawal stops recording before an offline request, preserves points, and needs explicit discard confirmation | PASS consent API/point-time decision/generic hooks; real uploads and mid-run integration deferred to step 05 |
| PRIV-03 | Policy version bump needs reacceptance before the next run, without altering older runs/history | server/src/profile/consents.js; mobile consent screen and recordingDecision | PRIV-03 policy version bumps require fresh acceptance without modifying old consent or runs; PRIV-03 current consent is checked before each future run; old versions require reacceptance | PASS API/mobile/DB; actual run-start gate deferred to step 05 |
| PRIV-04 | Atomic/idempotent erasure, audit redaction, cascade/hex release, rollback, work cancellation and no victim notification | reviewed migration; server/src/profile/deletion.js, jobs.js, exports.js; mobile controller | PRIV-04 deletion is atomic, idempotent, releases hexes and removes identifiers, sessions and export keys; PRIV-04 failed deletion rolls back earlier redactions and does not cancel work or delete an account; PRIV-04 confirmed deletion stops recording, clears credentials, own encrypted pending data, native Google state and caches | PASS DB/API/mobile, including outbox commit/rollback and queued-mail suppression; real ACTIVE run and claim workers deferred to step 05; phone throwaway-account deletion and original-account return PASS |
| PRIV-05 | Delete captain/sole admin: longest-standing member becomes CAPTAIN, no SystemRole promotion, empty team disbands | server/src/profile/deletion.js | PRIV-05 deleting a captain transfers to the longest-standing member without promoting system role; PRIV-05 deleting a sole captain disbands the team; simultaneous member deletions do not deadlock | PASS real API/database transactions |
| PRIV-06 | One active export, no IDOR/other-user coordinates, Runner redactions, 24h cleanup, delete race and Android cache lifecycle | server/src/profile/exports.js; data_exports constraints; mobile export-share.js | PRIV-06 concurrent exports reuse one active job, encrypt files and exclude other users, secrets and rival names; PRIV-06 expiry removes ciphertext and keys, missing artifacts fail safely, and export cannot outlive deletion; PRIV-06 cache remains readable after chooser selection until the app resumes from the receiving app | PASS API/DB/mobile; native share phone check and empty-cache return PASS |
| PRIV-07 | Case-insensitive names, advisory serialization, suffixes, 30-day reservations and admin-only history | server/src/profile/names.js, profile.js, auth modules; migration; mobile profile form | PRIV-07 exact profile edits reject canonical conflicts and reserve released names for 30 days; history is admin-only; PRIV-07 parallel registration and Google name claims are unique without deadlocks or errors; PRIV-07 an in-flight advisory lock forces a suffix even before the competing row exists | PASS API/unit/DB/UI |
| PRIV-08 | Approximate-only Android location is unusable for recording; explain need for Precise first | mobile/src/profile/consent-controls.js, ConsentPage | PRIV-08 approximate location is unusable; asks for precise location without requesting any OS permission | PASS parameterized permission-decision tests; actual permission prompt deferred to recording in step 05 |

## Step 04b: UI foundation

No API or schema changes. These checks use the owner-authorised Android phone,
read-only device navigation and guarded test databases. Device size/density,
font scale, navigation overlays and test network/media overrides were restored.
No real account was deleted or fixture run created.

| ID | Scenario | Where implemented | Test / manual check name | Status |
| --- | --- | --- | --- | --- |
| UI-01 | Camera cutout, gesture and three-button bars never cover header/tab controls | core SystemBars, platform/android.js, ui/Screen and TabBar, native theme | UI-01 real-camera cutout and both native navigation modes | PASS phone screenshots/geometry: top35px; bottom48px/config0 and14px/config2; tab background reaches832px and controls end784/818px |
| UI-02 | 130% system font at320px, no clipping/overflow and reachable forms | rem type, wrapping, own scroll, TextField/Button | UI-02 Android font_scale1.3 at320CSSpx | PASS real phone: body16→20.8px and labels14→18.2px, no horizontal overflow; text/target layout also covered by UI-10 fixture |
| UI-03 | Every form can reveal its focused field and submit, then restore after IME closes | platform/android.js; safe-area CSS; sticky form submit | UI-03 native IME events reveal the focused field and restore the layout without subtracting height twice; UI-03 owner login/create-account keyboard checks | PASS automated + owner confirmed login/create; corrected build measured12 visible field/action pairs across auth, profile and password/delete forms; editor Done also closes IME |
| UI-04 | App follows the phone light/dark setting, or the in-app Theme choice (System default, Light, Dark); Android never auto-inverts our themes | DayNight theme + values-night window colours, forceDarkAllowed=false, WebView darkening opt-out, platform/theme.js + early script in index.html set data-theme before first paint, choice in localStorage, system bar icons synced | UI-04 System follows prefers-color-scheme, Light/Dark override it, early script matches theme.js, bars follow theme; UI-04 settings Theme applies instantly and is stored locally; UI-04 phone: toggle device dark mode with Theme=System, then set Light and Dark while the phone is in the opposite mode | Automated PASS; on-phone check pending (previous locked-light device PASS no longer applies) |
| UI-05 | System back closes overlays first, pops nested routes, exits at root; no protected-history loop | platform/navigation.js, ui/Shell.jsx, modal stack | UI-05 dialog traps focus, native back closes it first, and cleanup restores focus; UI-05 a cold nested screen goes to its parent rather than exiting or redirect-looping; UI-05 phone sheet/nested/root | PASS automated and real Back: avatar sheet closed, Privacy→You, root exit; signed-in session survives reopening; 72 rapid tab switches had zero overlapping/missing/mismatched frames, scroll restored, owner confirmed no overlap |
| UI-06 | Rotation/split-screen remains usable | portrait manifest, responsive flex shell and scroll areas | UI-06 owner rotation and split-screen check | PASS owner confirmed portrait lock;384×416 short-window geometry/scroll test has no overlap. Actual Samsung split-screen mode not exercised |
| UI-07 | Slow/offline screens settle to Retry, no infinite spinner or duplicate writes | bounded API client, useResource, Skeleton/ErrorState, disabled write buttons and submit guard | UI-07 busy button blocks repeated taps; error has a working Retry; skeleton announces loading; UI-07 phone offline read/recovery | PASS automated form/resource cases; phone methods/sessions/password/privacy/consent/delete showed Retry without a remaining skeleton; delayed read showed skeleton then content; already-loaded cached privacy stays usable offline; page errors suppress duplicate connection banners; release footer stays mounted |
| UI-08 | Reduced motion has no slides/scales | ui/motion.css; reduced-media overrides | UI-08 phone reduced-motion media check | PASS real WebView: reduced=true, running animations0, transitionDuration0s; buttons override active transform under reduced motion; 36 reduced-motion tab switches had zero moving frames |
| UI-09 | TalkBack names, roles, order; art excluded | semantic HTML, labels, aria-current, aria-hidden, focus trap/restore | UI-09 controls have names, switch state and a labelled current tab; decorative icons are hidden; UI-09 owner TalkBack | PASS automated semantics; owner confirmed spoken names/roles/order on preview; focused-editor/radio semantics also have component coverage |
| UI-10 | 24-char names,60-char email, RTL/non-Latin, no overflow | bdi/dir=auto, min-width0, overflow-wrap and row-value ellipsis | UI-10 physical WebView synthetic long-text fixture at320px/130% | PASS public fixture: scrollWidth=clientWidth=320px, button52.46px; RTL text wraps; no private account values logged |

Manual repeat checks (test names start with their ID):

- **UI-01 cutout/bars**: use Android Display navigation settings for gesture,
  then three-button. Header and all tab labels stay above system areas; tab
  background continues underneath. Restore the original mode afterwards.
- **UI-02 system font**: set Android Font size to130%, open the320px layout,
  check headings, fields and button labels; scroll remains available. Restore.
- **UI-03 every form keyboard**: login/signup, forgot/reset/change password,
  profile name/bio and delete password/DELETE. Focus each field, use Next,
  reach submit without hiding text, close IME and verify header/tabs restore.
  Do not submit account deletion or send private values during this layout check.
- **UI-04 theme**: Settings > Appearance is System. Toggle the phone dark mode: the app
  follows live (paper vs warm black, readable status/navigation icons). Choose Light
  then Dark while the phone is in the opposite mode: applies instantly, survives a
  force-stop and cold start with no flash of the other theme. Inputs stay readable.
- **UI-05 back**: visit each nested destination, open avatar/discard overlays,
  use system Back; overlay first, parent next, exit only from a root. Reopen
  without clearing data; sign-in must survive.
- **UI-06 rotate/split**: rotate while in a form; portrait lock holds. If Samsung
  offers split-screen, open beside Settings and check scrolling/inputs/tabs in
  the smaller area; if unavailable, record that limitation, not a fabricated pass.
- **UI-07 network**: test real read-only screens with unavailable API, Retry
  after reconnect, then delayed responses; preserve entered values and encrypted
  saved work. Use only mocked/disposable data for destructive-write failures.
- **UI-08 reduced**: enable reduced motion before navigating/pressing/opening
  sheets; no movement/press scaling/hex reveal. Disable afterwards if desired.
- **UI-09 TalkBack**: enable in Android Accessibility, explore back/tabs,
  profile fields, password eye, switches and avatar dialog; labels and roles
  match the visual order and decorative hexes are skipped. Turn off afterwards.
- **UI-10 long text**: use synthetic text in a local layout fixture, never change
  the owner's profile just for overflow checks;320px and130% must wrap/ellipsis.

Text contrast checks (normal text AA): ink/paper13.63:1, muted/paper5.65:1,
clay/paper4.63:1, paper/pine6.96:1, paper/deep-pine11:1, error/paper-2 6.42:1.
Owner correction: replaced the reported large form boxes with a profile overview, focused editors, lighter fields and contained unsaved-change actions. Final phone sign-in/review confirmation remains pending before the PR.


Owner navigation correction: incoming-only tab fade replaces the two-layer
crossfade that briefly overlaid Settings and You. UI-05 rapid taps must show
exactly one active page at every frame, preserve scroll/drafts, and focus only
that page's heading. UI-08 repeats the stress check with reduced motion. Both
passed on the phone, and the owner confirmed the overlap is gone. Back direction
and the persistent release footer have regression coverage as well.


## Step 05 run recording — automated checks passed; recording phone proofs pending

SQL passed the disposable test gate, then was applied to development after the
owner's second go and verified backup on 2026-11-14. These rows track the whole
step; a server PASS does not claim the corresponding native/phone proof. There
are no provisional offline starts. Development still has 30 tables; all existing
rows were preserved. Native recording, encrypted storage and UI are implemented. Desk/outdoor recording phone proofs remain pending; automated checks do not substitute for them.

| ID | Scenario | Where implemented | Test name | Status |
| --- | --- | --- | --- | --- |
| PERM-01 | Permanently denied foreground location opens app settings without a prompt loop | TerritoryRecorderPlugin real permission state; Run permission sheet | PERM-01 blocked permission shows Android settings; PERM-01 blocked location opens settings without looping a system prompt | PASS controller/UI + native policy; Android prompt proof pending |
| PERM-02 | Permission revoked mid-run stops safely and preserves points | RunRuntime tick/pause; encrypted journal; Run screen | PERM-02 permission-loss event pauses the screen without losing the visible recorded stats | PASS UI event handling; native stop implemented; settings-revocation phone proof pending |
| PERM-03 | One-time and reset permissions checked at every start | TerritoryRecorderPlugin permissionState; controller start | PERM-03 real permissions are checked again at every start | PASS controller + native policy; real one-time/auto-reset proof pending |
| PERM-04 | Background denial allows foreground-only recording with a warning | Run permission sheet; RunRuntime foreground lifecycle | PERM-04 foreground-only option stays available and the warning persists throughout recording | PASS UI/controller; physical foreground/background proof pending |
| PERM-05 | Notification denial does not prevent a location foreground service | Run notification rationale; unmodified location service; notification actions | PERM-05 denied notifications explain the Active apps fallback and do not block continuing | PASS UI; Android notification-denial service proof pending |
| PERM-06 | Approximate-only grant blocks start with an explanation | Controller real-permission check and permission sheet | PERM-06 approximate-only location never reserves or begins a run | PASS controller + native policy; approximate-only phone proof pending |
| PERM-07 | GPS off auto-pauses and records interruption instead of cheating | RunRuntime GPS off/on controls; separated segments; Run UI | PERM-07 GPS loss shows a saved pause and return restores a separated recording segment | PASS UI; native interruption handling implemented; toggle phone proof pending |
| PERM-08 | Activity-recognition denial leaves steps absent and recording usable | Optional activity rationale; native step sensor; nullable batch signal | PERM-08 optional activity refusal proceeds to Ready without a required step signal | PASS controller/API; physical activity denial proof pending |
| LIFE-01 | OS/OEM kill retains committed points and offers recovery/battery guide | Application-bound foreground service; encrypted journal; recovery/battery guide | LIFE-01 process recovery offers saved state without automatically resuming GPS | PASS controller/native policy; actual process-kill proof pending |
| LIFE-02 | Calls, DND, navigation, lock and layout changes do not lose recording | Native service; RunStats/UI components; existing shell | LIFE-02 unit conversion long time and pace keep stable labels; 42 headless layout cases | PASS unit/layout (320–430px, 130%, reduced motion); physical interruptions pending |
| LIFE-03 | Reboot/battery loss offers finish at last stored point | RunStore; boot/process identity; finish-only recovery | LIFE-03 a reboot recovery preserves the native finish-only decision; LIFE_03_and_LIFE_05_committedPointsSurviveProcessStyleReopen | PASS controller/native policy and device journal reopen; real reboot pending |
| LIFE-04 | Failed writes stop capture and expose a bounded rescue buffer | RunStore atomic commit; RunRuntime stop/rescue/Retry; debug-only fault seam | LIFE-04 start is blocked on low storage and a committed native run survives a bridge failure; LIFE_04_failedWriteRollsBackPointAndAcknowledgementTogether | PASS controller + Android store instrumentation; runtime fault phone check pending |
| LIFE-05 | APK upgrade preserves/migrates recovery data | Versioned RunStore and durable upload lease | LIFE-05 recreating the controller reuses the installed journal lease and finishes its upload without erasure | PASS controller + Android reopen instrumentation; installing APK mid-run pending |
| LIFE-06 | One live run per account, including pauses and different devices | Run partial unique index; API account/install locks; mobile conflict actions | LIFE-06 ten concurrent connections create one live ACTIVE run without deadlock; LIFE-06 new recording begins only after a server acknowledgement | PASS DB/API/controller; second-physical-phone proof pending |
| LIFE-07 | Offline uploads retry by exact batch without duplicates or false cumulative acknowledgements | Native committed batches/leases; controller backoff/native HTTP; API receipts | LIFE-07 retry keeps the native batch body and key unchanged; LIFE-07 retryable rate limiting rejects excess writes | PASS API/controller/transport/UI and ciphertext instrumentation; extended offline phone proof pending |
| LIFE-08 | Stationary auto-pause/notification/finish thresholds | RecordingPolicy/RunRuntime inactivity; server stationary-tail clipping | LIFE-08 stationary auto-finish keeps raw tail evidence; LIFE-08 stationary end clips later manual control windows; LIFE_08_inactivityBoundariesDoNotFinishEarly | PASS API/native policy; real 5/30-minute phone timing pending |
| LIFE-09 | Tiny/empty run may be discarded without claiming; claimed run cannot | Confirm/discard UI; native discard tombstone; immutable server finish | LIFE-09 finish/discard always require explicit confirmation; LIFE-09 a completed summary never traps Back to Run in a redirect loop | PASS API/controller/UI; desk recording proof pending |
| LIFE-10 | Monotonic duration and wall-clock jump evidence | Native monotonic/server clock alignment; API signal-only chunks/events | LIFE-10 signal-only event batches are idempotent authenticated and owner scoped; LIFE-10 clock-jump and interruption signals plus battery/optional steps persist once | PASS API; native producer implemented; manual clock-change proof pending |
| LIFE-11 | 24h/100000-point limits, >8h INFO and configured retention | DB CHECKs; native limits; API review and retention | LIFE-11 point ceiling and run length are enforced; LIFE-11 raw-point retention purges auxiliary coordinates at expiry | PASS DB/API; native bounds implemented; endurance phone proof pending |
| GPS-01 | Cold start ignores distance until 25m accuracy or fifteen seconds | Native cold-fix policy and UI; server math | GPS-01 cold start waits for <=25m or fifteen seconds; GPS_01_coldFixWaitsForAccuracyOrFifteenSeconds | PASS server/native policy; physical GPS proof pending |
| GPS-02 | Jitter below max(8m, accuracy) adds no distance | RunRuntime live counter; server haversine/jitter policy | GPS-02 known spherical distances dateline crossing and stationary jitter are finite and bounded; GPS-02 finish calculates authoritative haversine distance | PASS server/native math; outdoor distance comparison pending |
| GPS-03 | Raw poor/outlier fixes retained; only server filters authoritative totals | Native raw encrypted capture; server filtering only | GPS-03 drift outliers and accuracy above 50m do not inflate server distance or mutate raw points | PASS API/server math; raw native writer implemented; outdoor proof pending |
| GPS-04 | Long gaps/missing sequences never create a connecting trace | Native time/segment breaks; server receipts; separate SVG paths | GPS-04 SVG paths never connect separate encoded segments; GPS-04 gaps over thirty seconds or missing sequences never join route traces | PASS API/UI/native math; physical gap proof pending |
| GPS-05 | Provider/mock retained; network points excluded from claim annotations | Native Location provider/mock; point columns; server geography | GPS-05 network-provider and mock flags survive ingestion; network points are excluded from restricted-cell claim annotations | PASS DB/API; native producer implemented; desk proof pending; claiming deferred |
| GPS-06 | Invalid points rejected atomically, future/window/sequence checks, invalid ratio SOFT | Native invalid-drop counter; point checks/Zod; SOFT ratio | GPS-06 invalid oversized future and out-of-window point batches leave no partial rows; GPS_06_invalidNumbersAndNegativeSpeedAreRejected | PASS DB/API/native math; device data collection proof pending |
| GPS-07 | Distant pause/resume forms separate segments and records soft movement evidence | Native pause/resume controls and positions; API segments/movement evidence | GPS-07 pause/resume is idempotent and never adds a path between distant positions | PASS API; native controls implemented; physical separated-route proof pending |
| GPS-08 | Restricted areas annotated generically, no ownership written | Server H3 annotations; generic detail notice | GPS-08 restricted cells are annotated without claims and the nearest region is attached | PASS API/UI notice; no claiming implemented |
| GPS-09 | Another city/country allowed; nearest geocoded region used where available | Server H3 nearest-region fallback | GPS-09 a different city uses the nearest known region cell and an empty catalog never blocks recording | PASS API; another-city outdoor proof not claimed |
| GPS-10 | Treadmill/stationary GPS yields no invented distance or steps-only claim | Native distance policy; server math; Run/empty route explanation | GPS-10 Run explains treadmill limits and starts via a permission flow; GPS-10 treadmill locations produce no distance | PASS server/UI; physical stationary timing pending |

Additional privacy proofs: PRIV-04 deletion aborts ACTIVE data atomically against
concurrent ingest and cannot leave a publishing run; PRIV-04 an aborted deletion
rolls back the ACTIVE-run abort marker and every point; PRIV-06 export includes
own new run signals and points, never another account recordings. Owner-only
404s hold even for public profiles. Native per-owner store/key erasure passed on Android instrumentation. Full recording/account-deletion phone proof remains pending. Java method names use underscores because Java identifiers cannot contain hyphens; the equivalent edge IDs are listed above.
