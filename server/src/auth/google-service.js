'use strict';
const { randomBytes } = require('node:crypto');
const { verifyGoogleIdToken, googleClaims } = require('./google');
const { failure, accountFailure, databaseNow, lockUser, revokeSessions, createSessionTools } = require('./session-core');

const conflict = () => failure(409, 'GOOGLE_SIGN_IN_FAILED', 'Unable to sign in with this Google account.');
const identitySelect = { id: true, provider: true, emailAtSignup: true, createdAt: true, lastUsedAt: true };
function createGoogleService({ prisma, config, verifyGoogle = verifyGoogleIdToken, clock = () => new Date() }) {
  const { newFamily } = createSessionTools(config);
  async function verified(idToken) {
    if (!config.googleWebClientId) return failure(503, 'GOOGLE_UNAVAILABLE', 'Google sign-in is not configured.');
    try { return googleClaims(await verifyGoogle(idToken, config), config.googleWebClientId, clock()); }
    catch (error) {
      return error.code === 'GOOGLE_EMAIL_UNVERIFIED' ? failure(403, error.code, 'Verify your Google email before signing in.') :
        failure(401, 'INVALID_GOOGLE_TOKEN', 'Google sign-in could not be verified. Please try again.');
    }
  }
  const list = (tx, userId) => tx.authIdentity.findMany({ where: { userId }, select: identitySelect, orderBy: [{ provider: 'asc' }, { createdAt: 'asc' }] });
  async function googleLogin({ idToken }, req) {
    const claims = await verified(idToken); if (claims.failure) return claims;
    // Serialize a subject across users and an email across new registrations.
    // Locks use sorted, fixed domain-labelled keys; no token/email is logged.
    try {
      return await prisma.$transaction(async tx => {
        for (const key of [`google-sub:${claims.sub}`, `google-email:${claims.email}`].sort()) {
          await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
        }
        const identity = await tx.authIdentity.findUnique({ where: { provider_providerSubject: { provider: 'GOOGLE', providerSubject: claims.sub } } });
        let user;
        const now = await databaseNow(tx);
        if (identity) {
          user = await lockUser(tx, identity.userId);
          const unavailable = accountFailure(user); if (unavailable) return unavailable;
          await tx.authIdentity.update({ where: { id: identity.id }, data: { lastUsedAt: now } });
        } else {
          const existing = await tx.user.findUnique({ where: { email: claims.email }, select: { id: true } });
          if (existing) {
            user = await lockUser(tx, existing.id);
            const unavailable = accountFailure(user); if (unavailable) return unavailable;
            const methods = await tx.authIdentity.findMany({ where: { userId: user.id } });
            // Never merge two Google subjects because an email matches.
            if (!user.passwordHash || !methods.some(i => i.provider === 'PASSWORD') ||
                methods.some(i => i.provider === 'GOOGLE' && i.emailAtSignup.toLowerCase() === claims.email)) return conflict();
            if (!claims.authoritative) return failure(409, 'ACCOUNT_LINK_REQUIRED', 'Sign in with your password, then link Google from Settings.');
            if (!user.verifiedAt) {
              user = await tx.user.update({ where: { id: user.id }, data: { passwordHash: null, displayName: claims.name } });
              await revokeSessions(tx, user.id, now);
              await tx.authToken.updateMany({ where: { userId: user.id, kind: { in: ['EMAIL_VERIFY', 'PASSWORD_RESET'] }, usedAt: null }, data: { usedAt: now } });
            }
            user = await tx.user.update({ where: { id: user.id }, data: { verifiedAt: user.verifiedAt || now } });
          } else {
            user = await tx.user.create({ data: { email: claims.email, username: `u_${randomBytes(14).toString('hex')}`,
              displayName: claims.name, passwordHash: null, verifiedAt: claims.authoritative ? now : null } });
          }
          await tx.authIdentity.create({ data: { userId: user.id, provider: 'GOOGLE', providerSubject: claims.sub,
            emailAtSignup: claims.email, lastUsedAt: now } });
          if (!user.passwordHash) await tx.authIdentity.deleteMany({ where: { userId: user.id, provider: 'PASSWORD' } });
        }
        return newFamily(tx, user, req, now);
      }, { timeout: 10000 });
    } catch (error) { if (error.code === 'P2002') return conflict(); throw error; }
  }
  async function link({ idToken }, req) {
    const claims = await verified(idToken); if (claims.failure) return claims;
    try {
      return await prisma.$transaction(async tx => {
        const user = await lockUser(tx, req.authUser.id);
        const unavailable = accountFailure(user); if (unavailable) return unavailable;
        const active = await tx.authToken.findFirst({ where: { userId: user.id, familyId: req.authSessionId,
          kind: 'REFRESH', revokedAt: null, usedAt: null, expiresAt: { gt: await databaseNow(tx) } } });
        if (!active) return failure(401, 'UNAUTHORIZED', 'This session has ended. Please sign in again.');
        const identity = await tx.authIdentity.findUnique({ where: { provider_providerSubject: { provider: 'GOOGLE', providerSubject: claims.sub } } });
        if (identity) return identity.userId === user.id ? { identities: await list(tx, user.id) } : conflict();
        const sameEmailGoogle = await tx.authIdentity.findFirst({ where: { userId: user.id, provider: 'GOOGLE', emailAtSignup: claims.email } });
        if (sameEmailGoogle) return conflict();
        // The authenticated user controls the unused, verified Google subject.
        // An identity belonging to somebody else is never reassigned, even if emails match.
        await tx.authIdentity.create({ data: { userId: user.id, provider: 'GOOGLE', providerSubject: claims.sub,
          emailAtSignup: claims.email, lastUsedAt: await databaseNow(tx) } });
        return { identities: await list(tx, user.id) };
      });
    } catch (error) { if (error.code === 'P2002') return conflict(); throw error; }
  }
  return { googleLogin, link, identities: req => list(prisma, req.authUser.id).then(identities => ({ identities })) };
}
module.exports = { createGoogleService };
