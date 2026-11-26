# Engineering rules

## Git
- Never work on `main`. Never push, merge, rebase published history or amend old commits unless the owner asks. Branch from the latest feature branch (check `git branch --show-current`; chain recorded in docs/FINAL_STATUS.md / overnight/MORNING_REPORT.md). Task branches: `feat/<task-slug>`.
- Small logical commits, conventional messages (`feat(mobile): ...`, `fix(api): ...`, `docs: ...`), REAL current dates only (the college requires honest history). Tree clean at the end.
- Never commit: .env, secrets, APK/AAB, keystores, local.properties, node_modules, build output, `overnight/`, `scripts/overnight*.sh`.

## Quality gates (before every commit that touches code)
- `mobile`: `npm test`, `npm run lint`, `npm run apk:debug` (when UI/native touched). `server`: `npm test` (DB), `npm run test:api`, lint if present. Fix real failures; do not weaken or delete tests to pass.
- New logic gets tests. UI changes: update/add component tests for states (loading, empty, error, success).

## Dependencies
- Prefer none. A new dependency needs a reason in the decision log, a pinned version, a size check (mobile main JS gzip budget in 06) and a licence check. No new native Capacitor plugin without owner approval. No UI frameworks/animation libraries (see 06).

## Security
- Treat all input as hostile; parameterised SQL only; escape/encode output; no secrets or PII in logs; HTTPS only in release builds; permissions minimal (INTERNET, location; others need approval).
- The owner creates keystores and production accounts; you never do.

## Schema
- Frozen unless the owner approves. Write needs to the decision log and propose in docs (02).

## Token economy (credits are limited)
- Read only the docs/files the task needs. Prefer targeted `grep`/`head` over reading whole files. Keep tool output short (`| tail -20`). Do not re-read files you just wrote. Don't paste long logs in replies.
- Final reply: max 10 lines: what changed, test counts, open issues, decisions needed.

## Decision log
Append dated entries to `docs/DECISIONS.md` (create if missing): decision, reason, alternatives, who must confirm. Keep entries to 1-3 lines.

## Docs hygiene
- `mobile/src/ui/README.md` is STALE (describes the old Clay & Pine light UI). Rewrite it to match 05 during task T01.
- Keep README.md, AGENTS.md and docs/FINAL_STATUS.md truthful when behaviour changes.
