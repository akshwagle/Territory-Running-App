'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');

function parseDatabaseUrl(value, name) {
  if (!value) throw new Error(`Set ${name} before running database tests.`);
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a PostgreSQL URL.`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${name} must be a PostgreSQL URL.`);
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || database.includes('/')) throw new Error(`${name} needs an explicit database name.`);
  return { url, database };
}

function testDatabaseConfig(env) {
  const app = parseDatabaseUrl(env.DATABASE_URL, 'DATABASE_URL');
  const direct = parseDatabaseUrl(env.DIRECT_URL, 'DIRECT_URL');
  const test = parseDatabaseUrl(env.DATABASE_URL_TEST, 'DATABASE_URL_TEST');
  if (env.DATABASE_URL_TEST === env.DATABASE_URL || env.DATABASE_URL_TEST === env.DIRECT_URL) {
    throw new Error('Refusing to test: test URL equals an application/migration URL.');
  }
  // Conservative on purpose: even different credentials, aliases, ports or schema
  // query parameters must not disguise the same application database name.
  if ([app.database, direct.database].some((name) => name.toLowerCase() === test.database.toLowerCase())) {
    throw new Error('Refusing to test: use a separate test database name.');
  }
  if ((test.url.searchParams.get('schema') || 'public') !== 'public') {
    throw new Error('Refusing to test: DATABASE_URL_TEST must target schema public.');
  }
  const allowed = new Set(['schema', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'connect_timeout', 'application_name']);
  for (const key of test.url.searchParams.keys()) {
    if (!allowed.has(key)) throw new Error('Refusing to test: unsupported test connection parameter.');
  }
  return { connectionString: env.DATABASE_URL_TEST, database: test.database };
}

async function verifyEmptyDatabase(pool, expectedDatabase) {
  const { rows: [identity] } = await pool.query(
    "SELECT current_database() AS database, current_setting('server_version_num')::int AS version"
  );
  assert.equal(identity.database, expectedDatabase, 'Connected to the wrong test database');
  assert.equal(Math.floor(identity.version / 10000), 16, 'Tests require PostgreSQL 16');
  const { rows } = await pool.query(`
    SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  `);
  if (rows.length) throw new Error('Refusing to test: test database must be empty. Recreate only the disposable test database.');
}

function runPrisma(args, connectionString) {
  try {
    return execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args], {
      cwd: serverRoot,
      env: { ...process.env, DATABASE_URL: connectionString, DIRECT_URL: connectionString },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
    });
  } catch {
    throw new Error('Prisma command failed against the isolated test database. Check migrations and privileges.');
  }
}

async function user(db, overrides = {}) {
  const id = overrides.id || randomUUID();
  const values = { username: `test_${id.slice(0, 20)}`, email: `${id}@test.example`,
    displayName: `DB ${id.replaceAll('-', '').slice(-20)}`, role: 'RUNNER', ...overrides };
  const { rows: [row] } = await db.query(`
    INSERT INTO users (id, username, email, password_hash, display_name, role, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING *
  `, [id, values.username, values.email, 'test-only-hash', values.displayName, values.role]);
  return row;
}

async function run(db, userId, overrides = {}) {
  const values = {
    clientRunId: randomUUID(), startedAt: '2026-01-01T10:00:00Z', endedAt: '2026-01-01T10:10:00Z',
    distanceM: 1000, durationS: 600, ...overrides,
  };
  const { rows: [row] } = await db.query(`
    INSERT INTO runs (user_id, client_run_id, started_at, ended_at, distance_m, duration_s, app_version)
    VALUES ($1, $2, $3, $4, $5, $6, 'db-test') RETURNING *
  `, [userId, values.clientRunId, values.startedAt, values.endedAt, values.distanceM, values.durationS]);
  return row;
}

async function rejectsSql(operation, code, constraint) {
  await assert.rejects(operation, (error) => {
    assert.equal(error.code, code, `Expected SQLSTATE ${code}, got ${error.code}`);
    if (constraint) assert.equal(error.constraint, constraint);
    return true;
  });
}

module.exports = { serverRoot, testDatabaseConfig, verifyEmptyDatabase, runPrisma, user, run, rejectsSql };
