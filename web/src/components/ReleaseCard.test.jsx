import { afterEach, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReleaseCard from './ReleaseCard.jsx';

const state = { kind: 'release', release: { versionName: '0.1.1', apkUrl: '/downloads/test.apk', publishedAt: '2026-11-11T08:00:00Z', sha256: 'a'.repeat(64), changelog: null } };
afterEach(() => vi.useRealTimers());

test('Copied label and polite confirmation last exactly two seconds', async () => {
  userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  vi.useFakeTimers();
  render(<ReleaseCard state={state} retry={() => {}} device="desktop" />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy SHA-256' })));
  expect(screen.getByRole('button', { name: 'Copied SHA-256' })).toHaveTextContent('Copied');
  expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  expect(screen.getByRole('status')).toHaveTextContent('Checksum copied.');
  act(() => vi.advanceTimersByTime(1999));
  expect(screen.getByRole('button', { name: 'Copied SHA-256' })).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('button', { name: 'Copy SHA-256' })).toHaveTextContent('Copy');
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

test('clipboard failure selects the entire checksum and announces the manual shortcut', async () => {
  userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
  render(<ReleaseCard state={state} retry={() => {}} device="desktop" />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy SHA-256' })));
  expect(window.getSelection().toString()).toBe(state.release.sha256);
  expect(screen.getByRole('status')).toHaveTextContent('Press Ctrl/Cmd+C');
});
