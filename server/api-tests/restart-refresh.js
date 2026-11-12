'use strict';

// A fresh process deliberately receives no parent's module state or token cache.
// Input/output are captured by the test, not printed as test/log output.
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const request = require('supertest');
const { createApp } = require('../src/app');
const { readConfig } = require('../src/config');
const { testDatabaseConfig } = require('../db-tests/helpers');
async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const isolated = testDatabaseConfig({ ...process.env, DATABASE_URL_TEST: input.databaseUrl });
  const config = readConfig({ DATABASE_URL: input.databaseUrl, CORS_ORIGINS: 'http://localhost:5173',
    JWT_ACCESS_SECRET: input.jwtAccessSecret, REFRESH_TOKEN_DERIVATION_SECRET: input.refreshDerivationSecret });
  const prisma = new PrismaClient({ datasources: { db: { url: isolated.connectionString } }, log: [] });
  try {
    const app = createApp({ prisma, config, logger: () => {} });
    const response = await request(app).post('/api/auth/refresh').send({ refreshToken: input.refreshToken });
    process.stdout.write(JSON.stringify({ status: response.status, body: response.body }));
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { process.stderr.write('Isolated restart test failed.\n'); process.exitCode = 1; });
