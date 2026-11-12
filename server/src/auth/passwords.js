'use strict';

const { scrypt, randomBytes, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const bcrypt = require('bcrypt'); // Existing dependency: legacy hashes only.

const derive = promisify(scrypt);
// N=2^15, r=8, p=3: about 32 MiB per derivation; 64 MiB safety ceiling.
const PARAMETERS = Object.freeze({ N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
const DENYLIST = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234',
  '1234567890', '12345678901', '123456789012', 'qwerty12345',
  'qwertyuiop', 'letmein1234', 'welcome123', 'welcome1234', 'iloveyou123',
]);

function acceptablePassword(value) {
  return typeof value === 'string' && [...value].length >= 10 && [...value].length <= 128 &&
    !DENYLIST.has(value.toLowerCase());
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, 32, PARAMETERS);
  return `scrypt$32768$8$3$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

const dummySalt = randomBytes(16);
const dummyKey = randomBytes(32);
async function verifyPassword(password, encoded) {
  // Never normalize or trim passwords. Unknown accounts still do one scrypt.
  const match = typeof encoded === 'string' && /^scrypt\$32768\$8\$3\$([\w-]{22})\$([\w-]{43})$/.exec(encoded);
  if (match) {
    const actual = await derive(password, Buffer.from(match[1], 'base64url'), 32, PARAMETERS);
    return timingSafeEqual(actual, Buffer.from(match[2], 'base64url'));
  }
  if (typeof encoded === 'string' && /^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(encoded)) {
    // Do not accept bcrypt's silent truncation of a legacy password.
    if (Buffer.byteLength(password, 'utf8') <= 72) return bcrypt.compare(password, encoded);
  }
  const actual = await derive(password, dummySalt, 32, PARAMETERS);
  timingSafeEqual(actual, dummyKey);
  return false;
}

module.exports = { PARAMETERS, acceptablePassword, hashPassword, verifyPassword };
