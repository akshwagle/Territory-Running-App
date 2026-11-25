'use strict';

require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { readConfig } = require('./config');
const { createApp } = require('./app');

async function main() {
  const config = readConfig();
  const prisma = new PrismaClient({ log: [] });
  const app = createApp({ prisma, config });
  let stopCleanup,stopRunCleanup;
  try { stopCleanup=await app.locals.profileJobs.start(); stopRunCleanup=await app.locals.runRetention.start(); }
  catch { stopCleanup?.(); await prisma.$disconnect(); throw new Error('Cleanup could not initialize. Check database migrations and private storage permissions.'); }
  const server = app.listen(config.port, config.host, () => console.info(`API listening at http://${config.host}:${config.port}`));
  server.requestTimeout = 60000; server.headersTimeout = 20000; server.keepAliveTimeout = 65000;
  server.on('error', async () => {
    console.error('API could not listen. Check HOST, PORT and whether the port is already in use.');
    stopCleanup();
    stopRunCleanup();
    await prisma.$disconnect();
    process.exitCode = 1;
  });
  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    app.locals.setShuttingDown();
    console.info('API shutting down.');
    stopCleanup();
    stopRunCleanup();
    const deadline = setTimeout(() => { server.closeAllConnections(); process.exitCode = 1; }, config.shutdownTimeoutMs);
    deadline.unref();
    server.close(async () => {
      await app.locals.profileJobs.drain();
      await app.locals.authJobs.drain();
      await prisma.$disconnect();
      clearTimeout(deadline);
    });
    server.closeIdleConnections();
  }
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  // Log the error class only; messages can contain user data or SQL.
  process.on('unhandledRejection', (reason) => console.error(JSON.stringify({ level: 'error', event: 'unhandled_rejection', errorName: String(reason?.name ?? 'Error').slice(0, 60) })));
  process.on('uncaughtException', (error) => {
    console.error(JSON.stringify({ level: 'fatal', event: 'uncaught_exception', errorName: String(error?.name ?? 'Error').slice(0, 60) }));
    process.exitCode = 1;
    shutdown();
  });
}

main().catch((error) => {
  // Configuration errors contain variable names only, never their values.
  console.error(`Startup failed: ${error.message}`);
  process.exitCode = 1;
});
