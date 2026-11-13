'use strict';
const { lockUser, accountFailure, databaseNow } = require('../auth/session-core');

function publicError(statusCode, publicCode, message) {
  return Object.assign(new Error(message), { statusCode, publicCode });
}
async function currentAccount(tx, req, { allowMissing = false } = {}) {
  const user = await lockUser(tx, req.authUser.id);
  if (!user && allowMissing) return null;
  const unavailable = accountFailure(user);
  if (unavailable) throw publicError(unavailable.failure.status, unavailable.failure.code, unavailable.failure.message);
  const active = await tx.authToken.findFirst({ where: { userId:user.id, familyId:req.authSessionId,
    kind:'REFRESH', usedAt:null, revokedAt:null, expiresAt:{gt:await databaseNow(tx)} }, select:{id:true} });
  if (!active) throw publicError(401,'UNAUTHORIZED','This session has ended. Please sign in again.');
  return user;
}
async function lockAccountWork(tx,userId) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('account-work:' || ${userId},0))`;
}
module.exports = { publicError, currentAccount, lockAccountWork };
