import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
// Hide only after the first usable React screen (including an offline skeleton)
// has painted. Do not wait on authentication/network and hold a native blank view.
export function firstScreenReady({ platform = Capacitor.getPlatform(), plugin = SplashScreen,
  frame = requestAnimationFrame, cancel = cancelAnimationFrame } = {}) {
  if (platform !== 'android') return () => {};
  let second, stopped = false;
  const first = frame(() => { second = frame(() => { if (!stopped) plugin.hide().catch(() => {}); }); });
  return () => { stopped = true; cancel(first); if (second !== undefined) cancel(second); };
}
