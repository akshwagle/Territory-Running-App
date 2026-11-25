'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readConfig } = require('../src/config');

const base = { DATABASE_URL: 'postgresql://u:p@db.example:5432/app', CORS_ORIGINS: 'https://app.example.com,https://localhost',
  JWT_ACCESS_SECRET: 'a'.repeat(40), REFRESH_TOKEN_DERIVATION_SECRET: 'b'.repeat(40) };
const prod = { ...base, NODE_ENV: 'production', HOST: '0.0.0.0', WEB_BASE_URL: 'https://example.com', MAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'smtp.example.com', SMTP_USER: 'u', SMTP_PASSWORD: 'p', SMTP_FROM: 'noreply@example.com' };

test('production config accepts a complete HTTPS setup', () => {
  const config = readConfig({ ...prod, TRUST_PROXY: '1' });
  assert.equal(config.trustProxy, 1);
  assert.equal(config.shutdownTimeoutMs, 10000);
});
test('production config refuses cleartext CORS origins and loopback binding', () => {
  assert.throws(() => readConfig({ ...prod, CORS_ORIGINS: 'https://app.example.com,http://localhost' }), /http: origins/);
  assert.throws(() => readConfig({ ...prod, HOST: '127.0.0.1' }), /HOST must be/);
  assert.doesNotThrow(() => readConfig({ ...prod, HOST: '127.0.0.1', ALLOW_LOOPBACK_HOST: 'true' }));
});
test('TRUST_PROXY and SHUTDOWN_TIMEOUT_MS are validated', () => {
  assert.throws(() => readConfig({ ...base, TRUST_PROXY: 'true' }), /TRUST_PROXY/);
  assert.throws(() => readConfig({ ...base, SHUTDOWN_TIMEOUT_MS: '5' }), /SHUTDOWN_TIMEOUT_MS/);
  assert.equal(readConfig(base).trustProxy, 0);
});
