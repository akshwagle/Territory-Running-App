import { it, expect, vi } from 'vitest';
import { createVault, SESSION_KEY, LEGACY_KEY } from './vault.js';
import { platformStorage } from './platform-storage.js';
import { createPendingJournal, PENDING_KEY } from './pending-work.js';
import { memoryStorage, session } from './test-helpers.js';

it('browser previews never invoke the plugin web fallback or localStorage/Preferences for tokens', async () => {
  const write = vi.spyOn(Storage.prototype, 'setItem');
  const plugin = { set: vi.fn() }, storage = platformStorage('web', plugin);
  const vault = createVault(storage); await vault.set(session());
  expect(vault.snapshot().session).toEqual(session());
  expect(plugin.set).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  expect(await createVault(platformStorage('web', plugin)).restore()).toBeNull();
  write.mockRestore();
});

it('Android storage uses the maintained Keystore plugin with one namespace initialization and no clear-all', async () => {
  const plugin = { setKeyPrefix: vi.fn(async () => {}), get: vi.fn(async () => null), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
  const storage = platformStorage('android', plugin);
  await storage.set(SESSION_KEY, session()); await storage.get(SESSION_KEY); await storage.remove(SESSION_KEY);
  expect(plugin.setKeyPrefix).toHaveBeenCalledExactlyOnceWith('territoryrun_');
  expect(plugin.get).toHaveBeenCalledWith(SESSION_KEY, false);
  expect(plugin.set).toHaveBeenCalledWith(SESSION_KEY, session(), false);
  expect(plugin.remove).toHaveBeenCalledWith(SESSION_KEY);
});

it.each(['migrate', 'invalid', 'future'])('AUTH-13 %s older/unknown session formats never alter unsent data', async mode => {
  const storage = memoryStorage(), journal = createPendingJournal(storage);
  await journal.put('user-one', 'chunk-one', { contents: 'unsent sentinel' });
  const before = structuredClone(storage.records.get(PENDING_KEY));
  if (mode === 'migrate') await storage.set(LEGACY_KEY, { version: 1, ...session() });
  else await storage.set(SESSION_KEY, mode === 'future' ? { version: 99, session: session() } : { version: 2, session: { refreshToken: 'bad' } });
  const vault = createVault(storage); await vault.restore();
  expect(Boolean(vault.snapshot().session)).toBe(mode === 'migrate');
  expect(storage.records.has(LEGACY_KEY)).toBe(false);
  expect(storage.records.get(PENDING_KEY)).toEqual(before);
});

it('unavailable secure storage reports an error and never deletes pending data as recovery', async () => {
  const storage = memoryStorage(); storage.get = async () => { throw Error('key unavailable'); };
  const remove = vi.spyOn(storage, 'remove');
  await expect(createVault(storage).restore()).rejects.toMatchObject({ code: 'SECURE_STORAGE_UNAVAILABLE' });
  expect(remove).not.toHaveBeenCalled();
});
