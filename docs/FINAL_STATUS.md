# Final status

Verified on the final-QA branch (local PostgreSQL 16, disposable test databases, no network services):

| Check | Result |
| --- | --- |
| Server DB tests (`npm test`) | 45 pass |
| Server API tests (`npm run test:api`) | 166 pass |
| Mobile tests / lint | 247 pass / clean |
| Web tests / lint / build | 90 pass / clean / OK |
| Debug APK (`npm run apk:debug`) | builds |
| Unsigned release build (minify + shrink) | verified in step 12 |
| `npm run e2e:smoke --prefix server` | 20 checks pass |

The smoke test registers, logs in, records and finishes a synthetic VALID run, reads its claim, territory, map cells, leaderboard, notifications, stats and run list, checks anonymous access is rejected, requests and reads a data export, rejects a wrong-password deletion, deletes the account and confirms the login and runs are gone.

## What is built
Email and Google sign-in, sessions, profile and privacy controls, consent, data export and account deletion; GPS run recording with batching, anti-cheat flags and idempotent finish; hex territory claiming with cooldowns and restricted zones; Leaflet map; leaderboards, follows, teams and feed; history, splits, records, stats and achievements; in-app notifications and badge awarding; production config guards, health probes, Dockerfile and deployment guide; light/dark theme and first-run explainer. Still 30 tables; no schema change after step 05.

## Only the owner can do or verify
1. An outdoor GPS run on a real phone (recording while screen-off, accuracy, claiming, map, light theme and 360 px layouts).
2. Google OAuth production setup (consent screen, release-signing SHA-1, production client IDs).
3. Hosting accounts: server, PostgreSQL 16, HTTPS domain, production env (see docs/DEPLOYMENT.md); run the Docker image, which was not run here.
4. Release keystore and signed APK (the agent never creates keystores); bump `mobile/app-version.json`.
5. Firebase push: project, `google-services.json`, plugin and a `device_tokens` table (schema change needing approval).
6. Play Store or website upload and `release:register` against the production server.
7. Restarting the phone-test API on the owner's network (`scripts/` helper) before testing on the phone.
8. Decide whether to remove the app-like features left in `web/` (dashboard, auth pages, live tracker).

## Not built (needs schema approval)
Goals, gear/shoes, challenges, clubs, kudos/comments, notification preferences, push tokens, FOLLOWER/TEAM notification types. Details in the project decision log.

## Known limits
Stats use UTC buckets; personal records are whole-run averages; no remote fonts are loaded (Barlow is named in the font stack but not bundled, so devices without it use the system font); paid map tiles are advisable at scale.

## UI redesign (Clay & Pine)
Branches `feat/ui-foundation` to `feat/ui-final-check` restyle the mobile app only: tokens and light/dark themes, component library (Segmented, Card, StatGrid, Banner, Sheet, HoldButton, CountUp), Google-first auth, Home, workout, run summary, map, community, stats, profile/settings, an a11y audit (docs/UI_REVIEW.md) and lazy-loaded routes. `git diff` against the pre-redesign base shows no changes under `web/` or `server/`.
Checks on the final branch: mobile 247 tests, lint, build, `check:bundle` (main JS 91.4 kB gzip of 100, CSS 19.3 kB), `check:contrast`, `assets:check`, debug APK all pass. Old lime accent, Space Grotesk, Inter and Google Fonts URLs are gone from `mobile/src`. Remaining hex literals sit outside the token file only for avatar identity colours (stored values), a map-colour fallback matching the tokens, and a mask. **No screen was checked on a phone**; 360 px layout, font scaling, TalkBack and map tile contrast are unverified.
