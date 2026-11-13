'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { readConfig } = require('../src/config');
const { hashPassword, verifyPassword, acceptablePassword } = require('../src/auth/passwords');
const { normalizeEmail, normalizeDisplayName, isRefreshToken } = require('../src/auth/validation');
const { equalHashes, tokenHash, successorToken } = require('../src/auth/tokens');
const { normalizeRegistrationName, normalizeGoogleName } = require('../src/profile/names');

test('auth startup requires two different secrets of at least 32 UTF-8 bytes without echoing values', () => {
  const env = { DATABASE_URL: 'postgresql://test:placeholder@localhost/isolated_test', CORS_ORIGINS: 'http://localhost:5173',
    JWT_ACCESS_SECRET: 'test-access-secret-only-01234567890123456789',
    REFRESH_TOKEN_DERIVATION_SECRET: 'test-derivation-secret-only-98765432109876543210' };
  for (const name of ['JWT_ACCESS_SECRET', 'REFRESH_TOKEN_DERIVATION_SECRET']) {
    for (const value of [undefined, '', 'short-secret', 'REPLACE_WITH_A_DIFFERENT_RANDOM_SECRET_AT_LEAST_32_BYTES']) {
      assert.throws(() => readConfig({ ...env, [name]: value }), (error) => error.message.includes(name) &&
        (value === undefined || value === '' || !error.message.includes(value)));
    }
  }
  assert.throws(() => readConfig({ ...env, REFRESH_TOKEN_DERIVATION_SECRET: env.JWT_ACCESS_SECRET }), /must be different/);
  assert.equal(readConfig(env).authRateLimitMax, 10);
});

test('scrypt uses independent 16-byte salts, documented fixed costs and constant-time derived-key verification', async () => {
  const password = 'Long!MountainPassphrase42';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.match(first, /^scrypt\$32768\$8\$3\$[\w-]{22}\$[\w-]{43}$/);
  assert.ok(await verifyPassword(password, first));
  assert.equal(await verifyPassword('Wrong!MountainPassphrase42', first), false);
  assert.equal(await verifyPassword(password, null), false);
  assert.equal(await verifyPassword(password, 'malformed'), false);
  assert.ok(acceptablePassword('a'.repeat(128)));
  assert.equal(acceptablePassword('a'.repeat(129)), false);
  assert.equal(acceptablePassword('PASSWORD123'), false);
});

test('AUTH-02 successor derivation binds exact parent, persisted UUID, domain and separate secret; hashes compare safely', () => {
  const raw = randomBytes(32).toString('base64url');
  const id = randomUUID();
  const secret = 'test-derivation-secret-only-98765432109876543210';
  const child = successorToken(raw, id, secret);
  assert.equal(child, successorToken(raw, id, secret));
  assert.notEqual(child, successorToken(raw, randomUUID(), secret));
  assert.notEqual(child, successorToken(randomBytes(32).toString('base64url'), id, secret));
  assert.notEqual(child, successorToken(raw, id, secret+'different'));
  assert.ok(equalHashes(tokenHash(child), tokenHash(child)));
  assert.equal(equalHashes(tokenHash(child), tokenHash(raw)), false);
  assert.equal(equalHashes('', tokenHash(child)), false);
  assert.equal(equalHashes('z'.repeat(64), tokenHash(child)), false);
  assert.ok(isRefreshToken(child));
});

test('AUTH-11 email policy accepts 254 characters, rejects 255, preserves plus aliases and handles Unicode consistently', () => {
  const longest = 'a'.repeat(64)+'@'+'b'.repeat(63)+'.'+'c'.repeat(63)+'.'+'d'.repeat(61);
  assert.equal(longest.length, 254);
  assert.equal(normalizeEmail(longest), longest);
  assert.equal(normalizeEmail(longest+'d'), null);
  assert.equal(normalizeEmail(' User+Trail@BÜCHER.example '), 'user+trail@xn--bcher-kva.example');
  assert.equal(normalizeEmail('usér@example.test'), null);
  assert.equal(normalizeEmail('x.@example.test'), null);
  assert.equal(normalizeEmail('x@example.test.'), null);
  assert.equal(normalizeDisplayName('  Ｔｒａｉｌ   Runner  '), 'Trail Runner');
  assert.equal(normalizeDisplayName('Trail\u200bRunner'), null);
  assert.equal(normalizeDisplayName('Trail\u202eRunner'), null);
  assert.equal(normalizeDisplayName('Territory Run'), null);
});

test('PRIV-07 display-name normalization enforces 3-24 code points and clamps legacy signup/provider names safely', () => {
  assert.equal(normalizeDisplayName('Li'),null);
  assert.equal(normalizeDisplayName('a'.repeat(24)),'a'.repeat(24));
  assert.equal(normalizeDisplayName('a'.repeat(25)),null);
  assert.equal(normalizeRegistrationName('  Ｔｒａｉｌ   Runner  '),'Trail Runner');
  assert.equal(normalizeRegistrationName('a'.repeat(60)),'a'.repeat(24));
  assert.equal([...normalizeRegistrationName('𐐀'.repeat(30))].length,24);
  for(const value of ['Li','Admin','Bad Shit','Trail 🏃'])assert.equal(normalizeGoogleName(value),'Runner');
  assert.equal(normalizeDisplayName('Scunthorpe'),'Scunthorpe');
});
