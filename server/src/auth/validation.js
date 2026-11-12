'use strict';

const { z } = require('zod');
const { domainToASCII } = require('node:url');
const { acceptablePassword } = require('./passwords');

function normalizeEmail(value) {
  if (typeof value !== 'string' || value.length > 1024) return null;
  const text = value.trim().toLowerCase();
  if (/[\s\p{C}]/u.test(text)) return null;
  const parts = text.split('@');
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  // ASCII dot-atom local parts only; no alias stripping or provider-specific rules.
  if (!local || local.length > 64 || !/^[a-z0-9!#$%&'*+\-/=?^_`{|}~.]+$/.test(local) ||
      local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  const ascii = domainToASCII(domain);
  const labels = ascii.split('.');
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  const result = `${local}@${ascii}`;
  return result.length <= 254 ? result : null;
}

function normalizeDisplayName(value) {
  if (typeof value !== 'string' || value.length > 240 || /[\p{C}\p{Extended_Pictographic}]/u.test(value)) return null;
  const result = value.normalize('NFKC').trim().replace(/ +/g, ' ');
  if ([...result].length < 2 || [...result].length > 60 || !/^[\p{L}\p{M}\p{N} .'-]+$/u.test(result)) return null;
  const reserved = result.toLowerCase().replace(/[ .'-]/g, '');
  return ['admin', 'administrator', 'support', 'territoryrun'].includes(reserved) ? null : result;
}

const email = z.string().transform(normalizeEmail).refine((value) => value !== null);
const displayName = z.string().transform(normalizeDisplayName).refine((value) => value !== null);
const password = z.string().refine(acceptablePassword);
function isRefreshToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) &&
    Buffer.from(value, 'base64url').toString('base64url') === value;
}
const refreshToken = z.string().refine(isRefreshToken);
const registerBody = z.strictObject({ email, password, displayName });
const loginBody = z.strictObject({ email, password: z.string().min(1).refine((value) => [...value].length <= 128) });
const refreshBody = z.strictObject({ refreshToken });
const actionBody = z.strictObject({ token: refreshToken });
const resetBody = z.strictObject({ token: refreshToken, newPassword: password });
const forgotBody = z.strictObject({ email });
const changeBody = z.strictObject({ currentPassword: z.string().min(1).refine(value => [...value].length <= 128), newPassword: password });
const googleBody = z.strictObject({ idToken: z.string().min(10).max(8192) });
const emptyBody = z.strictObject({});
const sessionParams = z.strictObject({ id: z.uuid() });

module.exports = { normalizeEmail, normalizeDisplayName, isRefreshToken, registerBody, loginBody, refreshBody,
  actionBody, resetBody, forgotBody, changeBody, googleBody, emptyBody, sessionParams };
