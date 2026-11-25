# Step 05 — first SQL gate verification

**Status: development migrations applied after the owner's second go on 2026-11-14.**
This is not completion of the mobile run-recording step. Native capture, the encrypted journal, notification integration and debug-only
indoor simulation are implemented. Automated checks are recorded below; the
owner's desk recording and outdoor phone proofs are still pending. The first-gate evidence below describes the earlier test-only stage;
the development deployment record at the end supersedes its pending-approval text.
The owner has restarted the final API source on port 4000; health is 200/db up. Guided recording phone proofs remain pending. Do not merge.

The owner approved the exact two SQL files for disposable test databases only,
the unmodified community location dependency/native encrypted store design,
server-only h3-js 4.5.0, and online acknowledgement for every new run. Branch is
feat/run-recording from updated main after merged PRs #9/#10. No commits yet.
The two migration files were byte-compared with the approved drafts: identical.

## Migration output — real TAP diagnostics

```text
# Prisma schema loaded from prisma/schema.prisma
# Datasource "db": PostgreSQL database "territory_test", schema "public" at "127.0.0.1:55432"
# 5 migrations found in prisma/migrations
# Applying migration `20261113000000_profile_privacy`
# Applying migration `20261113010000_run_status`
# Applying migration `20261113010100_run_recording`
# The following migration(s) have been applied:
# migrations/
#   └─ 20261113000000_profile_privacy/
#     └─ migration.sql
#   └─ 20261113010000_run_status/
#     └─ migration.sql
#   └─ 20261113010100_run_recording/
#     └─ migration.sql
#       
# All migrations have been successfully applied.
```

These runs used the existing URL/identity/PostgreSQL-16 guards. The isolated
public schemas were recreated only in territory_test and territory_api_test;
no TRUNCATE cleanup, history-guard weakening or development reset was used.
The DB suite independently proves 26 original tables, 27 after auth, and 30 after
profile/privacy plus recording. It checks every column/default/enum/FK/index/CHECK,
the unchanged audit/history guards, the original ten-runner and sorted two-connection
territory concurrency cases, and one ACTIVE recording from ten racing connections.

## Actual regression output excerpts

```text
npm test --prefix server
1..45
# tests 45
# pass 45
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2660.916291

npm run test:api --prefix server
1..124
# tests 124
# pass 124
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 25521.137

npm test --prefix mobile
 Test Files  13 passed (13)
      Tests  155 passed (155)

npm test --prefix web
 Test Files  6 passed (6)
      Tests  30 passed (30)

> territory-run-mobile@0.1.0 lint
> eslint .

> territory-run-web@0.1.0 lint
> eslint .

npm run build --prefix mobile
dist/assets/data-pages-uOKqIkpD.js                              8.16 kB │ gzip:   3.01 kB
dist/assets/web-BuolxOFl.js                                     8.43 kB │ gzip:   2.80 kB
dist/assets/profile-pages-BKKoChoX.js                          12.90 kB │ gzip:   4.32 kB
dist/assets/index-MGtkMCCD.js                                 330.37 kB │ gzip: 104.65 kB

✓ built in 123ms

npm run build --prefix web
  assets/index-BQhB_UB4.js: 80991 bytes [mobile + desktop]
  assets/index-CblHU49a.css: 6560 bytes
  assets/motion-features-Br3-cQov.js: 19599 bytes [desktop effect chunk]
Mobile JavaScript: 80991 bytes (80.99 kB gzip); limit 90000.
All JavaScript, including desktop effects: 100590 bytes (100.59 kB gzip).
All CSS: 6560 bytes (6.56 kB gzip); limit 15000.
Phones and reduced-motion sessions skip the dynamic effect chunk; see usePresentationMotion.js and its tests.

> territory-run-mobile@0.1.0 check:bundle
> node scripts/check-budgets.mjs

Main JavaScript gzip: 103588 bytes (limit: 350000).
CSS gzip: 5489 bytes.
```

Server npm audit: 0 vulnerabilities (0 high/critical). Only h3-js 4.5.0 has been
installed in this stage. Mobile/web source and dependencies remain unchanged.
No new APK/native permission claims are made by these Vite regression builds.

## What the API tests prove

- Idempotent creates, ACTIVE uniqueness across installations, stale takeover only
  after ten minutes without fresh received points, no new provisional offline runs.
- Live mutation install guard, email verification/configured minimum version,
  auth/body/ID/pagination validation, owner-only 404s even for a public profile.
- Atomic max-500 ingestion, full 500-point case, exact duplicate/overlap handling,
  out-of-order batches/gap healing, future/window/increasing-sequence timestamps,
  conflicting receipt/point rejection and retryable write limiting.
- Shared current/historical consent helpers: withdrawal stops new points while
  earlier valid points still upload; a policy version bump blocks the next start.
- Idempotent pause/resume and finish, separate segments across movement, haversine
  fixture, jitter/cold fixes/outlier/poor-accuracy gaps, soft evidence (not rejection).
- Restricted-cell/nearest-region annotations only; no ownership or hex writes.
- Atomic account deletion against ingest and rollback preservation, own export
  with new signals/points excluding another account, configured point cleanup.

Recordings normalize times against the server/monotonic timeline; raw device
wall-clock changes remain evidence. route_polyline's new versioned segment JSON
envelope and the routeSegments DTO prevent a trace line across a pause/gap.
See server/README.md for exact endpoint/header/query contracts and thresholds.

## Bounded local load proof

Ran only against the separately guarded DB-test database (not the API database
reserved for the owner's curl run). It created and removed only its own fixture.

```json
{"database":"guarded DB-test database","points":100000,"finalBatch":500,"ingestionMs":1334,"historyMs":16,"historyBytes":430,"finishMs":1878,"storedSignalsBytes":1104096,"status":"PENDING_VALIDATION"}
```

This exercises the last 500-point write into a 100,000-point run with populated
auxiliary JSONB metadata, history's SQL-side summary projection, and finish.
It is one local-machine sample, not a production load benchmark. JSONB rewrites
remain a storage trade-off under the explicitly approved schema; no hidden
counter/auxiliary column or extra table was added.

## Development read-only proof

The check ran in BEGIN READ ONLY, then ROLLBACK. No new recording enum value,
column, index or migration exists in development. No existing account was modified.

```json
{
  "developmentTables": 30,
  "developmentMigrations": [
    "20261111000000_init",
    "20261112000000_auth_foundation",
    "20261113000000_profile_privacy"
  ],
  "newRunRecordingColumns": 0,
  "runStatusValues": [
    "UPLOADING",
    "PENDING",
    "VALID",
    "FLAGGED",
    "REJECTED"
  ],
  "rowsViolatingProposedRunLength": 0,
  "rowsViolatingProposedPointChecks": 0
}
```

The current data contains no rows violating the proposed length/point CHECKs.
A second approval still needs a backup before any development DDL. The revised
location-retention notice/version also requires reacceptance after that deployment;
private .env is not edited at this first gate.

## Curl and next approval

Owner Terminal command (finite temporary listener, guarded API test DB only):

```sh
cd ~/Desktop/Territory-Running-App
node server/scripts/run-recording-proof.js
```

The helper sends real curl requests for registration, create/retry/conflict,
points/retry, owner/foreign detail, pause/resume, finish/retry, history and discard.
Output is allowlisted: no raw coordinates, routes, client IDs, passwords, emails or
authentication tokens. Google/mail are mocked; fixture accounts and listener are
cleaned up. **PASS — the owner ran the helper in Terminal and supplied the
following real output.** No real Google flow or SMTP delivery was exercised.
Development approval is still pending; this result does not authorize development
DDL. The temporary listener and proof accounts were cleaned up.

```text
Run recording curl proof: guarded API test database only; no real Google/email. http://127.0.0.1:52113
curl POST /api/auth/register -> HTTP 201
{"accessToken":"[REDACTED]","refreshToken":"[REDACTED]","user":"[fixture account]"}
curl POST /api/auth/register -> HTTP 201
{"accessToken":"[REDACTED]","refreshToken":"[REDACTED]","user":"[fixture account]"}
curl POST /api/runs -> HTTP 201
{"run":{"status":"ACTIVE","state":"ACTIVE","distanceM":0,"durationS":null}}
curl POST /api/runs -> HTTP 200
{"run":{"status":"ACTIVE","state":"ACTIVE","distanceM":0,"durationS":null}}
curl POST /api/runs -> HTTP 409
{"error":{"code":"RUN_ACTIVE_ELSEWHERE","message":"A run is already active. Resume it, cancel this start, or end it after ten minutes without new points."}}
curl POST /api/runs/[fixture-run]/points -> HTTP 200
{"highestSeq":1,"duplicate":false,"recordingAllowed":true}
curl POST /api/runs/[fixture-run]/points -> HTTP 200
{"highestSeq":1,"duplicate":true,"recordingAllowed":true}
curl GET /api/runs/[fixture-run] -> HTTP 404
{"error":{"code":"NOT_FOUND","message":"This run was not found."}}
curl GET /api/runs/[fixture-run] -> HTTP 200
{"run":{"status":"ACTIVE","state":"ACTIVE","distanceM":0,"durationS":null}}
curl POST /api/runs/[fixture-run]/pause -> HTTP 200
{"run":{"status":"ACTIVE","state":"PAUSED","distanceM":0,"durationS":null}}
curl POST /api/runs/[fixture-run]/resume -> HTTP 200
{"run":{"status":"ACTIVE","state":"ACTIVE","distanceM":0,"durationS":null}}
curl POST /api/runs/[fixture-run]/finish -> HTTP 200
{"run":{"status":"PENDING_VALIDATION","state":"DONE","distanceM":11,"durationS":30}}
curl POST /api/runs/[fixture-run]/finish -> HTTP 200
{"run":{"status":"PENDING_VALIDATION","state":"DONE","distanceM":11,"durationS":30}}
curl GET /api/runs?limit=1 -> HTTP 200
{"runCount":1}
curl DELETE /api/runs/[fixture-run] -> HTTP 204
(empty body)
curl GET /api/runs/[fixture-run] -> HTTP 404
{"error":{"code":"NOT_FOUND","message":"This run was not found."}}
RUN RECORDING CURL PROOF PASSED. Coordinates, routes and credentials were not printed.
Proof accounts removed; temporary proof listener closed.
```

The first test gate is satisfied: 45 DB tests, 124 API tests, 155 mobile tests,
30 web tests, lint/build regressions, bounded load proof and owner-run curl proof
passed. The next request is a second explicit go for development only after a
verified backup at .local/backups/before-run-recording.dump. Stop before DDL if
that backup cannot be created or verified. Table count must remain 30. Recheck
existing-account access after deployment and ask the owner to reaccept the revised
location-retention notice. No development DDL or private env edits have occurred.

## Schema additions (plain text)

Tables added/dropped: none; application table count remains 30.
RunStatus values added: ACTIVE, PENDING_VALIDATION; no PAUSED value or new enum.
runs columns added: run_signals JSONB NOT NULL DEFAULT {}, deleted_at TIMESTAMPTZ(6) NULL.
runs columns changed: ended_at and duration_s allow NULL only in ACTIVE rows,
  enforced by runs_recording_state_check; closed rows still require both values.
run_points columns added: provider VARCHAR(16) NOT NULL DEFAULT unknown,
  is_mock BOOLEAN NULL (legacy unavailable is NULL).
CHECKs added: runs_recording_state_check, runs_max_length_check,
  runs_signals_object_check, run_points_provider_check,
  run_points_seq_nonnegative_check, run_points_coordinates_check,
  run_points_accuracy_check, run_points_speed_check.
Partial unique index added: runs_one_active_user_key on user_id WHERE
  status=ACTIVE AND deleted_at IS NULL.
Existing CHECKs/FKs/keys/columns retained; no audit/history trigger/function changes.

All PERM/LIFE/GPS rows are recorded in docs/EDGE_CASES.md. Partial server proofs
are labelled separately from native/device proofs; no outdoor test is claimed.


## Second go and development deployment — 2026-11-14

The owner explicitly approved taking the backup first and applying exactly
20261113010000_run_status and 20261113010100_run_recording to development.
PostgreSQL was already running and was neither stopped nor restarted.

The backup and before-data fingerprints used the same exported PostgreSQL snapshot.
pg_dump used the private connection settings from server/.env through environment
variables, with no credentials in arguments or printed output. The archive is
custom-format, nonempty, mode0600 and gitignored. pg_restore listed all application
tables plus migration history and read the entire archive into /dev/null without
connecting to or restoring any database. Application data was fingerprinted again
immediately before migration; it still matched the verified backup snapshot.

Real backup output:

```text
Backup created: .local/backups/before-run-recording.dump
Backup exists: true; nonempty: true; size: 102781 bytes; mode: 0600.
pg_restore verification: full archive readable; all 30 application tables and migration history included.
Existing-data fingerprints saved privately for before/after verification. No credentials or record contents printed.
```

Real migration output excerpt:

```text
5 migrations found in prisma/migrations
Applying migration `20261113010000_run_status`
Applying migration `20261113010100_run_recording`
All migrations have been successfully applied.
```

Post-application proof (only public metadata/counts; no record contents or keys):

```json
{
  "backup": {
    "path": ".local/backups/before-run-recording.dump",
    "bytes": 102781,
    "exists": true,
    "nonempty": true,
    "mode": "0600",
    "fullArchiveReadable": true,
    "tableDataEntries": 31,
    "createdAt": "2026-11-13T19:31:35.901Z"
  },
  "appliedMigrations": [
    "20261113010000_run_status",
    "20261113010100_run_recording"
  ],
  "verification": {
    "tableCount": 30,
    "runStatusValues": [
      "UPLOADING",
      "PENDING",
      "VALID",
      "FLAGGED",
      "REJECTED",
      "ACTIVE",
      "PENDING_VALIDATION"
    ],
    "accountsBefore": 3,
    "accountsAfter": 3,
    "runsBefore": 0,
    "runsAfter": 0,
    "pointsBefore": 0,
    "pointsAfter": 0,
    "accountRowsUnchanged": true,
    "runRowsUnchanged": true,
    "pointRowsUnchanged": true,
    "all30TablesExistingRowsUnchanged": true,
    "newChecksValidated": 8,
    "oneActiveIndexValid": true
  },
  "configuration": {
    "minimumAppVersion": 6,
    "pointRetentionDays": 365,
    "runWriteLimit": 1200,
    "locationConsentVersion": "2026-11-13-run-v1",
    "unrelatedSettingsPreserved": true
  },
  "apiRestart": "pending owner Terminal restart",
  "postgres": "running on 127.0.0.1:55432"
}
```

The comparison covers every existing row in all 30 application tables, including
all fields of users, auth identities, tokens, privacy/profile/consent history,
legacy run and raw-point columns. New columns were excluded from the legacy-data
fingerprint comparison; the eight new validated CHECKs and unique index were
verified separately. No original migration checksum changed. There were three
accounts, zero runs and zero points before application; all remain unchanged.
This is a stored-data preservation check, not a new manual sign-in claim.

Prisma Client 6.19.3 was regenerated successfully. Only the documented run keys
in the private, gitignored server/.env were updated; credentials and unrelated
settings were preserved. The new location-retention policy version requires
reacceptance before recording a run; existing account/sign-in data is untouched.

Owner restart: Ctrl+C in the Terminal running the old API, then from repository
root run `HOST=0.0.0.0 PORT=4000 npm start --prefix server`. Leave PostgreSQL running.
The new process should print `API listening at http://0.0.0.0:4000`.


## Mobile implementation checkpoint — 14 November 2026

The owner restarted the API after the development migration. A second API-only
restart was requested after completing signal-only batches and stationary-tail
handling; PostgreSQL remains running. No further development schema changes
were made. No recording phone/outdoor result is claimed yet.

Implemented: native write-before-upload AES-GCM journal, Android Keystore keys,
foreground-service notification controls, permissions/rationales, durable leases,
server-aligned monotonic time, pause segments, consent/auth pending-work hooks,
recovery, storage-stop/rescue behavior, and Run/summary/history/detail screens.
App version 0.4.0/code 6. The existing UI components and single-painted-route
navigation are reused. No claiming, validation or map implementation was added.
The local psql wrapper selects aggregate counts only; it never prints connection
settings, points, emails or tokens.

Latest successful automated output (exact excerpts):

```text
DB:
# tests 45
# pass 45
# fail 0

API:
# tests 128
# pass 128
# fail 0

Mobile:
 Test Files  17 passed (17)
      Tests  191 passed (191)

Web:
 Test Files  6 passed (6)
      Tests  30 passed (30)

npm run lint --prefix mobile
> eslint .

npm run lint --prefix web
> eslint .

Android encrypted store:
com.equimaps.capacitor_background_geolocation.RunStoreTest:.....
Time: 10.021
OK (5 tests)

Android policy/math: tests="9" failures="0" errors="0"

PASS: 42 screen/width/font-scale combinations; no overflow, one visible route, tabs >=48px. Screenshots: .local/screenshots/.
```

Headless checks used fixture accounts and intercepted files only, with no live
API, Google or native calls: seven screens at 320/360/430 px, normal/130% text,
reduced motion. These do not replace physical GPS or lifecycle phone proof.
Debug and unsigned release Gradle builds passed. The release APK excludes the
native producer, debug bridge methods and JS/button entry points. The deliberate
stale-debug-assets release build failed with the intended verifyReleaseAssets
message; a subsequent normal-asset release build passed. Three upstream Android
source files match the inspected 1.3.1 package exactly.

An existing export test's frozen auth clock could fall behind a just-issued JWT
when registration crossed a second boundary. Its auth now uses real time;
export expiry alone uses the test clock. Production auth was unchanged. A new
regression test prevents the summary's Back to Run action from redirect-looping.

Audits: mobile 0 high / 0 critical / 4 moderate (development ESLint toolchain);
server 0 vulnerabilities. No automated dependency upgrades were applied.

### Desk proof — owner actions, one screen at a time

1. Sign into the installed build. Open Run → Get ready to run. Review and accept
   the current Location/Terms/Privacy notices if requested; return to Run.
2. Read the precise-location explanation before allowing Precise location.
   Review background permission separately, choosing Allow all the time for
   the screen-off test. Notification and activity prompts have separate
   explanations; steps are optional. Declining background allows foreground
   only, which intentionally pauses when this app is no longer visible.
3. Close the Ready sheet without starting a real run. Tap Start desk simulation.
   Expect a mock-run notice, increasing time/distance, and a recording notification.
4. Pause, then Resume. Turn Wi-Fi/mobile data off briefly; counts remain saved,
   sync says Waiting for signal. Reconnect and Retry sync; no duplicate points.
5. Desk simulation tools → Test storage stop. Keep the app open. Expect the
   storage warning and a held-fix count. Retry storage: the held fix is committed
   before a safe pause. Resume to continue. This fault API is absent in release.
6. Kill the process during this simulated run (a finite adb force-stop can be
   performed during the guided proof), then reopen. Expect Resume your run or
   Finish it, with committed counts preserved. Do not clear app data/uninstall.
7. Resume, finish, wait for upload and open history/detail. Expect mock GPS and
   Pending validation, separated trace segments, and server totals. Discard the
   simulated run after checking it, so it is never mistaken for real evidence.

### Real ten-minute outdoor proof — NOT YET RUN

1. Start with the phone on the Mac's Wi-Fi and the API reachable at the configured
   LAN address. Sign in, accept current notices and grant precise/background
   location. Use a normal Start run, not the desk simulator. Only the start needs
   the server; an acknowledged run can continue after leaving Wi-Fi coverage.
2. Walk outdoors for about two minutes with the run visible. Check the persistent
   notification's time/distance and Pause/Resume controls. Lock the screen and
   walk another two minutes. With background permission, points should continue.
3. Reopen, pause, move a little, resume and continue walking. No straight line
   should join the paused movement. Try DND/another app briefly; keep a safe route.
4. At roughly minute six, kill the app/process without clearing app data. Reopen
   and choose Resume your run. A new segment records the collection gap. Continue
   until about ten minutes. A force-stop stops collection until reopening; the
   app must not invent points for that time.
5. Finish, return to the Mac's Wi-Fi and keep the app open until All saved. Open
   Run history and the latest detail; expect Pending validation, plausible stats
   and separate SVG trace segments. No hexes are claimed in this step.
6. In Terminal at the repo root run the read-only psql report:

```sh
cd ~/Desktop/Territory-Running-App
./scripts/run-points-report.sh
# Optional: ./scripts/run-points-report.sh <run-uuid>
```

The wrapper invokes the relocated PostgreSQL 16 psql using server/.env only in
its child environment. It selects the latest three non-deleted run summaries,
point/distinct-sequence counts, sequence bounds, mock count, long gaps and segment
count. No raw coordinates, account details or connection strings are printed.
Send back pass/failure at each stage, the reported distance/time/point counts,
whether screen-off capture/recovery/history worked, and the aggregate psql output.
Never send credentials, raw points or export contents. Do not claim the outdoor
proof passed until the owner reports it.

### ER diagram changes (plain text inventory)

Tables: none added or dropped; application table count remains 30.
RunStatus enum: added ACTIVE and PENDING_VALIDATION; retained all existing values.
runs: ended_at and duration_s made nullable only for ACTIVE; added run_signals
JSONB NOT NULL DEFAULT '{}' and deleted_at TIMESTAMPTZ nullable.
run_points: added provider VARCHAR(16) NOT NULL DEFAULT 'unknown', is_mock BOOLEAN nullable.
Added CHECKs: runs_recording_state_check, runs_max_length_check,
runs_signals_object_check, run_points_provider_check,
run_points_seq_nonnegative_check, run_points_coordinates_check,
run_points_accuracy_check, run_points_speed_check.
Added partial unique index: runs_one_active_user_key on user_id where status
is ACTIVE and deleted_at IS NULL. Existing time/distance/duration CHECKs retained.
No primary keys, foreign keys, history guards or audit triggers changed.

Final pre-phone build: code 6 debug APK installed with adb install -r (Success), preserving app data. Android encryption/acknowledgement instrumentation rerun passed 5/5; policy/math 9/9. Mobile checks passed 191/191 with lint. Debug APK build succeeded; no staging, commits or push yet. Desk and outdoor recording proof remain pending the owner's API restart and guided checks.

Phone handoff: owner confirmed the final API-only restart on 14 November; health 200/db up verified. The installed app restored the existing signed-in Home session, with native recorder IDLE, no saved run and no storage error. Desk check 1 (updated consent acceptance) is now pending the owner; no GPS recording was started.

Desk check 1: owner reported PASS for all current consent notices Accepted.
Read-only Android permission inspection then showed precise location granted,
background/notifications/activity not granted, GPS on. No run has started.
Foreground-only fallback is the next guided check. A navigation regression test
was added so opening the consent page closes the old permission sheet; the next
APK build will include it.

Desk check 2: owner reported PASS. Choosing Use foreground only advanced to the notification explanation. This verifies the permission-flow fallback; foreground-only capture/pause behavior still awaits the desk run.

Desk check 3: owner reported PASS after denying Android notification permission. The app advanced to Optional step signal. Location-service operation with that denial remains to be checked during the desk recording.

Desk check 4: owner reported done; read-only phone inspection confirmed the Ready when you are sheet, precise location granted, background/notification/activity permissions not granted and recorder IDLE. No run had started. The next check starts the explicitly marked desk simulation.

Desk check 5: owner reported PASS. Read-only live proof confirmed ACTIVE simulated recording, foreground-only mode, 73 committed local points, 56 distinct uploaded points (all mock), two batches with stepDelta null, notification/activity permissions denied, and an actual foreground location service with recording notification ID 28351. No coordinates, tokens or account details were printed. This proves the service can run with notification permission denied and activity signal omitted.

```json
{
  "phone": {
    "state": "ACTIVE",
    "simulated": true,
    "distanceM": 144.10882398265463,
    "elapsedMs": 79148,
    "pointCount": 73,
    "pendingPoints": 17,
    "foregroundOnly": true,
    "storageFailed": false,
    "notifications": false,
    "activity": false,
    "hasPause": true,
    "errorVisible": false,
    "locationServicePresent": true,
    "serviceForeground": true,
    "recordingNotificationId": true
  },
  "database": {
    "status": "ACTIVE",
    "mockGps": true,
    "storedPoints": 56,
    "distinctSequences": 56,
    "mockPoints": 56,
    "batchCount": 2,
    "stepSignalsAllAbsent": true
  }
}
```

Desk check 6: owner reported the expected foreground-only pause. Native proof
confirmed PAUSED/FOREGROUND_ONLY, stopped foreground service and all 240 points
already uploaded distinctly as mock. However, one pause control remained queued:
the live API returned INVALID_INPUT. The exact pending request passed the
current source validator locally without exposing its coordinate payload. Process
inspection identified port 4000 listener PID 67140, started 01:06 on 14 November,
before validation.js changed at 01:27 and service.js at 02:51. The earlier health
check confirmed availability but did not establish new-source loading. A targeted
owner-Terminal restart is required; no schema or request relaxation is needed.
App Info is open, with no permission change requested yet. Run data is preserved.

Targeted restart resolved the pause validation failure: a single API listener
PID 43551 started at 10:08 on 14 November, after the source changes, with cwd
server in the Desktop repo. Health is 200/db up. The unchanged queued pause
request then synced automatically; the server recording state became PAUSED
and retained all 240 distinct points. No body relaxation or schema change was
made. Foreground-only pause is now confirmed end to end.

Desk check 7: owner reported PASS for Allow all the time with precise location.
The run remains paused. Notification enablement is next. The pending small
consent-sheet navigation fix will be installed as an in-place APK update during
the paused run to exercise journal preservation. Native manual Resume now labels
its control USER; PROCESS_RECOVERY is reserved for an actual recovery choice.
No schema or API change is involved, and the API need not restart.

Desk check 8: owner enabled notifications; read-only permission check confirmed
background and notifications true, activity false. In-place APK update succeeded.
Private run-identity comparison and metadata checks proved the same 240 points,
472.35670083210016 m and 257756 ms paused time survived, with explicit recovery
choices and no storage error. A further debug hardware-feed guard was installed
while still paused; the same preservation check passed again. No real location
fix is accepted into a simulated run during the start/resume handoff.
Mobile checks for the consent-sheet fix: 192 tests, lint, debug build passed.

Desk check 9: owner reported PASS for recovery Resume, growing counters and the
recording notification's distance/time/Pause/Stop controls. Native inspection
confirmed ACTIVE with background mode, no visible error and a foreground service;
436 uploaded points were all distinct and all mock. Activity signal remained
absent. A recovery handoff also produced an immediate inactivity pause/resume
before the first synthetic fix; the explicit-resume inactivity baseline will be
reset before final delivery so a long manual/recovery pause cannot trigger the
old stationary timer immediately. The stored points and segments were preserved.

Desk check 10: owner reported PASS for notification Pause (elapsed time stopped and action changed to Resume) and notification Resume (active counters continued). The next check disconnects phone Wi-Fi/mobile data while retaining the existing acknowledged mock run.

Desk check 11: owner confirmed Waiting for signal while time and distance kept
increasing with phone Wi-Fi/mobile data off. Read-only proof showed 810 local
points versus 648 uploaded points, 162 pending, with the foreground service still
active. An adb force-stop and offline reopen preserved the same run and all 810
points, still with 162 pending. Recovery offered Resume without a new start.
Paused time ends at the last durable fix rather than adding the process gap.
An offline-cold-start copy bug (All saved despite pending points) was corrected
to Waiting for signal. Explicit Resume now resets the stationary baseline so a
long pause does not immediately re-trigger an old inactivity timeout.

The offline label/inactivity-baseline fixes passed all 192 mobile tests, lint and debug build. Updated APK installed while the run remained paused; offline recovery again retained the same 810 points and 162 pending, now correctly showing Waiting for signal. No data was discarded or acknowledged while offline.

Additional recovery/anti-cheat regressions passed in the guarded API test DB:
131 tests, 131 pass, 0 fail. These source changes are not loaded by the current
phone-test API yet and require one planned owner restart after the desk run.
They derive a missing manual-resume position from the earliest accurate point
(order independent), keep GPS-off movement as an interruption rather than a
cheating review, and allow reboot recovery to end exactly at the last stored
point even if later empty control windows must be clipped. No schema changed.

Desk check 12: owner reported PASS for Resume while phone Wi-Fi/mobile data stayed off. The existing acknowledged run remained active, time/distance grew and Waiting for signal stayed visible. No provisional run or new online reservation was used. Reconnection and duplicate-free queue draining are next.

Desk check 13: owner reported PASS after reconnecting phone Wi-Fi. Offline
banner cleared and sync returned to All saved. Read-only checks confirmed
1,122 distinct uploaded points (all mock), then 1,640/1,640 with zero pending
when the mock run was paused for the storage-safety update. No duplicate sequence
rows were introduced by offline/process recovery replay. The update retained
exactly the same 1,640 points, distance and paused time. Mobile 193 tests, lint
and debug build passed. Storage failure now freezes the visible state/time and
requires Retry before Resume/Finish; successful discard clears the rescue state.

Desk check 14: owner reported PASS for the simulated storage stop. Device proof
confirmed PAUSED/LOW_STORAGE, storageFailed true, one rescue fix, stopped location
service, frozen point count 1,654 and frozen elapsed time over a further 1.5-second
check. 1,646 points were already on the server and eight committed points remained
in the local upload queue, plus the one held fix. Retry is now requested. No app
restart, update or erasure is allowed while that fix is only in memory.
