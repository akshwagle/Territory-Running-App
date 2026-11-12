'use strict';

const { verifyAccessToken } = require('./tokens');
const { accountFailure, publicUser } = require('./service');

function requireAuth({ prisma, config, clock = () => new Date() }) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const match = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(req.get('authorization') || '');
    let userId;
    try {
      if (!match) throw new Error('Missing access token.');
      userId = await verifyAccessToken(match[1], config.jwtAccessSecret, clock());
    } catch {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'A valid access token is required.' } });
    }
    const user = await prisma.user.findUnique({ where: { id: userId },
      select: { id: true, email: true, displayName: true, createdAt: true, deletionAt: true, suspendedAt: true } });
    const unavailable = accountFailure(user);
    if (unavailable) {
      const { status, code, message } = unavailable.failure;
      return res.status(status).json({ error: { code, message } });
    }
    req.authUser = publicUser(user);
    next();
  };
}

module.exports = { requireAuth };
