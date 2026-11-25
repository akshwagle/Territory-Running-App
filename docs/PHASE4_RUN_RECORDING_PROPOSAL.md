# Step 05 run-recording proposal — development SQL applied; mobile pending

The owner approved the dependency/native-storage approach, the exact SQL for
disposable test databases only, and online-only new run starts. h3-js 4.5.0 is
installed on the server; the approved migrations are applied only to the guarded
disposable databases and, after the second go and verified backup on 2026-11-14,
to development. Mobile dependencies
and recording implementation are not installed/built yet. Previous PRs #9 and #10 are MERGED. Branch
feat/run-recording was created from updated main at 09df9f3. Work remains in
/Users/akshwagle/Desktop/Territory-Running-App.

## Plugin review

Versions, dates and peer ranges below came from the npm registry and the exact
published tarballs, downloaded only into ignored .local/run-recording/plugin-review/.
Reading a tarball is not installing a dependency; no package lifecycle script ran.
The public GitHub README can lag the published package: the published Gachlab
4.1.2 licence is MIT, although older repository text mentions Apache-2.0.

| Package | Exact inspected release | Release date (UTC) | Published licence | Capacitor peer |
| --- | --- | --- | --- | --- |
| @capacitor-community/background-geolocation | 1.3.1 | 2026-10-22 | MIT | >=3.0.0 |
| @capgo/background-geolocation | 8.6.4 | 2026-11-13 | MPL-2.0 | >=8.0.0 |
| @gachlab/capacitor-background-geolocation | 4.1.2 | 2026-11-12 | MIT | >=8.0.0 |
| @transistorsoft/capacitor-background-geolocation | 9.7.2 | 2026-10-29 | CUSTOM | ^8.0.0 |
| @capacitor-community/sqlite | 8.1.1 | 2026-08-06 | MIT | >=8.0.0 |
| @capawesome/capacitor-keep-awake | 0.1.3 | 2026-10-17 | MIT | >=8.0.0 |

Findings from shipped Android source:

- **Community 1.3.1 — preferred location dependency, with app-owned support code.**
  Package development targets Capacitor 8; manifest declares foreground service
  type location and FOREGROUND_SERVICE_LOCATION. Its two Android classes deliver
  Location objects through an in-process broadcast/Capacitor callback; no
  plugin-owned location/token disk store or HTTP client was found. The service's
  static notification has no Pause/Stop actions. onUnbind and handleOnDestroy
  stop collection, so it cannot promise continuous recording after process death.
  Its exported=true service also needs an app manifest override to false.
  This is a collection dependency, not a complete crash-safe running recorder.
- **Capgo 8.6.4 — not recommended for this app's native-persistence path.** MPL-2.0.
  LocationStore persists configured HTTP headers in ordinary SharedPreferences;
  LocationLogFileStorage writes coordinate JSON unencrypted, and optional SQLite
  logging is not encrypted either. These paths are conditional, not evidence
  that every configuration leaks data. Disabling native HTTP/location journaling
  avoids them but leaves us needing the same app-owned persistence/control code.
- **Gachlab 4.1.2 — reject its built-in durable path for this privacy requirement.**
  LocationDbHelper uses android.database.sqlite.SQLiteOpenHelper with latitude,
  longitude and other location fields in ordinary columns. ConfigDAO persists
  configuration JSON in that database, including configured transport settings.
  BGLog mirrors diagnostics to logcat and a persisted log table. This was not
  an exhaustive audit of every optional mode; the plaintext location store is
  already enough to rule out using it as our encrypted safety store.
- **Transistorsoft 9.7.2 — reject for this brief.** Its JS wrapper has MIT text,
  but the package declares CUSTOM licensing and the README requires a licence
  for release builds on both platforms. Debug being free is insufficient.
- **SQLite 8.1.1 — available alternative, not proposed for installation.** MIT,
  SQLCipher 4.17.0 with a secret held in EncryptedSharedPreferences. Its Android
  source does not request extra device permissions. It still needs a native
  write-before-bridge integration for collection while the WebView is suspended.
- **Keep-awake 0.1.3 — compatible alternative, not proposed for installation.** MIT;
  its Android implementation only sets/clears FLAG_KEEP_SCREEN_ON. We can apply
  that same supported Android window flag in our recorder bridge with no package.

Preferred design for approval: install only the community location dependency;
keep it unmodified. Add app-owned native code to durably capture its native
location broadcast before the JS upload path can read it, manage the dynamic
notification with Pause/Stop, check real permissions, and expose recovery/control
methods to the existing JS auth/pending-data interface. Use a single adapter.
If this native integration cannot meet the write-before-upload guarantee in a
proof build, stop and report it before replacing the plugin or weakening storage.

No plugin can collect fixes while Android force-stops its process. Preserve all
committed points, record an interruption, and offer recovery at next launch;
never invent points for the missing interval. A reboot offers Finish saved run
using the last point timestamp rather than automatically resuming collection.

## Encrypted local safety store proposal

Use Android's built-in SQLite only as a transactional container for **AES-256-GCM
ciphertext**. Point payloads, run/device/recovery state and sensitive metadata are
encrypted before SQLite writes (including its WAL/journal). A distinct per-account
key is held in Android Keystore; no plaintext key, coordinates or tokens enter
preferences, logs or files. Auth keeps its existing secure-storage plugin unchanged.
Bind each record's ciphertext to its opaque run/sequence/schema identifiers as AAD;
use a fresh random 96-bit nonce per write. Native collection commits before making
that point available to JS or an upload. No browser IndexedDB coordinate store.

This avoids storing a growing 100,000-point JSON value in secure preferences and
avoids depending on a WebView callback to save each native fix. Sign-out/session
expiry stop recording but keep ciphertext and keys for that account; successful
account deletion removes run rows, recovery state and the account's key. Write
failure stops recording with a warning and a bounded in-memory rescue buffer.
Crash/low-storage/migration/tamper/account-isolation proofs are required, not yet run.

## Additional server dependency request

**h3-js 4.5.0**, released 2026-07-01, Apache-2.0, Node >=4: request permission
for the server only. The brief requires GPS-08 restricted-cell detection and
GPS-09 region-cell/nearest-region resolution, but no H3 library is installed.
Use it only for those reads/annotations; do not write claims or ownership here.
No H3 library, map SDK or extra location package is proposed for the mobile app.

## Behaviour that needs an explicit decision

A global one-active-run rule cannot be guaranteed when two devices both start
new runs without contacting the server. Recommendation: require an online server
acknowledgement to start a new run, then allow that run to record, pause, finish
and recover for hours offline with encrypted queued uploads. An offline *new*
start would instead need provisional-run/conflict-resolution rules; do not quietly
claim that a database unique index can prevent disconnected local starts.

## Schema proposal and every touched object

Keep 30 tables. No table is added, dropped or renamed; no existing column is
dropped or renamed. No admin_actions foreign key, redaction function or history
guard is touched. In addition to the explicitly named ACTIVE/run_signals/provider/
is_mock changes, the brief needs approval for the exact PENDING_VALIDATION enum
value, nullable end/duration while ACTIVE, and deleted_at for soft deletion.
Existing PENDING rows are not renamed or rewritten. No PAUSED enum is needed.

- Enum RunStatus: add ACTIVE and PENDING_VALIDATION only.
- Existing runs: make ended_at and duration_s nullable; add run_signals JSONB
  NOT NULL default {}; add deleted_at TIMESTAMPTZ(6) nullable.
- Existing run_points: add provider VARCHAR(16) NOT NULL default unknown, is_mock
  BOOLEAN nullable (NULL means unavailable for legacy points, not false).
- New CHECKs on runs: runs_recording_state_check, runs_max_length_check,
  runs_signals_object_check.
- New CHECKs on run_points: run_points_provider_check,
  run_points_seq_nonnegative_check, run_points_coordinates_check,
  run_points_accuracy_check, run_points_speed_check.
- New partial unique index: runs_one_active_user_key on user_id for live ACTIVE
  rows (deleted_at IS NULL). A paused run remains ACTIVE and keeps that slot.
- Existing runs time-order, positive-duration and nonnegative-distance CHECKs,
  primary keys, idempotency unique keys, foreign keys and indexes remain.
- New triggers/functions: none. No data rewrite is proposed.

Segments, interruption/clock/quality events, device signals, batch receipts,
battery/step deltas, and per-sequence auxiliary altitude/bearing/monotonic/device
wall-clock metadata live in run_signals. No additional per-point columns or
counter columns are proposed. Its size is bounded by the 100,000-point ceiling;
large-JSON rewrite cost is a trade-off that needs a load check. Auxiliary point
metadata is purged with raw point retention rather than retained indefinitely.

The first migration contains only enum additions, with no surrounding transaction.
The second may use the newly committed values. **Both were test-verified, then
applied to development after the second go and verified backup on 2026-11-14.**
First approval is for guarded disposable-test migration/tests only. Development
needs a separate second go after real results, with a backup before application.

### Proposed migration 1

```sql
-- Proposed migration 1: enum additions only. No BEGIN/COMMIT wrapper.
-- Complete this migration before the following migration uses these values.
ALTER TYPE "RunStatus" ADD VALUE 'ACTIVE';
ALTER TYPE "RunStatus" ADD VALUE 'PENDING_VALIDATION';
```

### Proposed migration 2

```sql
-- Proposed migration 2. Review only: not yet applied to any database.
BEGIN;

ALTER TABLE runs
    ALTER COLUMN ended_at DROP NOT NULL,
    ALTER COLUMN duration_s DROP NOT NULL,
    ADD COLUMN run_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN deleted_at TIMESTAMPTZ(6);

-- Keep runs_time_order_check (ended_at > started_at),
-- runs_duration_positive_check (duration_s > 0), and
-- runs_distance_nonnegative_check (distance_m >= 0) unchanged.
-- This extra CHECK permits NULL end/duration only while a run is ACTIVE.
ALTER TABLE runs
    ADD CONSTRAINT runs_recording_state_check CHECK (
        (status = 'ACTIVE' AND ended_at IS NULL AND duration_s IS NULL)
        OR
        (status <> 'ACTIVE' AND ended_at IS NOT NULL AND duration_s IS NOT NULL)
    ),
    ADD CONSTRAINT runs_max_length_check CHECK (
        ended_at IS NULL OR ended_at <= started_at + INTERVAL '24 hours'
    ),
    ADD CONSTRAINT runs_signals_object_check CHECK (
        jsonb_typeof(run_signals) = 'object'
    );

-- Paused runs keep ACTIVE status; segments in run_signals represent pauses.
-- A soft-deleted recording no longer reserves the user's active-run slot.
CREATE UNIQUE INDEX runs_one_active_user_key
    ON runs (user_id)
    WHERE status = 'ACTIVE' AND deleted_at IS NULL;

ALTER TABLE run_points
    ADD COLUMN provider VARCHAR(16) NOT NULL DEFAULT 'unknown',
    ADD COLUMN is_mock BOOLEAN,
    ADD CONSTRAINT run_points_provider_check CHECK (
        provider IN ('gps', 'network', 'fused', 'passive', 'unknown')
    ),
    ADD CONSTRAINT run_points_seq_nonnegative_check CHECK (seq >= 0),
    ADD CONSTRAINT run_points_coordinates_check CHECK (
        lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
        AND (lat <> 0 OR lng <> 0)
    ),
    ADD CONSTRAINT run_points_accuracy_check CHECK (
        accuracy_m >= 0 AND accuracy_m < 'Infinity'::real
    ),
    ADD CONSTRAINT run_points_speed_check CHECK (
        speed_mps IS NULL
        OR (speed_mps >= 0 AND speed_mps < 'Infinity'::real)
    );

COMMIT;
```

## Required proof gates

1. Owner chooses location/native-storage approach, any extra dependency, and the
   online-start trade-off; owner gives first SQL go for disposable test DB only.
2. Implement server create/read/finish, transactional batches, consent/history,
   exclusivity, bounds and idempotency; extend own export and deletion/job locks.
3. Add DB/API tests and every PERM/LIFE/GPS case with ID-prefixed names; preserve
   30-table/column contracts and append-only cleanup. Present real test SQL/output.
4. Ask for second development go; back up first; never migrate it implicitly.
5. Build native encrypted recorder/permissions and JS queue/state/recovery using
   existing auth hooks and UI library; add Run through the TabBar configuration.
6. Indoor debug-only simulation first (excluded from release), then owner's real
   ten-minute outdoor/lock/kill/recover/history/DB proof. Do not claim that passed
   until the owner reports it. Android force-stop gaps remain explicit.
7. Run DB/API/web/mobile tests, lint/build, audit, APK permission/storage inspection;
   six ordered commits, push branch, PR into main without merging.

## Primary sources

- https://github.com/capacitor-community/background-geolocation
- https://registry.npmjs.org/@capacitor-community%2fbackground-geolocation
- https://github.com/Cap-go/capacitor-background-geolocation
- https://github.com/gachlab/capacitor-background-geolocation
- https://github.com/transistorsoft/capacitor-background-geolocation
- https://github.com/capacitor-community/sqlite
- https://github.com/capawesome-team/capacitor-plugins/tree/main/packages/keep-awake
- https://github.com/uber/h3-js
- https://h3geo.org/docs/api/indexing/
- https://developer.android.com/develop/sensors-and-location/location/permissions/background
- https://developer.android.com/develop/background-work/services/fgs/changes
- https://developer.android.com/develop/ui/views/notifications/notification-permission
