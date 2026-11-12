import { createVault } from './vault.js';
import { createApiClient } from './api-client.js';
import { ApiError, friendlyMessage, isAccountError, isConnectionError } from './errors.js';
import { DISCARD_CONFIRMATION } from './pending-work.js';

const savedMessage = 'Any unsent data stays encrypted on this phone. Sign in to its account to continue.';
const GOOGLE_ATTEMPT = 'auth-google-attempt-v1';

export function createAuthController({ origin, storage, pending, google, fetchImpl, timeoutMs }) {
  const vault = createVault(storage), listeners = new Set();
  let state = { status: 'restoring', user: null, message: '' }, starting, operation = 0, profileLoad = 0;
  const set = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const api = createApiClient({ origin, vault, fetchImpl, timeoutMs,
    onSessionLost() { pending.pause(); set({ status: 'signedOut', user: null, message: `Your session ended. ${savedMessage}` }); },
    onAccountBlocked(error) { pending.pause(); set({ status: 'blocked', message: `${friendlyMessage(error)} ${savedMessage}` }); },
    onReauthenticationRequired() { pending.pause(); set({ status: 'reauthRequired', message: `Sign in again to continue. ${savedMessage}` }); },
  });
  async function loadMe() {
    if (!vault.snapshot().session) return;
    const load = ++profileLoad;
    try {
      const user = await api.request('/api/me');
      if (load !== profileLoad) return;
      if (typeof user.emailVerified !== 'boolean') throw new ApiError('INVALID_RESPONSE', 'The server needs an update before it can report email verification. Try again after it restarts.');
      const current = vault.snapshot();
      if (current.session?.user.id !== user.id) return;
      if (!await vault.set({ ...current.session, user }, current.revision)) return;
      if (load !== profileLoad) return;
      pending.resume(user.id); set({ status: 'authenticated', user, message: '' });
    } catch (error) {
      if (load !== profileLoad) return;
      if (['signedOut', 'reauthRequired'].includes(state.status) || isAccountError(error)) throw error;
      const current = vault.snapshot().session;
      if (current) { pending.pause(); set({ status: isConnectionError(error) ? 'offline' : 'unavailable', user: current.user, message: friendlyMessage(error) }); }
      throw error;
    }
  }
  async function start() {
    if (starting) return starting;
    starting = (async () => {
      try {
        const session = await vault.restore();
        const interrupted = await storage.get(GOOGLE_ATTEMPT);
        if (interrupted) await storage.remove(GOOGLE_ATTEMPT);
        if (!session) {
          pending.pause(); set({ status: 'signedOut', user: null, message: savedMessage,
            authOutcome: interrupted ? { kind: 'error', message: 'Google sign-in was interrupted before it finished. Please try again or use email login.' } : null });
          return;
        }
        set({ user: session.user }); await loadMe();
      } catch (error) {
        if (state.status === 'restoring') set({ status: 'storageError', message: friendlyMessage(error) });
      } finally { starting = null; }
    })();
    return starting;
  }
  async function signIn(kind, body) {
    if (kind !== 'google') set({ authOutcome: null });
    const op = ++operation;
    const session = await api.request(`/api/auth/${kind}`, { auth: false, method: 'POST', body });
    if (op !== operation) throw new ApiError('SESSION_CHANGED', 'Your sign-in changed. Please try again.');
    await vault.set(session);
    set({ status: 'restoring', user: session.user, message: '' });
    // The session is already saved: a network loss now must not ask the user to
    // repeat registration or lose a refresh family that was issued successfully.
    try { await loadMe(); }
    catch (error) {
      if (!['offline', 'unavailable'].includes(state.status)) throw error;
    }
  }
  return {
    api, pending,
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start, loadMe,
    login: body => signIn('login', body),
    async signup(body) {
      await signIn('register', body);
      if (!vault.snapshot().session) return;
      try { await api.request('/api/auth/verify-email/request', { method: 'POST', body: {} }); }
      catch { set({ message: 'Account created. The verification email could not be requested. Use Resend when connected.' }); }
    },
    async googleSignIn() {
      set({ authOutcome: { kind: 'progress', message: 'Opening the Google account picker…' } });
      try {
        await storage.set(GOOGLE_ATTEMPT, { version: 1, startedAt: Date.now() });
        const idToken = await google.signIn();
        set({ authOutcome: { kind: 'progress', message: 'Google returned an ID token. Requesting your app session…' } });
        await signIn('google', { idToken });
        set({ authOutcome: { kind: 'success', message: state.status === 'authenticated' ? 'Signed in with Google.' : 'Google sign-in was accepted. Reconnect to confirm your account.' } });
      } catch (error) {
        set({ authOutcome: { kind: 'error', message: friendlyMessage(error), code: error.code } });
        throw error;
      } finally { try { await storage.remove(GOOGLE_ATTEMPT); } catch { /* a future start reports an interrupted attempt */ } }
    },
    async linkGoogle() { const idToken = await google.signIn(); return api.request('/api/auth/google/link', { method: 'POST', body: { idToken } }); },
    async signOut({ mode = 'keep', confirmation } = {}) {
      const current = vault.snapshot().session;
      if (!current) return;
      if (mode === 'upload') await pending.upload(current.user.id);
      if (mode === 'discard') {
        if (confirmation !== DISCARD_CONFIRMATION) throw new ApiError('CONFIRM_DISCARD', 'Confirm again before discarding saved data.');
        await pending.discard(current.user.id, confirmation);
      }
      operation++; profileLoad++; pending.pause();
      let remoteFailed = false;
      try { await api.request('/api/auth/logout', { auth: false, method: 'POST', body: { refreshToken: current.refreshToken } }); }
      catch { remoteFailed = true; }
      try { await google.signOut?.(); } catch { /* local app sign-out still completes */ }
      try { await vault.clear(); }
      catch (error) { set({ status: 'storageError', user: null, message: friendlyMessage(error) }); throw error; }
      pending.pause();
      set({ status: 'signedOut', user: null, authOutcome: null, message: `Signed out on this phone. ${savedMessage}${remoteFailed ? ' The server session could not be ended; you can revoke it from another signed-in device.' : ''}` });
    },
    async resetPassword(body) {
      const result = await api.request('/api/auth/password/reset', { auth: Boolean(vault.snapshot().session), method: 'POST', body });
      operation++; profileLoad++; pending.pause(); await vault.clear(); pending.pause();
      set({ status: 'signedOut', user: null, authOutcome: null, message: `${result.message} ${savedMessage}` });
      return result;
    },
    async confirmEmail(token) {
      const result = await api.request('/api/auth/verify-email/confirm', { auth: Boolean(vault.snapshot().session), method: 'POST', body: { token } });
      if (vault.snapshot().session) { try { await loadMe(); } catch { /* retain confirmation success */ } }
      return result;
    },
    async pendingCount() { return state.user ? pending.count(state.user.id) : 0; },
  };
}
