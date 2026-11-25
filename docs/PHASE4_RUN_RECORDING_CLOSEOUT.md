# Step 05 closeout — run recording

Branch `feat/run-recording`, closed 2026-11-26. Not merged.

## Built
- Migrations `20261113010000_run_status` and `20261113010100_run_recording` (approved, applied to development 2026-11-14). Table count stays 30.
- API: create (idempotent, one ACTIVE run), point ingestion (max 500, dedupe, gap healing), pause/resume, finish, history, discard, consent and install guards, retention, deletion/export integration.
- Mobile/Android: encrypted write-before-upload journal, foreground service, permission flow, recovery, run/history/detail screens, debug-only desk simulator. App 0.4.0 (code 6).
- No claiming, validation or map.

## Tests (2026-11-26)
| Suite | Result |
|---|---|
| Server DB (`npm test`) | 45/45 |
| Server API (`npm run test:api`) | 131/131 |
| Mobile (vitest) | 193/193 |
| Web (vitest) | 30/30 |
| Lint mobile + web | clean |
| `npm run apk:debug` | build successful |

The API test DB was non-empty, so only `territory_api_test`'s public schema was recreated, as the guard requires.

## Unverified
- Real ten-minute outdoor GPS proof not run (screen-off capture, kill/recovery, history).
- Desk proof stopped at check 14; storage-retry and finish/discard checks are not recorded.
- Android instrumentation (RunStoreTest 5/5) and JUnit (9/9) were last run before final edits; not rerun in this closeout.
- Release APK not rebuilt here.
- The phone-test API needs a restart to load the latest recovery/anti-cheat changes.
- The consent-retention revision requires reacceptance by existing accounts.
