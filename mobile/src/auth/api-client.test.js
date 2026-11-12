import { describe, it, expect, vi } from 'vitest';
import { createApiClient } from './api-client.js';
import { createVault } from './vault.js';
import { session, memoryStorage, response } from './test-helpers.js';
const denied = () => response(401, { error: { code: 'UNAUTHORIZED', message: 'Please sign in again.' } });
async function fixture(fetchImpl, extras = {}) {
  const storage = memoryStorage(), vault = createVault(storage);
  await vault.set(session());
  const onSessionLost = vi.fn(), onAccountBlocked = vi.fn();
  const api = createApiClient({ origin: 'http://localhost:4000', vault, fetchImpl, onSessionLost, onAccountBlocked, ...extras });
  return { api, vault, storage, onSessionLost, onAccountBlocked };
}

describe('API refresh and session boundaries', () => {
  it('AUTH-03 parallel expired requests share one refresh and replay each request exactly once', async () => {
    let rotations = 0, originals = 0, replays = 0;
    const f = await fixture(async (url, options) => {
      if (url.endsWith('/refresh')) { rotations++; await new Promise(resolve => setTimeout(resolve, 10)); return response(200, session('new')); }
      if (options.headers.Authorization === 'Bearer header.old.signature') { originals++; return denied(); }
      replays++; expect(options.body).toBe(JSON.stringify({ chunk: 'unchanged' }));
      return response(200, { accepted: true });
    });
    const results = await Promise.all(Array.from({ length: 10 }, () => f.api.request('/api/runs/chunks', { method: 'POST', body: { chunk: 'unchanged' } })));
    expect(results.every(value => value.accepted)).toBe(true);
    expect([rotations, originals, replays]).toEqual([1, 10, 10]);
    expect(f.vault.snapshot().session.refreshToken).toBe('n'.repeat(43));
  });

  it('AUTH-03 a late old-token 401 uses the already rotated session without a second refresh', async () => {
    let rotations = 0;
    const f = await fixture(async (url, options) => {
      if (url.endsWith('/refresh')) { rotations++; return response(200, session('new')); }
      if (options.headers.Authorization.includes('.old.')) { await new Promise(resolve => setTimeout(resolve, url.endsWith('/late') ? 30 : 0)); return denied(); }
      return response(200, { ok: true });
    });
    await Promise.all([f.api.request('/api/early'), f.api.request('/api/late')]);
    expect(rotations).toBe(1);
  });

  it('AUTH-03 a second 401 is returned without a refresh loop', async () => {
    let calls = 0;
    const f = await fixture(async url => { calls++; return url.endsWith('/refresh') ? response(200, session('new')) : denied(); });
    await expect(f.api.request('/api/me')).rejects.toMatchObject({ status: 401 });
    expect(calls).toBe(3);
  });

  it.each(['offline', 'timeout', 'server', 'rate'])('AUTH-04 %s refresh failure preserves the saved session', async reason => {
    const f = await fixture(async (url, options) => {
      if (!url.endsWith('/refresh')) return denied();
      if (reason === 'offline') throw Error('offline');
      if (reason === 'timeout') return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Error('timeout'))));
      return response(reason === 'server' ? 503 : 429, { error: { code: 'TEMPORARY', message: 'Try again.' } });
    }, { timeoutMs: 15 });
    await expect(f.api.request('/api/me')).rejects.toBeDefined();
    expect(f.vault.snapshot().session).toEqual(session());
    expect(f.onSessionLost).not.toHaveBeenCalled();
  });

  it('AUTH-04 only an explicit refresh 401 clears credentials and asks for sign-in', async () => {
    const f = await fixture(async () => denied());
    await expect(f.api.request('/api/me')).rejects.toMatchObject({ status: 401 });
    expect(f.vault.snapshot().session).toBeNull();
    expect(f.onSessionLost).toHaveBeenCalledOnce();
  });

  it('AUTH-12 suspended/deleted refresh responses keep data and expose the account message', async () => {
    for (const code of ['ACCOUNT_SUSPENDED', 'ACCOUNT_DELETED']) {
      const f = await fixture(async url => url.endsWith('/refresh') ? response(403, { error: { code, message: 'Account unavailable.' } }) : denied());
      await expect(f.api.request('/api/me')).rejects.toMatchObject({ code });
      expect(f.onAccountBlocked).toHaveBeenCalledOnce();
      expect(f.vault.snapshot().session).not.toBeNull();
    }
  });

  it('public login errors do not refresh or send an existing bearer token', async () => {
    const fetchImpl = vi.fn(async (_url, options) => { expect(options.headers.Authorization).toBeUndefined(); return denied(); });
    const f = await fixture(fetchImpl);
    await expect(f.api.request('/api/auth/login', { auth: false, method: 'POST', body: {} })).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('an in-flight refresh cannot resurrect a session after sign-out', async () => {
    let deliver;
    const f = await fixture(async url => url.endsWith('/refresh') ? new Promise(resolve => { deliver = resolve; }) : denied());
    const pending = f.api.refresh();
    await f.vault.clear(); deliver(response(200, session('new')));
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(f.vault.snapshot().session).toBeNull();
  });

  it('successful 204 responses have no body; malformed JSON is a friendly response error', async () => {
    const f = await fixture(async () => response(204));
    expect(await f.api.request('/api/auth/logout')).toBeNull();
    const bad = await fixture(async () => new Response('not json', { status: 200 }));
    await expect(bad.api.request('/api/me')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('profile metadata writes cannot discard a concurrent refresh or lose verified-email state', async () => {
    let deliver;
    const f = await fixture(async () => new Promise(resolve => { deliver = resolve; }));
    const pending = f.api.refresh(), before = f.vault.snapshot();
    await f.vault.set({ ...before.session, user: { ...before.session.user, emailVerified: true } }, before.revision);
    expect(f.vault.snapshot().revision).toBe(before.revision);
    deliver(response(200, session('new'))); await pending;
    expect(f.vault.snapshot().session).toMatchObject({ refreshToken: 'n'.repeat(43), user: { emailVerified: true } });
  });

  it('AUTH-04 a profile metadata update cannot suppress an explicit refresh 401', async () => {
    let deliver;
    const f = await fixture(async () => new Promise(resolve => { deliver = resolve; }));
    const pending = f.api.refresh(), before = f.vault.snapshot();
    await f.vault.set({ ...before.session, user: { ...before.session.user, emailVerified: true } }, before.revision);
    deliver(denied()); await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(f.vault.snapshot().session).toBeNull(); expect(f.onSessionLost).toHaveBeenCalledOnce();
  });

  it('a late account error for an older signed-in account cannot block the new account', async () => {
    let deliver;
    const f = await fixture(async () => new Promise(resolve => { deliver = resolve; }));
    const pending = f.api.request('/api/me');
    await f.vault.set({ ...session('new'), user: { ...session().user, id: 'user-two' } });
    deliver(response(403, { error: { code: 'ACCOUNT_SUSPENDED', message: 'Old account is suspended.' } }));
    await expect(pending).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    expect(f.onAccountBlocked).not.toHaveBeenCalled(); expect(f.vault.snapshot().session.user.id).toBe('user-two');
  });
});
