# AI guidance index

Read this first, then ONLY the files your task needs (token economy). Precedence when files disagree:
1. `AGENTS.md` hard rules (schema, safety, git) 2. these docs 3. existing code conventions.

| If the task is about | Read |
| --- | --- |
| What the app does, screens, feature status | 01-product-and-features.md |
| Tables, enums, queries, migrations | 02-database.md |
| Express API, validation, errors, performance | 03-backend-api.md |
| Login, sessions, Google, consent, deletion | 04-authentication.md |
| Look and feel, components, screens, copy | 05-ui-ux-design.md |
| Animation, haptics, speed, battery | 06-animation-and-performance.md |
| Git, tests, security, dependencies, workflow | 07-engineering-rules.md |
| What to do next, in order | 08-tasks.md |

## Session protocol
1. Read this file, `08-tasks.md` (find the first unchecked task) and the docs that task lists.
2. Do ONE task per session. Work on its own branch from the latest branch (see `07`).
3. Finish: tests + lint + build green, commit in small real-dated commits, tick the task in `08-tasks.md`, add at most 5 lines to the task's Notes, append schema or product questions to `overnight/DECISIONS.md` (if the file exists) or `docs/DECISIONS.md`.
4. If a doc here is wrong or stale, fix the doc in the same commit. Docs describe what IS true.

## Ownership
- `web/` (landing site, and the dashboard/auth/tracker pages inside it) belongs to the owner's friend. Never edit, remove or restyle anything in `web/`.
- The owner (Aksh) decides: schema changes, new dependencies with native code, accent colour, store/hosting accounts.
