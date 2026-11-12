import { afterEach, expect, test, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { TestObserver } from '../test-setup.js';
import TerritoryMap from './TerritoryMap.jsx';

const preference = vi.hoisted(() => ({ reduced: false }));
vi.mock('motion/react', () => ({ useReducedMotion: () => preference.reduced }));
afterEach(() => { vi.useRealTimers(); preference.reduced = false; });
const filled = (container, color) => [...container.querySelectorAll(`g[fill="var(--color-${color})"] polygon`)].filter((p) => p.getAttribute('opacity') === '1').length;

test('six route cells, rival arrival and takeover progress in order; hidden maps pause', async () => {
  vi.useFakeTimers();
  const { container, unmount } = render(<TerritoryMap />);
  await act(async () => {});
  const figure = container.querySelector('figure');
  const observer = TestObserver.instances.find((item) => item.targets.has(figure));
  expect(filled(container, 'pine')).toBe(0);
  act(() => vi.advanceTimersByTime(350));
  expect(filled(container, 'pine')).toBe(1);
  act(() => vi.advanceTimersByTime(5 * 350));
  expect(filled(container, 'pine')).toBe(6);
  expect(filled(container, 'clay')).toBe(0);
  act(() => vi.advanceTimersByTime(350));
  expect(filled(container, 'clay')).toBe(1);
  act(() => vi.advanceTimersByTime(350));
  expect(filled(container, 'clay')).toBe(2);
  act(() => observer.emit(figure, false));
  act(() => vi.advanceTimersByTime(10000));
  expect(filled(container, 'clay')).toBe(2);
  expect(vi.getTimerCount()).toBe(0);
  act(() => observer.emit(figure, true));
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test('background tabs stop the loop and resume without catching up', async () => {
  vi.useFakeTimers();
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const { container } = render(<TerritoryMap />);
  await act(async () => {});
  act(() => vi.advanceTimersByTime(350));
  hidden.mockReturnValue(true);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  act(() => vi.advanceTimersByTime(10000));
  expect(filled(container, 'pine')).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
  hidden.mockReturnValue(false);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  act(() => vi.advanceTimersByTime(350));
  expect(filled(container, 'pine')).toBe(2);
});

test('reduced motion is the static final frame and schedules no loop', async () => {
  preference.reduced = true;
  vi.useFakeTimers();
  const { container } = render(<TerritoryMap />);
  await act(async () => {});
  expect(filled(container, 'pine')).toBe(6);
  expect(filled(container, 'clay')).toBe(2);
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(20000));
  expect(filled(container, 'clay')).toBe(2);
});
