#!/usr/bin/env bash
set -euo pipefail

usage() { printf 'Usage: %s [--dry-run]\n' "$0"; }
dry_run=false
case "${1:-}" in
  --dry-run) dry_run=true ;;
  --help|-h) usage; exit 0 ;;
  '') ;;
  *) usage >&2; exit 2 ;;
esac
if (( $# > 1 )); then usage >&2; exit 2; fi

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$repo_root"
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  printf 'Install Node 22.12+ and npm before running the phone test.\n' >&2
  exit 1
fi
# Read en0 directly; do not select a VPN, loopback or another interface.
lan_ip="$(ifconfig en0 2>/dev/null | awk '$1 == "inet" { print $2; exit }' || true)"
if [[ -z "$lan_ip" ]]; then
  printf 'No Wi-Fi IPv4 address found on en0. Connect the Mac to Wi-Fi, then retry.\n' >&2
  exit 1
fi

# Read configuration without sourcing .env as shell code or printing secrets.
metadata="$(node - "$repo_root" "$lan_ip" <<'METADATA'
const fs = require('node:fs');
const path = require('node:path');
const { isIPv4 } = require('node:net');
const [root, lan] = process.argv.slice(2);
try {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Node 22.12+ is required.');
  if (!isIPv4(lan)) throw new Error('en0 did not provide a valid Wi-Fi IPv4 address.');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'mobile/app-version.json'), 'utf8'));
  if (typeof version.versionName !== 'string' || version.versionName.length > 20 ||
      !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version.versionName) ||
      !Number.isInteger(version.versionCode) || version.versionCode < 1 || version.versionCode > 2100000000) {
    throw new Error('mobile/app-version.json must contain a valid versionName/versionCode.');
  }
  const dotenv = require(path.join(root, 'server/node_modules/dotenv'));
  const envFile = path.join(root, 'server/.env');
  if (!fs.existsSync(envFile)) throw new Error('Configure server/.env before running the phone test.');
  const env = { ...dotenv.parse(fs.readFileSync(envFile)), ...process.env };
  const origins = [...new Set([
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'https://localhost', 'http://localhost', 'capacitor://localhost',
    ...(env.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
    `http://${lan}:5173`,
  ])].join(',');
  require(path.join(root, 'server/src/config')).readConfig({ ...env, HOST: '0.0.0.0', PORT: '4000', CORS_ORIGINS: origins });
  console.log(version.versionName);
  console.log(version.versionCode);
  console.log(origins);
} catch (error) {
  console.error(error.code || error instanceof SyntaxError || error.code === 'MODULE_NOT_FOUND'
    ? 'Check server/.env, mobile/app-version.json and installed server dependencies.' : error.message);
  process.exitCode = 1;
}
METADATA
)"
version_name="$(printf '%s\n' "$metadata" | sed -n '1p')"
version_code="$(printf '%s\n' "$metadata" | sed -n '2p')"
cors_origins="$(printf '%s\n' "$metadata" | sed -n '3p')"
api_url="http://$lan_ip:4000"
apk="$repo_root/mobile/android/app/build/outputs/apk/debug/app-debug.apk"

if [[ "$dry_run" == true ]]; then
  printf 'Phone test --dry-run: no files written, builds run, databases changed or services started.\n'
  printf 'Project: %s\nWi-Fi IPv4 (en0): %s\n' "$repo_root" "$lan_ip"
  printf 'Would check that API port 4000 and web port 5173 are free; never stop existing listeners.\n'
  printf 'Would set web/.env.local: VITE_API_URL=%s (preserve other variables).\n' "$api_url"
  printf 'Would set mobile/.env.local: VITE_API_URL=%s (preserve other variables).\n' "$api_url"
  printf 'Would ensure PostgreSQL is running: ./scripts/local-postgres.sh start\n'
  printf 'Would rebuild version %s / code %s: VITE_API_URL=%s npm run apk:debug --prefix mobile\n' "$version_name" "$version_code" "$api_url"
  printf '  Existing build helper: Vite build, Capacitor sync, Gradle assembleDebug; reuse the existing debug key.\n'
  printf 'Would register: npm run release:register --prefix server -- --file %s --version-name %s --version-code %s\n' "$apk" "$version_name" "$version_code"
  printf 'Would start API in this Terminal: HOST=0.0.0.0 PORT=4000 CORS_ORIGINS=%s node server/src/index.js\n' "$cors_origins"
  printf 'Would start web in this Terminal: VITE_API_URL=%s npm run dev --prefix web -- --host 0.0.0.0 --port 5173 --strictPort\n' "$api_url"
  printf 'Would wait for healthy API and web responses, then keep both servers attached to this script.\n'
  printf 'Ctrl+C would stop only this script\047s API/web process groups; PostgreSQL would stay running.\n'
  printf 'Tracked files, including mobile/app-version.json, are never edited by this script.\n'
  printf 'Open on your phone (same Wi-Fi): http://%s:5173\n' "$lan_ip"
  exit 0
fi

# Fail before env writes/builds if another application owns either port.
node <<'PORTS'
const net = require('node:net');
(async () => {
  for (const port of [4000, 5173]) {
    const probe = net.createServer();
    await new Promise((resolve, reject) => {
      probe.once('error', () => reject(new Error(`Port ${port} is in use or unavailable. Stop its existing server, then retry.`)));
      probe.listen(port, '0.0.0.0', resolve);
    });
    await new Promise(resolve => probe.close(resolve));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
PORTS

umask 077
node - "$api_url" <<'ENV_FILES'
const fs = require('node:fs');
const value = process.argv[2];
for (const file of ['web/.env.local', 'mobile/.env.local']) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  let replaced = false;
  const lines = current.split(/\r?\n/).filter(line => {
    if (!/^\s*(?:export\s+)?VITE_API_URL\s*=/.test(line)) return true;
    if (replaced) return false;
    replaced = true;
    return true;
  }).map(line => /^\s*(?:export\s+)?VITE_API_URL\s*=/.test(line) ? `VITE_API_URL=${value}` : line);
  if (!replaced) lines.push(`VITE_API_URL=${value}`);
  fs.writeFileSync(file, lines.join('\n').replace(/\n*$/, '\n'), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}
ENV_FILES

printf 'Wi-Fi IPv4 (en0): %s\nBuilding version %s / code %s for %s\n' "$lan_ip" "$version_name" "$version_code" "$api_url"
"$repo_root/scripts/local-postgres.sh" start
VITE_API_URL="$api_url" npm run apk:debug --prefix mobile
npm run release:register --prefix server -- --file "$apk" --version-name "$version_name" --version-code "$version_code" \
  --changelog 'Phone-test build with LAN API connectivity.'

# A foreground supervisor keeps both services in this Terminal. Each service
# owns a process group so cleanup reaches npm/Vite descendants, never a server
# selected by name or port. No process is disowned or left as a daemon.
node - "$repo_root" "$lan_ip" "$cors_origins" <<'SERVERS'
const { spawn } = require('node:child_process');
const path = require('node:path');
const [root, lan, cors] = process.argv.slice(2);
const owned = [];
let stopping = false;
let shutdown;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function start(label, executable, args, cwd, env) {
  const child = spawn(executable, args, { cwd, env, detached: true, stdio: ['ignore', 'inherit', 'inherit'] });
  const record = { label, child, exited: false };
  record.closed = new Promise(resolve => {
    child.once('error', () => console.error(`${label} could not start. Check its installation and output above.`));
    child.once('close', () => { record.exited = true; resolve(); });
  });
  owned.push(record);
}

function signalGroup(record, signal) {
  if (!record.child.pid) return;
  try { process.kill(-record.child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}

function groupAlive(record) {
  if (!record.child.pid) return false;
  try { process.kill(-record.child.pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

function stop() {
  if (shutdown) return shutdown;
  stopping = true;
  shutdown = (async () => {
    for (const record of owned) signalGroup(record, 'SIGTERM');
    const expires = Date.now() + 10000;
    const force = setTimeout(() => { for (const record of owned) signalGroup(record, 'SIGKILL'); }, 10000);
    try {
      await Promise.all(owned.map(record => record.closed));
      // npm can exit before its Vite child: wait for their entire owned group.
      while (owned.some(groupAlive) && Date.now() < expires) await delay(50);
      for (const record of owned) if (groupAlive(record)) signalGroup(record, 'SIGKILL');
    } finally { clearTimeout(force); }
    console.log('Stopped the phone-test API and web server. PostgreSQL stays running.');
  })();
  return shutdown;
}

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.once(signal, () => { stop().then(() => process.exit(code)).catch(() => process.exit(1)); });
}

(async () => {
  start('API', process.execPath, ['src/index.js'], path.join(root, 'server'),
    { ...process.env, HOST: '0.0.0.0', PORT: '4000', CORS_ORIGINS: cors });
  start('Web', 'npm', ['run', 'dev', '--', '--host', '0.0.0.0', '--port', '5173', '--strictPort'], path.join(root, 'web'),
    { ...process.env, VITE_API_URL: `http://${lan}:4000` });
  const deadline = Date.now() + 30000;
  let ready = false;
  while (!stopping && Date.now() < deadline) {
    if (owned.some(record => record.exited)) throw new Error('A phone-test server exited. Check its output above.');
    try {
      const health = await fetch('http://127.0.0.1:4000/api/health', { signal: AbortSignal.timeout(1000) });
      const body = await health.json();
      const web = await fetch('http://127.0.0.1:5173', { signal: AbortSignal.timeout(1000) });
      ready = health.ok && body.status === 'ok' && body.db === 'up' && web.ok;
    } catch { ready = false; }
    if (ready) break;
    await delay(250);
  }
  if (stopping) return;
  if (!ready) throw new Error('API/web did not become ready within 30 seconds. Check database access and the output above.');
  console.log('Leave this Terminal open. Press Ctrl+C to stop both servers.');
  console.log(`Open on your phone (same Wi-Fi): http://${lan}:5173`);
  await Promise.race(owned.map(record => record.closed));
  if (!stopping) throw new Error('A phone-test server stopped; shutting down its companion.');
})().catch(async error => {
  console.error(error.message);
  await stop();
  process.exitCode = 1;
});
SERVERS
