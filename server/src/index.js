'use strict';

require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { readConfig } = require('./config');
const { createApp } = require('./app');

async function main() {
  const config = readConfig();
  const prisma = new PrismaClient({ log: [] });
  const app = createApp({ prisma, config });
  const server = app.listen(config.port, config.host, () => console.info(`API listening at http://${config.host}:${config.port}`));
  server.on('error', async () => {
    console.error('API could not listen. Check HOST, PORT and whether the port is already in use.');
    await prisma.$disconnect();
    process.exitCode = 1;
  });
  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    console.info('API shutting down.');
    const deadline = setTimeout(() => { server.closeAllConnections(); process.exitCode = 1; }, 10000);
    deadline.unref();
    server.close(async () => {
      await prisma.$disconnect();
      clearTimeout(deadline);
    });
    server.closeIdleConnections();
  }
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

main().catch((error) => {
  // Configuration errors contain variable names only, never their values.
  console.error(`Startup failed: ${error.message}`);
  process.exitCode = 1;
});
