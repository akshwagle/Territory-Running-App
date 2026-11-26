import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { applyTheme, readTheme, resolveTheme, saveTheme, THEME_KEY, watchTheme } from './theme.js';
import { syncSystemBars } from './android.js';

const media = light => query => ({ matches: light && query.includes('light'), addEventListener: vi.fn(), removeEventListener: vi.fn() });
const memory = () => { const data = {}; return { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, data }; };
beforeEach(() => { delete document.documentElement.dataset.theme; delete document.documentElement.dataset.themeChoice; });

it('UI-04 System follows prefers-color-scheme; Light and Dark override it', () => {
  expect(resolveTheme('system', media(true))).toBe('light');
  expect(resolveTheme('system', media(false))).toBe('dark');
  expect(resolveTheme('dark', media(true))).toBe('dark');
  expect(resolveTheme('light', media(false))).toBe('light');
});

it('UI-04 the choice defaults to System, is stored locally and survives bad values', () => {
  const storage = memory();
  expect(readTheme(storage)).toBe('system');
  expect(saveTheme('dark', { storage, media: media(true) })).toBe('dark');
  expect(storage.data[THEME_KEY]).toBe('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(readTheme(storage)).toBe('dark');
  saveTheme('neon', { storage, media: media(true) });
  expect(storage.data[THEME_KEY]).toBe('dark');
  expect(readTheme({ getItem: () => { throw new Error('blocked'); } })).toBe('system');
});

it('UI-04 a phone setting change re-applies only while the choice is System', () => {
  const storage = memory(), listeners = [];
  const m = () => ({ matches: false, addEventListener: (_, fn) => listeners.push(fn), removeEventListener: vi.fn() });
  const seen = vi.fn(); watchTheme(seen, { media: m, storage });
  listeners[0](); expect(seen).toHaveBeenLastCalledWith('dark');
  storage.setItem(THEME_KEY, 'light'); listeners[0](); expect(seen).toHaveBeenLastCalledWith('light');
});

it('UI-04 the inline script in index.html applies the same rule before the app loads', () => {
  const script = /<script>(.*?)<\/script>/s.exec(readFileSync(resolve(process.cwd(), 'index.html'), 'utf8'))[1];
  const run = (choice, light) => {
    localStorage.clear(); if (choice) localStorage.setItem(THEME_KEY, choice);
    globalThis.matchMedia = media(light); new Function(script)();
    return document.documentElement.dataset.theme;
  };
  expect([run(null, true), run(null, false), run('dark', true), run('light', false), run('bogus', false)]).toEqual(['light', 'dark', 'dark', 'light', 'dark']);
  for (const choice of ['system', 'light', 'dark']) for (const light of [true, false]) {
    applyTheme(choice, { media: media(light) });
    expect(document.documentElement.dataset.theme).toBe(run(choice === 'system' ? null : choice, light));
  }
  delete globalThis.matchMedia; localStorage.clear();
});

it('UI-04 system bar icons follow the resolved theme on Android only', async () => {
  const bars = { setStyle: vi.fn() };
  await syncSystemBars('light', { platform: 'android', bars }); expect(bars.setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' });
  await syncSystemBars('dark', { platform: 'android', bars }); expect(bars.setStyle).toHaveBeenLastCalledWith({ style: 'DARK' });
  await syncSystemBars('dark', { platform: 'web', bars }); expect(bars.setStyle).toHaveBeenCalledTimes(2);
});
