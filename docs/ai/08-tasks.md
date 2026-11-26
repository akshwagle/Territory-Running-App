# Task backlog (do in order, ONE per session)

Start: read README.md here, this file, and the docs the task lists. Branch `feat/<slug>` from the latest branch. Finish per README session protocol, then tick the box and add <= 5 lines under Notes. Never touch `web/`. Never change the schema.

Status: [ ] todo  [x] done

## UI/UX (read 05, 06, 07; plus 01 for screen intent)
- [x] T01 Foundation. Apply the Clay & Pine palette from 05 to ui.css (dark and light, same token names, replace the lime accent everywhere including map layer colours and any hardcoded hex), switch fonts to bundled Barlow / Barlow Condensed (remove the runtime Google Fonts import and Space Grotesk/Inter), script-check contrast of text/accent/warn/danger on both themes and nudge hex values if a pair fails, audit tokens (no hardcoded colours/px; add missing semantic tokens additively), add motion tokens for 06, rewrite stale `mobile/src/ui/README.md` to match 05. Done: no lime left (grep), no external font request, both themes pass the contrast script, README truthful, tests green.
- [x] T02 Component library. Bring Button, Input, Card, ListRow, StatTile, Chip/Segmented, TabBar, Sheet, Dialog, Toast, Skeleton, EmptyState, ErrorState, Banner to the 05 spec with all states and tests. Done: one place defines each; screens import them; no duplicate ad-hoc styles.
- [x] T03 Motion system. Implement the 06 catalogue (press, screen/tab transitions, sheet, skeleton shimmer, count-up, hold-to-finish ring, banner) with reduced-motion handling. Done: only transform/opacity animated, reduced-motion verified in tests, bundle budget kept.
- [x] T04 Auth screens (welcome, signup, login, forgot, reset, verify). Done: blueprint in 05, inline validation, correct autocomplete/inputmode, Google button spec, all error states. Read 04.
- [x] T05 Home. Hero Start-run card, territory snapshot, weekly chart, feed, notifications bell, skeletons/empty states.
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
- T03 (feat/ui-t03-motion): added ui/motion.jsx (CountUp/useCountUp, HoldButton conic ring) and keyframes toast-in, banner-in, scrim-in, pop-in, spin; skeleton shimmer is opacity-only on ::after; `.stagger` (max 6 x 30 ms) and `.pop-in` utilities.
  Toast now top-safe; sheet scrim fades; button spinner rotates; claim tiles count up. Reduced motion: all animation/transition off, count-up shows final value (tests). Sizes: main JS 92.0 kB gz, CSS 18.4 kB gz.
  Not visually verified. Left: HoldButton not yet wired into the recorder (T06), `.stagger` not yet applied to lists, pull-to-refresh not built, reduced motion removes fades entirely (spec allows <=150 ms).
- T04 (feat/ui-t04-auth-screens): signup/login lead with Google then 'or use email'; AuthForm validates each field on blur (shared validation.js), email inputmode/autocapitalize kept; auth pages share `.auth-screen` layout, legacy `.button` links moved to ui-button.
  Controller, vault, Google adapter untouched. Not visually verified. Splash/Welcome photo composition left as is.
- T05 (feat/ui-t05-home): Home = greeting + today status (streak), Start-run hero card, territory snapshot (/api/territory/me: held, gained this week, protected; gained hidden above 200 hexes), weekly distance chart (stats overview), feed, bell. Skeleton/empty/error per section.
  Not visually verified. Left: TabBar still 3 tabs per Shell TABS (5 listed), feed cards unchanged, no pull-to-refresh, `.stagger` not applied.
- T06 (feat/ui-t06-workout): recorder page gets GPS quality chip (good/waiting/weak/paused), giant stats (existing RunStats), HoldButton Finish (1 s ring) replacing the finish dialog; reboot-recovery keeps 'Finish saved run' dialog. Controller/recording logic untouched.
  Not visually verified. Left: Workout landing page unchanged, controls not sticky to bottom, no low-storage banner beyond existing storageFailed message.
