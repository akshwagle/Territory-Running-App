'use strict';

const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { createHash } = require('node:crypto');
const { registerBody, loginBody, refreshBody, normalizeEmail } = require('./validation');
const { createAuthService } = require('./service');

function createAuthRouter({ prisma, config, logger }) {
  const router = express.Router();
  const service = createAuthService({ prisma, config });
  const limited = (_req, res) => res.status(429).json({ error: {
    code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.',
  } });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(rateLimit({ windowMs: config.authRateLimitWindowMs, limit: config.authIpRateLimitMax,
    standardHeaders: 'draft-8', legacyHeaders: false, handler: limited }));
  router.use(express.json({ limit: '16kb', strict: true, inflate: false }));
  router.use(rateLimit({ windowMs: config.authRateLimitWindowMs, limit: config.authRateLimitMax,
    standardHeaders: 'draft-8', legacyHeaders: false, handler: limited,
    keyGenerator(req) {
      const email = normalizeEmail(req.body?.email) || '';
      return createHash('sha256').update(JSON.stringify([ipKeyGenerator(req.ip), email])).digest('hex');
    },
  }));
  function validated(schema, action, successStatus) {
    return async (req, res) => {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: {
        code: 'INVALID_INPUT', message: 'Check the supplied account details.',
      } });
      const result = await action(parsed.data, req);
      if (result?.failure) {
        const { status, code, message, reason } = result.failure;
        // Fixed internal reason tags only. No values supplied by the caller.
        logger(JSON.stringify({ event: 'auth_failure', reason }));
        return res.status(status).json({ error: { code, message } });
      }
      if (successStatus === 204) return res.status(204).end();
      return res.status(successStatus).json(result);
    };
  }
  router.post('/register', validated(registerBody, service.register, 201));
  router.post('/login', validated(loginBody, service.login, 200));
  router.post('/refresh', validated(refreshBody, ({ refreshToken }, req) => service.refresh(refreshToken, req), 200));
  router.post('/logout', validated(refreshBody, ({ refreshToken }) => service.logout(refreshToken), 204));
  return router;
}

module.exports = { createAuthRouter };
