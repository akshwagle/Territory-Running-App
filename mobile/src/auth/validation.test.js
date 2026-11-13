import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { normalizeEmail, normalizeDisplayName, formErrors, passwordError } from './validation.js';
const require = createRequire(import.meta.url);
const server = require('../../../server/src/auth/validation.js');

it('email/display-name validation matches the server contract, including Unicode domains and aliases', () => {
  for (const value of [' Runner+tag@Example.COM ', 'a@bücher.test', '.a@example.test', 'a..b@example.test', 'a@one', 'a@localhost', 'a@host.test/path', 'a@host.test#x', 'a@@host.test', '😃@host.test', `${'x'.repeat(65)}@host.test`, 'a@host.test.']) expect(normalizeEmail(value)).toBe(server.normalizeEmail(value));
  for (const value of [' Trail  Runner ', 'Ａｌｅｘ', 'admin', 'support', 'Territory Run', 'a', 'Li', 'A😀', 'Zoë Runner', 'A\nB', 'A'.repeat(24), 'A'.repeat(25), 'A'.repeat(61), 'Scunthorpe', 'Bad Shit']) expect(normalizeDisplayName(value)).toBe(server.normalizeDisplayName(value));
});
it('password validation counts code points, preserves spaces, and mirrors the server denylist', () => {
  for (const value of ['short', 'password123', 'a'.repeat(129), '🗺'.repeat(128), ' MountainTrail ', 'Trail!Mountain2026']) expect(passwordError(value) === null).toBe(server.registerBody.safeParse({ email: 'a@example.test', displayName: 'Trail Runner', password: value }).success);
  expect(formErrors('signup', {})).toHaveProperty('email'); expect(formErrors('reset', { newPassword: 'short' })).toHaveProperty('newPassword');
  expect(passwordError('legacy', true)).toBeNull();
});
