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
  for (const name of ['JWT_ACCESS_SECRET', 'REFRESH_TOKEN_DERIVATION_SECRET']) {
    if (typeof env[name] !== 'string' || Buffer.byteLength(env[name], 'utf8') < 32 ||
        /^REPLACE_|^YOUR_/.test(env[name])) throw new Error(`${name} must be an independent random secret of at least 32 bytes.`);
  }
  if (env.JWT_ACCESS_SECRET === env.REFRESH_TOKEN_DERIVATION_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and REFRESH_TOKEN_DERIVATION_SECRET must be different.');
  }
  const production = env.NODE_ENV === 'production';
  const mailTransport = env.MAIL_TRANSPORT || (production ? 'smtp' : 'outbox');
  if (!['smtp', 'outbox'].includes(mailTransport) || (production && mailTransport === 'outbox')) throw new Error('MAIL_TRANSPORT must select SMTP in production.');
  const webBaseUrl = env.WEB_BASE_URL || (production ? '' : 'http://localhost:5173');
  let web;
  try { web = new URL(webBaseUrl); } catch { throw new Error('WEB_BASE_URL must be an explicit HTTP(S) origin.'); }
  if (!['http:', 'https:'].includes(web.protocol) || web.username || web.password || web.search || web.hash ||
      web.pathname !== '/' || (production && web.protocol !== 'https:')) throw new Error('WEB_BASE_URL must be an origin; production requires HTTPS.');
  const googleWebClientId = env.GOOGLE_WEB_CLIENT_ID || null;
  if (googleWebClientId && !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleWebClientId)) throw new Error('GOOGLE_WEB_CLIENT_ID must be a Web OAuth client identifier.');
  let smtp = null;
  if (mailTransport === 'smtp') {
    for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) {
      if (!env[name] || /^YOUR_/.test(env[name]) || /[\r\n]/.test(env[name])) throw new Error(`${name} is required for SMTP.`);
    }
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.SMTP_FROM)) throw new Error('SMTP_FROM must be a single email address.');
    const port = integer(env.SMTP_PORT, 587, 'SMTP_PORT', 1, 65535);
    smtp = { host: env.SMTP_HOST, port, secure: port === 465, requireTLS: true,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }, from: env.SMTP_FROM };
  }
  const verifiedFlag = env.REQUIRE_VERIFIED_EMAIL_FOR_RUNS ?? String(production);
  if (!['true', 'false'].includes(verifiedFlag)) throw new Error('REQUIRE_VERIFIED_EMAIL_FOR_RUNS must be true or false.');
  return {
    host,
    port: integer(env.PORT, 4000, 'PORT', 1, 65535),
    origins,
    rateLimitMax: integer(env.API_RATE_LIMIT_MAX, 100, 'API_RATE_LIMIT_MAX', 1, 100000),
    rateLimitWindowMs: integer(env.API_RATE_LIMIT_WINDOW_MS, 60000, 'API_RATE_LIMIT_WINDOW_MS', 1000, 3600000),
    jwtAccessSecret: env.JWT_ACCESS_SECRET,
    refreshDerivationSecret: env.REFRESH_TOKEN_DERIVATION_SECRET,
    authRateLimitMax: 10,
    authIpRateLimitMax: 50,
    authRateLimitWindowMs: 15 * 60 * 1000,
    authActionRateLimitMax: 5,
    googleWebClientId,
    mailTransport, smtp, webBaseUrl: web.origin,
    requireVerifiedEmailForRuns: verifiedFlag === 'true',
    forgotResponseMs: 250,
  };
}

module.exports = { readConfig };
