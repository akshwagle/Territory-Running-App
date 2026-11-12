import { useCallback, useEffect, useRef, useState } from 'react';

export const apiOrigin = new URL(import.meta.env.VITE_API_URL || 'http://localhost:4000').origin;
export const releaseErrorMessage = 'The site could not reach the server. Try again in a moment.';

function validRelease(value) {
  return value && typeof value.versionName === 'string' && value.versionName.length > 0 &&
    /^[a-fA-F0-9]{64}$/.test(value.sha256) &&
    /^\/downloads\/[A-Za-z0-9._-]+\.apk$/.test(value.apkUrl) &&
    typeof value.publishedAt === 'string' && !Number.isNaN(Date.parse(value.publishedAt)) &&
    (value.changelog === null || typeof value.changelog === 'string');
}

export default function useRelease() {
  const [state, setState] = useState({ kind: 'loading' });
  const active = useRef(null);
  const load = useCallback(async () => {
    if (active.current) return; // All Retry controls share one request.
    const controller = new AbortController();
    const request = { controller, timeout: null };
    active.current = request;
    setState({ kind: 'loading' });
    const current = () => active.current === request;
    const deadline = new Promise((_, reject) => {
      request.timeout = setTimeout(() => {
        controller.abort();
        reject(new Error('Release deadline reached'));
      }, 10000);
    });
    async function read() {
      const response = await fetch(`${apiOrigin}/api/releases/latest`, { signal: controller.signal });
      if (response.status === 404) {
        const body = await response.json();
        if (body.error?.code !== 'NO_RELEASE') throw new Error('Unexpected response');
        return { kind: 'empty' };
      }
      if (!response.ok) throw new Error('Request failed');
      const release = await response.json();
      if (!validRelease(release)) throw new Error('Invalid release');
      return { kind: 'release', release };
    }
    try {
      const next = await Promise.race([read(), deadline]);
      if (current()) setState(next);
    } catch {
      if (current()) setState({ kind: 'error' });
    } finally {
      clearTimeout(request.timeout);
      if (current()) active.current = null;
    }
  }, []);
  useEffect(() => {
    load();
    return () => {
      const request = active.current;
      active.current = null;
      if (request) { clearTimeout(request.timeout); request.controller.abort(); }
    };
  }, [load]);
  return { state, retry: load };
}

export function releaseDate(value) {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}
