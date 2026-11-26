# Task backlog (do in order, ONE per session)

Start: read README.md here, this file, and the docs the task lists. Branch `feat/<slug>` from the latest branch. Finish per README session protocol, then tick the box and add <= 5 lines under Notes. Never touch `web/`. Never change the schema.

Status: [ ] todo  [x] done

## UI/UX (read 05, 06, 07; plus 01 for screen intent)
- [x] T01 Foundation. Apply the Clay & Pine palette from 05 to ui.css (dark and light, same token names, replace the lime accent everywhere including map layer colours and any hardcoded hex), switch fonts to bundled Barlow / Barlow Condensed (remove the runtime Google Fonts import and Space Grotesk/Inter), script-check contrast of text/accent/warn/danger on both themes and nudge hex values if a pair fails, audit tokens (no hardcoded colours/px; add missing semantic tokens additively), add motion tokens for 06, rewrite stale `mobile/src/ui/README.md` to match 05. Done: no lime left (grep), no external font request, both themes pass the contrast script, README truthful, tests green.
- [x] T02 Component library. Bring Button, Input, Card, ListRow, StatTile, Chip/Segmented, TabBar, Sheet, Dialog, Toast, Skeleton, EmptyState, ErrorState, Banner to the 05 spec with all states and tests. Done: one place defines each; screens import them; no duplicate ad-hoc styles.
- [x] T03 Motion system. Implement the 06 catalogue (press, screen/tab transitions, sheet, skeleton shimmer, count-up, hold-to-finish ring, banner) with reduced-motion handling. Done: only transform/opacity animated, reduced-motion verified in tests, bundle budget kept.
- [x] T04 Auth screens (welcome, signup, login, forgot, reset, verify). Done: blueprint in 05, inline validation, correct autocomplete/inputmode, Google button spec, all error states. Read 04.
- [x] T05 Home. Hero Start-run card, territory snapshot, weekly chart, feed, notifications bell, skeletons/empty states.
- [x] T06 Workout and live recorder. Giant stats, thumb-zone controls, hold-to-finish, GPS/low-storage/waiting states. Must not change recording logic or data safety.
- [x] T07 Run summary, history, run detail. Count-up hero, stat grid, route map, badges, share, kind flagged/rejected explanations.
- [x] T08 Map. Full-bleed, floating controls, legend, hex sheet, zoom hint, offline/denied states.
- [x] T09 Community. Leaderboard/Teams/Runners, you-row, team card, search, feed polish.
- [x] T10 Stats and achievements. Chart, records, achievements grid, one-shot badge celebration.
- [x] T11 Notifications, You (profile), Settings and privacy screens, export/delete flows polish.
- [x] T12 Accessibility + small screen + light theme audit across every route (360 and 412 px, font scale 1.3, reduced motion). Fix issues; list leftovers in docs/UI_REVIEW.md.
- [x] T13 Performance pass against 06 budgets (bundle sizes, lazy chunks, list sizes, re-render hot spots). Record before/after sizes.
- [x] T19 Palette guard and skill-driven polish. Add `mobile/scripts/check-palette.mjs` + `npm run check:palette` (scan mobile/src, index.html, android res and the built CSS for hex/rgb/hsl colours; fail on the banned hues in 05; allow only token files and the documented exceptions: Google button brand colours, stored avatar identity colours, map fallback). Wire it into the existing check chain. Then use the frontend-design skill, the Design plugin skills (design-critique, accessibility-review, ux-copy) and web-design-guidelines (only if the skill is installed and the session is interactive) to review every screen and fix issues in mobile/ only; record findings in docs/UI_REVIEW.md. Done: guard passes, tests/lint/build/apk:debug green, no web/ or server/ changes.

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
- T08 (feat/ui-t08-map): legend moved behind a layers chip, recenter uses the target icon, both float in the thumb zone above safe-area; zoom hint is a pill; hex sheet leads with a status chip (restricted/cooldown/yours/capturable); light theme drops the tile invert filter.
  Not visually verified. Left: no hex fade-in animation, no cooldown countdown tick, tiles still remote OSM.
- T07 (feat/ui-t07-run-summary): summary gets "+N hexes" count-up hero (ClaimResult), route map and share on the summary, kind next-step text for flagged/rejected runs (nextStepText).
  Stat grid, badges, history and run detail were already on the T02 components. Not visually verified. Left: history list rows unchanged, detail page has no hero.
- T09 (feat/ui-t09-community): leaderboard rows highlight your own row (aria-current) and a sticky pinned you-row shows rank + value; team card uses Card with team-colour edge and invite code row; feed items made compact.
  Existing Segmented, period chips, search, follow, teams flows unchanged. 243 tests, lint, build, bundle, debug APK green. Not visually verified.
- T10 (feat/ui-t10-stats): stats overview uses StatGrid tiles, latest bar emphasised; badges are a 2-col grid (Earned / Still to earn) with progress, locked state.
  One-shot celebration: badges earned since last visit (ids in localStorage `tr.badges.seen`, first visit only seeds) get icon pop + ring (transform/opacity only), dismissible status pill, confirm haptic; reduced motion disables animation.
  244 tests, lint, build, bundle, contrast, debug APK green. Not visually verified.
- T11 (feat/ui-t11-profile-settings): You page shows real lifetime runs/distance/territory (StatGrid, skeleton + retry); fake zeros and placeholder chart removed. Notifications grouped by day; Settings regrouped Account / Privacy & data / App / Danger zone (delete last, separate).
  Section accepts className. Export/delete/consent flows unchanged (already dialog-gated). 247 tests, lint, build, bundle, contrast, debug APK green. Not visually verified.
  Left: 5-tab bar still 3 tabs, no weekly chart on You (needs a 12-week series; overview range covers week/month/year only), swipe-to-read not built (tap only).
- T12 (feat/ui-t12-a11y-audit): static CSS/markup audit; text under 12 px raised (tab labels, splash sub-brand), settings row values wrap instead of truncating. Rest already met 05 (44/48 px targets, focus rings, dialog focus trap, reduced motion, live regions).
  Leftovers listed in docs/UI_REVIEW.md. Not visually verified; real 360/412 px, font scale 1.3 and TalkBack need the device checklist (T17).
- T13 (feat/ui-t13-performance): Settings, Community, Workout and sign-out screens now lazy chunks; useResource moved to pages/use-resource.js so Settings splits for real. Main JS 96.8 -> 92.3 kB gz (build output), CSS 19.3 kB gz.
  check:bundle now enforces main <= 100 kB, CSS <= 30 kB, route chunks <= 40 kB (map vendor chunk Leaflet+h3 ~108 kB lazy, exempt). Map watch cleanup, cursor/limit lists already OK.
  Left: stats/pages.jsx still in main (BarChart/useUnits shared with Home); no list windowing needed (lists capped at 50). Not measured on device.
- T19 (feat/ui-t19-palette-guard): check:palette guard + `npm run check`; viewport zoom fixed; findings in docs/UI_REVIEW.md. Not device-verified.
