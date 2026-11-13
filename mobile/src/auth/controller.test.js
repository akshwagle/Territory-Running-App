import { it, expect, vi } from 'vitest';
import { createAuthController } from './controller.js';
import { createPendingJournal, createPendingWork, PENDING_KEY, DISCARD_CONFIRMATION } from './pending-work.js';
import { SESSION_KEY } from './vault.js';
import { ApiError } from './errors.js';
import { memoryStorage, session, response } from './test-helpers.js';

async function setup(fetchImpl, initial = session(), google = { signIn: async () => 'mock.id.token' }) {
  const storage = memoryStorage();
  if (initial) await storage.set(SESSION_KEY, { version: 2, session: initial });
  const journal = createPendingJournal(storage), pending = createPendingWork(journal);
  const controller = createAuthController({ origin: 'http://localhost:4000', storage, pending,
    google, fetchImpl });
  return { storage, journal, pending, controller };
}
const me = () => response(200, { ...session().user, emailVerified: false });

it('restores a secure session, loads verification state and resumes only the matching owner', async () => {
  const f = await setup(async () => me());
  const source = { count: async () => 0, resume: vi.fn(), pause: vi.fn() };
  f.pending.register('recording', source); await f.controller.start();
  expect(f.controller.getSnapshot()).toMatchObject({ status: 'authenticated', user: { emailVerified: false } });
  expect(source.resume).toHaveBeenCalledWith('user-one');
});

it('AUTH-03 background/resume validates against the server and refreshes once without trusting the phone clock', async () => {
  let expired = false, rotations = 0;
  const f = await setup(async (url, options) => {
    if (url.endsWith('/refresh')) { rotations++; return response(200, session('new')); }
    if (expired && options.headers.Authorization.includes('.old.')) return response(401, { error: { code: 'UNAUTHORIZED', message: 'Expired.' } });
    return me();
  });
  await f.controller.start(); expired = true; await f.controller.loadMe();
  expect(rotations).toBe(1); expect(f.controller.getSnapshot().status).toBe('authenticated');
});

it('AUTH-04 offline restoration preserves credentials and data, pauses work, then resumes after reconnection', async () => {
  let offline = true;
  const f = await setup(async () => { if (offline) throw Error('offline'); return me(); });
  await f.journal.put('user-one', 'saved', 'unchanged'); await f.controller.start();
  expect(f.controller.getSnapshot().status).toBe('offline'); expect(f.pending.isPaused()).toBe(true);
  expect(f.storage.records.has(SESSION_KEY)).toBe(true);
  offline = false; await f.controller.loadMe();
  expect(f.controller.getSnapshot().status).toBe('authenticated'); expect(f.pending.isPaused()).toBe(false);
  expect((await f.journal.list('user-one'))[0].payload).toBe('unchanged');
});

it('AUTH-07 session expiry keeps unsent data encrypted and re-login resumes the same owner', async () => {
  let revoked = false;
  const f = await setup(async url => {
    if (url.endsWith('/login')) { revoked = false; return response(200, session('new')); }
    if (revoked) return response(401, { error: { code: 'UNAUTHORIZED', message: 'Session ended.' } });
    return me();
  });
  await f.journal.put('user-one', 'saved', { sentinel: 'do not discard' }); await f.controller.start();
  const before = structuredClone(f.storage.records.get(PENDING_KEY)); revoked = true;
  await expect(f.controller.loadMe()).rejects.toMatchObject({ status: 401 });
  expect(f.controller.getSnapshot()).toMatchObject({ status: 'signedOut', user: null });
  expect(f.controller.getSnapshot().message).toBe('Your session ended. Sign in again.'); expect(f.pending.isPaused()).toBe(true);
  expect(f.storage.records.get(PENDING_KEY)).toEqual(before);
  await f.controller.login({ email: 'runner@example.test', password: 'NotSentToAnyServer' });
  expect(f.pending.isPaused()).toBe(false); expect(f.storage.records.get(PENDING_KEY)).toEqual(before);
});

it('AUTH-06 separate phone sessions remain independent when one family is revoked', async () => {
  let firstRevoked = false;
  const a = await setup(async () => firstRevoked ? response(401, { error: { code: 'UNAUTHORIZED', message: 'Revoked.' } }) : me());
  const b = await setup(async () => me(), session('new'));
  await Promise.all([a.controller.start(), b.controller.start()]); firstRevoked = true;
  await expect(a.controller.loadMe()).rejects.toMatchObject({ status: 401 }); await b.controller.loadMe();
  expect(a.controller.getSnapshot().status).toBe('signedOut'); expect(b.controller.getSnapshot().status).toBe('authenticated');
});

it('AUTH-08 explicit sign-out keeps pending data; failed upload never signs out or discards it', async () => {
  const f = await setup(async url => url.endsWith('/logout') ? response(204) : me());
  await f.journal.put('user-one', 'saved', 'preserve'); await f.controller.start();
  const before = structuredClone(f.storage.records.get(PENDING_KEY));
  await expect(f.controller.signOut({ mode: 'upload' })).rejects.toMatchObject({ code: 'UPLOAD_NOT_AVAILABLE' });
  expect(f.controller.getSnapshot().status).toBe('authenticated');
  await expect(f.controller.signOut({ mode: 'discard' })).rejects.toMatchObject({ code: 'CONFIRM_DISCARD' });
  expect(f.storage.records.get(PENDING_KEY)).toEqual(before);
  await f.controller.signOut({ mode: 'keep' });
  expect(f.controller.getSnapshot().status).toBe('signedOut'); expect(f.storage.records.get(PENDING_KEY)).toEqual(before);
});

it('AUTH-08 confirmed discard affects only the signed-in owner', async () => {
  const f = await setup(async url => url.endsWith('/logout') ? response(204) : me());
  await f.journal.put('user-one', 'a', 'own'); await f.journal.put('other-user', 'b', 'other'); await f.controller.start();
  await f.controller.signOut({ mode: 'discard', confirmation: DISCARD_CONFIRMATION });
  expect(await f.journal.list('user-one')).toEqual([]); expect((await f.journal.list('other-user'))[0].payload).toBe('other');
});

it('AUTH-12 account deletion/suspension pauses work and preserves the separate encrypted journal', async () => {
  for (const code of ['ACCOUNT_SUSPENDED', 'ACCOUNT_DELETED']) {
    const f = await setup(async () => response(403, { error: { code, message: 'Unavailable.' } }));
    await f.journal.put('user-one', 'saved', 'preserve'); await f.controller.start();
    expect(f.controller.getSnapshot().status).toBe('blocked'); expect(f.controller.getSnapshot().message).toMatch(/account.*(suspended|deletion)|deletion.*account/i);
    expect(f.pending.isPaused()).toBe(true); expect(await f.journal.list('user-one')).toHaveLength(1);
  }
});

it('registering after login resumes generic hooks but never gives a different account saved data', async () => {
  const f = await setup(async () => me());
  await f.journal.put('other-user', 'saved', 'private'); await f.controller.start();
  expect(await f.controller.pendingCount()).toBe(0);
  expect(await f.journal.list('user-one')).toEqual([]);
  expect(await f.journal.list('other-user')).toHaveLength(1);
  const hook = { count: async () => 0, pause: vi.fn(), resume: vi.fn() };
  f.pending.register('late-registration', hook);
  expect(hook.resume).toHaveBeenCalledWith('user-one');
});

it('reset and verification actions never create an implicit session', async () => {
  const f = await setup(async () => response(200, { message: 'Done. Sign in again.' }), null); await f.controller.start();
  await f.controller.confirmEmail('a'.repeat(43)); expect(f.controller.getSnapshot().status).toBe('signedOut');
  await f.controller.resetPassword({ token: 'a'.repeat(43), newPassword: 'MapleMountainTrail2026' });
  expect(f.controller.getSnapshot().status).toBe('signedOut'); expect(f.storage.records.has(SESSION_KEY)).toBe(false);
});

it('AUTH-03 a replayed UNAUTHORIZED pauses work and asks for reauthentication without clearing on a non-refresh response', async () => {
  const f = await setup(async url => url.endsWith('/refresh') ? response(200, session('new')) : response(401, { error: { code: 'UNAUTHORIZED', message: 'Session ended.' } }));
  await f.journal.put('user-one', 'saved', 'preserve'); await f.controller.start();
  expect(f.controller.getSnapshot().status).toBe('reauthRequired');
  expect(f.pending.isPaused()).toBe(true); expect(f.storage.records.has(SESSION_KEY)).toBe(true);
  expect(await f.journal.list('user-one')).toHaveLength(1);
});

it.each(['GOOGLE_CANCELLED', 'GOOGLE_NO_ID_TOKEN', 'NETWORK_UNAVAILABLE', 'GOOGLE_SIGN_IN_FAILED'])('Google %s has a controller-level message even if its screen remounts', async code => {
  const apiError = new ApiError(code, `Visible result: ${code}`, code === 'GOOGLE_SIGN_IN_FAILED' ? 401 : 0);
  const nativeFailure = ['GOOGLE_CANCELLED', 'GOOGLE_NO_ID_TOKEN'].includes(code);
  const f = await setup(async () => { throw apiError; }, null, { signIn: async () => { if (nativeFailure) throw apiError; return 'mock.id.token'; } });
  await f.controller.start(); await expect(f.controller.googleSignIn()).rejects.toMatchObject({ code });
  expect(f.controller.getSnapshot()).toMatchObject({ status: 'signedOut', authOutcome: { kind: 'error', message: `Visible result: ${code}` } });
  expect(JSON.stringify(f.controller.getSnapshot())).not.toContain('mock.id.token');
  expect(f.storage.records.has('auth-google-attempt-v1')).toBe(false);
});

it('an interrupted native attempt becomes a clear message after app recreation and never clears saved data', async () => {
  const f = await setup(async () => me(), null);
  await f.storage.set('auth-google-attempt-v1', { version: 1, startedAt: Date.now() });
  await f.journal.put('user-one', 'saved', 'preserve'); await f.controller.start();
  expect(f.controller.getSnapshot().authOutcome.message).toContain('interrupted');
  expect(await f.journal.list('user-one')).toHaveLength(1);
});

it('a late pre-verification profile response cannot bring the verification banner back', async () => {
  let oldResponse, racing = false, calls = 0;
  const f = await setup(async () => {
    if (!racing) return me();
    if (++calls === 1) return new Promise(resolve => { oldResponse = resolve; });
    return response(200, { ...session().user, emailVerified: true });
  });
  await f.controller.start(); racing = true;
  const older = f.controller.loadMe(); await f.controller.loadMe(); oldResponse(me()); await older;
  expect(f.controller.getSnapshot().user.emailVerified).toBe(true);
  expect(f.storage.records.get(SESSION_KEY).session.user.emailVerified).toBe(true);
});

it('a clean signed-out start has no unsent-data claim; the pending hook returns only real encrypted item counts', async () => {
  const f = await setup(async () => me(), null); await f.controller.start();
  expect(f.controller.getSnapshot().message).toBe(''); expect(await f.controller.pendingTotal()).toBe(0);
  await f.journal.put('another-owner', 'one', 'private');
  expect(await f.controller.pendingTotal()).toBe(1); expect(await f.controller.pendingCount()).toBe(0);
});
