'use strict';

require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { Pool } = require('pg');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const contract = require('./schema-contract');
const { serverRoot, testDatabaseConfig, verifyEmptyDatabase, runPrisma, user, run, rejectsSql } = require('./helpers');

// Guard runs before constructing a pool, executing a migration or issuing SQL.
const config = testDatabaseConfig(process.env);
const pool = new Pool({ connectionString: config.connectionString, max: 12, connectionTimeoutMillis: 5000 });

before(async () => {
  await verifyEmptyDatabase(pool, config.database);
  runPrisma(['migrate', 'deploy'], config.connectionString);
});
after(async () => { await pool.end(); });

test('empty-database migration creates exactly the specified 26 application tables', async () => {
  const { rows } = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY table_name
  `);
  assert.equal(rows.length, 26);
  assert.deepEqual(rows.map((row) => row.table_name), Object.keys(contract.columns).sort());
  const { rows: migrations } = await pool.query('SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations');
  assert.equal(migrations.length, 1);
  assert.ok(migrations[0].finished_at);
  assert.equal(migrations[0].rolled_back_at, null);
  // A second deploy must be a no-op.
  runPrisma(['migrate', 'deploy'], config.connectionString);
});

test('all 26 tables match the independent column, type and nullability contract', async () => {
  const { rows } = await pool.query(`
    SELECT c.relname AS table, a.attname AS column, format_type(a.atttypid, a.atttypmod) AS type,
           NOT a.attnotnull AS nullable
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
      AND a.attnum > 0 AND NOT a.attisdropped
  `);
  rows.sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`));
  assert.deepEqual(rows, contract.expectedColumns());
});

test('all ten enums match the specified values and order', async () => {
  const { rows } = await pool.query(`
    SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' GROUP BY t.typname
  `);
  assert.deepEqual(Object.fromEntries(rows.map((row) => [row.name, row.labels])), contract.enums);
});

test('UUID defaults, timestamp defaults, identity columns and all explicit defaults match the spec', async () => {
  const { rows } = await pool.query(`
    SELECT c.relname AS table, a.attname AS column, pg_get_expr(d.adbin, d.adrelid) AS expression,
           a.attidentity AS identity
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
      AND a.attnum > 0 AND NOT a.attisdropped
  `);
  const expected = {};
  for (const field of contract.expectedColumns()) {
    if (field.column === 'id' && field.type === 'uuid') expected[`${field.table}.${field.column}`] = 'gen_random_uuid()';
    if (['created_at', 'joined_at', 'awarded_at', 'claimed_at', 'published_at'].includes(field.column)) {
      expected[`${field.table}.${field.column}`] = 'CURRENT_TIMESTAMP';
    }
  }
  Object.assign(expected, {
    'users.role': `'RUNNER'::"SystemRole"`, 'team_members.role': `'MEMBER'::"TeamRole"`,
    'seasons.status': `'UPCOMING'::"SeasonStatus"`, 'runs.status': `'UPLOADING'::"RunStatus"`,
    'run_flags.status': `'OPEN'::"FlagStatus"`, 'user_privacy_settings.hide_route': 'true',
    'user_privacy_settings.hide_radius_m': '200', 'user_stats.total_runs': '0', 'user_stats.total_dist_m': '0',
    'user_stats.streak_days': '0', 'user_stats.best_streak': '0', 'runs.route_polyline': `''::text`,
    'runs.h3_resolution': '11', 'runs.mock_gps': 'false', 'restricted_zones.active': 'true',
    'devices.platform': `'ANDROID'::character varying`, 'app_releases.is_active': 'true',
  });
  for (const row of rows) {
    const key = `${row.table}.${row.column}`;
    assert.equal(row.expression, expected[key] ?? null, `Default for ${key}`);
    assert.equal(row.identity, ['run_points.id', 'login_attempts.id'].includes(key) ? 'd' : '', `Identity for ${key}`);
  }
});

test('all primary/unique keys, ordinary indexes and both partial unique indexes match the spec', async () => {
  const { rows } = await pool.query(`
    SELECT c.relname AS table, i.indisprimary AS primary, i.indisunique AS unique,
           pg_get_expr(i.indpred, i.indrelid) AS predicate,
           array_agg(a.attname::text ORDER BY k.ordinality) AS columns
    FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality)
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
    WHERE n.nspname = 'public' AND c.relname <> '_prisma_migrations'
    GROUP BY i.indexrelid, c.relname, i.indisprimary, i.indisunique, i.indpred, i.indrelid
  `);
  const keys = rows.filter((row) => row.unique && !row.predicate)
    .map((row) => `${row.table}:${row.primary ? 'p' : 'u'}:${row.columns.join(',')}`).sort();
  const expected = Object.entries(contract.keys).flatMap(([table, values]) => values.map((value) => `${table}:${value}`)).sort();
  assert.deepEqual(keys, expected);
  assert.deepEqual(rows.filter((row) => !row.unique).map((row) => `${row.table}:${row.columns.join(',')}`).sort(), [...contract.indexes].sort());
  assert.deepEqual(rows.filter((row) => row.predicate).map((row) => ({
    table: row.table, unique: row.unique, columns: row.columns, predicate: row.predicate,
  })).sort((a, b) => a.table.localeCompare(b.table)), [
    { table: 'seasons', unique: true, columns: ['status'], predicate: `(status = 'ACTIVE'::"SeasonStatus")` },
    { table: 'team_members', unique: true, columns: ['team_id'], predicate: `(role = 'CAPTAIN'::"TeamRole")` },
  ]);
  const { rows: checks } = await pool.query(`
    SELECT conname, convalidated FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace
  `);
  assert.deepEqual(checks.map((row) => row.conname).sort(), [
    'users_email_lowercase_check', 'follows_no_self_follow_check', 'badges_threshold_positive_check',
    'seasons_time_order_check', 'runs_time_order_check', 'runs_distance_nonnegative_check',
    'runs_duration_positive_check', 'run_flags_reporter_reason_check',
  ].sort());
  assert.ok(checks.every((row) => row.convalidated));
});

test('all foreign keys and delete actions match, with no foreign keys on deliberate history/standalone fields', async () => {
  const { rows } = await pool.query(`
    SELECT child.relname || '.' || ca.attname AS child, parent.relname || '.' || pa.attname AS parent,
           c.confdeltype AS action
    FROM pg_constraint c JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN pg_attribute ca ON ca.attrelid = child.oid AND ca.attnum = c.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid = parent.oid AND pa.attnum = c.confkey[1]
    WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
  `);
  assert.deepEqual(rows.map((row) => [row.child, row.parent, row.action]).sort(), [...contract.foreignKeys].sort());
});

test('populated test database guard refuses reuse without changing any data', async () => {
  await assert.rejects(() => verifyEmptyDatabase(pool, config.database), /test database must be empty/);
  assert.equal((await pool.query('SELECT migration_name FROM _prisma_migrations')).rowCount, 1);
});

test('duplicate run upload and duplicate point chunk are rejected; other users may reuse a client ID', async () => {
  const first = await user(pool);
  const second = await user(pool);
  const original = await run(pool, first.id);
  await rejectsSql(() => run(pool, first.id, { clientRunId: original.client_run_id }), '23505', 'runs_user_id_client_run_id_key');
  await run(pool, second.id, { clientRunId: original.client_run_id });
  const point = () => pool.query(`INSERT INTO run_points (run_id, seq, lat, lng, recorded_at, accuracy_m)
    VALUES ($1, 1, 19.076, 72.8777, now(), 5)`, [original.id]);
  await point();
  await rejectsSql(point, '23505', 'run_points_run_id_seq_key');
  assert.equal(original.route_polyline, '');
  assert.equal(original.status, 'UPLOADING');
  assert.equal(original.h3_resolution, 11);
});

test('follows rejects self-follow and duplicate edges while accepting a real follow', async () => {
  const first = await user(pool);
  const second = await user(pool);
  await rejectsSql(() => pool.query('INSERT INTO follows (follower_id, followee_id) VALUES ($1, $1)', [first.id]), '23514', 'follows_no_self_follow_check');
  await pool.query('INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)', [first.id, second.id]);
  await rejectsSql(() => pool.query('INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)', [first.id, second.id]), '23505');
});

test('only one ACTIVE season is permitted, including updates; multiple UPCOMING/ENDED seasons are allowed', async () => {
  const insert = (status) => pool.query(`INSERT INTO seasons (name, starts_at, ends_at, status)
    VALUES ($1, '2026-01-01', '2026-02-01', $2) RETURNING id`, [randomUUID(), status]);
  const { rows: [active] } = await insert('ACTIVE');
  await rejectsSql(() => insert('ACTIVE'), '23505', 'seasons_one_active_idx');
  const { rows: [upcoming] } = await insert('UPCOMING');
  await insert('UPCOMING');
  await insert('ENDED');
  await insert('ENDED');
  await rejectsSql(() => pool.query("UPDATE seasons SET status = 'ACTIVE' WHERE id = $1", [upcoming.id]), '23505');
  await pool.query("UPDATE seasons SET status = 'ENDED' WHERE id = $1", [active.id]);
  await pool.query("UPDATE seasons SET status = 'ACTIVE' WHERE id = $1", [upcoming.id]);
  await pool.query("UPDATE seasons SET status = 'ENDED' WHERE id = $1", [upcoming.id]);
});

test('one CAPTAIN per team and one team_members row per runner are enforced', async () => {
  const runners = await Promise.all(Array.from({ length: 5 }, () => user(pool)));
  const makeTeam = async () => (await pool.query(`INSERT INTO teams (name, color_hex, invite_code)
    VALUES ($1, '#12AB34', $2) RETURNING id`, [randomUUID(), randomUUID().slice(0, 12)])).rows[0];
  const team = await makeTeam();
  const otherTeam = await makeTeam();
  const join = (index, teamId, role) => pool.query('INSERT INTO team_members (user_id, team_id, role) VALUES ($1, $2, $3)', [runners[index].id, teamId, role]);
  await join(0, team.id, 'CAPTAIN');
  await join(1, team.id, 'MEMBER');
  await join(2, team.id, 'MEMBER');
  await rejectsSql(() => join(3, team.id, 'CAPTAIN'), '23505', 'team_members_one_captain_per_team_idx');
  await rejectsSql(() => pool.query("UPDATE team_members SET role = 'CAPTAIN' WHERE user_id = $1", [runners[1].id]), '23505');
  await rejectsSql(() => join(0, otherTeam.id, 'MEMBER'), '23505', 'team_members_pkey');
  await join(4, otherTeam.id, 'CAPTAIN');
});

test('runs rejects non-increasing times, negative distance and non-positive duration', async () => {
  const runner = await user(pool);
  for (const endedAt of ['2026-01-01T10:00:00Z', '2026-01-01T09:59:59Z']) {
    await rejectsSql(() => run(pool, runner.id, { endedAt }), '23514', 'runs_time_order_check');
  }
  await rejectsSql(() => run(pool, runner.id, { distanceM: -1 }), '23514', 'runs_distance_nonnegative_check');
  for (const durationS of [0, -1]) await rejectsSql(() => run(pool, runner.id, { durationS }), '23514', 'runs_duration_positive_check');
  await run(pool, runner.id, { distanceM: 0 });
});

test('lowercase email, positive badge threshold and season time CHECK constraints reject invalid writes', async () => {
  await rejectsSql(() => user(pool, { email: 'MixedCase@test.example' }), '23514', 'users_email_lowercase_check');
  const runner = await user(pool);
  await rejectsSql(() => user(pool, { email: runner.email }), '23505');
  await rejectsSql(() => user(pool, { username: runner.username }), '23505');
  for (const threshold of [0, -1]) {
    await rejectsSql(() => pool.query(`INSERT INTO badges (code, name, criteria, threshold)
      VALUES ($1, 'Test', 'RUN_COUNT', $2)`, [randomUUID(), threshold]), '23514', 'badges_threshold_positive_check');
  }
  for (const endsAt of ['2026-01-01', '2025-12-31']) {
    await rejectsSql(() => pool.query(`INSERT INTO seasons (name, starts_at, ends_at)
      VALUES ($1, '2026-01-01', $2)`, [randomUUID(), endsAt]), '23514', 'seasons_time_order_check');
  }
});

test('reporter reason CHECK and SET NULL references on zone/reporter/resolver deletion work', async () => {
  const owner = await user(pool);
  const reporter = await user(pool);
  const resolver = await user(pool);
  const activity = await run(pool, owner.id);
  const { rows: [zone] } = await pool.query("INSERT INTO restricted_zones (name, reason) VALUES ($1, 'Test zone') RETURNING id", [randomUUID()]);
  await pool.query('INSERT INTO restricted_zone_hexes (zone_id, h3_index) VALUES ($1, 626195993234145279)', [zone.id]);
  await rejectsSql(() => pool.query(`INSERT INTO run_flags (run_id, reason, reporter_id)
    VALUES ($1, 'SPEED_LIMIT', $2)`, [activity.id, reporter.id]), '23514', 'run_flags_reporter_reason_check');
  const { rows: [flag] } = await pool.query(`INSERT INTO run_flags (run_id, zone_id, reason, reporter_id, resolver_id)
    VALUES ($1, $2, 'USER_REPORT', $3, $4) RETURNING id`, [activity.id, zone.id, reporter.id, resolver.id]);
  await pool.query('INSERT INTO run_flags (run_id, reason) VALUES ($1, $2)', [activity.id, 'SPEED_LIMIT']);
  await pool.query('DELETE FROM restricted_zones WHERE id = $1', [zone.id]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[reporter.id, resolver.id]]);
  const { rows: [remaining] } = await pool.query('SELECT zone_id, reporter_id, resolver_id FROM run_flags WHERE id = $1', [flag.id]);
  assert.deepEqual(remaining, { zone_id: null, reporter_id: null, resolver_id: null });
  assert.equal((await pool.query('SELECT * FROM restricted_zone_hexes WHERE zone_id = $1', [zone.id])).rowCount, 0);
});

test('user deletion cascades dependent data but preserves audit and another runner’s prev_owner_id history', async () => {
  const deleted = await user(pool, { role: 'ADMIN' });
  const survivor = await user(pool);
  const deletedRun = await run(pool, deleted.id);
  const survivorRun = await run(pool, survivor.id);
  await pool.query(`INSERT INTO run_points (run_id, seq, lat, lng, recorded_at, accuracy_m)
    VALUES ($1, 0, 19, 72, now(), 4)`, [deletedRun.id]);
  await pool.query(`INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at)
    VALUES ($1, 'REFRESH', $2, now() + interval '1 day')`, [deleted.id, randomBytes(32).toString('hex')]);
  await pool.query(`INSERT INTO devices (user_id, fcm_token, app_version, last_seen_at)
    VALUES ($1, $2, 'test', now())`, [deleted.id, randomUUID()]);
  await pool.query("INSERT INTO notifications (user_id, type, title) VALUES ($1, 'SYSTEM', 'Test')", [deleted.id]);
  await pool.query('INSERT INTO user_privacy_settings (user_id) VALUES ($1)', [deleted.id]);
  await pool.query('INSERT INTO user_stats (user_id, updated_at) VALUES ($1, now())', [deleted.id]);
  await pool.query('INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2), ($2, $1)', [deleted.id, survivor.id]);
  const { rows: [audit] } = await pool.query(`INSERT INTO admin_actions (admin_id, action, target_type, target_id)
    VALUES ($1, 'REVIEW_RUN', 'runs', $2) RETURNING id`, [deleted.id, deletedRun.id]);
  await pool.query(`INSERT INTO hex_ownership (h3_index, owner_id, run_id, cooldown_until)
    VALUES (626195993234145280, $1, $2, now() + interval '30 minutes')`, [deleted.id, deletedRun.id]);
  await pool.query(`INSERT INTO run_hexes (run_id, h3_index, outcome, prev_owner_id)
    VALUES ($1, 626195993234145280, 'CAPTURED', NULL),
           ($2, 626195993234145281, 'CAPTURED', $3),
           ($2, 626195993234145282, 'RESTRICTED', NULL)`, [deletedRun.id, survivorRun.id, deleted.id]);
  await pool.query('DELETE FROM users WHERE id = $1', [deleted.id]);
  for (const table of ['runs', 'auth_tokens', 'devices', 'notifications', 'user_privacy_settings', 'user_stats']) {
    assert.equal((await pool.query(`SELECT * FROM ${table} WHERE user_id = $1`, [deleted.id])).rowCount, 0, table);
  }
  assert.equal((await pool.query('SELECT * FROM run_points WHERE run_id = $1', [deletedRun.id])).rowCount, 0);
  assert.equal((await pool.query('SELECT * FROM run_hexes WHERE run_id = $1', [deletedRun.id])).rowCount, 0);
  assert.equal((await pool.query('SELECT * FROM hex_ownership WHERE owner_id = $1', [deleted.id])).rowCount, 0);
  assert.equal((await pool.query('SELECT * FROM follows WHERE follower_id = $1 OR followee_id = $1', [deleted.id])).rowCount, 0);
  assert.equal((await pool.query('SELECT admin_id FROM admin_actions WHERE id = $1', [audit.id])).rows[0].admin_id, deleted.id);
  const { rows: history } = await pool.query('SELECT prev_owner_id FROM run_hexes WHERE run_id = $1 ORDER BY h3_index', [survivorRun.id]);
  assert.deepEqual(history, [{ prev_owner_id: deleted.id }, { prev_owner_id: null }]);
});

test('admin_actions is append-only: UPDATE, DELETE and TRUNCATE are rejected by PostgreSQL', async () => {
  for (const sql of ["UPDATE admin_actions SET note = 'changed'", 'DELETE FROM admin_actions', 'TRUNCATE admin_actions']) {
    await rejectsSql(() => pool.query(sql), '55000');
  }
});

const claimSql = `
  INSERT INTO hex_ownership (h3_index, owner_id, run_id, cooldown_until) VALUES ($1, $2, $3, $4)
  ON CONFLICT (h3_index) DO UPDATE SET owner_id = EXCLUDED.owner_id, run_id = EXCLUDED.run_id,
    claimed_at = now(), cooldown_until = EXCLUDED.cooldown_until
  WHERE hex_ownership.cooldown_until <= now()
  RETURNING owner_id, run_id
`;

async function contenders(count) {
  return Promise.all(Array.from({ length: count }, async () => {
    const runner = await user(pool);
    const activity = await run(pool, runner.id);
    return { ownerId: runner.id, runId: activity.id };
  }));
}

async function parallelTransactions(actors, work) {
  // Acquire all physical connections and open every transaction before releasing
  // the JS barrier. Query timeouts turn a deadlock/hang into a failing test.
  const clients = await Promise.all(actors.map(() => pool.connect()));
  try {
    const pids = await Promise.all(clients.map(async (client) => {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("SET LOCAL statement_timeout = '15s'");
      return (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    }));
    assert.equal(new Set(pids).size, actors.length, 'Must use distinct PostgreSQL connections');
    const results = await Promise.allSettled(clients.map(async (client, index) => {
      try {
        const value = await work(client, actors[index], index);
        await client.query('COMMIT');
        return value;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }));
    for (const result of results) assert.equal(result.status, 'fulfilled', result.reason?.message);
    return results.map((result) => result.value);
  } finally {
    await Promise.all(clients.map(async (client) => {
      try { await client.query('ROLLBACK'); } finally { client.release(); }
    }));
  }
}

test('10-runner concurrency: one winner for an unowned/expired hex; live cooldown cannot be stolen; no errors/deadlocks', { timeout: 60000 }, async () => {
  const actors = await contenders(10);
  for (const [offset, mode] of ['unowned', 'expired', 'protected'].entries()) {
    const cell = (626195993234146000n + BigInt(offset)).toString();
    if (mode !== 'unowned') {
      await pool.query(`INSERT INTO hex_ownership (h3_index, owner_id, run_id, cooldown_until)
        VALUES ($1, $2, $3, now() + $4::interval)`, [cell, actors[0].ownerId, actors[0].runId, mode === 'expired' ? '-1 minute' : '30 minutes']);
    }
    const results = await parallelTransactions(actors, (client, actor) => client.query(claimSql,
      [cell, actor.ownerId, actor.runId, new Date(Date.now() + 30 * 60 * 1000)]));
    const winners = results.flatMap((result) => result.rows);
    assert.equal(winners.length, mode === 'protected' ? 0 : 1, `${mode}: conditional-upsert winners`);
    const { rows } = await pool.query('SELECT owner_id, run_id, cooldown_until > now() AS protected FROM hex_ownership WHERE h3_index = $1', [cell]);
    assert.equal(rows.length, 1, `${mode}: exactly one owner remains`);
    assert.equal(rows[0].protected, true);
    assert.equal(rows[0].owner_id, mode === 'protected' ? actors[0].ownerId : winners[0].owner_id);
    assert.equal(rows[0].run_id, mode === 'protected' ? actors[0].runId : winners[0].run_id);
  }
});

test('two-connection batch concurrency: sorted h3_index claims finish with one owner per hex and no errors/deadlocks', { timeout: 30000 }, async () => {
  const actors = await contenders(2);
  const cells = Array.from({ length: 40 }, (_, index) => 626195993234147000n + BigInt(index));
  const results = await parallelTransactions(actors, async (client, actor, index) => {
    const input = index === 0 ? [...cells] : [...cells].reverse();
    input.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    let claims = 0;
    for (const cell of input) {
      const result = await client.query(claimSql, [cell.toString(), actor.ownerId, actor.runId, new Date(Date.now() + 30 * 60 * 1000)]);
      claims += result.rowCount;
    }
    return claims;
  });
  assert.equal(results.reduce((sum, count) => sum + count, 0), cells.length);
  const { rows } = await pool.query('SELECT h3_index, owner_id, run_id FROM hex_ownership WHERE h3_index = ANY($1::bigint[]) ORDER BY h3_index', [cells.map(String)]);
  assert.equal(rows.length, cells.length);
  assert.equal(new Set(rows.map((row) => row.h3_index)).size, cells.length);
  for (const row of rows) assert.ok(actors.some((actor) => actor.ownerId === row.owner_id && actor.runId === row.run_id));
});

test('Prisma maintains updated_at on users, user_stats and game_settings', async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: config.connectionString } } });
  try {
    const runner = await user(pool);
    const old = new Date('2000-01-01T00:00:00Z');
    await prisma.user.update({ where: { id: runner.id }, data: { updatedAt: old } });
    const updatedUser = await prisma.user.update({ where: { id: runner.id }, data: { displayName: 'Updated' } });
    assert.ok(updatedUser.updatedAt > old);
    await prisma.userStat.create({ data: { userId: runner.id, updatedAt: old } });
    assert.ok((await prisma.userStat.update({ where: { userId: runner.id }, data: { totalRuns: 1 } })).updatedAt > old);
    const key = `test_${randomUUID()}`;
    await prisma.gameSetting.create({ data: { key, value: 'a', updatedAt: old } });
    assert.ok((await prisma.gameSetting.update({ where: { key }, data: { value: 'b' } })).updatedAt > old);
  } finally { await prisma.$disconnect(); }
});

test('seed runs twice idempotently: bcrypt admin, correct defaults/badges, stable dates, preserved tuning and no fake runs', { timeout: 30000 }, async () => {
  const email = 'seed-admin@tests.example';
  const password = randomBytes(32).toString('base64url');
  const seed = () => {
    try {
      execFileSync(process.execPath, [path.join(serverRoot, 'prisma/seed.js')], {
        cwd: serverRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000,
        env: { ...process.env, DATABASE_URL: config.connectionString, DIRECT_URL: config.connectionString, ADMIN_EMAIL: email, ADMIN_PASSWORD: password },
      });
    } catch { throw new Error('Seed failed against isolated test database.'); }
  };
  const runsBefore = (await pool.query('SELECT count(*)::int AS count FROM runs')).rows[0].count;
  seed();
  const keys = ['h3_resolution', 'claim_cooldown_minutes', 'max_speed_mps', 'max_gps_jump_m', 'min_gps_accuracy_m', 'decay_days'];
  const { rows: defaults } = await pool.query('SELECT key, value FROM game_settings WHERE key = ANY($1::text[])', [keys]);
  assert.deepEqual(Object.fromEntries(defaults.map((row) => [row.key, row.value])), {
    h3_resolution: '11', claim_cooldown_minutes: '30', max_speed_mps: '8.5', max_gps_jump_m: '100', min_gps_accuracy_m: '30', decay_days: '14',
  });
  const { rows: badges } = await pool.query("SELECT criteria, threshold FROM badges WHERE code IN ('TOTAL_DISTANCE_10KM', 'HEX_COUNT_100', 'STREAK_DAYS_7', 'RUN_COUNT_10')");
  assert.deepEqual(badges.map((row) => [row.criteria, row.threshold]).sort(), [['TOTAL_DISTANCE', 10000], ['HEX_COUNT', 100], ['STREAK_DAYS', 7], ['RUN_COUNT', 10]].sort());
  const { rows: [admin] } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  assert.equal(admin.role, 'ADMIN');
  assert.match(admin.password_hash, /^\$2[aby]\$12\$/);
  assert.ok(await bcrypt.compare(password, admin.password_hash));
  const { rows: [season] } = await pool.query("SELECT * FROM seasons WHERE name = 'Season 1'");
  assert.equal(season.status, 'UPCOMING');
  assert.ok(season.starts_at > new Date());
  assert.ok(season.ends_at > season.starts_at);
  assert.equal((await pool.query("SELECT * FROM regions WHERE name = 'Demo Region'")).rowCount, 1);
  await pool.query("UPDATE game_settings SET value = '45' WHERE key = 'claim_cooldown_minutes'");
  const snapshot = async () => {
    const results = await Promise.all([
      pool.query('SELECT * FROM users WHERE email = $1', [email]),
      pool.query('SELECT * FROM game_settings WHERE key = ANY($1::text[]) ORDER BY key', [keys]),
      pool.query("SELECT * FROM seasons WHERE name = 'Season 1'"),
      pool.query("SELECT * FROM regions WHERE name = 'Demo Region'"),
      pool.query("SELECT * FROM badges WHERE code IN ('TOTAL_DISTANCE_10KM', 'HEX_COUNT_100', 'STREAK_DAYS_7', 'RUN_COUNT_10') ORDER BY code"),
    ]);
    return results.map((result) => result.rows);
  };
  const first = await snapshot();
  seed();
  assert.deepEqual(await snapshot(), first);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM runs')).rows[0].count, runsBefore);
});
