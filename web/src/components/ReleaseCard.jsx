import { useEffect, useRef, useState } from 'react';
import DownloadControl from './DownloadControl.jsx';
import { CopyIcon } from './Icons.jsx';
import { releaseDate, releaseErrorMessage } from '../hooks/useRelease.js';

export default function ReleaseCard({ state, retry, device }) {
  const [copyState, setCopyState] = useState('idle');
  const checksum = useRef(null);
  const timer = useRef(null);
  const operation = useRef(0);
  useEffect(() => () => { operation.current++; clearTimeout(timer.current); }, []);
  async function copyChecksum() {
    const current = ++operation.current;
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(state.release.sha256);
      if (current !== operation.current) return;
      setCopyState('copied');
      timer.current = setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      if (current !== operation.current || !checksum.current) return;
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(checksum.current);
      selection?.removeAllRanges();
      selection?.addRange(range);
      setCopyState('manual');
    }
  }
  return <div className={`release-card${state.kind === 'loading' ? ' release-placeholder' : ''}`} aria-labelledby="release-title" aria-busy={state.kind === 'loading'}>
    <span className="eyebrow">THE LATEST BUILD</span>
    {state.kind === 'release' ? <>
      <div className="release-heading"><h3 id="release-title">Version {state.release.versionName}</h3><span className="tag">EARLY BUILD</span></div>
      <dl className="release-facts">
        <div><dt>Released</dt><dd><time dateTime={state.release.publishedAt}>{releaseDate(state.release.publishedAt)}</time></dd></div>
        <div><dt>Requires</dt><dd>Android 7.0+ · API 24</dd></div>
        {Number.isSafeInteger(state.release.fileSizeBytes) && state.release.fileSizeBytes > 0 && <div><dt>APK size</dt><dd>{(state.release.fileSizeBytes / 1024 / 1024).toFixed(1)} MB</dd></div>}
      </dl>
      <p className="changelog">{state.release.changelog || 'No release notes provided.'}</p>
      <DownloadControl state={state} retry={retry} device={device} />
      <div className="checksum-heading"><h4>SHA-256 CHECKSUM</h4><button className="copy-button" onClick={copyChecksum} aria-label={copyState === 'copied' ? 'Copied SHA-256' : 'Copy SHA-256'}><CopyIcon /><span>{copyState === 'copied' ? 'Copied' : 'Copy'}</span></button></div>
      <code className="checksum" ref={checksum}>{state.release.sha256}</code>
      <p className="copy-status" role="status" aria-live="polite">{copyState === 'copied' ? 'Checksum copied.' : copyState === 'manual' ? 'Press Ctrl/Cmd+C' : ''}</p>
      <details className="verify-details"><summary>How to verify the file</summary><p>Calculate the SHA-256 of the downloaded APK and compare all 64 characters with the value above. A match means the files are identical; it does not prove an app is safe.</p><p>On macOS or Linux:</p><code className="verify-command">shasum -a 256 /path/to/download.apk</code><p>On Windows, use PowerShell:</p><code className="verify-command">Get-FileHash .\download.apk -Algorithm SHA256</code></details>
    </> : <>
      <h3 id="release-title">{state.kind === 'loading' ? 'Checking the latest build' : state.kind === 'empty' ? 'The first version is coming soon' : 'Download unavailable'}</h3>
      <p>{state.kind === 'loading' ? 'Release details will appear here.' : state.kind === 'empty' ? 'There is no APK to download yet. Check back for the first build.' : releaseErrorMessage}</p>
      <DownloadControl state={state} retry={retry} device={device} />
    </>}
  </div>;
}
