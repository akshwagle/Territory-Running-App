import { useEffect, useState } from 'react';

const apiOrigin = new URL(import.meta.env.VITE_API_URL || 'http://localhost:4000').origin;

function validRelease(value) {
  return value && typeof value.versionName === 'string' &&
    /^[a-fA-F0-9]{64}$/.test(value.sha256) &&
    /^\/downloads\/[A-Za-z0-9._-]+\.apk$/.test(value.apkUrl) &&
    !Number.isNaN(Date.parse(value.publishedAt)) &&
    (value.changelog === null || typeof value.changelog === 'string');
}

export default function App() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ kind: 'loading' });
  const [copyStatus, setCopyStatus] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    async function load() {
      try {
        const response = await fetch(`${apiOrigin}/api/releases/latest`, { signal: controller.signal });
        if (response.status === 404) {
          const body = await response.json();
          if (body.error?.code !== 'NO_RELEASE') throw new Error('Unexpected response');
          if (!controller.signal.aborted) setState({ kind: 'empty' });
          return;
        }
        if (!response.ok) throw new Error('Request failed');
        const release = await response.json();
        if (!validRelease(release)) throw new Error('Invalid release');
        if (!controller.signal.aborted) setState({ kind: 'release', release });
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error' });
      }
    }
    load();
    return () => controller.abort();
  }, [attempt]);

  async function copyChecksum() {
    try {
      await navigator.clipboard.writeText(state.release.sha256);
      setCopyStatus('Checksum copied.');
    } catch { setCopyStatus('Copy unavailable. Select the checksum below to copy it manually.'); }
  }

  return (
    <main>
      <header><h1>Territory Run</h1><p>Android app download</p></header>
      {state.kind === 'loading' && <p role="status">Checking for the latest version…</p>}
      {state.kind === 'error' && <section aria-label="Download unavailable">
        <p role="alert">We couldn’t load the latest release. Check your connection and try again.</p>
        <button onClick={() => setAttempt((value) => value + 1)}>Retry</button>
      </section>}
      {state.kind === 'empty' && <p>The first version is coming soon</p>}
      {state.kind === 'release' && <>
        <section aria-labelledby="release-title">
          <h2 id="release-title">Version {state.release.versionName}</h2>
          <p>Released <time dateTime={state.release.publishedAt}>{new Date(state.release.publishedAt).toLocaleDateString()}</time></p>
          <h3>Changelog</h3><p className="changelog">{state.release.changelog || 'No changelog provided.'}</p>
          <a className="download" href={`${apiOrigin}${state.release.apkUrl}`}>Download APK</a>
          <h3>SHA-256 checksum</h3>
          <p>Use this checksum to verify your downloaded file.</p>
          <code className="checksum">{state.release.sha256}</code>
          <button onClick={copyChecksum}>Copy SHA-256</button>
          <p role="status">{copyStatus}</p>
        </section>
        <section aria-labelledby="install-title">
          <h2 id="install-title">Install on Android</h2>
          <ol>
            <li>Download the APK, then open it from your downloads.</li>
            <li>If Android asks, allow installs from this source for the browser or file manager you used.</li>
            <li>Follow Android’s prompts to install the app.</li>
          </ol>
          <p>Play Protect may warn because this app is installed outside the Play Store. Review the warning before deciding whether to continue.</p>
        </section>
      </>}
    </main>
  );
}
