// Haptic-style feedback. navigator.vibrate is a silent no-op where the WebView
// or the manifest does not allow it (the app declares no VIBRATE permission),
// so this never throws and never blocks an action.
const PATTERNS = { light: 8, confirm: [14, 40, 14] };
export function tap(kind = 'light') {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate(PATTERNS[kind] ?? PATTERNS.light);
  } catch { /* feedback is optional */ }
}
