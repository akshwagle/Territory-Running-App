import { expect, it, vi } from 'vitest';
import { watchPlatform } from './android.js';

it('UI-03 native IME events reveal the focused field and restore the layout without subtracting height twice', async () => {
  const listeners = {}, remove = vi.fn(), bars = { setStyle: vi.fn() };
  const keyboard = { addListener: async (event, callback) => { listeners[event] = callback; return { remove }; } };
  const field = document.createElement('input'); document.body.append(field);
  field.scrollIntoView = vi.fn(); field.focus();
  const stop = await watchPlatform({ platform: 'android', bars, keyboard, schedule: fn => fn() });
  expect(bars.setStyle).toHaveBeenCalledWith({ style: 'LIGHT' });
  listeners.keyboardDidShow({ keyboardHeight: 320 });
  expect(document.documentElement.dataset.keyboardOpen).toBe('');
  expect(field.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'instant' });
  listeners.keyboardDidHide(); expect(document.documentElement.dataset.keyboardOpen).toBeUndefined();
  stop(); expect(remove).toHaveBeenCalledTimes(2); field.remove();
});

it('browser previews do not invoke native system bar or keyboard APIs', async () => {
  const bars = { setStyle: vi.fn() }, keyboard = { addListener: vi.fn() };
  (await watchPlatform({ platform: 'web', bars, keyboard }))();
  expect(bars.setStyle).not.toHaveBeenCalled(); expect(keyboard.addListener).not.toHaveBeenCalled();
});
