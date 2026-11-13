# Phase 4 step 04 — profile/privacy review

Status: implementation, automated checks and the required phone flows passed.
The six ordered commits deliver this step for PR review. The prior step's PR #8 was
confirmed MERGED before branching from pulled main on feat/profile-privacy.
`docs/PHASE4_APP_AUTH_REVIEW.md` is unchanged.

## Approved development migration and backup

The disposable test gate passed before the second go. The owner then authorized
a development backup and migration. Private backup:
`.local/backups/before-profile-privacy.dump`, 64,130 bytes, mode 0600. Its PGDMP
header, TOC and full pg_restore archive-read check passed before any migration
was applied. The archive stays ignored and was not restored over development.

Real migration output:

```text
Backup created: .local/backups/before-profile-privacy.dump
Backup exists: true; non-empty: true; bytes: 64130; mode: 0600.
Backup archive read/required-table checks: passed. Credentials and archive contents were not printed.
Prisma schema loaded from prisma/schema.prisma

3 migrations found in prisma/migrations

Applying migration `20261113000000_profile_privacy`

The following migration(s) have been applied:

migrations/
  └─ 20261113000000_profile_privacy/
    └─ migration.sql

All migrations have been successfully applied.

Development application table count: 30
Tested migration checksum: matched.
Existing account credential/profile fields unchanged: true (3 accounts).
Existing sign-in identity fields unchanged: true (4 identities).

```

Owner-confirmed post-migration phone check: signed out, signed back into the
EXISTING account, opened Settings — PASS. Before/after fingerprints confirmed
all three existing users and four identities retained the same account and
credential fields. No credentials were printed. Development has 30 application
tables and the three committed migration records. The applied SQL body is the
reviewed draft; only its comment header changed. Migration checksum:
`a7b6241ea2bef3dc51378f91334948eeb6f6b14f65a5f6fe9424d7f738306fe1`.

## Real foreign-key and trigger-stack proof (disposable PostgreSQL 16)

These are diagnostics from the final 40-test database run, not inferred from
Prisma. The tombstone UUID is reserved by CHECK and is not a real user row.

```text
# Actual admin_actions FKs: [{"column":"admin_id","foreign_key":null,"on_delete":"NOT APPLICABLE (no FK)"},{"column":"target_id","foreign_key":null,"on_delete":"NOT APPLICABLE (no FK)"}]
# Actual users.username: {"data_type":"character varying","character_maximum_length":30,"is_nullable":"NO"}
# Committed actor=true; target=true; both=true; action/admin/time preserved; tombstone_user_exists=false.
# Real multi-row DELETE returned 2 usernames; both audit IDs tombstoned; context cleared.
# DELETE executed, then rollback: user restored=true; audit byte-for-field unchanged=true.
# email/name/ID/identity/old-name mentions redacted=true; unrelated note unchanged=true.
# Forged SET LOCAL + plain SQL rejected with SQLSTATE 55000; audit unchanged.
# admin_actions: UPDATE=55000 DELETE=55000 TRUNCATE=55000; no guard disabled.
# user_consents: UPDATE=55000 DELETE=55000 TRUNCATE=55000; no guard disabled.
# display_name_history: UPDATE=55000 DELETE=55000 TRUNCATE=55000; no guard disabled.
```

No append-only guard was disabled for fixture cleanup. Tests use rollback,
parent cascades and guarded reset of the disposable database. Ordinary UPDATE,
DELETE and TRUNCATE still fail, including forged SET LOCAL. The suite also tests
a malicious extra row mutation during an otherwise legitimate erasure stack.

## Implemented behavior and decisions

Deletion also cleans the private development outbox after commit, with a retry journal and startup/hourly cleanup. Rollback preserves original message bytes; queued delivery rechecks the account under the same lock and cannot send after deletion. SMTP copies already delivered remain outside the app. No schema change was needed for this hardening.

See server/README.md for complete endpoint contracts, If-Match consent retries,
privacy rules, deletion reauthentication/team locking, export format and limits.
Mobile README documents native cache/sharing and the step-05 integration points.
The original auth JWT remains exactly sub/sid/iat/exp; `/api/me` stays small.
No email verification is required for profile edits, exports or deletion.

Approved native additions are exact-pinned Share8.0.3 and Filesystem8.1.5 (MIT,
Capacitor peer>=8); the locked Filesystem transitive Synapse1.0.4 is ISC. Native
Google remains the unmodified Capawesome0.1.4 adapter. No Google Cloud settings
were changed. Full audit: 4 moderate ESLint/minimatch tooling findings, 0 high,
0 critical. No unapproved audit upgrade was made.

App0.3.0/code4 built and installed with data preserved. Actual APK permissions:
INTERNET and the existing com.territoryrunning.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION.
No location, public-storage or biometric permission. FileProvider was narrowed
to this app's territory-exports cache subdirectory.

## Real automated output

### Database

```text
  duration_ms: 0.176042
  type: 'test'
  ...
1..40
# tests 40
# suites 0
# pass 40
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2993.169917
```

### API

```text
  duration_ms: 0.70725
  type: 'test'
  ...
1..89
# tests 89
# suites 0
# pass 89
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 21513.846459
```

### Mobile

```text
> territory-run-mobile@0.1.0 test
> vitest run


 RUN  v5.1.0 /Users/akshwagle/Desktop/Territory-Running-App/mobile


 Test Files  8 passed (8)
      Tests  131 passed (131)
   Start at  10:22:58
   Duration  2.72s (environment 50%, tests 30%, setup 14%, import 3%, transform 3%)

```

### Mobile lint

```text

> territory-run-mobile@0.1.0 lint
> eslint .

```

### Web

```text
> territory-run-web@0.1.0 test
> vitest run


 RUN  v5.1.0 /Users/akshwagle/Desktop/Territory-Running-App/web


 Test Files  6 passed (6)
      Tests  30 passed (30)
   Start at  05:00:19
   Duration  1.69s (environment 52%, tests 25%, setup 13%, import 7%, transform 2%)

```

### Web lint

```text

> territory-run-web@0.1.0 lint
> eslint .

```

### Android build

```text

You can use '--warning-mode all' to show the individual deprecation warnings and determine if they come from your own scripts or plugins.

For more on this, please refer to https://docs.gradle.org/8.14.3/userguide/command_line_interface.html#sec:command_line_warnings in the Gradle documentation.

BUILD SUCCESSFUL in 7s
245 actionable tasks: 27 executed, 218 up-to-date

Debug APK: /Users/akshwagle/Desktop/Territory-Running-App/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

### Layout

```text
PASS 320px: 5 new screens at 100% and 200% text; no horizontal overflow; all visible controls >=48px.
PASS 360px: 5 new screens at 100% and 200% text; no horizontal overflow; all visible controls >=48px.
PASS 430px: 5 new screens at 100% and 200% text; no horizontal overflow; all visible controls >=48px.
```

Screenshots and all full raw logs stay in ignored .local/. Every new screen was checked at 320/360/430px with reduced motion and at 100%/200% text. All passed overflow and >=48px touch-target checks. Browser API fixtures were intercepted; no live coordinates or auth credentials were used.

### Real curl proof

Google and SMTP are mocked; actual curl requests hit a finite listener backed only by the guarded API test DB. Output redacts token/email values.

```text
Profile/privacy curl proof: guarded API test database only; Google/SMTP mocked.
Application table count: 30
curl POST /api/auth/register -> HTTP 201
{"accessToken":"[REDACTED]","refreshToken":"[REDACTED]","expiresIn":900,"user":{"id":"4079b3f3-4fdb-4d58-9a93-1eb05b97bd13","email":"[REDACTED]","displayName":"Proof 0a11e333","createdAt":"2026-11-13T05:14:11.534Z"}}
curl GET /api/me/profile -> HTTP 200
{"profile":{"id":"4079b3f3-4fdb-4d58-9a93-1eb05b97bd13","displayName":"Proof 0a11e333","avatarId":0,"avatarColor":"#1F5A46","preferredUnits":"km","bio":"","homeRegionId":null,"homeRegion":null},"options":{"avatarIds":[0,1,2,3,4,5,6,7,8,9,10,11],"avatarColors":["#1F5A46","#B8452A","#14392C","#5A5F58","#1F2421"],"preferredUnits":["km","mi"]},"regions":[]}
curl PATCH /api/me/profile -> HTTP 200
{"profile":{"id":"4079b3f3-4fdb-4d58-9a93-1eb05b97bd13","displayName":"Proof 0a11e333","avatarId":7,"avatarColor":"#B8452A","preferredUnits":"mi","bio":"Curl proof","homeRegionId":null,"homeRegion":null},"options":{"avatarIds":[0,1,2,3,4,5,6,7,8,9,10,11],"avatarColors":["#1F5A46","#B8452A","#14392C","#5A5F58","#1F2421"],"preferredUnits":["km","mi"]},"regions":[]}
curl GET /api/me/privacy -> HTTP 200
{"privacy":{"profileVisibility":"PRIVATE","appearOnLeaderboards":false,"shareRouteShapes":false}}
curl PATCH /api/me/privacy -> HTTP 200
{"privacy":{"profileVisibility":"FOLLOWERS","appearOnLeaderboards":true,"shareRouteShapes":false}}
curl POST /api/me/consents -> HTTP 200
{"consents":[{"type":"LOCATION","version":"2026-11-13","accepted":true,"requiresAcceptance":false,"etag":"\"LOCATION:6\"","latest":{"id":"6","userId":"4079b3f3-4fdb-4d58-9a93-1eb05b97bd13","type":"LOCATION","version":"2026-11-13","accepted":true,"createdAt":"2026-11-13T05:14:11.596Z"},"title":"Location processing","text":"During a recorded run we collect GPS points, times, accuracy and speed to draw your route, validate the run and claim territory. Raw points are removed after validation; run summaries and simplified routes remain until you delete them or your account. You can withdraw location consent in Privacy. Recording stops on this phone when you withdraw; you choose what happens to saved points."},{"type":"TERMS","version":"2026-11-13","accepted":false,"requiresAcceptance":true,"etag":"\"TERMS:none\"","latest":null,"title":"Terms of use","text":"Record your own runs, respect other people and restricted places, and use the game safely. Runs with manipulated location data may be rejected. You control your account and can export or delete your live data in Settings."},{"type":"PRIVACY","version":"2026-11-13","accepted":false,"requiresAcceptance":true,"etag":"\"PRIVACY:none\"","latest":null,"title":"Privacy notice","text":"We store your account, consent choices and recorded activity to run the game. Profile visibility, leaderboards and route sharing are your choices. Your export contains your own data. Account deletion removes live personal data; audit actions remain with your identity redacted. You can change these choices in Settings."}],"history":[{"id":"6","userId":"4079b3f3-4fdb-4d58-9a93-1eb05b97bd13","type":"LOCATION","version":"2026-11-13","accepted":true,"createdAt":"2026-11-13T05:14:11.596Z"}]}
curl POST /api/me/consents -> HTTP 200
{"consents":[{"type":"LOCATION","version":"2026-11-13","accepted":false,"requiresAcceptance":true,"etag":"\"LOCATION:7\"","latest":{"id":"7","userId":"4079b3f3-4fdb-4d58-9a93-1eb05b97bd13","type":"LOCATION","version":"2026-11-13","accepted":false,"createdAt":"2026-11-13T05:14:11.606Z"},"title":"Location processing","text":"During a recorded run we collect GPS points, times, accuracy and speed to draw your route, validate the run and claim territory. Raw points are removed after validation; run summaries and simplified routes remain until you delete them or your account. You can withdraw location consent in Privacy. Recording stops on this phone when you withdraw; you choose what happens to saved points."},{"type":"TERMS","version":"2026-11-13","accepted":false,"requiresAcceptance":true,"etag":"\"TERMS:none\"","latest":null,"title":"Terms of use","text":"Record your own runs, respect other people and restricted places, and use the game safely. Runs with manipulated location data may be rejected. You control your account and can export or delete your live data in Settings."},{"type":"PRIVACY","version":"2026-11-13","accepted":false,"requiresAcceptance":true,"etag":"\"PRIVACY:none\"","latest":null,"title":"Privacy notice","text":"We store your account, consent choices and recorded activity to run the game. Profile visibility, leaderboards and route sharing are your choices. Your export contains your own data. Account deletion removes live personal data; audit actions remain with your identity redacted. You can change these choices in Settings."}],"history":[{"id":"7","userId":"4079b3f3-4fdb-4d58-9a93-1eb05b97bd13","type":"LOCATION","version":"2026-11-13","accepted":false,"createdAt":"2026-11-13T05:14:11.606Z"},{"id":"6","userId":"4079b3f3-4fdb-4d58-9a93-1eb05b97bd13","type":"LOCATION","version":"2026-11-13","accepted":true,"createdAt":"2026-11-13T05:14:11.596Z"}]}
curl POST /api/me/export -> HTTP 202
{"export":{"id":"f75444b4-3d91-4e05-b0eb-543f2cd23b3a","status":"PENDING","createdAt":"2026-11-13T05:14:11.615Z","expiresAt":"2026-11-14T05:14:11.615Z"}}
curl GET /api/me/export/f75444b4-3d91-4e05-b0eb-543f2cd23b3a -> HTTP 200
{"formatVersion":1,"profile":{"id":"4079b3f3-4fdb-4d58-9a93-1eb05b97bd13","username":"u_474607d754384b0d053c0132519b","email":"[REDACTED]","displayName":"Proof 0a11e333","avatarId":7,"avatarColor":"#B8452A","preferredUnits":"mi","bio":"Curl proof","homeRegionId":null,"createdAt":"2026-11-13T05:14:11.534Z","verifiedAt":null},"privacy":{"profileVisibility":"FOLLOWERS","appearOnLeaderboards":true,"shareRouteShapes":false,"homeHex":null,"hideRadiusM":200},"consents":[{"id":"6","type":"LOCATION","version":"2026-11-13","accepted":true,"createdAt":"2026-11-13T05:14:11.596Z"},{"id":"7","type":"LOCATION","version":"2026-11-13","accepted":false,"createdAt":"2026-11-13T05:14:11.606Z"}],"runs":[],"flags":[],"teams":[],"notifications":[],"redactions":"Other runners are labelled Runner. Flag and notification free text is omitted because it can identify other people. Team member lists, invite codes and authentication secrets are excluded."}
curl DELETE /api/me -> HTTP 204
(empty body)
curl DELETE /api/me -> HTTP 204
(empty body)
curl GET /api/me/export/f75444b4-3d91-4e05-b0eb-543f2cd23b3a -> HTTP 404
{"error":{"code":"NOT_FOUND","message":"The requested export was not found."}}
PROFILE PRIVACY CURL PROOF PASSED.
Proof account removed; temporary listener closed; temporary export files removed.
```

## Phone flow status

Existing-account migration check PASS (owner). Profile save/persistence PASS (owner confirmed avatar/colour/units/bio). Privacy choices save/persistence PASS (owner). Consent acceptance/history PASS (owner). Withdrawal/reacceptance PASS (owner). Native export sharing PASS (owner could share the JSON). Export cache empty after return PASS (read-only ADB). Throwaway-account deletion and native sign-in cleanup PASS (owner and read-only proof). Original-account sign-in after deletion and saved Profile/Privacy choices PASS (owner). the owner checks (API restarted successfully). No destructive test is to be run on the owner's existing account.

## Deferred and limits

Actual recording, uploading saved points, cross-device one-active-run, ACTIVE status, map/leaderboard endpoints and claim-job integration remain step05. Generic hooks and privacy/time decisions are covered now, with honest partial statuses in EDGE_CASES. Real SMTP remains unverified. Rate limits and work queues are per process; production deployment needs shared queue/limits, export size/storage planning and backup retention. Exports omit flag/notification free text and use neutral titles to protect rivals; copies already shared cannot be recalled. The small profanity filter is not comprehensive moderation. No new schema objects beyond the reviewed migration were added.

## Complete reviewed schema inventory

## Tables and columns

| Table | Treatment | Every column added or involved |
| --- | --- | --- |
| users | ALTER; new indexes and DELETE triggers | ADD avatar_id SMALLINT NOT NULL DEFAULT 0; avatar_color VARCHAR(7) NOT NULL DEFAULT '#1F5A46'; preferred_units VARCHAR(2) NOT NULL DEFAULT 'km'; bio VARCHAR(140) NOT NULL DEFAULT ''; home_region_id UUID NULL. Existing id gets a tombstone-reservation CHECK; existing display_name gets its canonical 3–24 CHECK and unique expression index. Existing id, email, username, display_name are read by audit capture. No old column type/name is changed. |
| user_privacy_settings | ALTER; insert missing rows only | ADD profile_visibility ProfileVisibility NOT NULL DEFAULT PRIVATE; appear_on_leaderboards BOOLEAN NOT NULL DEFAULT false. Existing user_id is used for the missing-row insert/ON CONFLICT. Existing hide_route supplies inverse shareRouteShapes; no second route flag is added. Existing privacy values are preserved. |
| admin_actions | Existing statement-trigger function replaced; new row guard | No columns added/dropped/renamed/type-changed. Future account DELETE may change only admin_id (matching deleted ID -> tombstone), target_id (matching deleted ID -> tombstone), note (NULL on affected rows). id, action, target_type and created_at are preserved, as are all non-deleted acting-admin/target IDs. The complete OLD/NEW row is checked. This migration itself does not update existing audit rows. |
| display_name_history | CREATE | id UUID PK DEFAULT gen_random_uuid(); user_id UUID NOT NULL; display_name VARCHAR(60) NOT NULL; name_key TEXT NOT NULL; changed_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(); reserved_until TIMESTAMPTZ(6) NOT NULL DEFAULT now()+720 hours. |
| user_consents | CREATE | id BIGINT GENERATED ALWAYS AS IDENTITY PK; user_id UUID NOT NULL; type ConsentType NOT NULL; version VARCHAR(32) NOT NULL; accepted BOOLEAN NOT NULL; created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(). |
| data_exports | CREATE | id UUID PK DEFAULT gen_random_uuid(); user_id UUID NOT NULL; status ExportStatus NOT NULL DEFAULT PENDING; encryption_key BYTEA NOT NULL; created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(); expires_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()+24 hours; completed_at TIMESTAMPTZ(6) NULL. |
| regions | Existing FK target only | Existing id is referenced by users.home_region_id; no column or row changes. PostgreSQL adds internal FK action triggers here. |
| auth_identities | Read-only dependency of the deletion trigger | Existing user_id, email_at_signup, provider_subject are read before cascades to capture note-matching identifiers. No DDL or direct DML change. |

Result: 3 new tables (27 -> 30), 26 new columns across the 3 new tables and
2 altered profile/privacy tables. No table or existing column is dropped.
Other existing tables, including run_hexes and login_attempts, have no DDL change
in this SQL. The later deletion service will separately remove matching login
attempts and clear surviving prev_owner_id references inside its transaction.

## Enums — 3 new, no existing enum changed

- ProfileVisibility: PUBLIC, FOLLOWERS, PRIVATE.
- ConsentType: LOCATION, TERMS, PRIVACY.
- ExportStatus: PENDING, READY, FAILED.

## Constraints — all 18 new named constraints

| Table | Name | Rule |
| --- | --- | --- |
| users | users_id_not_audit_tombstone_check | A real user cannot have UUID 00000000-0000-0000-0000-000000000000. |
| users | users_profile_name_check | Name is canonical NFKC/trimmed/single-space and 3–24 characters. |
| users | users_avatar_id_check | Pattern ID 0–11. |
| users | users_avatar_color_check | One of five specified Clay & Pine hex colours. |
| users | users_preferred_units_check | km or mi. |
| users | users_home_region_id_fkey | home_region_id -> regions.id; DELETE SET NULL, UPDATE NO ACTION. |
| display_name_history | display_name_history_pkey | UUID id primary key. |
| display_name_history | display_name_history_user_id_fkey | user_id -> users.id; DELETE CASCADE, UPDATE NO ACTION. |
| display_name_history | display_name_history_name_check | Name length 3–24 and name_key matches profile_name_key(display_name). |
| display_name_history | display_name_history_reservation_check | reserved_until = changed_at + 720 hours. |
| user_consents | user_consents_pkey | BIGINT identity id primary key. |
| user_consents | user_consents_user_id_fkey | user_id -> users.id; DELETE CASCADE, UPDATE NO ACTION. |
| user_consents | user_consents_version_check | Version is 1–32 characters with the defined safe version-token format. |
| data_exports | data_exports_pkey | UUID id primary key. |
| data_exports | data_exports_user_id_fkey | user_id -> users.id; DELETE CASCADE, UPDATE NO ACTION. |
| data_exports | data_exports_key_check | Encryption key is exactly 32 bytes. |
| data_exports | data_exports_expiry_check | expires_at = created_at + 24 hours. |
| data_exports | data_exports_completion_check | PENDING has no completed_at; READY/FAILED have completed_at >= created_at. |

NOT NULL, defaults and identity properties are stated for every new column in
the table above. No existing CHECK, FK, PK or UNIQUE constraint is removed.
The display-name uniqueness and one-active-export uniqueness below are indexes,
not additional pg_constraint rows.

## Explicit indexes — 7 new

- users_display_name_key: UNIQUE on profile_name_key(users.display_name).
- users_home_region_id_idx: users(home_region_id).
- display_name_history_name_key_reserved_until_idx: (name_key, reserved_until).
- display_name_history_user_id_changed_at_idx: (user_id, changed_at).
- user_consents_user_id_type_id_idx: (user_id, type, id).
- data_exports_one_active_per_user: UNIQUE (user_id) WHERE status IN (PENDING,READY).
- data_exports_expires_at_idx: (expires_at).

PostgreSQL also creates backing indexes for the 3 named new primary keys and
an owned identity sequence for user_consents.id (normally user_consents_id_seq).

## User-defined triggers — 7 new; 1 existing trigger retained with changed function

| Trigger | Table / timing | Function and treatment |
| --- | --- | --- |
| user_consents_append_only | user_consents BEFORE UPDATE/DELETE, ROW | NEW; protect_profile_history. Only parent-erasure cascades may delete history. |
| user_consents_no_truncate | user_consents BEFORE TRUNCATE, STATEMENT | NEW; protect_profile_history; always rejects truncation. |
| display_name_history_append_only | display_name_history BEFORE UPDATE/DELETE, ROW | NEW; protect_profile_history; allows only parent-erasure cascade deletion. |
| display_name_history_no_truncate | display_name_history BEFORE TRUNCATE, STATEMENT | NEW; protect_profile_history; always rejects truncation. |
| admin_actions_redaction_guard | admin_actions BEFORE UPDATE, ROW | NEW; enforce_admin_actions_redaction checks the entire expected OLD/NEW row. |
| users_capture_audit_erasure | users BEFORE DELETE, ROW | NEW; capture_account_audit_erasure snapshots aliases before child cascades. |
| users_redact_audit_after_delete | users AFTER DELETE, ROW | NEW; redact_account_audit_after_delete performs exact redaction after user absence is visible. |
| admin_actions_append_only | admin_actions BEFORE UPDATE/DELETE/TRUNCATE, STATEMENT | EXISTING definition retained. Its reject_admin_actions_mutation function is replaced; DELETE/TRUNCATE and ordinary/empty UPDATE remain rejected. |

The 4 new foreign keys also cause PostgreSQL to generate 16 internal RI triggers:
for each FK, child INSERT/UPDATE checks and parent DELETE/UPDATE actions. Their
numeric RI_ConstraintTrigger_* names are generated at execution and cannot be
listed before applying the SQL. They are fully determined by the 4 named FKs
above. Existing internal FK triggers are not changed.

## Functions — 7 new; 1 replaced

- NEW profile_name_key(text): canonical case-insensitive name key.
- NEW protect_profile_history(): append-only history with erasure-cascade exception.
- NEW audit_note_mentions_account(text,jsonb): normalized identifier matching.
- NEW account_audit_erasure_context(): validates trigger depth, transaction ID,
  active user snapshot and actual absence of the deleted user; otherwise NULL.
- NEW capture_account_audit_erasure(): captures per-user identifiers before deletion.
- NEW redact_account_audit_after_delete(): updates only matching IDs/affected notes.
- NEW enforce_admin_actions_redaction(): permits exactly the derived redacted row.
- REPLACED reject_admin_actions_mutation(): existing statement gate, narrowed to
  the valid account-deletion UPDATE exception; DELETE/TRUNCATE stay blocked.

All functions are SECURITY INVOKER. New audit functions fix search_path to
pg_catalog,public. No role/extension/permission change or SECURITY DEFINER bypass
is introduced. Trigger guard functions are VOLATILE so they see the actual DELETE.

## Exact audit-redaction semantics

- Fixed tombstone: 00000000-0000-0000-0000-000000000000, reserved from real user IDs.
- Deleted user's matching target_id becomes the tombstone. Nonmatching target IDs
  and target_type are preserved.
- All other acting admins stay unchanged. If the deleted user was the acting
  admin, that matching admin_id becomes the tombstone as well.
- Notes on directly affected actor/target rows become NULL. Notes on other rows
  become NULL when they mention a captured UUID, email, username, current/past
  display name or Google subject. Matching normalizes Unicode, case and whitespace
  and checks word boundaries, so e.g. Ann is not treated as Annual.
- Audit entry id, action and created_at never change. Unrelated rows remain intact.
- Both a real users DELETE trigger stack and a same-transaction context are
  required. Forging SET LOCAL alone cannot enable audit edits. A row guard checks
  every column, so even the allowed context cannot alter action/time/other data.
- Context aliases are removed after each user; multi-row deletion is supported.
  Statement/transaction rollback restores user and audit rows together.
- No application code needs to switch the audit guard off. No trigger is disabled.

## Reviewed trigger checks (all passed)

1. Ordinary and zero-row UPDATEs fail with 55000; ID/action/timestamp/note edits fail.
2. DELETE/TRUNCATE fail, including empty tables and fabricated transaction settings.
3. Actual account deletion redacts matching target/actor IDs and notes while
   preserving action, non-deleted acting admin, target_type, entry ID and timestamp.
4. Notes mentioning prior names/identity emails are redacted despite FK cascades;
   unrelated notes and word-boundary near-matches remain unchanged.
5. A forged context alone cannot permit an audit update; a hostile attempt to
   change extra columns during the deletion update fails the full-row guard.
6. Multi-user deletion handles shared audit rows correctly; active context is cleared.
7. Forced rollback and failed deletion restore the original audit/user rows.
8. A real user with the reserved tombstone UUID is rejected by its named CHECK.
9. Existing table-count, ownership, FK/cascade, consent-history and export tests
   are extended for 30 tables and the explicit erasure exception.

## Approved dependencies (installed)

@capacitor/share 8.0.3 and @capacitor/filesystem 8.1.5: user approved. Approval
persists. Both exact-pinned plugins are installed unmodified; cache only, remove after
sharing, never log contents. No additional direct dependency was installed.

## Read-only phone storage probe

```text
PASS installed app: version 0.3.0 / code 4.
PASS secure session: encrypted AES-GCM plugin record present; no raw JWT or plaintext token fields in app preferences.
PASS current app logcat: no ID/access/refresh token patterns. Raw logcat and private preferences were not printed or saved.
This read-only probe supports the owner-reported phone flow; it does not itself perform Google sign-in or prove SMTP delivery.
```

## Commit isolation checks

The first commit passed 71 API tests from a snapshot of its staged files. The next two passed their privacy/consent integration tests and loaded without later modules. The complete server passed 89 API tests. The profile/privacy mobile commit passed 110 tests, lint and a production build from its staged snapshot. Shared files were split with generated `git apply --cached` patches; working files were preserved. No commit date was overridden.

Deletion accepts the same maximum of 128 Unicode code points as registration/login, including non-BMP passwords; a real register/delete API test covers the boundary.

## Read-only phone deletion proof

The owner deleted a newly registered throwaway account through the UI. These checks then read development state only; the automated DB/API suites still use distinct disposable databases. The short-lived target descriptor was removed after verification.

```text
PASS deleted throwaway account absent; all 16 checked ownership/session/history references are zero.
PASS matching login attempts absent.
PASS matching development outbox messages and cleanup journals absent.
PASS total account count decreased by exactly one.
PASS native secure-storage session/legacy/Google-attempt/deletion-retry keys absent.
PASS temporary Android export cache empty.
Read-only proof complete; no credentials, emails, account IDs or file contents printed.
```

## Completed phone sequence

- Existing-account sign-in and Settings after the backed-up migration: PASS.
- Profile avatar/colour/units/bio save and reopen: PASS.
- Privacy visibility/leaderboard/route sharing save and reopen: PASS.
- Consent acceptance/history and location withdrawal/reacceptance: PASS.
- Native JSON sharing: PASS; temporary cache zero after returning.
- Fresh throwaway-account deletion: PASS, with the plain login confirmation.
- Read-only DB/outbox/native credential/cache deletion proof: PASS.
- Original-account sign-in and saved Profile/Privacy choices after deletion: PASS.

No real runs or points were fabricated on the phone. Unsent-data warnings and erasure use encrypted-journal/controller tests. Actual mid-run stop/upload and pending claim integration require step 05. Fresh-Google account deletion uses the mocked verifier tests; the owner used password reauthentication for the throwaway phone deletion. Real native Google sign-in was already verified in step 03, and no Google Cloud changes were made.
