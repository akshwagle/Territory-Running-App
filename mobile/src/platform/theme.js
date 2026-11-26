// Theme choice: 'system' (default, follows prefers-color-scheme), 'light' or 'dark'.
// Stored in localStorage (a display preference, not a secret). index.html applies the
// same rule synchronously before first paint; keep both in step (theme.test.js checks it).
export const THEME_KEY = 'tr.theme';
export const THEME_CHOICES = ['system', 'light', 'dark'];

export function readTheme(storage = globalThis.localStorage) {
  try { const value = storage?.getItem(THEME_KEY); return THEME_CHOICES.includes(value) ? value : 'system'; } catch { return 'system'; }
}

export function resolveTheme(choice, media = globalThis.matchMedia) {
  if (choice === 'light' || choice === 'dark') return choice;
  try { return media?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch { return 'dark'; }
}

// Applies the choice to <html> (data-theme is the resolved value CSS reads) and tells listeners.
export function applyTheme(choice = readTheme(), { doc = document, media = globalThis.matchMedia } = {}) {
  const resolved = resolveTheme(choice, media);
  doc.documentElement.dataset.theme = resolved;
  doc.documentElement.dataset.themeChoice = choice;
  return resolved;
}

export function saveTheme(choice, { storage = globalThis.localStorage, ...options } = {}) {
  if (!THEME_CHOICES.includes(choice)) return applyTheme(readTheme(storage), options);
  try { storage?.setItem(THEME_KEY, choice); } catch { /* The choice still applies for this session. */ }
  return applyTheme(choice, options);
}

// Re-applies on phone setting changes while the choice is System. onChange gets the resolved theme.
export function watchTheme(onChange, { doc = document, media = globalThis.matchMedia, storage = globalThis.localStorage } = {}) {
  let query;
  try { query = media?.('(prefers-color-scheme: light)'); } catch { query = null; }
  const update = () => { onChange(applyTheme(readTheme(storage), { doc, media })); };
  query?.addEventListener?.('change', update);
  return () => query?.removeEventListener?.('change', update);
}
