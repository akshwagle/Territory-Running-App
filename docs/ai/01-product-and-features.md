# Product and features

Territory Running App: a mobile-first running game. Runners record GPS runs; every H3 resolution-11 cell (~50 m) traversed by a VALID run becomes territory. Another runner can capture it after its cooldown. Seasons, teams, follows, badges, anti-cheat, notifications, privacy controls. Delivered as an Android APK (Capacitor) downloaded from the landing website; any person must be able to install and use it.

Audience: everyday runners, 16+ who are not hardcore gamers. The app must feel like a premium fitness product first and a game second.

## Feature status (from docs/FINAL_STATUS.md; update when it changes)
| Area | Status |
| --- | --- |
| Email + Google sign-in, sessions, verify email, reset password | built |
| Profile, privacy (PUBLIC/FOLLOWERS/PRIVATE), consent, export, delete | built |
| GPS run recording (offline-safe queue, pause/resume, recovery), anti-cheat flags | built, needs outdoor phone proof |
| Territory claiming, cooldowns, restricted zones, claim result per run | built |
| Map (Leaflet + OSM tiles, hex layer, detail sheet), route on run detail | built, needs phone check |
| Community: leaderboards (hexes/distance/runs), follows, teams, feed, search | built |
| History, splits, records, stats chart, achievements | built |
| In-app notifications, badges | built |
| Light and dark theme, first-run explainer | built, UI quality is the main gap |
| Goals, gear, challenges, clubs, kudos/comments, notification preferences, push | NOT built: need approved schema (see 02) |

## Screens (routes in mobile/src/App.jsx)
Auth: /welcome /signup /login /forgot /reset /verify. Tabs: /home /workout /community /settings /you. Run: /run /run/summary /run/history /run/history/:id. Others: /map /stats /notifications, settings sub-pages (methods, sessions, export, delete, password, profile, privacy, consent), /you/privacy /you/consent.

## Product rules
- Real data only. No sample data, no dead buttons, no "coming soon" (hide what is not built).
- A run is sacred: never lose recorded points; never block Finish on network.
- Privacy by default: other runners see only what their privacy setting allows (`canView`); HEX_LOST never names the capturer; home-adjacent cells are hidden from others.
- Fair play: flagged/mock/too-fast runs claim nothing and tell the runner why in plain words.
- Explain game rules in-context (cooldown, what counts as a claim) in one short line, not a manual.

## Success feel
Open app -> see today's status and one clear next action -> tap Start -> big readable live stats -> finish -> satisfying summary of territory gained -> see it on the map -> friendly nudge to go again.
