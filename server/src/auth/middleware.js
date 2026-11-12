'use strict';

const { verifyAccessToken } = require('./tokens');
const { accountFailure, publicUser } = require('./session-core');

function requireAuth({ prisma, config, clock = () => new Date() }) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const match = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(req.get('authorization') || '');
    let session;
    try {
      if (!match) throw new Error('Missing access token.');
      session = await verifyAccessToken(match[1], config.jwtAccessSecret, clock());
    } catch {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'A valid access token is required.' } });
    }
    // One query/snapshot, with the existing family_id index for the EXISTS.
    const [user] = await prisma.$queryRaw`
      SELECT u.id, u.email, u.display_name AS "displayName", u.created_at AS "createdAt",
        u.verified_at AS "verifiedAt", u.deletion_at AS "deletionAt", u.suspended_at AS "suspendedAt",
        EXISTS (SELECT 1 FROM auth_tokens t WHERE t.family_id = ${session.familyId}::uuid
          AND t.user_id = u.id AND t.kind = 'REFRESH' AND t.used_at IS NULL
          AND t.revoked_at IS NULL AND t.expires_at > clock_timestamp()) AS "sessionActive"
      FROM users u WHERE u.id = ${session.userId}::uuid`;
    const unavailable = accountFailure(user);
    if (unavailable) {
      const { status, code, message } = unavailable.failure;
      return res.status(status).json({ error: { code, message } });
    }
    if (!user.sessionActive) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'This session has ended. Please sign in again.' } });
    req.authUser = publicUser(user);
    req.authSessionId = session.familyId;
    req.authEmailVerified = user.verifiedAt !== null;
    next();
  };
}

module.exports = { requireAuth };
