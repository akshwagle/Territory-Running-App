import { expect, test, vi } from 'vitest';
import { loadMotion, shouldLoadMotion } from './usePresentationMotion.js';

test('phones skip the animation feature chunk entirely', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation((media) => ({ matches: media === '(min-width: 768px)' ? false : false }));
  expect(shouldLoadMotion()).toBe(false);
  expect(await loadMotion()).toEqual({});
});

test('reduced motion skips the feature chunk even on a wide screen', async () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true });
  expect(shouldLoadMotion()).toBe(false);
  expect(await loadMotion()).toEqual({});
});

test('wide screens without a reduced-motion preference receive domAnimation', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation((media) => ({ matches: media === '(min-width: 768px)' }));
  expect(shouldLoadMotion()).toBe(true);
  const features = await loadMotion();
  expect(features.animation).toBeDefined();
  expect(features.inView).toBeDefined();
  expect(typeof features.renderer).toBe('function');
});


test('Android skips the feature chunk in landscape too', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 15)');
  vi.spyOn(window, 'matchMedia').mockImplementation((media) => ({ matches: media === '(min-width: 768px)' }));
  expect(shouldLoadMotion()).toBe(false);
  expect(await loadMotion()).toEqual({});
});
