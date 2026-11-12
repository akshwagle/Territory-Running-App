'use strict';
const { OAuth2Client } = require('google-auth-library');
const { normalizeEmail, normalizeDisplayName } = require('./validation');

async function verifyGoogleIdToken(idToken, config, { client = new OAuth2Client(config.googleWebClientId) } = {}) {
  // Library verifies Google's signature/certificates, audience, issuer and time.
  const ticket = await client.verifyIdToken({ idToken, audience: config.googleWebClientId });
  return ticket.getPayload();
}
function googleClaims(payload, audience, now) {
  if (!payload || payload.aud !== audience || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) ||
      !Number.isInteger(payload.exp) || payload.exp <= Math.floor(now.getTime() / 1000) ||
      typeof payload.sub !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(payload.sub)) throw new Error('Invalid Google identity.');
  if (payload.email_verified !== true) throw Object.assign(new Error('Unverified Google email.'), { code: 'GOOGLE_EMAIL_UNVERIFIED' });
  const email = normalizeEmail(payload.email);
  if (!email) throw new Error('Invalid Google identity.');
  return { sub: payload.sub, email, name: normalizeDisplayName(payload.name) || 'Runner',
    authoritative: email.endsWith('@gmail.com') || (typeof payload.hd === 'string' && payload.hd.length > 0) };
}
module.exports = { verifyGoogleIdToken, googleClaims };
