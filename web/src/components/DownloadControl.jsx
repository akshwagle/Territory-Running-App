import { apiOrigin } from '../hooks/useRelease.js';
import { Arrow } from './Icons.jsx';

export default function DownloadControl({ state, retry, device, compact = false, text = false }) {
  const buttonClass = `button${compact ? ' download-compact' : ''}`;
  if (state.kind === 'error') return <button className={text ? 'text-download' : `${buttonClass} button-outline`} onClick={retry} aria-label="Retry release download">Retry{!text && <Arrow />}</button>;
  if (device === 'ios') return <span className={`availability${compact ? ' download-compact' : text ? ' text-availability' : ''}`}>Android only for now</span>;
  if (state.kind === 'release') return <a className={text ? 'text-download' : `${buttonClass} button-primary`} href={`${apiOrigin}${state.release.apkUrl}`}>
    {compact ? 'Download' : 'Download APK'}{!text && <Arrow />}
  </a>;
  return <button className={text ? 'text-download' : `${buttonClass} button-outline`} disabled data-loading={state.kind === 'loading'}>{state.kind === 'loading' ? compact ? 'Loading…' : 'Checking release…' : 'Coming soon'}</button>;
}
