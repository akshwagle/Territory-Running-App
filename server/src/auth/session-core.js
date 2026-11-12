'use strict';
const { randomUUID } = require('node:crypto');
const { ACCESS_SECONDS, REFRESH_MS, tokenHash, hashIp, initialRefreshToken, issueAccessToken } = require('./tokens');

function failure(status, code, message, reason = code.toLowerCase()) { return { failure: { status, code, message, reason } }; }
function accountFailure(user) {
  if (!user || user.deletionAt) return failure(403, 'ACCOUNT_DELETED', 'This account has been deleted or is awaiting deletion.');
  if (user.suspendedAt) return failure(403, 'ACCOUNT_SUSPENDED', 'This account is suspended.');
  return null;
}
function publicUser(user) { return { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt }; }
async function databaseNow(tx) { return (await tx.$queryRaw`SELECT clock_timestamp() AS now`)[0].now; }
async function lockUser(tx, id) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.user.findUnique({ where: { id } });
}
async function revokeSessions(tx, userId, now, keepFamily = null) {
  const where = { userId, kind: 'REFRESH', ...(keepFamily ? { familyId: { not: keepFamily } } : {}) };
  await tx.authToken.updateMany({ where, data: { revokedAt: now } });
  await tx.authToken.updateMany({ where: { ...where, usedAt: null }, data: { usedAt: now } });
}
async function revokeFamily(tx, familyId, now) {
  await tx.authToken.updateMany({ where: { kind: 'REFRESH', familyId }, data: { revokedAt: now } });
  await tx.authToken.updateMany({ where: { kind: 'REFRESH', familyId, usedAt: null }, data: { usedAt: now } });
}
function createSessionTools(config) {
  function metadata(req) { return { userAgent: (req.get('user-agent') || '').slice(0, 512) || null,
    ipHash: hashIp(req.ip || 'unknown', config.refreshDerivationSecret) }; }
  async function response(user, refreshToken, now, familyId) {
    return { accessToken: await issueAccessToken(user.id, familyId, config.jwtAccessSecret, now),
      refreshToken, expiresIn: ACCESS_SECONDS, user: publicUser(user) };
  }
  async function newFamily(tx, user, req, now) {
    const id = randomUUID(), raw = initialRefreshToken();
    await tx.authToken.create({ data: { id, userId: user.id, kind: 'REFRESH', familyId: id,
      tokenHash: tokenHash(raw), expiresAt: new Date(now.getTime() + REFRESH_MS), createdAt: now, ...metadata(req) } });
    return response(user, raw, now, id);
  }
  return { metadata, response, newFamily };
}
module.exports = { failure, accountFailure, publicUser, databaseNow, lockUser, revokeSessions, revokeFamily, createSessionTools };
