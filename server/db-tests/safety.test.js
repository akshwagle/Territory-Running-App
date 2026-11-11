'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { testDatabaseConfig } = require('./helpers');

const app = 'postgresql://app:placeholder@localhost:5432/territory?schema=public';
const config = { DATABASE_URL: app, DIRECT_URL: app, DATABASE_URL_TEST: 'postgresql://test:placeholder@localhost:5432/territory_test?schema=public' };

test('test guard rejects identical URLs before connecting', () => {
  assert.throws(() => testDatabaseConfig({ ...config, DATABASE_URL_TEST: app }), /equals/);
});

test('test guard rejects the same database through different credentials, host aliases and schemas', () => {
  for (const url of [
    'postgresql://other:placeholder@127.0.0.1:5432/territory?schema=public',
    'postgresql://other:placeholder@localhost:6432/territory?schema=other',
    'postgres://other:placeholder@localhost:5432/%74erritory',
  ]) assert.throws(() => testDatabaseConfig({ ...config, DATABASE_URL_TEST: url }), /separate test database/);
});

test('test guard rejects migration database reuse, missing URLs and connection overrides', () => {
  assert.throws(() => testDatabaseConfig({ ...config, DIRECT_URL: config.DATABASE_URL_TEST }), /equals/);
  assert.throws(() => testDatabaseConfig({ ...config, DATABASE_URL_TEST: '' }), /Set DATABASE_URL_TEST/);
  assert.throws(() => testDatabaseConfig({ ...config, DATABASE_URL_TEST: `${config.DATABASE_URL_TEST}&dbname=territory` }), /unsupported/);
  assert.throws(() => testDatabaseConfig({ ...config, DATABASE_URL_TEST: config.DATABASE_URL_TEST.replace('public', 'other') }), /schema public/);
  assert.equal(testDatabaseConfig(config).database, 'territory_test');
});
