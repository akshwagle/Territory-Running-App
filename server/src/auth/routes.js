'use strict';
const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { setTimeout: delay } = require('node:timers/promises');
const { createHash } = require('node:crypto');
const schemas = require('./validation');
const { tokenHash } = require('./tokens');
const { createAuthService } = require('./service');
const { createActionService } = require('./actions');
const { createGoogleService } = require('./google-service');
const { createMailer, createMailJobs } = require('./mailer');
const { requireAuth } = require('./middleware');

function createAuthRouter({ prisma, config, logger, clock, mailer = createMailer(config), verifyGoogle, mailJobs }) {
  const router = express.Router();
  const jobs = mailJobs || createMailJobs(logger);
  const service = createAuthService({ prisma, config });
  const actions = createActionService({ prisma, config, mailer });
  const google = createGoogleService({ prisma, config, verifyGoogle, clock });
  const auth = requireAuth({ prisma, config, clock });
  const optionalAuth = (req, res, next) => req.get('authorization') ? auth(req, res, next) : next();
  const limited = (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(rateLimit({ windowMs: config.authRateLimitWindowMs, limit: config.authIpRateLimitMax,
    standardHeaders: 'draft-8', legacyHeaders: false, handler: limited }));
  router.use(express.json({ limit: '16kb', strict: true, inflate: false }));
  function validate(schema, source = 'body') {
    return (req, res, next) => {
      const parsed = schema.safeParse(req[source] ?? {});
      if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Check the supplied account details.' } });
      req.input = parsed.data; next();
    };
  }
  function limit(label, count = config.authActionRateLimitMax) {
    return rateLimit({ windowMs: config.authRateLimitWindowMs, limit: count,
      standardHeaders: 'draft-8', legacyHeaders: false, handler: limited,
      async keyGenerator(req) {
        let account = req.authUser?.email || schemas.normalizeEmail(req.input?.email);
        if (!account && req.input?.token) {
          const row = await prisma.authToken.findUnique({ where: { tokenHash: tokenHash(req.input.token) }, select: { userId: true } });
          account = row?.userId;
        }
        return createHash('sha256').update(JSON.stringify([label, account || ipKeyGenerator(req.ip)])).digest('hex');
      },
    });
  }
  function handle(action, status = 200) {
    return async (req, res) => {
      const result = await action(req.input, req);
      if (result?.failure) {
        const { status: failureStatus, code, message, reason } = result.failure;
        logger(JSON.stringify({ event: 'auth_failure', reason }));
        return res.status(failureStatus).json({ error: { code, message } });
      }
      return status === 204 ? res.status(204).end() : res.status(status).json(result);
    };
  }
  router.post('/register', validate(schemas.registerBody), limit('register', config.authRateLimitMax), handle(service.register, 201));
  router.post('/login', validate(schemas.loginBody), limit('login', config.authRateLimitMax), handle(service.login));
  router.post('/refresh', validate(schemas.refreshBody), limit('refresh', config.authRateLimitMax), handle(({ refreshToken }, req) => service.refresh(refreshToken, req)));
  router.post('/logout', validate(schemas.refreshBody), limit('logout', config.authRateLimitMax), handle(({ refreshToken }) => service.logout(refreshToken), 204));
  router.post('/google', validate(schemas.googleBody), limit('google', config.authRateLimitMax), handle(google.googleLogin));
  router.post('/google/link', auth, validate(schemas.googleBody), limit('google-link'), handle(google.link));
  router.get('/identities', auth, validate(schemas.emptyBody, 'query'), handle((_input, req) => google.identities(req)));
  router.post('/verify-email/request', auth, validate(schemas.emptyBody), limit('verify-request'), (req, res) => {
    const task = { userId: req.authUser.id, kind: 'EMAIL_VERIFY', ip: req.ip };
    res.once('finish', () => jobs.enqueue(() => actions.requestAction(task)));
    res.status(202).json({ message: 'If verification is needed, an email will arrive shortly.' });
  });
  router.post('/verify-email/confirm', optionalAuth, validate(schemas.actionBody), limit('verify-confirm'),
    handle(({ token }, req) => actions.confirm({ token, kind: 'EMAIL_VERIFY', actorId: req.authUser?.id })));
  router.post('/password/forgot', validate(schemas.forgotBody), limit('password-forgot'), async (req, res) => {
    const task = { email: req.input.email, kind: 'PASSWORD_RESET', ip: req.ip };
    // No account lookup occurs before this response. Both branches do precisely
    // the same work/delay; account lookup, token issuance and SMTP happen later.
    await delay(config.forgotResponseMs);
    res.once('finish', () => jobs.enqueue(() => actions.requestAction(task)));
    res.status(202).json({ message: 'If an account exists, a password reset email will arrive shortly.' });
  });
  router.post('/password/reset', optionalAuth, validate(schemas.resetBody), limit('password-reset'),
    handle(({ token, newPassword }, req) => actions.confirm({ token, newPassword, kind: 'PASSWORD_RESET', actorId: req.authUser?.id })));
  router.post('/password/change', auth, validate(schemas.changeBody), limit('password-change'), handle(actions.changePassword));
  return router;
}
module.exports = { createAuthRouter };
