# Authentication and account security

Details live in `server/README.md` (endpoint table, env) and docs/PHASE4_AUTH_*.md. Summary:

## Model
- Email+password (`AuthProvider.PASSWORD`, password hashing in `auth/passwords.js`) and Google sign-in/link (`GOOGLE`, `google-auth-library`, ID token verified server-side with GOOGLE_WEB_CLIENT_ID). One user can have both identities; unlink never leaves an account without a way to sign in.
- Session = short-lived JWT access token + rotating refresh token. Refresh tokens are stored hashed in `auth_tokens` (kind REFRESH) with a family id; reuse of a rotated token revokes the family. Logout revokes the family and is idempotent. Session list and per-session revoke exist. No cookies; Bearer header only.
- Email verification (kind EMAIL_VERIFY, 24 h) and password reset (kind PASSWORD_RESET, 30 min), single-use, hashed. Reset and password change revoke other sessions.
- Brute force: `login_attempts` + rate limits; generic error messages (never reveal whether an email exists).
- Suspended users (`users.suspended_at`) cannot sign in or refresh.
- Mail through nodemailer SMTP; dev uses a local outbox (`.local/mail-outbox`).

## On the phone
- Tokens live only in encrypted native storage (`@aparajita/capacitor-secure-storage`); never in localStorage, logs or URLs. One auth controller and one API client are authoritative (`mobile/src/auth`); do not create parallel ones.
- Google sign-in via `@capawesome/capacitor-google-sign-in`. Production needs owner setup: OAuth consent screen, release-signing SHA-1, production client IDs (docs/DEPLOYMENT.md).
- Auth failures show calm, specific text and a next action; forms keep typed values; password fields have show/hide; keyboard types and autocomplete attributes are correct (email, current-password, new-password, one-time-code).
- On 401 refresh once, then sign out cleanly and keep unsent run data (never discard a recorded run because of auth).

## Consent and privacy flows
LOCATION, TERMS and PRIVACY consents are versioned records (`user_consents`); location recording requires LOCATION consent; changed text means re-consent. Data export (`data_exports`) and account deletion (password re-check, cascades, 30-day-style retention rules per code) must keep working for every new table or feature.

## Rules
- Never log or return password hashes, tokens, Google subs or refresh families' secrets.
- Constant-time compare for tokens; no secrets in repo; `.env` ignored.
- Any auth change needs tests for success, expiry, reuse/rotation, revoke, suspended user, and cross-user access.
- Admin features require `SystemRole.ADMIN` and write `admin_actions`.
