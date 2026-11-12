'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHmac } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { issueAccessToken, tokenHash, successorToken, ACCESS_SECONDS } = require('../src/auth/tokens');

module.exports = function authCases({ prisma, pool, config, isolated }) {
  const makeApp = (overrides = {}, extra = {}) => createApp({ prisma,
    config: { ...config, rateLimitMax: 10000, authRateLimitMax: 1000, authIpRateLimitMax: 1000, ...overrides },
    logger: () => {}, verifyGoogle: async () => { throw new Error('Mock rejects unused Google verification.'); }, ...extra });
  const credentials = (overrides = {}) => ({ email: `${randomUUID()}@example.test`,
    password: 'Maple!RiverTrail2026', displayName: 'Trail Runner', ...overrides });
  async function register(app, input = credentials()) {
    const response = await request(app).post('/api/auth/register').send(input);
    assert.equal(response.status, 201);
    return { input, ...response.body, response };
  }
  const refresh = (app, raw) => request(app).post('/api/auth/refresh').send({ refreshToken: raw });
  function error(response, status, code) {
    assert.equal(response.status, status);
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.deepEqual(Object.keys(response.body.error).sort(), ['code', 'message']);
    assert.equal(response.body.error.code, code);
  }

  test('register creates an atomic password identity and hashed session; login and /api/me return only public fields', async () => {
    const app = makeApp();
    const account = await register(app);
    assert.deepEqual(Object.keys(account.response.body).sort(), ['accessToken', 'expiresIn', 'refreshToken', 'user']);
    assert.deepEqual(Object.keys(account.user).sort(), ['createdAt', 'displayName', 'email', 'id']);
    assert.equal(account.expiresIn, ACCESS_SECONDS);
    assert.match(account.refreshToken, /^[\w-]{43}$/);
    const stored = await prisma.user.findUnique({ where: { id: account.user.id }, include: { authIdentities: true, authTokens: true } });
    assert.match(stored.passwordHash, /^scrypt\$32768\$8\$3\$/);
    assert.equal(stored.authIdentities.length, 1);
    assert.equal(stored.authIdentities[0].providerSubject, account.user.email);
    assert.equal(stored.authTokens.length, 1);
    assert.equal(stored.authTokens[0].tokenHash, tokenHash(account.refreshToken));
    for (const raw of [account.input.password, account.refreshToken, account.accessToken]) {
      assert.equal(JSON.stringify(stored).includes(raw), false);
    }
    const loggedIn = await request(app).post('/api/auth/login').send({ email: account.input.email, password: account.input.password });
    assert.equal(loggedIn.status, 200);
    assert.equal(loggedIn.body.user.id, account.user.id);
    assert.notEqual(loggedIn.body.refreshToken, account.refreshToken);
    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${loggedIn.body.accessToken}`);
    assert.equal(me.status, 200);
    assert.deepEqual(me.body, account.user);
    assert.equal(me.headers['cache-control'], 'no-store');
  });

  test('AUTH-01 simultaneous case/space variants create exactly one account and return generic duplicate failures', async () => {
    const app = makeApp();
    const email = `${randomUUID()}@example.test`;
    const results = await Promise.all([email, email.toUpperCase(), ` ${email} `, ` ${email.toUpperCase()} `]
      .map((value) => request(app).post('/api/auth/register').send(credentials({ email: value }))));
    assert.equal(results.filter((result) => result.status === 201).length, 1);
    const failures = results.filter((result) => result.status !== 201);
    for (const result of failures) { error(result, 401, 'AUTH_FAILED'); assert.deepEqual(result.body, failures[0].body); }
    assert.equal(await prisma.user.count({ where: { email } }), 1);
    assert.equal(await prisma.authIdentity.count({ where: { provider: 'PASSWORD', providerSubject: email } }), 1);
  });

  test('registration rolls back the user when identity creation conflicts; no account without an identity is left behind', async () => {
    const app = makeApp();
    const owner = await register(app);
    const target = credentials();
    await prisma.authIdentity.create({ data: { userId: owner.user.id, provider: 'PASSWORD',
      providerSubject: target.email, emailAtSignup: target.email } });
    error(await request(app).post('/api/auth/register').send(target), 401, 'AUTH_FAILED');
    assert.equal(await prisma.user.count({ where: { email: target.email } }), 0);
  });

  test('the general API limiter still covers auth and /api/me in addition to the stricter auth limits', async () => {
    const app = makeApp({ rateLimitMax: 1 });
    const account = await register(app);
    error(await request(app).get('/api/me').set('Authorization', `Bearer ${account.accessToken}`), 429, 'RATE_LIMITED');
  });

  test('duplicate registration, wrong password and unknown email have identical generic error responses', async () => {
    const app = makeApp();
    const account = await register(app);
    const duplicate = await request(app).post('/api/auth/register').send(account.input);
    const wrong = await request(app).post('/api/auth/login').send({ email: account.input.email, password: 'Another!TrailPassword' });
    const unknown = await request(app).post('/api/auth/login').send({ email: `${randomUUID()}@example.test`, password: 'Another!TrailPassword' });
    for (const response of [duplicate, wrong, unknown]) { error(response, 401, 'AUTH_FAILED'); assert.deepEqual(response.body, wrong.body); }
  });

  test('weak passwords, unknown fields, missing bodies, malformed JSON and oversized bodies are rejected without writes', async () => {
    const app = makeApp();
    const email = `${randomUUID()}@example.test`;
    for (const password of ['short', 'password123', 'a'.repeat(129)]) {
      error(await request(app).post('/api/auth/register').send(credentials({ email, password })), 400, 'INVALID_INPUT');
    }
    for (const [route, body] of [
      ['register', { ...credentials({ email }), role: 'ADMIN' }],
      ['login', { email, password: 'StrongEnough!Password', extra: true }],
      ['refresh', { refreshToken: randomBytes(32).toString('base64url'), now: Date.now() }],
      ['logout', { refreshToken: randomBytes(32).toString('base64url'), extra: true }],
    ]) error(await request(app).post(`/api/auth/${route}`).send(body), 400, 'INVALID_INPUT');
    error(await request(app).post('/api/auth/login'), 400, 'INVALID_INPUT');
    error(await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"password":'), 400, 'INVALID_INPUT');
    error(await request(app).post('/api/auth/register').send({ ...credentials({ email }), password: 'x'.repeat(17000) }), 413, 'BODY_TOO_LARGE');
    assert.equal(await prisma.user.count({ where: { email } }), 0);
  });

  test('strict auth rate limits normalize IP/email keys and an IP backstop covers changing emails', async () => {
    const app = makeApp({ authRateLimitMax: 2, authIpRateLimitMax: 20 });
    const email = `${randomUUID()}@example.test`;
    for (const value of [email, ` ${email.toUpperCase()} `]) {
      error(await request(app).post('/api/auth/login').send({ email: value, password: 'Unknown!Password1' }), 401, 'AUTH_FAILED');
    }
    const blocked = await request(app).post('/api/auth/login').send({ email, password: 'Unknown!Password1' });
    error(blocked, 429, 'RATE_LIMITED');
    assert.ok(blocked.headers['retry-after']);
    assert.equal((await request(app).get('/api/health')).status, 200);
    const ipLimited = makeApp({ authRateLimitMax: 100, authIpRateLimitMax: 2 });
    for (let i = 0; i < 2; i++) await request(ipLimited).post('/api/auth/login').send({ email: `${randomUUID()}@example.test`, password: 'Unknown!Password1' });
    error(await request(ipLimited).post('/api/auth/login').send({ email, password: 'Unknown!Password1' }), 429, 'RATE_LIMITED');
  });

  test('/api/me rejects missing, malformed, incorrectly signed, expired and extra-claim access tokens', async () => {
    const app = makeApp();
    const account = await register(app);
    error(await request(app).get('/api/me'), 401, 'UNAUTHORIZED');
    error(await request(app).get('/api/me').set('Authorization', 'Bearer invalid'), 401, 'UNAUTHORIZED');
    const bad = await issueAccessToken(account.user.id, JSON.parse(Buffer.from(account.accessToken.split('.')[1], 'base64url')).sid, 'a-different-secret-at-least-32-bytes-long', new Date());
    error(await request(app).get('/api/me').set('Authorization', `Bearer ${bad}`), 401, 'UNAUTHORIZED');
    const expired = await issueAccessToken(account.user.id, JSON.parse(Buffer.from(account.accessToken.split('.')[1], 'base64url')).sid, config.jwtAccessSecret, new Date(Date.now() - 901000));
    error(await request(app).get('/api/me').set('Authorization', `Bearer ${expired}`), 401, 'UNAUTHORIZED');
    const { SignJWT } = await import('jose');
    const extra = await new SignJWT({ role: 'ADMIN', sid: JSON.parse(Buffer.from(account.accessToken.split('.')[1], 'base64url')).sid }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(account.user.id).setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode(config.jwtAccessSecret));
    error(await request(app).get('/api/me').set('Authorization', `Bearer ${extra}`), 401, 'UNAUTHORIZED');
    const futureApp = makeApp({}, { clock: () => new Date(Date.now() + 901000) });
    error(await request(futureApp).get('/api/me').set('Authorization', `Bearer ${account.accessToken}`), 401, 'UNAUTHORIZED');
  });

  test('AUTH-02 two simultaneous refreshes rotate once and return the identical HMAC successor; one grace redemption only', async () => {
    const firstApp = makeApp();
    const secondApp = makeApp();
    const account = await register(firstApp);
    const results = await Promise.all([refresh(firstApp, account.refreshToken), refresh(secondApp, account.refreshToken)]);
    assert.deepEqual(results.map((r) => r.status), [200, 200]);
    assert.equal(results[0].body.refreshToken, results[1].body.refreshToken);
    assert.notEqual(results[0].body.refreshToken, account.refreshToken);
    const rows = await prisma.authToken.findMany({ where: { userId: account.user.id } });
    assert.equal(rows.length, 2);
    const parent = rows.find((r) => r.tokenHash === tokenHash(account.refreshToken));
    const child = rows.find((r) => r.id === parent.replacedById);
    assert.ok(parent.usedAt && parent.graceReplayedAt);
    assert.ok(rows.every((r) => r.revokedAt === null));
    const expected = createHmac('sha256', config.refreshDerivationSecret)
      .update(JSON.stringify(['refresh-successor-v1', account.refreshToken, parent.replacedById])).digest('base64url');
    assert.equal(expected, results[0].body.refreshToken);
    assert.equal(child.tokenHash, tokenHash(expected));
    assert.equal(child.familyId, parent.familyId);
    error(await refresh(firstApp, account.refreshToken), 401, 'REFRESH_RETRY_EXHAUSTED');
    assert.equal((await refresh(secondApp, expected)).status, 200);
  });

  test('AUTH-02 grace retry after a simulated process restart recovers the exact successor using only persisted hashes and UUID', async () => {
    const app = makeApp();
    const account = await register(app);
    const rotated = await refresh(app, account.refreshToken);
    assert.equal(rotated.status, 200);
    const output = execFileSync(process.execPath, [path.join(__dirname, 'restart-refresh.js')], {
      input: JSON.stringify({ databaseUrl: isolated.connectionString, refreshToken: account.refreshToken,
        jwtAccessSecret: config.jwtAccessSecret, refreshDerivationSecret: config.refreshDerivationSecret }),
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000,
    });
    const retried = JSON.parse(output);
    assert.equal(retried.status, 200);
    assert.equal(retried.body.refreshToken, rotated.body.refreshToken);
    assert.equal(await prisma.authToken.count({ where: { userId: account.user.id } }), 2);
  });

  test('AUTH-02 retry after the grace window revokes the whole family and rejects its current successor', async () => {
    const app = makeApp();
    const account = await register(app);
    const rotated = await refresh(app, account.refreshToken);
    await pool.query("UPDATE auth_tokens SET used_at=clock_timestamp()-interval '11 seconds' WHERE token_hash=$1", [tokenHash(account.refreshToken)]);
    error(await refresh(app, account.refreshToken), 401, 'REFRESH_REUSED');
    error(await refresh(app, rotated.body.refreshToken), 401, 'INVALID_REFRESH_TOKEN');
    const rows = await prisma.authToken.findMany({ where: { userId: account.user.id } });
    assert.ok(rows.every((row) => row.revokedAt));
  });

  test('AUTH-02 a different parent token cannot redeem grace; a changed derivation secret fails closed', async () => {
    const app = makeApp();
    const account = await register(app);
    const rotated = await refresh(app, account.refreshToken);
    let altered = randomBytes(32).toString('base64url');
    assert.notEqual(altered, account.refreshToken);
    error(await refresh(app, altered), 401, 'INVALID_REFRESH_TOKEN');
    const otherSecretApp = makeApp({ refreshDerivationSecret: 'different-derivation-secret-012345678901234567890' });
    error(await refresh(otherSecretApp, account.refreshToken), 401, 'INVALID_REFRESH_TOKEN');
    error(await refresh(app, rotated.body.refreshToken), 401, 'INVALID_REFRESH_TOKEN');
  });

  test('logout revokes only its family, is idempotent and prevents refreshing descendants', async () => {
    const app = makeApp();
    const account = await register(app);
    const login = await request(app).post('/api/auth/login').send({ email: account.input.email, password: account.input.password });
    const rotated = await refresh(app, account.refreshToken);
    assert.equal((await request(app).post('/api/auth/logout').send({ refreshToken: account.refreshToken })).status, 204);
    assert.equal((await request(app).post('/api/auth/logout').send({ refreshToken: account.refreshToken })).status, 204);
    error(await refresh(app, rotated.body.refreshToken), 401, 'INVALID_REFRESH_TOKEN');
    assert.equal((await refresh(app, login.body.refreshToken)).status, 200);
    assert.equal((await request(app).post('/api/auth/logout').send({ refreshToken: randomBytes(32).toString('base64url') })).status, 204);
  });

  test('refresh rejects malformed and expired tokens', async () => {
    const app = makeApp();
    error(await refresh(app, 'not-a-refresh-token'), 400, 'INVALID_INPUT');
    const account = await register(app);
    await prisma.authToken.updateMany({ where: { userId: account.user.id }, data: { expiresAt: new Date('2000-01-01') } });
    error(await refresh(app, account.refreshToken), 401, 'INVALID_REFRESH_TOKEN');
  });

  test('AUTH-05 server Date, expiresIn and JWT expiry ignore a phone clock hours ahead or behind', async () => {
    const app = makeApp();
    const account = await register(app);
    const now = Date.now();
    assert.ok(Math.abs(Date.parse(account.response.headers.date) - now) < 2000);
    const claims = JSON.parse(Buffer.from(account.accessToken.split('.')[1], 'base64url').toString());
    assert.deepEqual(Object.keys(claims).sort(), ['exp', 'iat', 'sid', 'sub']);
    assert.equal(claims.exp - claims.iat, 900);
    assert.equal(account.expiresIn, 900);
    for (const offset of [-6, 6]) {
      const response = await request(app).get('/api/me').set('Authorization', `Bearer ${account.accessToken}`)
        .set('Date', new Date(now + offset * 3600000).toUTCString()).set('X-Client-Time', String(now + offset * 3600000));
      assert.equal(response.status, 200);
      assert.ok(Math.abs(Date.parse(response.headers.date) - Date.now()) < 2000);
    }
    const preflight = await request(app).options('/api/auth/login').set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type');
    assert.equal(preflight.status, 204);
    assert.ok(preflight.headers['access-control-allow-methods'].includes('POST'));
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    assert.ok(allowed.headers['access-control-expose-headers'].includes('Date'));
  });

  test('AUTH-11 email edge forms normalize consistently and unsafe or reserved display names are rejected', async () => {
    const app = makeApp();
    const id = randomUUID();
    const account = await register(app, credentials({ email: ` ${id}+RUN@EXAMPLE.TEST `, displayName: '  Ｔｒａｉｌ   Runner  ' }));
    assert.equal(account.user.email, `${id}+run@example.test`);
    assert.equal(account.user.displayName, 'Trail Runner');
    const login = await request(app).post('/api/auth/login').send({ email: ` ${id}+RuN@Example.Test `, password: account.input.password });
    assert.equal(login.status, 200);
    const unicodeDomain = await register(app, credentials({ email: `${randomUUID()}@bücher.example` }));
    assert.ok(unicodeDomain.user.email.endsWith('@xn--bcher-kva.example'));
    for (const email of ['tést@example.test', 'a'.repeat(65)+'@example.test', 'trail.@example.test',
      'trail@example.test.', 'a..b@example.test', 'x@'+'a'.repeat(63)+'.'+'b'.repeat(63)+'.'+'c'.repeat(63)+'.'+'d'.repeat(63)]) {
      error(await request(app).post('/api/auth/register').send(credentials({ email })), 400, 'INVALID_INPUT');
    }
    for (const displayName of ['Admin', 'support', 'Territory Run', 'ＡＤＭＩＮ', 'Trail 🏃', 'Trail\u200bRunner', 'Trail\u202eRunner']) {
      error(await request(app).post('/api/auth/register').send(credentials({ displayName })), 400, 'INVALID_INPUT');
    }
  });

  test('AUTH-12 suspended or deletion-requested accounts cannot refresh or use /api/me and receive specific codes', async () => {
    const app = makeApp();
    for (const [field, code] of [['suspendedAt', 'ACCOUNT_SUSPENDED'], ['deletionAt', 'ACCOUNT_DELETED']]) {
      const account = await register(app);
      await prisma.user.update({ where: { id: account.user.id }, data: { [field]: new Date() } });
      error(await refresh(app, account.refreshToken), 403, code);
      error(await request(app).get('/api/me').set('Authorization', `Bearer ${account.accessToken}`), 403, code);
      assert.ok((await prisma.authToken.findMany({ where: { userId: account.user.id } })).every((row) => row.revokedAt));
    }
  });

  test('legacy bcrypt passwords upgrade to scrypt on login without losing the password identity', async () => {
    const app = makeApp();
    const account = await register(app);
    await prisma.user.update({ where: { id: account.user.id }, data: { passwordHash: await bcrypt.hash(account.input.password, 12) } });
    assert.equal((await request(app).post('/api/auth/login').send({ email: account.input.email, password: account.input.password })).status, 200);
    assert.match((await prisma.user.findUnique({ where: { id: account.user.id } })).passwordHash, /^scrypt\$/);
    assert.equal(await prisma.authIdentity.count({ where: { userId: account.user.id } }), 1);
  });

  test('auth logs exclude passwords, refresh/access/ID tokens, hashes, authorization and supplied URLs on success and failure', async () => {
    const logs = [];
    const app = makeApp({}, { logger: (line) => logs.push(line) });
    const account = await register(app, credentials({ password: 'NeverLog!MountainTrail42' }));
    await request(app).post('/api/auth/login?token=never-log-query').send({ email: account.input.email, password: 'NeverLog!WrongTrail42' });
    await request(app).post('/api/auth/login').send({ email: account.input.email, password: account.input.password });
    await request(app).get('/api/me').set('Authorization', `Bearer ${account.accessToken}`);
    const rotated = await refresh(app, account.refreshToken);
    await request(app).post('/api/auth/register').send({ ...credentials(), idToken: 'never-log-id-token' });
    await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"password":"never-log-malformed"');
    await request(app).post('/api/auth/logout').send({ refreshToken: rotated.body.refreshToken });
    const stored = await prisma.user.findUnique({ where: { id: account.user.id }, include: { authTokens: true } });
    const forbidden = [account.input.password, 'NeverLog!WrongTrail42', account.refreshToken, account.accessToken,
      rotated.body.refreshToken, rotated.body.accessToken, stored.passwordHash, ...stored.authTokens.map((row) => row.tokenHash),
      'never-log-query', 'never-log-id-token', 'never-log-malformed', account.input.email];
    for (const value of forbidden) assert.equal(logs.join('\n').includes(value), false);
    assert.ok(logs.some((line) => JSON.parse(line).reason === 'password_mismatch'));
    for (const line of logs) {
      const entry = JSON.parse(line);
      assert.ok(['durationMs,method,route,status', 'event,reason'].includes(Object.keys(entry).sort().join(',')));
    }
  });
};
