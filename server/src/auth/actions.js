'use strict';
const { hashPassword, verifyPassword } = require('./passwords');
const { initialRefreshToken, tokenHash, equalHashes, hashIp } = require('./tokens');
const { failure, accountFailure, databaseNow, lockUser, revokeSessions } = require('./session-core');
const { messageFor } = require('./mailer');
const { lockAccountWork } = require('../profile/common');
const lifetimes = { EMAIL_VERIFY: 24 * 60 * 60 * 1000, PASSWORD_RESET: 30 * 60 * 1000 };

function createActionService({ prisma, config, mailer }) {
  async function requestAction({ userId, email, kind, ip }) {
    const candidate = userId ? { id: userId } : await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!candidate) return;
    const raw = initialRefreshToken();
    const issued = await prisma.$transaction(async tx => {
      const user = await lockUser(tx, candidate.id);
      if (accountFailure(user) || (kind === 'EMAIL_VERIFY' && user.verifiedAt)) return null;
      const now = await databaseNow(tx);
      // The same lock serializes re-requests, confirmation and password changes.
      await tx.authToken.updateMany({ where: { userId: user.id, kind, usedAt: null }, data: { usedAt: now } });
      const row=await tx.authToken.create({ data: { userId: user.id, kind, tokenHash: tokenHash(raw),
        expiresAt: new Date(now.getTime() + lifetimes[kind]), createdAt: now,
        ipHash: hashIp(ip || 'unknown', config.refreshDerivationSecret) } });
      return {userId:user.id,email:user.email,tokenId:row.id};
    });
    if (issued) await prisma.$transaction(async tx=>{
      await lockAccountWork(tx,issued.userId);
      const user=await tx.user.findUnique({where:{id:issued.userId}});
      if(accountFailure(user)||user.email!==issued.email)return;
      const active=await tx.authToken.findFirst({where:{id:issued.tokenId,usedAt:null,expiresAt:{gt:await databaseNow(tx)}}});
      if(active)await mailer.send(messageFor(kind,raw,issued.email,config.webBaseUrl),{userId:issued.userId});
    },{timeout:45000});
  }

  async function confirm({ token, kind, actorId, newPassword }) {
    const digest = tokenHash(token);
    const candidate = await prisma.authToken.findUnique({ where: { tokenHash: digest } });
    if (!candidate || !equalHashes(digest, candidate.tokenHash)) return failure(404, 'ACTION_TOKEN_NOT_FOUND', 'This link is invalid. Request a new link.');
    const passwordHash = kind === 'PASSWORD_RESET' ? await hashPassword(newPassword) : null;
    return prisma.$transaction(async tx => {
      const user = await lockUser(tx, candidate.userId);
      const unavailable = accountFailure(user); if (unavailable) return unavailable;
      const row = await tx.authToken.findUnique({ where: { id: candidate.id } });
      const now = await databaseNow(tx);
      if (!row || !equalHashes(digest, row.tokenHash)) return failure(404, 'ACTION_TOKEN_NOT_FOUND', 'This link is invalid. Request a new link.');
      if (actorId && actorId !== user.id) return failure(403, 'ACTION_ACCOUNT_MISMATCH', 'This link belongs to another account. Sign out before using it.');
      if (row.kind !== kind) return failure(400, 'ACTION_TOKEN_PURPOSE_MISMATCH', 'This is the wrong kind of link. Request the correct link.');
      if (row.usedAt) return failure(409, 'ACTION_TOKEN_USED', 'This link was already used or replaced. Request a new link.');
      if (row.expiresAt <= now) return failure(410, 'ACTION_TOKEN_EXPIRED', 'This link expired. Request a new link.');
      if (kind === 'PASSWORD_RESET') {
        const identity = await tx.authIdentity.findUnique({ where: { provider_providerSubject: { provider: 'PASSWORD', providerSubject: user.email } } });
        if (identity && identity.userId !== user.id) return failure(409, 'IDENTITY_CONFLICT', 'The sign-in method cannot be changed.');
        await tx.user.update({ where: { id: user.id }, data: { passwordHash, verifiedAt: user.verifiedAt || now } });
        await tx.authIdentity.upsert({ where: { provider_providerSubject: { provider: 'PASSWORD', providerSubject: user.email } },
          create: { userId: user.id, provider: 'PASSWORD', providerSubject: user.email, emailAtSignup: user.email }, update: {} });
        await revokeSessions(tx, user.id, now);
        await tx.authToken.updateMany({ where: { userId: user.id, kind: { in: ['PASSWORD_RESET', 'EMAIL_VERIFY'] }, usedAt: null }, data: { usedAt: now } });
        return { message: 'Password updated. Sign in with your new password.' };
      }
      await tx.authToken.update({ where: { id: row.id }, data: { usedAt: now } });
      await tx.user.update({ where: { id: user.id }, data: { verifiedAt: user.verifiedAt || now } });
      return { message: 'Email verified. Return to the app; this link does not sign you in.' };
    }, { timeout: 10000 });
  }

  async function changePassword({ currentPassword, newPassword }, req) {
    const observed = await prisma.user.findUnique({ where: { id: req.authUser.id } });
    if (!observed?.passwordHash) return failure(403, 'PASSWORD_NOT_SET', 'Use the password reset email to set your first password.');
    if (!await verifyPassword(currentPassword, observed.passwordHash)) return failure(401, 'AUTH_FAILED', 'The current password is incorrect.');
    const passwordHash = await hashPassword(newPassword);
    return prisma.$transaction(async tx => {
      const user = await lockUser(tx, observed.id);
      const unavailable = accountFailure(user); if (unavailable) return unavailable;
      const now = await databaseNow(tx);
      const active = await tx.authToken.findFirst({ where: { userId: user.id, familyId: req.authSessionId,
        kind: 'REFRESH', usedAt: null, revokedAt: null, expiresAt: { gt: now } } });
      if (!active) return failure(401, 'UNAUTHORIZED', 'This session has ended. Please sign in again.');
      if (user.passwordHash !== observed.passwordHash) return failure(401, 'AUTH_FAILED', 'The current password has changed. Sign in again.');
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await revokeSessions(tx, user.id, now, req.authSessionId);
      await tx.authToken.updateMany({ where: { userId: user.id, kind: 'PASSWORD_RESET', usedAt: null }, data: { usedAt: now } });
      return { message: 'Password changed. Other sessions have been signed out.' };
    });
  }
  return { requestAction, confirm, changePassword };
}
module.exports = { createActionService, lifetimes };
