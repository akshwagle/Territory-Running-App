import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';

const release = { versionCode: 1, versionName: '0.1.0', apkUrl: '/downloads/territory-run-0.1.0.apk', sha256: 'a'.repeat(64), changelog: 'First Android shell.', publishedAt: '2026-11-11T08:00:00Z' };
afterEach(() => vi.unstubAllGlobals());

test('shows loading while the request is pending', () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  render(<App />);
  expect(screen.getByRole('status')).toHaveTextContent('Checking for the latest version');
});

test('shows an error and Retry recovers to the available release', async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, status: 200, json: async () => release });
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t load');
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('link', { name: 'Download APK' })).toHaveAttribute('href', `http://localhost:4000${release.apkUrl}`);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('shows coming soon when the API reports NO_RELEASE', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: { code: 'NO_RELEASE' } }) }));
  render(<App />);
  expect(await screen.findByText('The first version is coming soon')).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Download APK' })).not.toBeInTheDocument();
});

test('shows release details, an honest Android guide and copies the SHA-256', async () => {
  const user = userEvent.setup();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => release }));
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Version 0.1.0' })).toBeVisible();
  expect(screen.getByText(release.changelog)).toBeVisible();
  expect(screen.getByText(release.sha256)).toBeVisible();
  expect(screen.getByText(/Play Protect may warn/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Copy SHA-256' }));
  await waitFor(() => expect(copy).toHaveBeenCalledWith(release.sha256));
  expect(screen.getByText('Checksum copied.')).toBeVisible();
  copy.mockRestore();
});

test('rejects a malformed release or unexpected 404 rather than creating an unsafe download link', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...release, apkUrl: '//untrusted.example/a.apk' }) }));
  render(<App />);
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Download APK' })).not.toBeInTheDocument();
});
