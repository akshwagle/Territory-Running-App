'use strict';

const { randomUUID, randomBytes } = require('node:crypto');
const { hashPassword, verifyPassword } = require('./passwords');
const { REFRESH_MS, GRACE_MS, tokenHash, equalHashes,
  successorToken } = require('./tokens');

const credentialsFailure = (reason) => ({ failure: {
  status: 401, code: 'AUTH_FAILED', message: 'Cannot register or sign in with these details.', reason,
} });
const refreshFailure = (reason, code = 'INVALID_REFRESH_TOKEN') => ({ failure: {
  status: 401, code, message: 'This session cannot be renewed. Please sign in again.', reason,
} });
const { accountFailure, publicUser, databaseNow, lockUser, revokeFamily, createSessionTools } = require('./session-core');
const { allocateDisplayName } = require('../profile/names');

function createAuthService({ prisma, config }) {
  const { metadata, response, newFamily } = createSessionTools(config);
  async function register(input, request) {
    // No email pre-check: database uniqueness arbitrates simultaneous sign-ups.
    // Hash before the transaction for both new and existing email addresses.
    const passwordHash = await hashPassword(input.password);
    try {
      return await prisma.$transaction(async (tx) => {
        const now = await databaseNow(tx);
        const displayName = await allocateDisplayName(tx, input.displayName);
        const user = await tx.user.create({ data: {
          username: `u_${randomBytes(14).toString('hex')}`, email: input.email,
          passwordHash, displayName,
          authIdentities: { create: { provider: 'PASSWORD', providerSubject: input.email,
            emailAtSignup: input.email, lastUsedAt: now } },
        } });
        return newFamily(tx, user, request, now);
      }, { timeout: 10000 });
    } catch (error) {
      if (error.code === 'P2002') return credentialsFailure('registration_conflict');
      throw error;
    }
  }

  async function login(input, request) {
    const identity = await prisma.authIdentity.findUnique({
      where: { provider_providerSubject: { provider: 'PASSWORD', providerSubject: input.email } },
      include: { user: true },
    });
    const observedHash = identity?.user.passwordHash;
    if (!await verifyPassword(input.password, observedHash)) {
      return credentialsFailure(identity ? 'password_mismatch' : 'identity_not_found');
    }
    const upgradedHash = observedHash.startsWith('scrypt$') ? null : await hashPassword(input.password);
    return prisma.$transaction(async (tx) => {
      const user = await lockUser(tx, identity.userId);
      const unavailable = accountFailure(user);
      if (unavailable) return unavailable;
      // Credentials may have been changed while password verification ran.
      if (user.passwordHash !== observedHash || !await tx.authIdentity.findFirst({
        where: { id: identity.id, userId: user.id, provider: 'PASSWORD', providerSubject: input.email },
      })) return credentialsFailure('credentials_changed');
      const now = await databaseNow(tx);
      if (upgradedHash) await tx.user.update({ where: { id: user.id }, data: { passwordHash: upgradedHash } });
      await tx.authIdentity.update({ where: { id: identity.id }, data: { lastUsedAt: now } });
      return newFamily(tx, user, request, now);
    }, { timeout: 10000 });
  }

  async function refresh(raw, request) {
    const digest = tokenHash(raw);
    const candidate = await prisma.authToken.findUnique({ where: { tokenHash: digest } });
    if (!candidate || candidate.kind !== 'REFRESH' || !equalHashes(digest, candidate.tokenHash)) {
      return refreshFailure('unknown_refresh');
    }
    return prisma.$transaction(async (tx) => {
      const user = await lockUser(tx, candidate.userId);
      const now = await databaseNow(tx);
      const parent = await tx.authToken.findUnique({ where: { id: candidate.id } });
      const unavailable = accountFailure(user);
      if (unavailable) {
        if (parent) await revokeFamily(tx, parent.familyId, now);
        return unavailable;
      }
      if (!parent || !equalHashes(digest, parent.tokenHash) || parent.revokedAt) return refreshFailure('revoked_refresh');
      if (parent.usedAt) {
        const age = now.getTime() - parent.usedAt.getTime();
        if (age < 0 || age > GRACE_MS || !parent.replacedById) {
          await revokeFamily(tx, parent.familyId, now);
          return refreshFailure('refresh_reuse', 'REFRESH_REUSED');
        }
        // One persisted grace redemption only. Further retries inside the window
        // fail without revoking a legitimate in-flight session.
        if (parent.graceReplayedAt) return refreshFailure('grace_already_consumed', 'REFRESH_RETRY_EXHAUSTED');
        const child = await tx.authToken.findUnique({ where: { id: parent.replacedById } });
        const recovered = successorToken(raw, parent.replacedById, config.refreshDerivationSecret);
        if (!child || child.kind !== 'REFRESH' || child.userId !== user.id ||
            child.familyId !== parent.familyId || !equalHashes(tokenHash(recovered), child.tokenHash)) {
          await revokeFamily(tx, parent.familyId, now);
          return refreshFailure('successor_integrity_failure');
        }
        if (child.revokedAt || child.usedAt || child.expiresAt <= now) return refreshFailure('successor_unavailable');
        await tx.authToken.update({ where: { id: parent.id }, data: { graceReplayedAt: now } });
        return response(user, recovered, now, parent.familyId);
      }
      if (parent.expiresAt <= now) {
        await revokeFamily(tx, parent.familyId, now);
        return refreshFailure('expired_refresh');
      }
      const successorId = randomUUID();
      const rawSuccessor = successorToken(raw, successorId, config.refreshDerivationSecret);
      await tx.authToken.create({ data: { id: successorId, userId: user.id, kind: 'REFRESH',
        tokenHash: tokenHash(rawSuccessor), familyId: parent.familyId,
        expiresAt: new Date(now.getTime() + REFRESH_MS), createdAt: now, ...metadata(request) } });
      await tx.authToken.update({ where: { id: parent.id }, data: { usedAt: now, replacedById: successorId } });
      return response(user, rawSuccessor, now, parent.familyId);
    }, { timeout: 10000 });
  }

  async function logout(raw) {
    const digest = tokenHash(raw);
    const candidate = await prisma.authToken.findUnique({ where: { tokenHash: digest } });
    // Idempotent, even for unknown/expired tokens, with no account disclosure.
    if (!candidate || candidate.kind !== 'REFRESH' || !equalHashes(digest, candidate.tokenHash)) return;
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, candidate.userId);
      await revokeFamily(tx, candidate.familyId, await databaseNow(tx));
    }, { timeout: 10000 });
  }
  return { register, login, refresh, logout };
}

module.exports = { createAuthService, publicUser, accountFailure };
