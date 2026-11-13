import { ApiError } from './errors.js';

export const PENDING_KEY = 'pending-work-v1';
export const DISCARD_CONFIRMATION = 'DISCARD_UNSENT_DATA';

// A small encrypted journal for later recording modules. Auth never interprets
// payloads and never removes this key when it removes session credentials.
export function createPendingJournal(storage) {
  let tail = Promise.resolve();
  const serial = task => { const next = tail.then(task); tail = next.catch(() => {}); return next; };
  async function read() {
    const record = await storage.get(PENDING_KEY);
    if (record === null) return [];
    if (record.version !== 1 || !Array.isArray(record.items)) throw new ApiError('SAVED_DATA_UNAVAILABLE', 'Saved data could not be read. Keep this app installed and try again.');
    return record.items;
  }
  return {
    list: ownerId => serial(async () => (await read()).filter(item => item.ownerId === ownerId)),
    put: (ownerId, id, payload) => serial(async () => {
      if (!ownerId || !id) throw Error('An owner and stable item ID are required.');
      const items = await read();
      if (!items.some(item => item.ownerId === ownerId && item.id === id)) {
        await storage.set(PENDING_KEY, { version: 1, items: [...items, { ownerId, id, payload }] });
      }
    }),
    discard: (ownerId, confirmation) => serial(async () => {
      if (confirmation !== DISCARD_CONFIRMATION) throw Error('Explicit discard confirmation is required.');
      await storage.set(PENDING_KEY, { version: 1, items: (await read()).filter(item => item.ownerId !== ownerId) });
    }),
  };
}

// Later recording/upload modules register here, without coupling auth to runs.
// Each source owns its acknowledgement/deletion policy and its encrypted data.
export function createPendingWork(journal) {
  const sources = new Map();
  let owner = null;
  const work = {
    register(name, source) {
      if (sources.has(name)) throw Error('Pending source already registered.');
      sources.set(name, source);
      if (owner) source.resume?.(owner); else source.pause?.();
      return () => sources.delete(name);
    },
    pause() { owner = null; for (const source of sources.values()) source.pause?.(); },
    resume(ownerId) { if (owner !== ownerId) work.pause(); owner = ownerId; for (const source of sources.values()) source.resume?.(ownerId); },
    isPaused: () => owner === null,
    async stopRecording(ownerId,reason) {
      for(const source of sources.values())await source.stopRecording?.(ownerId,reason);
    },
    async count(ownerId) { const counts = await Promise.all([...sources.values()].map(source => source.count(ownerId))); return counts.reduce((sum, n) => sum + n, 0); },
    async upload(ownerId) {
      if (!ownerId || owner !== ownerId) throw new ApiError('UNAUTHORIZED', 'Sign in to the account that owns the saved data first.', 401);
      for (const source of sources.values()) if (await source.count(ownerId)) {
        if (owner !== ownerId) throw new ApiError('UNAUTHORIZED', 'Sign in again before uploading saved data.', 401);
        if (!source.upload) throw new ApiError('UPLOAD_NOT_AVAILABLE', 'Uploads are not available in this build. Keep the saved data on this phone.');
        await source.upload(ownerId);
      }
    },
    async discard(ownerId, confirmation) {
      if (!ownerId || confirmation !== DISCARD_CONFIRMATION) throw new ApiError('CONFIRM_DISCARD', 'Confirm again before discarding saved data.');
      for (const source of sources.values()) await source.discard(ownerId, confirmation);
    },
  };
  work.register('encrypted-journal', { count: async id => (await journal.list(id)).length, discard: journal.discard });
  return work;
}
