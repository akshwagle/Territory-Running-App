import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export const ROOT_ROUTES = new Set(['/', '/home', '/you', '/settings']);
export function parentRoute(path) {
  if (path === '/you/privacy') return '/you';
  if (path === '/you/consent') return '/you/privacy';
  if (path.startsWith('/settings/')) return '/settings';
  if (path === '/forgot' || path === '/reset') return '/login';
  return '/';
}
export async function watchBack({ onBack, platform = Capacitor.getPlatform(), plugin = App }) {
  if (platform !== 'android') return () => {};
  const handle = await plugin.addListener('backButton', onBack);
  return () => handle.remove();
}
export const exitApp = () => App.exitApp();
