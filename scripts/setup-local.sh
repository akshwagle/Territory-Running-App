#!/usr/bin/env bash
# Prepares a fresh clone for local development: creates the PostgreSQL role and
# the three databases, fills placeholders in the ignored server/.env, applies the
# committed migrations and runs the idempotent seed.
#
# Safe to rerun. It never drops a database, never overwrites a value that is
# already set, never prints an existing password and never edits a tracked file.
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
server_dir="$repo_root/server"
env_file="$server_dir/.env"
example_file="$server_dir/.env.example"
pg_host="${PGHOST:-127.0.0.1}"
pg_port="${PGPORT:-5432}"
db_name="territory"
db_role="${TERRITORY_DB_ROLE:-territory_app}"
dry_run=0

usage() { printf 'Usage: %s [--dry-run]\n' "$0" >&2; }
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; usage; exit 2 ;;
  esac
done

fail() { printf '%s\n' "$*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }
run() { if ((dry_run)); then printf '  [dry-run] %s\n' "$*"; else "$@"; fi; }
in_server() { ( cd "$server_dir" && "$@" ); }

[[ -f "$example_file" ]] || fail "Missing $example_file."
[[ "$db_role" =~ ^[a-z_][a-z0-9_]*$ ]] || fail 'TERRITORY_DB_ROLE must be a lowercase SQL identifier.'
[[ "$pg_port" =~ ^[0-9]+$ ]] && (( 10#$pg_port >= 1 && 10#$pg_port <= 65535 )) || fail 'PGPORT must be an integer from 1 to 65535.'
command -v node >/dev/null 2>&1 || fail 'Node.js 22.12+ is required; see README.md.'
command -v psql >/dev/null 2>&1 || fail 'psql was not found. Install PostgreSQL 16 and put its bin directory on PATH; see README.md.'

step "Checking PostgreSQL at $pg_host:$pg_port"
psql_super() { psql -h "$pg_host" -p "$pg_port" -d postgres -v ON_ERROR_STOP=1 "$@"; }
if ((dry_run)); then
  printf '  [dry-run] would connect as %s\n' "${PGUSER:-$USER}"
elif ! psql_super -tAc 'SELECT 1' >/dev/null 2>&1; then
  fail "Cannot connect to PostgreSQL at $pg_host:$pg_port as ${PGUSER:-$USER}. Start it first (README: PostgreSQL setup reference), then rerun."
fi

step 'Resolving local database credentials'
# Reuse the password already configured in server/.env so reruns do not rotate
# a working credential; otherwise generate a URL-safe one.
db_password="$(node - "$env_file" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const match = raw.match(/^DATABASE_URL=(.*)$/m);
let password = '';
if (match) {
  try {
    const url = new URL(match[1].trim());
    const decoded = decodeURIComponent(url.password || '');
    if (decoded && !/^(YOUR_|REPLACE_)/.test(decoded)) password = decoded;
  } catch { /* fall through and generate */ }
}
if (!password) password = require('crypto').randomBytes(18).toString('hex');
process.stdout.write(password);
NODE
)"
[[ -n "$db_password" ]] || fail 'Could not resolve a database password.'

step "Creating role $db_role"
# The password is passed as a psql variable so it never appears on the command
# line or in the dry-run plan. psql expands variables only for SQL read from
# stdin, so the statements are fed through a here-document.
if psql_super -tAc "SELECT 1 FROM pg_roles WHERE rolname='$db_role'" 2>/dev/null | grep -qx 1; then
  printf '  %s: already exists (password refreshed from local configuration)\n' "$db_role"
  if ((dry_run)); then
    printf '  [dry-run] would refresh the role password\n'
  else
    psql_super -v role="$db_role" -v pw="$db_password" >/dev/null <<'SQL'
ALTER ROLE :"role" WITH LOGIN PASSWORD :'pw';
SQL
  fi
elif ((dry_run)); then
  printf '  [dry-run] would create the role with a generated password\n'
else
  psql_super -v role="$db_role" -v pw="$db_password" >/dev/null <<'SQL'
CREATE ROLE :"role" LOGIN PASSWORD :'pw';
SQL
fi

step 'Creating databases'
for name in "$db_name" territory_test territory_api_test; do
  if psql_super -tAc "SELECT 1 FROM pg_database WHERE datname='$name'" 2>/dev/null | grep -qx 1; then
    printf '  %s: already exists\n' "$name"
  else
    run psql_super -c "CREATE DATABASE $name OWNER $db_role"
  fi
done

step 'Filling placeholders in server/.env'
if [[ -f "$env_file" ]]; then
  printf '  server/.env exists; only missing or placeholder values are replaced\n'
elif ((dry_run)); then
  printf '  [dry-run] would create server/.env from server/.env.example\n'
else
  cp "$example_file" "$env_file"
  printf '  server/.env created from server/.env.example\n'
fi
if ((dry_run)); then
  printf '  [dry-run] would fill DATABASE_URL, DIRECT_URL, DATABASE_URL_TEST, DATABASE_URL_API_TEST,\n'
  printf '  [dry-run] POSTGRES_*, ADMIN_* and the two JWT secrets, and blank GOOGLE_WEB_CLIENT_ID\n'
else
  node - "$env_file" "$db_password" "$pg_port" "$db_role" "$db_name" <<'NODE'
const fs = require('fs');
const crypto = require('crypto');
const [, , file, password, port, role, dbName] = process.argv;
const raw = fs.readFileSync(file, 'utf8');

const get = (key) => {
  const match = raw.match(new RegExp('^' + key + '=(.*)$', 'm'));
  return match ? match[1].trim() : null;
};
const isPlaceholder = (value) => value === null || /^(?:|YOUR_.*|REPLACE_.*|<.*>)$/.test(value);
const base = 'postgresql://' + role + ':' + encodeURIComponent(password) + '@127.0.0.1:' + port + '/';

const updates = {
  DATABASE_URL: base + dbName + '?schema=public',
  DIRECT_URL: base + dbName + '?schema=public',
  DATABASE_URL_TEST: base + 'territory_test?schema=public',
  DATABASE_URL_API_TEST: base + 'territory_api_test?schema=public',
  POSTGRES_USER: role,
  POSTGRES_PASSWORD: password,
  POSTGRES_DB: dbName,
  POSTGRES_PORT: port,
};
if (isPlaceholder(get('ADMIN_EMAIL'))) updates.ADMIN_EMAIL = 'admin@territory.local';
let generatedAdminPassword = null;
if (isPlaceholder(get('ADMIN_PASSWORD'))) {
  generatedAdminPassword = crypto.randomBytes(12).toString('base64url');
  updates.ADMIN_PASSWORD = generatedAdminPassword;
}
for (const key of ['JWT_ACCESS_SECRET', 'REFRESH_TOKEN_DERIVATION_SECRET']) {
  if (isPlaceholder(get(key))) updates[key] = crypto.randomBytes(32).toString('hex');
}
if (isPlaceholder(get('GOOGLE_WEB_CLIENT_ID'))) updates.GOOGLE_WEB_CLIENT_ID = '';

let next = raw;
for (const [key, value] of Object.entries(updates)) {
  const pattern = new RegExp('^' + key + '=.*$', 'm');
  next = pattern.test(next)
    ? next.replace(pattern, key + '=' + value)
    : next.trimEnd() + '\n' + key + '=' + value + '\n';
}
fs.writeFileSync(file, next);
console.log('  updated: ' + Object.keys(updates).join(', '));
console.log('  ADMIN_EMAIL: ' + (updates.ADMIN_EMAIL ?? get('ADMIN_EMAIL')));
console.log(generatedAdminPassword
  ? '  ADMIN_PASSWORD: ' + generatedAdminPassword + ' (newly generated, stored in server/.env)'
  : '  ADMIN_PASSWORD: unchanged (already set in server/.env)');
NODE
fi

step 'Installing server dependencies'
if [[ -d "$server_dir/node_modules" ]]; then
  printf '  server/node_modules already present; skipping npm ci\n'
else
  run npm ci --prefix "$server_dir"
fi

step 'Generating the Prisma client'
run in_server npm run db:generate

step 'Applying committed migrations'
# migrate deploy applies the reviewed SQL migrations; db push would omit the
# hand-written CHECK constraints, partial indexes and the admin audit trigger.
run in_server npx prisma migrate deploy

step 'Seeding the database'
run in_server npm run db:seed

cat <<'DONE'

Local setup complete.
  API:  cd server && PORT=4000 npm start
  App:  cd mobile && npm run dev
  Admin credentials are in server/.env (ADMIN_EMAIL / ADMIN_PASSWORD).

If your shell already exports PORT, dotenv will not override it; start the API
with an explicit PORT (for example `PORT=4000 npm start`) in that case.
DONE
