'use strict';

const { createHash, createHmac, randomBytes, timingSafeEqual } = require('node:crypto');
const { isRefreshToken } = require('./validation');

const ACCESS_SECONDS = 15 * 60;
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const GRACE_MS = 10 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const jose = import('jose');

function tokenHash(value) { return createHash('sha256').update(value).digest('hex'); }
function equalHashes(first, second) {
  return typeof first === 'string' && typeof second === 'string' &&
    /^[a-f0-9]{64}$/.test(first) && /^[a-f0-9]{64}$/.test(second) &&
    timingSafeEqual(Buffer.from(first, 'hex'), Buffer.from(second, 'hex'));
}
function initialRefreshToken() { return randomBytes(32).toString('base64url'); }
function successorToken(parentToken, successorId, secret) {
  if (!isRefreshToken(parentToken) || !UUID.test(successorId)) throw new Error('Invalid internal rotation input.');
  // The fresh successor row UUID is persisted as parent.replaced_by_id.
  // JSON array encoding is unambiguous, with a fixed version/domain label.
  return createHmac('sha256', secret)
    .update(JSON.stringify(['refresh-successor-v1', parentToken, successorId]))
    .digest('base64url');
}
function hashIp(ip, secret) {
  return createHmac('sha256', secret).update(JSON.stringify(['ip-hash-v1', ip])).digest('hex');
}
async function issueAccessToken(userId, familyId, secret, now) {
  const { SignJWT } = await jose;
  const issued = Math.floor(now.getTime() / 1000);
  if (!UUID.test(userId) || !UUID.test(familyId)) throw new Error('Invalid session identifiers.');
  return new SignJWT({ sid: familyId }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId).setIssuedAt(issued).setExpirationTime(issued + ACCESS_SECONDS)
    .sign(new TextEncoder().encode(secret));
}
async function verifyAccessToken(token, secret, now) {
  if (typeof token !== 'string' || token.length > 2048) throw new Error('Invalid access token.');
  const { jwtVerify } = await jose;
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ['HS256'], typ: 'JWT', requiredClaims: ['sub', 'sid', 'iat', 'exp'],
    currentDate: now, maxTokenAge: ACCESS_SECONDS,
  });
  if (Object.keys(payload).sort().join(',') !== 'exp,iat,sid,sub' || !UUID.test(payload.sub) || !UUID.test(payload.sid) ||
      !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp - payload.iat !== ACCESS_SECONDS) {
    throw new Error('Invalid access claims.');
  }
  return { userId: payload.sub, familyId: payload.sid };
}

module.exports = { ACCESS_SECONDS, REFRESH_MS, GRACE_MS, tokenHash, equalHashes,
  initialRefreshToken, successorToken, hashIp, issueAccessToken, verifyAccessToken };
