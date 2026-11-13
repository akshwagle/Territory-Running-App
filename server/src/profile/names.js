'use strict';

const { randomBytes } = require('node:crypto');

const reserved = new Set(['admin', 'administrator', 'support', 'territoryrun']);
// Whole-word matching avoids rejecting names such as Scunthorpe.
const profanity = new Set(['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nazi']);
function canonicalName(value) {
  if (typeof value !== 'string' || value.length > 240 || /[\p{C}\p{Extended_Pictographic}]/u.test(value)) return null;
  const result = value.normalize('NFKC').trim().replace(/ +/g, ' ');
  if (!/^[\p{L}\p{M}\p{N} .'-]+$/u.test(result)) return null;
  if (reserved.has(result.toLowerCase().replace(/[ .'-]/g, ''))) return null;
  if (result.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).some(word => profanity.has(word))) return null;
  return result;
}

function normalizeDisplayName(value) {
  const result = canonicalName(value);
  return result && [...result].length >= 3 && [...result].length <= 24 ? result : null;
}

// Older signup clients allowed longer names. Keep those requests usable while
// storing a canonical 3–24-character name. Profile edits will use the strict rule.
function normalizeRegistrationName(value) {
  const result = canonicalName(value);
  if (!result || [...result].length < 3) return null;
  return normalizeDisplayName([...result].slice(0, 24).join('').trimEnd());
}
const normalizeGoogleName = value => normalizeRegistrationName(value) || 'Runner';

async function allocateDisplayName(tx, raw, userId = null, autoSuffix = true) {
  const base = normalizeRegistrationName(raw);
  if (!base) throw Error('A valid normalized display name is required.');
  for (let attempt = 0; attempt < (autoSuffix ? 128 : 1); attempt++) {
    // Small numeric suffixes stay readable. Random suffixes bound the work for
    // popular names rather than scanning an unbounded list of existing runners.
    const suffix = attempt === 0 ? '' : attempt < 8 ? ` ${attempt + 1}` : ` ${randomBytes(4).toString('hex')}`;
    const candidate = [...base].slice(0, 24 - suffix.length).join('').trimEnd() + suffix;
    const [{ key }] = await tx.$queryRaw`SELECT profile_name_key(${candidate}) AS key`;
    // Nonblocking transaction locks avoid multi-candidate deadlocks. Another
    // in-flight claim makes this candidate unavailable even before its INSERT.
    const [{ locked }] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended('display-name:' || ${key}, 0)) AS locked`;
    if (!locked) continue;
    const [{ unavailable }] = await tx.$queryRaw`SELECT
      EXISTS(SELECT 1 FROM users WHERE profile_name_key(display_name) = ${key}
        AND id IS DISTINCT FROM ${userId}::uuid)
      OR EXISTS(SELECT 1 FROM display_name_history WHERE name_key = ${key}
        AND user_id IS DISTINCT FROM ${userId}::uuid AND reserved_until > clock_timestamp()) AS unavailable`;
    if (!unavailable) return candidate;
  }
  if (!autoSuffix) throw Object.assign(Error('That display name is unavailable. Choose another.'), { statusCode:409, publicCode:'DISPLAY_NAME_UNAVAILABLE' });
  throw Object.assign(Error('Display-name allocation is busy. Please try again.'), { code: 'NAME_ALLOCATION_BUSY' });
}

async function recordDisplayNameChange(tx, user, nextName) {
  if (user.displayName === nextName) return;
  await tx.$executeRaw`INSERT INTO display_name_history(user_id,display_name,name_key)
    VALUES(${user.id}::uuid,${user.displayName},profile_name_key(${user.displayName}))`;
}

module.exports = { normalizeDisplayName, normalizeRegistrationName, normalizeGoogleName,
  allocateDisplayName, recordDisplayNameChange };
