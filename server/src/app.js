'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createAuthRouter } = require('./auth/routes');
const { requireAuth } = require('./auth/middleware');
const { createProfileRouter } = require('./profile/routes');
const { createMailJobs } = require('./auth/mailer');

function errorBody(code, message) { return { error: { code, message } }; }
function notFound(res) { return res.status(404).json(errorBody('NOT_FOUND', 'The requested resource was not found.')); }

function createApp({ prisma, config, downloadDir = path.resolve(__dirname, '../storage/apk'), logger = console.info, clock = () => new Date(), mailer, verifyGoogle }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use((_req, res, next) => { res.set('Date', clock().toUTCString()); next(); });
  app.use((req, res, next) => {
    const start = performance.now();
    res.once('finish', () => {
      // Only fixed route labels: never log URLs, query strings, headers, bodies,
      // cookies, IPs, database errors or user-supplied filenames.
      const route = req.route?.path ?? 'unmatched';
      logger(JSON.stringify({ method: req.method, route, status: res.statusCode, durationMs: Math.round(performance.now() - start) }));
    });
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.origins.includes(origin)) return callback(null, true);
      return callback(Object.assign(new Error('Origin blocked'), { publicCode: 'CORS_ORIGIN_DENIED', statusCode: 403 }));
    },
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH', 'DELETE'],
    exposedHeaders: ['Date'],
  }));

  app.use('/api', rateLimit({
    windowMs: config.rateLimitWindowMs, limit: config.rateLimitMax,
    standardHeaders: 'draft-8', legacyHeaders: false,
    handler(_req, res) { res.status(429).json(errorBody('RATE_LIMITED', 'Too many requests. Please try again later.')); },
  }));
  const mailJobs = createMailJobs(logger);
  app.locals.authJobs = mailJobs;
  app.use('/api/auth', createAuthRouter({ prisma, config, logger, clock, mailer, verifyGoogle, mailJobs }));
  app.get('/api/me', requireAuth({ prisma, config, clock }), (req, res) =>
    res.json({ ...req.authUser, emailVerified: req.authEmailVerified }));

  const profiles=createProfileRouter({prisma,config,clock,verifyGoogle,logger});
  app.use('/api',profiles.router);

  app.get('/api/health', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await prisma.$queryRaw`SELECT 1`;
      return res.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
    } catch {
      // The health endpoint deliberately uses its specified status envelope.
      return res.status(503).json({ status: 'degraded', db: 'down', time: new Date().toISOString() });
    }
  });

  app.get('/api/releases/latest', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const release = await prisma.appRelease.findFirst({
      where: { isActive: true }, orderBy: { versionCode: 'desc' },
      select: { versionCode: true, versionName: true, apkUrl: true, sha256: true, changelog: true, publishedAt: true },
    });
    if (!release) return res.status(404).json(errorBody('NO_RELEASE', 'The first version is coming soon.'));
    return res.json(release);
  });

  app.get('/downloads/:file', async (req, res, next) => {
    const name = req.params.file;
    if (!/^[A-Za-z0-9._-]+\.apk$/.test(name)) return notFound(res);
    let root;
    let file;
    try {
      root = await fs.realpath(downloadDir);
      file = await fs.realpath(path.join(root, name));
      // Reject symlinks escaping storage as well as encoded path traversal.
      if (path.dirname(file) !== root || !(await fs.stat(file)).isFile()) return notFound(res);
    } catch { return notFound(res); }
    res.type('application/vnd.android.package-archive');
    res.attachment(name);
    return res.sendFile(path.basename(file), { root, dotfiles: 'deny' }, (error) => { if (error) next(error); });
  });

  app.use((_req, res) => notFound(res));
  // Express requires four parameters to identify an error handler.
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.publicCode === 'CORS_ORIGIN_DENIED') {
      return res.status(403).json(errorBody('CORS_ORIGIN_DENIED', 'This origin is not allowed.'));
    }
    if (error.publicCode && Number.isInteger(error.statusCode) && error.statusCode>=400 && error.statusCode<500)
      return res.status(error.statusCode).json(errorBody(error.publicCode,error.message));
    if (error.type === 'entity.too.large') return res.status(413).json(errorBody('BODY_TOO_LARGE', 'The request body is too large.'));
    if (error.type === 'entity.parse.failed' || error.type === 'request.aborted') {
      return res.status(400).json(errorBody('INVALID_INPUT', 'Check the supplied account details.'));
    }
    if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') {
      return res.status(415).json(errorBody('UNSUPPORTED_ENCODING', 'Use an uncompressed UTF-8 JSON body.'));
    }
    if (req.originalUrl.startsWith('/downloads') && (error instanceof URIError || [400, 403, 404].includes(error.status))) return notFound(res);
    return res.status(500).json(errorBody('INTERNAL_ERROR', 'The request could not be completed.'));
  });
  return app;
}

module.exports = { createApp, errorBody };
