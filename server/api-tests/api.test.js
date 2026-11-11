'use strict';

require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const request = require('supertest');
const { Pool } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { testDatabaseConfig, verifyEmptyDatabase, runPrisma } = require('../db-tests/helpers');
const { createApp } = require('../src/app');
const { readConfig } = require('../src/config');
const { releaseInput, registerRelease, sha256 } = require('../scripts/register-release');

// Reuse Phase 1's URL, identity, PostgreSQL-16 and empty-database guards.
// No Prisma instance can implicitly fall back to DATABASE_URL.
const isolated = testDatabaseConfig({ ...process.env, DATABASE_URL_TEST: process.env.DATABASE_URL_API_TEST });
const pool = new Pool({ connectionString: isolated.connectionString });
const prisma = new PrismaClient({ datasources: { db: { url: isolated.connectionString } }, log: [] });
const config = readConfig({ ...process.env, CORS_ORIGINS: 'http://localhost:5173,https://localhost,http://localhost,capacitor://localhost' });
let directory;
let app;
const logs = [];

before(async () => {
  await verifyEmptyDatabase(pool, isolated.database);
  runPrisma(['migrate', 'deploy'], isolated.connectionString);
  directory = await fs.mkdtemp(path.resolve(__dirname, '../../.local/api-fixture-'));
  await fs.writeFile(path.join(directory, 'fixture.apk'), 'download fixture only');
  app = createApp({ prisma, config, downloadDir: directory, logger: (line) => logs.push(line) });
});
beforeEach(async () => { await prisma.appRelease.deleteMany(); });
after(async () => {
  await prisma.$disconnect();
  await pool.end();
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

function standardError(response, status, code) {
  assert.equal(response.status, status);
  assert.deepEqual(Object.keys(response.body), ['error']);
  assert.deepEqual(Object.keys(response.body.error).sort(), ['code', 'message']);
  assert.equal(response.body.error.code, code);
  assert.equal(typeof response.body.error.message, 'string');
  assert.ok(response.body.error.message.length);
  assert.equal(response.body.stack, undefined);
}

test('health returns 200 after a real database query', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.db, 'up');
  assert.ok(!Number.isNaN(Date.parse(response.body.time)));
  assert.ok(response.headers['x-content-type-options']);
});

test('health returns the specified 503 envelope when the database is unreachable', async () => {
  const unreachable = new URL(isolated.connectionString);
  unreachable.port = '1';
  unreachable.searchParams.set('connect_timeout', '1');
  const down = new PrismaClient({ datasources: { db: { url: unreachable.toString() } }, log: [] });
  try {
    const response = await request(createApp({ prisma: down, config, logger: () => {} })).get('/api/health');
    assert.equal(response.status, 503);
    assert.equal(response.body.status, 'degraded');
    assert.equal(response.body.db, 'down');
    assert.ok(!Number.isNaN(Date.parse(response.body.time)));
    assert.equal(JSON.stringify(response.body).includes('postgresql'), false);
  } finally { await down.$disconnect(); }
});

test('latest returns the standard NO_RELEASE error when empty', async () => {
  standardError(await request(app).get('/api/releases/latest'), 404, 'NO_RELEASE');
});

test('latest selects highest active version code and ignores a newer inactive release', async () => {
  for (const [versionCode, isActive] of [[1, true], [3, true], [9, false]]) {
    await prisma.appRelease.create({ data: { versionCode, versionName: `0.1.${versionCode}`, apkUrl: '/downloads/fixture.apk', sha256: 'a'.repeat(64), isActive } });
  }
  const response = await request(app).get('/api/releases/latest');
  assert.equal(response.status, 200);
  assert.equal(response.body.versionCode, 3);
  assert.deepEqual(Object.keys(response.body).sort(), ['versionCode', 'versionName', 'apkUrl', 'sha256', 'changelog', 'publishedAt'].sort());
  await prisma.appRelease.updateMany({ data: { isActive: false } });
  standardError(await request(app).get('/api/releases/latest'), 404, 'NO_RELEASE');
});

test('APK GET and HEAD have Android content type and attachment headers', async () => {
  for (const method of ['get', 'head']) {
    const response = await request(app)[method]('/downloads/fixture.apk');
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], 'application/vnd.android.package-archive');
    assert.match(response.headers['content-disposition'], /^attachment; filename="?fixture\.apk"?$/);
    assert.equal(response.headers['content-length'], String(Buffer.byteLength('download fixture only')));
  }
});

test('downloads reject traversal, encoded forms, malformed encodings, non-APK files and directories', async () => {
  for (const url of [
    '/downloads/../package.json', '/downloads/%2e%2e%2fpackage.json', '/downloads/%2e%2e/package.json',
    '/downloads/%252e%252e%252fpackage.json', '/downloads/..%5cpackage.json', '/downloads/file.apk%00',
    '/downloads/%ZZ.apk', '/downloads/file.txt', '/downloads/', '/downloads/missing.apk',
  ]) standardError(await request(app).get(url), 404, 'NOT_FOUND');
  await fs.symlink(path.resolve(__dirname, '../package.json'), path.join(directory, 'escape.apk'));
  standardError(await request(app).get('/downloads/escape.apk'), 404, 'NOT_FOUND');
});

test('CORS permits all configured web/Capacitor origins and rejects an unlisted origin', async () => {
  for (const origin of config.origins) {
    const response = await request(app).get('/api/health').set('Origin', origin);
    assert.equal(response.status, 200);
    assert.equal(response.headers['access-control-allow-origin'], origin);
  }
  const blocked = await request(app).get('/api/health').set('Origin', 'https://unlisted.example');
  standardError(blocked, 403, 'CORS_ORIGIN_DENIED');
  assert.equal(blocked.headers['access-control-allow-origin'], undefined);
});

test('rate limits and unexpected database failures use standard errors without secret details', async () => {
  const limited = createApp({ prisma, config: { ...config, rateLimitMax: 1 }, logger: () => {} });
  await request(limited).get('/api/health');
  standardError(await request(limited).get('/api/health'), 429, 'RATE_LIMITED');
  const failing = createApp({ prisma: { appRelease: { findFirst() { throw new Error('sensitive-database-detail'); } } }, config, logger: () => {} });
  const response = await request(failing).get('/api/releases/latest');
  standardError(response, 500, 'INTERNAL_ERROR');
  assert.equal(JSON.stringify(response.body).includes('sensitive'), false);
  standardError(await request(app).get('/unknown'), 404, 'NOT_FOUND');
});

test('request logs exclude query strings, credentials, headers and filenames', async () => {
  await request(app).get('/api/health?token=never-log-this').set('Authorization', 'Bearer never-log-this');
  assert.ok(logs.length);
  assert.equal(logs.some((line) => line.includes('never-log-this')), false);
  assert.ok(logs.every((line) => Object.keys(JSON.parse(line)).sort().join(',') === 'durationMs,method,route,status'));
});

test('invalid startup environment and registration arguments fail clearly without echoing credentials', () => {
  assert.throws(() => readConfig({}), /DATABASE_URL/);
  assert.throws(() => readConfig({ ...process.env, PORT: 'invalid' }), /PORT/);
  assert.throws(() => readConfig({ ...process.env, CORS_ORIGINS: '*' }), /CORS_ORIGINS/);
  for (const args of [[], ['--file', 'a.apk', '--version-name', '../escape', '--version-code', '1'],
    ['--file', 'a.apk', '--version-name', '0.1.0', '--version-code', '0']]) assert.throws(() => releaseInput(args));
});

test('release registration copies exact bytes, hashes them and idempotently upserts without deactivating older releases', async () => {
  const source = path.join(directory, 'test-source.apk');
  // Explicit ZIP-header test fixture, never used as a real app release.
  await fs.writeFile(source, Buffer.from('504b030466697874757265', 'hex'));
  const storage = path.join(directory, 'registered');
  const input = releaseInput(['--file', source, '--version-name', '0.1.0', '--version-code', '1', '--changelog', 'Fixture']);
  const first = await registerRelease({ prisma, input, storageDir: storage });
  const again = await registerRelease({ prisma, input, storageDir: storage });
  assert.equal(first.id, again.id);
  assert.equal(first.sha256, await sha256(source));
  assert.deepEqual(await fs.readFile(path.join(storage, 'territory-run-0.1.0.apk')), await fs.readFile(source));
  await registerRelease({ prisma, input: { ...input, versionName: '0.2.0', versionCode: 2 }, storageDir: storage });
  assert.equal(await prisma.appRelease.count({ where: { isActive: true } }), 2);
  await assert.rejects(() => registerRelease({ prisma, input: { ...input, versionCode: 3 }, storageDir: storage }), /different version code/);
});
