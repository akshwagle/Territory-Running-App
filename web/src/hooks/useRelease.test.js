import { afterEach, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import useRelease from './useRelease.js';

const release = { versionName: '0.1.1', apkUrl: '/downloads/test.apk', sha256: 'a'.repeat(64), publishedAt: '2026-11-11T08:00:00Z', changelog: null };
afterEach(() => vi.useRealTimers());

test('a ten-second deadline aborts the request, presents an error and permits one Retry', async () => {
  vi.useFakeTimers();
  let signal;
  const fetcher = vi.fn((_url, options) => { signal = options.signal; return new Promise(() => {}); });
  vi.stubGlobal('fetch', fetcher);
  const { result } = renderHook(useRelease);
  act(() => { result.current.retry(); result.current.retry(); });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(9999));
  expect(result.current.state.kind).toBe('loading');
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(signal.aborted).toBe(true);
  expect(result.current.state.kind).toBe('error');
  let finish;
  fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  act(() => { result.current.retry(); result.current.retry(); });
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => { finish({ ok: true, status: 200, json: async () => release }); });
  expect(result.current.state).toEqual({ kind: 'release', release });
  expect(vi.getTimerCount()).toBe(0);
});

test('unmount aborts the pending fetch and removes its deadline', () => {
  vi.useFakeTimers(); let signal;
  vi.stubGlobal('fetch', vi.fn((_url, options) => { signal = options.signal; return new Promise(() => {}); }));
  const { unmount } = renderHook(useRelease);
  unmount();
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
