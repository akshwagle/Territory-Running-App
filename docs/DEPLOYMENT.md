# Deployment guide

Target: a managed Node host (Render, Railway, Fly.io, a VPS with Docker, etc.) plus a managed
PostgreSQL 16 database. The phone app talks to the API over **HTTPS only**. Cleartext HTTP exists
only in debug Android builds (`android/app/src/debug`); the release manifest sets
`usesCleartextTraffic="false"`.

Placeholders below look like `YOUR_...`. Never commit real values; `.env*` files are gitignored.

## 1. Database (managed PostgreSQL 16)
1. Create a PostgreSQL 16 instance and a database/user for the app. Enable automatic backups.
2. Build the connection string. Most providers require TLS: append `?sslmode=require`.
3. Use the same string for `DATABASE_URL` and `DIRECT_URL` (use the provider's *direct*, non-pooled
   endpoint for `DIRECT_URL` if it offers a pooler).
4. Apply migrations from your machine or the release step: `cd server && npx prisma migrate deploy`.
   Never use `db push`. Seed once (`ADMIN_EMAIL`, `ADMIN_PASSWORD` set): `npm run db:seed`.

## 2. API on a managed Node host
Either run the container (`server/Dockerfile`; see `docker-compose.production.example.yml`) or use
the host's Node 22 runtime with build command `cd server && npm ci --omit=dev && npx prisma generate`
and start command `cd server && npm start`.

Required environment variables (see `server/.env.example`, placeholders only):

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` / `PORT` | `0.0.0.0` / the port the host expects |
| `DATABASE_URL`, `DIRECT_URL` | managed PostgreSQL URLs |
| `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_DERIVATION_SECRET` | two different random strings, 32+ bytes (`openssl rand -base64 48`) |
| `CORS_ORIGINS` | exact HTTPS origins: your website, `https://localhost`, `capacitor://localhost` (no `http:` in production) |
| `WEB_BASE_URL` | the website origin, HTTPS |
| `MAIL_TRANSPORT=smtp`, `SMTP_*` | real transactional mail account (verification and reset emails) |
| `GOOGLE_WEB_CLIENT_ID` | see section 4 |
| `TRUST_PROXY` | `1` when behind one load balancer/proxy (needed so rate limits see client IPs) |
| `MIN_APP_VERSION` | lowest accepted `versionCode` |

The server refuses to start on weak or missing secrets, `http:` CORS origins, loopback `HOST`, or
non-SMTP mail in production. Startup errors name the variable, never its value.

Probes: `GET /api/live` (process up), `GET /api/ready` (database reachable, 503 while shutting
down), `GET /api/health` (legacy, database status). Point the platform health check at `/api/ready`.
On SIGTERM the server stops accepting work, finishes in-flight requests (up to
`SHUTDOWN_TIMEOUT_MS`), drains background jobs and closes the database. Retention jobs (run-point
purge, export cleanup, mail jobs) start with the process, are idempotent and row-locked, and do not
overlap themselves, so running two instances is safe.

APK downloads are served from `server/storage/apk`; mount a persistent volume there, or host the file
on object storage and register that URL. Register a release:
`cd server && npm run release:register -- --file <apk> --version-name X --version-code N`.

## 3. HTTPS
Terminate TLS at the platform or a reverse proxy (Caddy, nginx, cloud load balancer) with a valid
certificate (Let's Encrypt is fine). Redirect HTTP to HTTPS. Verify with
`curl -fsS https://YOUR_API_ORIGIN/api/ready`. Android release builds will not connect to plain HTTP.

## 4. Google sign-in (OAuth consent screen)
1. Google Cloud Console: create or choose a project.
2. *APIs & Services > OAuth consent screen*: user type External, app name, support email, developer
   contact, links to your privacy policy and terms (HTTPS URLs on your site). Scopes: `openid`,
   `email`, `profile` only. Add yourself as test user while in Testing; click *Publish app* to let
   everyone sign in (needs the privacy policy URL; basic scopes need no verification review).
3. *Credentials > Create credentials > OAuth client ID*: type **Web application**. Authorised
   JavaScript origins: your website origin. No redirect URI is needed for the native ID-token flow;
   if you add web sign-in, register `https://YOUR_WEBSITE_ORIGIN/` as a redirect URI.
4. Create a second client of type **Android** with package `com.territoryrunning.app` and the SHA-1
   of your **release** keystore (section 6; get it with `keytool -list -v -keystore YOUR.jks`). Add
   the debug SHA-1 as a separate Android client if you still test debug builds.
5. Set the Web client ID in `GOOGLE_WEB_CLIENT_ID` (server) and `VITE_GOOGLE_WEB_CLIENT_ID` (mobile build).

## 5. Pointing the clients at production
- Website (`web/`): build with `VITE_API_URL=https://YOUR_API_ORIGIN npm run build`; deploy `web/dist`
  to static hosting (HTTPS). Add that origin to `CORS_ORIGINS` and `WEB_BASE_URL`.
- Mobile: put these in `mobile/.env.production.local` (gitignored) or the shell:
  `VITE_API_URL=https://YOUR_API_ORIGIN`, `VITE_GOOGLE_WEB_CLIENT_ID=...`,
  `VITE_DOWNLOAD_URL=https://YOUR_WEBSITE_ORIGIN/#download`.
  Build with `TERRITORY_RELEASE_BUILD=true`, which makes the build fail unless the API URL is public HTTPS.

## 6. Signing the release APK (owner steps; nothing here creates a key for you)
Keep the keystore and passwords out of git and back them up: losing the key means users cannot update.
```
# one time, on your machine (you choose passwords; store them in a password manager)
keytool -genkeypair -v -keystore ~/territory-release.jks -alias territory -keyalg RSA -keysize 2048 -validity 10000

# each release: bump mobile/app-version.json (versionName/versionCode), then
cd mobile
export TERRITORY_RELEASE_BUILD=true VITE_API_URL=https://YOUR_API_ORIGIN VITE_GOOGLE_WEB_CLIENT_ID=... VITE_DOWNLOAD_URL=...
npm ci && npm run build && npx cap sync android
cd android && ./gradlew assembleRelease          # produces an unsigned APK
BT=$ANDROID_HOME/build-tools/35.0.0
$BT/zipalign -p -f 4 app/build/outputs/apk/release/app-release-unsigned.apk /tmp/app-aligned.apk
$BT/apksigner sign --ks ~/territory-release.jks --out /tmp/territory-0.0.0.apk /tmp/app-aligned.apk
$BT/apksigner verify --verbose /tmp/territory-0.0.0.apk
cd ../../server && npm run release:register -- --file /tmp/territory-0.0.0.apk --version-name X --version-code N
```
Never commit the APK or keystore. Use the same keystore for every release.

## 7. Push notifications (FCM) – not yet built
The app has an in-app notification centre; device push is **not implemented** because it needs a
`device_tokens` table (schema change) and a Capacitor plugin. When approved, the owner must:
1. Create a Firebase project; add an Android app with package `com.territoryrunning.app` (add the release SHA-1).
2. Download `google-services.json` into `mobile/android/app/` (gitignored; never commit it).
3. Create a service account with the *Firebase Cloud Messaging API (V1)* role; store its JSON in the
   server environment as a secret, not in git.
4. Developers then add `@capacitor/push-notifications`, the Google services Gradle plugin, the
   Android 13+ `POST_NOTIFICATIONS` permission request, token storage and FCM HTTP v1 sending.

## 8. Operations
- Logs are one JSON line per request (`level, time, requestId, method, route, status, durationMs`);
  unexpected errors log only the error class and request id. No URLs, bodies, tokens or emails are
  logged. Clients receive the request id in the `X-Request-Id` header for support.
- Rate limits: API per IP (`API_RATE_LIMIT_*`), auth per IP and account, run writes per account
  (`RUN_WRITE_LIMIT`), profile writes (`PROFILE_WRITE_LIMIT`), exports (`EXPORT_REQUEST_LIMIT`).
  Limits are held in memory per instance; use a shared store if you scale beyond a few instances.
- Back up the database daily and test a restore. Rotate secrets by redeploying (rotating the JWT
  secret signs everyone out).

## 9. Pre-release checklist
- [ ] Managed PostgreSQL 16 with backups; `prisma migrate deploy` ran; admin seeded; seed password changed
- [ ] All env vars set; no placeholder values; `NODE_ENV=production`; server starts cleanly
- [ ] HTTPS valid on API and website; `/api/ready` returns 200 through the public URL
- [ ] `CORS_ORIGINS` lists only HTTPS origins plus `https://localhost` and `capacitor://localhost`
- [ ] SMTP works (register a test account, receive verification email)
- [ ] Google consent screen published, Web + release Android clients created, IDs set
- [ ] Privacy policy and terms published; `*_VERSION` env values match the live text
- [ ] Release APK built with `TERRITORY_RELEASE_BUILD=true`, signed with your keystore, `apksigner verify` passes
- [ ] APK registered (`release:register`), checksum shown on the download page, download works over HTTPS
- [ ] `MIN_APP_VERSION` set correctly for the build being shipped
- [ ] On a real phone: sign up, record a short run, finish, see territory, delete the test account
- [ ] Keystore and passwords backed up offline; nothing secret in git (`git status`, `git log -p | grep -i secret`)
