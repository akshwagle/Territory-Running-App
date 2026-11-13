import { expect, it, vi } from 'vitest';
import { firstScreenReady } from './splash.js';
it('splash hides only after the first screen has painted, without waiting for a network request', async () => {
  const frames = [], plugin = { hide: vi.fn(async () => {}) };
  const stop = firstScreenReady({ platform: 'android', plugin, frame: callback => frames.push(callback), cancel: vi.fn() });
  expect(plugin.hide).not.toHaveBeenCalled(); frames.shift()(); expect(plugin.hide).not.toHaveBeenCalled(); frames.shift()();
  expect(plugin.hide).toHaveBeenCalledOnce(); stop();
});
it('unmount before the second frame cancels hiding; browser previews do not invoke the native plugin', () => {
  const frames = [], plugin = { hide: vi.fn() }, cancel = vi.fn();
  const stop = firstScreenReady({ platform: 'android', plugin, frame: callback => frames.push(callback), cancel });
  frames.shift()(); stop(); frames.shift()(); expect(plugin.hide).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledTimes(2);
  firstScreenReady({ platform: 'web', plugin })(); expect(plugin.hide).not.toHaveBeenCalled();
});
