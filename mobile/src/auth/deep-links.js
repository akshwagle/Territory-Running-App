import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export function parseAuthLink(raw, webOrigin) {
  try {
    if (typeof raw !== 'string' || raw.length > 8192) return null;
    const url = new URL(raw);
    const action = url.protocol === 'territoryrun:' ? url.hostname :
      url.protocol === 'https:' && url.origin === webOrigin ? url.pathname.slice(1) : null;
    if (!['verify', 'reset'].includes(action) || url.username || url.password || url.port || url.hash ||
      (url.protocol === 'territoryrun:' && !['', '/'].includes(url.pathname))) return null;
    const token = url.searchParams.get('token');
    const valid = /^[\w-]{42}[AEIMQUYcgkosw048]$/.test(token || '') && [...url.searchParams.keys()].length === 1;
    return { action, token: valid ? token : null, error: valid ? null : 'This link is incomplete or invalid. Request a new email and open its link.' };
  } catch { return null; }
}

export async function watchNativeAuth({ onLink, onResume, plugin = App, platform = Capacitor.getPlatform() }) {
  if (platform !== 'android') return () => {};
  const handles = [];
  try {
    handles.push(await plugin.addListener('appUrlOpen', event => onLink(event.url)));
    handles.push(await plugin.addListener('appStateChange', event => { if (event.isActive) onResume(); }));
    const launch = await plugin.getLaunchUrl();
    if (launch?.url) onLink(launch.url);
    return () => { for (const handle of handles) handle.remove(); };
  } catch {
    for (const handle of handles) handle.remove();
    throw Error('App links could not be initialized. Close and reopen the app.');
  }
}
