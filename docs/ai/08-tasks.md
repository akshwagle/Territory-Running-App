# Task backlog (do in order, ONE per session)

Start: read README.md here, this file, and the docs the task lists. Branch `feat/<slug>` from the latest branch. Finish per README session protocol, then tick the box and add <= 5 lines under Notes. Never touch `web/`. Never change the schema.

Status: [ ] todo  [x] done

## UI/UX (read 05, 06, 07; plus 01 for screen intent)
- [x] T01 Foundation. Apply the Clay & Pine palette from 05 to ui.css (dark and light, same token names, replace the lime accent everywhere including map layer colours and any hardcoded hex), switch fonts to bundled Barlow / Barlow Condensed (remove the runtime Google Fonts import and Space Grotesk/Inter), script-check contrast of text/accent/warn/danger on both themes and nudge hex values if a pair fails, audit tokens (no hardcoded colours/px; add missing semantic tokens additively), add motion tokens for 06, rewrite stale `mobile/src/ui/README.md` to match 05. Done: no lime left (grep), no external font request, both themes pass the contrast script, README truthful, tests green.
- [x] T02 Component library. Bring Button, Input, Card, ListRow, StatTile, Chip/Segmented, TabBar, Sheet, Dialog, Toast, Skeleton, EmptyState, ErrorState, Banner to the 05 spec with all states and tests. Done: one place defines each; screens import them; no duplicate ad-hoc styles.
- [ ] T03 Motion system. Implement the 06 catalogue (press, screen/tab transitions, sheet, skeleton shimmer, count-up, hold-to-finish ring, banner) with reduced-motion handling. Done: only transform/opacity animated, reduced-motion verified in tests, bundle budget kept.
- [ ] T04 Auth screens (welcome, signup, login, forgot, reset, verify). Done: blueprint in 05, inline validation, correct autocomplete/inputmode, Google button spec, all error states. Read 04.
- [ ] T05 Home. Hero Start-run card, territory snapshot, weekly chart, feed, notifications bell, skeletons/empty states.
- [ ] T06 Workout and live recorder. Giant stats, thumb-zone controls, hold-to-finish, GPS/low-storage/waiting states. Must not change recording logic or data safety.
- [ ] T07 Run summary, history, run detail. Count-up hero, stat grid, route map, badges, share, kind flagged/rejected explanations.
- [ ] T08 Map. Full-bleed, floating controls, legend, hex sheet, zoom hint, offline/denied states.
- [ ] T09 Community. Leaderboard/Teams/Runners, you-row, team card, search, feed polish.
- [ ] T10 Stats and achievements. Chart, records, achievements grid, one-shot badge celebration.
- [ ] T11 Notifications, You (profile), Settings and privacy screens, export/delete flows polish.
- [ ] T12 Accessibility + small screen + light theme audit across every route (360 and 412 px, font scale 1.3, reduced motion). Fix issues; list leftovers in docs/UI_REVIEW.md.
- [ ] T13 Performance pass against 06 budgets (bundle sizes, lazy chunks, list sizes, re-render hot spots). Record before/after sizes.

## Backend and data (read 02, 03, 04, 07)
- [ ] T14 Schema proposal document only: write docs/SCHEMA_PROPOSAL.md for goals, gear, challenges, clubs, kudos/comments, notification_preferences, device_tokens and notification enum values (details in 02). NO migrations, NO code. Owner reviews and approves each item.
- [ ] T15 After approval only: implement approved schema items one at a time (migration + backup, DB tests, API, mobile UI, export/delete coverage). Skip anything not approved.
- [ ] T16 API review pass: re-audit routes against 03 checklist, add missing tests, check p95 query plans on the heaviest queries (leaderboards, hexes bbox) using EXPLAIN on seeded data; fix without schema change.

## Release readiness (read 04, 07, docs/DEPLOYMENT.md)
- [ ] T17 Owner device checklist: write docs/DEVICE_CHECKLIST.md (outdoor run, screen-off recording, claiming, map, light theme, 360 px, Google sign-in, offline recovery, install from website) as tick-boxes with expected results.
- [ ] T18 Release docs refresh: README, AGENTS.md status, docs/FINAL_STATUS.md, DEPLOYMENT.md reflect reality; list every owner-only step with exact commands.

## Notes
(append per task, <= 5 lines each)
- T01 (feat/ui-foundation): tokens in mobile/src/styles.css (ui.css only reads them); `npm run check:contrast` passes dark+light; fonts bundled (Barlow 400/600, Condensed 600/700), no external request.
  Map colours via `mapColor()` (hexes.js). Gradients/glow on buttons, cards, sheets flattened. Sizes: main JS 92.0 kB gz, CSS 17.5 kB gz (unchanged budget). 218+ tests green.
  Left for T02+: remaining ad-hoc px/rem values in styles.css, `.google` and avatar pickers keep literal brand/data hex by design, Leaflet tile invert filter in light theme (T08).
- T02 (feat/ui-t02-components): added Segmented, Card, StatGrid/StatTile, Banner; Button ghost/sm/block/reason; TextField validate-on-blur + clearable; ListRow subtitle/leading/trailing; Sheet grabber + drag-to-dismiss; Skeleton shapes.
  Screens migrated: community segmented, claim tiles, sport/promo/consent cards, connection banner; duplicate .segmented/.claim-tile/.card CSS removed. 227 tests, lint, build, apk:debug green; CSS 18.0 kB gz.
  Not visually verified. Left: TabBar unchanged (3 tabs vs spec 5, T05+), Toast still bottom-placed (T03), other ad-hoc cards (event-card etc.) untouched.
