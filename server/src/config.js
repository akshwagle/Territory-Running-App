'use strict';

function integer(value, fallback, name, min, max) {
  const raw = value ?? String(fallback);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < min || Number(raw) > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  return Number(raw);
}

function readConfig(env = process.env) {
  let database;
  try { database = new URL(env.DATABASE_URL); } catch { throw new Error('DATABASE_URL must be a PostgreSQL connection URL.'); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || database.pathname.length < 2) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL with an explicit database.');
  }
  const host = env.HOST ?? '127.0.0.1';
  if (!/^(?:[a-zA-Z0-9.-]+|\[?[a-fA-F0-9:]+\]?)$/.test(host)) throw new Error('HOST must be a hostname or IP address.');
  const origins = (env.CORS_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!origins.length) throw new Error('CORS_ORIGINS must contain at least one explicit allowed origin.');
  for (const origin of origins) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new Error('CORS_ORIGINS contains an invalid origin.'); }
    if (!['http:', 'https:', 'capacitor:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password ||
        parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname) || origin.endsWith('/')) {
      throw new Error('CORS_ORIGINS must contain exact origins without paths, wildcards or credentials.');
    }
  }
  return {
    host,
    port: integer(env.PORT, 4000, 'PORT', 1, 65535),
    origins,
    rateLimitMax: integer(env.API_RATE_LIMIT_MAX, 100, 'API_RATE_LIMIT_MAX', 1, 100000),
    rateLimitWindowMs: integer(env.API_RATE_LIMIT_WINDOW_MS, 60000, 'API_RATE_LIMIT_WINDOW_MS', 1000, 3600000),
  };
}

module.exports = { readConfig };
