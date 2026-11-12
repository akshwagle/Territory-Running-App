'use strict';

require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
const { Client } = require('pg');
const { testDatabaseConfig } = require('../db-tests/helpers');

async function main() {
  const selection = process.argv[2];
  if (!['db', 'api', 'all'].includes(selection)) throw new Error('Choose db, api or all; this command recreates only disposable test databases.');
  const db = testDatabaseConfig(process.env);
  const api = testDatabaseConfig({ ...process.env, DATABASE_URL_TEST: process.env.DATABASE_URL_API_TEST });
  if (db.database.toLowerCase() === api.database.toLowerCase()) throw new Error('DB and API tests need different database names.');
  const targets = selection === 'all' ? [db, api] : [selection === 'db' ? db : api];
  // Validate every target before connecting or dropping anything.
  for (const target of targets) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(target.database) || !target.database.endsWith('_test')) {
      throw new Error('Reset targets must be simple identifiers ending in _test.');
    }
  }
  for (const target of targets) {
    const url = new URL(target.connectionString);
    url.pathname = '/postgres';
    url.searchParams.delete('schema');
    const admin = new Client({ connectionString: url.toString() });
    try {
      await admin.connect();
      const actual = (await admin.query('SELECT current_database() AS name')).rows[0].name;
      if (actual !== 'postgres') throw new Error('Wrong administration database.');
      // The validated identifier contains no quotes; values cannot inject SQL.
      await admin.query(`DROP DATABASE IF EXISTS "${target.database}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${target.database}"`);
      console.log(`Recreated disposable test database: ${target.database}`);
    } finally { await admin.end(); }
  }
}
main().catch(() => { console.error('Test database reset failed. Check distinct *_test URLs and database-owner privileges. No development database reset is allowed.'); process.exitCode = 1; });
