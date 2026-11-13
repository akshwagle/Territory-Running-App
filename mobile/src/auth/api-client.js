import { ApiError, isAccountError } from './errors.js';

export function createApiClient({ origin, vault, fetchImpl = globalThis.fetch, timeoutMs = 15000,
  onSessionLost = () => {}, onAccountBlocked = () => {}, onReauthenticationRequired = () => {} }) {
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Invalid API origin.');
  let refreshing = null;
  const isCurrent = expected => {
    const live = vault.snapshot().session;
    return Boolean(live && expected && live.user.id === expected.user.id && live.accessToken === expected.accessToken);
  };
  async function send(path, { method = 'GET', body, accessToken, signal, ifMatch } = {}) {
    if (!/^\/api\/[a-zA-Z0-9/_-]+$/.test(path)) throw Error('Invalid API path.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await fetchImpl(`${url.origin}${path}`, {
        method, signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(ifMatch ? { 'If-Match':ifMatch } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const payload = response.status === 204 ? null : await response.json().catch(() => null);
      if (controller.signal.aborted) throw new ApiError('REQUEST_TIMEOUT', 'The request took too long. Check your connection and try again.');
      if (!response.ok) {
        const code = typeof payload?.error?.code === 'string' ? payload.error.code : 'SERVER_ERROR';
        const message = typeof payload?.error?.message === 'string' ? payload.error.message.slice(0, 500) : 'The server could not complete this request. Try again.';
        const seconds = Number(response.headers.get('Retry-After'));
        throw new ApiError(code, message, response.status, seconds > 0 ? Math.ceil(seconds) : null);
      }
      if (response.status !== 204 && !payload) throw new ApiError('INVALID_RESPONSE', 'The server sent an unreadable response. Try again.');
      return payload;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) throw new ApiError('REQUEST_TIMEOUT', 'The request took too long. Check your connection and try again.');
      throw new ApiError('NETWORK_UNAVAILABLE', 'Cannot reach the server. Check your connection and try again.');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  async function refresh() {
    if (refreshing) return refreshing;
    const start = vault.snapshot();
    if (!start.session) throw new ApiError('UNAUTHORIZED', 'Please sign in again.', 401);
    refreshing = (async () => {
      try {
        const next = await send('/api/auth/refresh', { method: 'POST', body: { refreshToken: start.session.refreshToken } });
        if (next?.user?.id !== start.session.user.id) throw new ApiError('INVALID_RESPONSE', 'The server returned a different account. Please sign in again.');
        if (!await vault.rotate(next, start.revision)) throw new ApiError('SESSION_CHANGED', 'Your sign-in changed. Please try again.');
        return next;
      } catch (error) {
        if (vault.snapshot().revision === start.revision) {
          if (error.status === 401) { await vault.clear(); onSessionLost(); }
          else if (isAccountError(error)) onAccountBlocked(error);
        }
        // Offline, timeout, 429 and 5xx keep the existing encrypted session.
        throw error;
      } finally { refreshing = null; }
    })();
    return refreshing;
  }
  async function request(path, { auth = true, ...options } = {}) {
    const start = vault.snapshot();
    if (auth && !start.session) throw new ApiError('UNAUTHORIZED', 'Please sign in to continue.', 401);
    try { return await send(path, { ...options, accessToken: auth ? start.session.accessToken : undefined }); }
    catch (error) {
      if (!auth) throw error;
      if (isAccountError(error)) { if (isCurrent(start.session)) onAccountBlocked(error); throw error; }
      if (error.status !== 401 || error.code !== 'UNAUTHORIZED') throw error;
      const current = vault.snapshot();
      if (!current.session || current.session.user.id !== start.session.user.id) throw error;
      // A late 401 can arrive after another caller has already rotated tokens.
      if (current.session.accessToken === start.session.accessToken) await refresh();
      const latest = vault.snapshot().session;
      if (!latest || latest.user.id !== start.session.user.id) throw error;
      // Exactly one replay. Never recursively refresh a second 401.
      try { return await send(path, { ...options, accessToken: latest.accessToken }); }
      catch (retryError) {
        if (isCurrent(latest)) {
          if (isAccountError(retryError)) onAccountBlocked(retryError);
          else if (retryError.status === 401 && retryError.code === 'UNAUTHORIZED') onReauthenticationRequired();
        }
        throw retryError;
      }
    }
  }
  return { request, refresh };
}
