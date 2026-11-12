import { ApiError } from './errors.js';

export const SESSION_KEY = 'auth-session-v2';
export const LEGACY_KEY = 'auth-session-v1';

function validSession(value) {
  return value && typeof value.accessToken === 'string' && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(value.accessToken) &&
    typeof value.refreshToken === 'string' && /^[\w-]{43}$/.test(value.refreshToken) &&
    typeof value.user?.id === 'string' && typeof value.user?.email === 'string' && typeof value.user?.displayName === 'string';
}

// One encrypted record replaces both tokens together. Serial writes and revision
// checks prevent an old refresh from restoring a session after explicit logout.
export function createVault(storage) {
  let session = null, revision = 0, tail = Promise.resolve();
  const listeners = new Set();
  const notify = () => { for (const listener of listeners) listener(); };
  const serialize = task => {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  };
  const vault = {
    snapshot: () => ({ session, revision }),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    restore: () => serialize(async () => {
      try {
        const current = await storage.get(SESSION_KEY);
        const legacy = current === null ? await storage.get(LEGACY_KEY) : null;
        const record = current ?? legacy;
        const candidate = record?.version === 2 ? record.session : record?.version === 1 ? record : null;
        if (validSession(candidate)) {
          session = { ...candidate }; delete session.version;
          if (legacy) { await storage.set(SESSION_KEY, { version: 2, session }); await storage.remove(LEGACY_KEY); }
        } else {
          session = null;
          // Deliberately never clear a store: saved run data is another key.
          if (current !== null) await storage.remove(SESSION_KEY);
          if (legacy !== null) await storage.remove(LEGACY_KEY);
        }
        revision++; notify(); return session;
      } catch { throw new ApiError('SECURE_STORAGE_UNAVAILABLE', 'Secure sign-in storage is unavailable. Restart the app and try again.'); }
    }),
    set: (next, expectedRevision, preserveUser = false) => serialize(async () => {
      if (expectedRevision !== undefined && revision !== expectedRevision) return false;
      if (!validSession(next)) throw new ApiError('INVALID_RESPONSE', 'The server returned an invalid session. Please try again.');
      const effective = preserveUser && session?.user.id === next.user.id ? { ...next, user: { ...session.user, ...next.user } } : next;
      const sameCredentials = session?.accessToken === effective.accessToken && session?.refreshToken === effective.refreshToken && session?.user.id === effective.user.id;
      try { await storage.set(SESSION_KEY, { version: 2, session: effective }); }
      catch { throw new ApiError('SECURE_STORAGE_UNAVAILABLE', 'Could not save your sign-in securely. Please try again.'); }
      session = effective; if (!sameCredentials) revision++; notify(); return true;
    }),
    rotate: (next, expectedRevision) => vault.set(next, expectedRevision, true),
    clear: () => serialize(async () => {
      // Keep tokens inaccessible in memory even if device storage reports an error.
      session = null; revision++; notify();
      try { await storage.remove(SESSION_KEY); await storage.remove(LEGACY_KEY); }
      catch { throw new ApiError('SECURE_STORAGE_UNAVAILABLE', 'Could not remove the saved sign-in. Restart the app before using this device again.'); }
    }),
  };
  return vault;
}
