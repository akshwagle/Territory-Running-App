import { expect, test, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';
import { apiOrigin } from './hooks/useRelease.js';
import { TestObserver } from './test-setup.js';

const release = { versionCode: 2, versionName: '0.1.1', apkUrl: '/downloads/territory-run-0.1.1.apk', sha256: 'a'.repeat(64), changelog: 'First Android shell.', publishedAt: '2026-11-11T08:00:00Z' };
const ready = (extra = {}) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...release, ...extra }) }));
const device = (value) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(value);
const apkLinks = () => screen.queryAllByRole('link').filter((link) => link.href.endsWith('.apk'));

test('shows loading in every download placement without an APK link', () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  render(<App />);
  expect(screen.getByRole('status')).toHaveTextContent('Checking for the latest version');
  expect(screen.getAllByRole('button', { name: /Checking release…|Loading…/ })).toHaveLength(4);
  expect(apkLinks()).toHaveLength(0);
});

test('shows an error and Retry recovers every download placement', async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, status: 200, json: async () => release });
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('The site could not reach the server. Try again in a moment.');
  expect(apkLinks()).toHaveLength(0);
  await userEvent.click(screen.getAllByRole('button', { name: 'Retry release download' })[0]);
  await screen.findByRole('heading', { name: 'Version 0.1.1' });
  expect(apkLinks()).toHaveLength(4);
  for (const link of apkLinks()) expect(link).toHaveAttribute('href', `${apiOrigin}${release.apkUrl}`);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('NO_RELEASE disables all download placements with Coming soon', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: { code: 'NO_RELEASE' } }) }));
  render(<App />);
  expect(await screen.findByText('The first version is coming soon')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Coming soon' })).toHaveLength(4);
  expect(apkLinks()).toHaveLength(0);
});

test('shows real release details and copies exactly the supplied SHA-256', async () => {
  const user = userEvent.setup(); ready();
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  render(<App />);
  await screen.findByRole('heading', { name: 'Version 0.1.1' });
  expect(screen.getByText(release.changelog)).toBeInTheDocument();
  expect(screen.getByText(release.sha256)).toBeInTheDocument();
  expect(screen.getByText('Android 7.0+ · API 24')).toBeInTheDocument();
  expect(screen.queryByText('APK size')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Copy SHA-256' }));
  await waitFor(() => expect(copy).toHaveBeenCalledWith(release.sha256));
  expect(screen.getByText('Checksum copied.')).toBeInTheDocument();
  expect(screen.getByText('Open this page on your Android phone to install.')).toBeInTheDocument();
});

test('copy failure leaves a selectable checksum and manual fallback', async () => {
  const user = userEvent.setup(); ready();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
  render(<App />);
  await screen.findByRole('heading', { name: 'Version 0.1.1' });
  await user.click(screen.getByRole('button', { name: 'Copy SHA-256' }));
  expect(await screen.findByText('Press Ctrl/Cmd+C')).toBeInTheDocument();
  expect(screen.getByText(release.sha256)).toBeInTheDocument();
});

test.each([
  { ...release, apkUrl: '//untrusted.example/a.apk' },
  { ...release, sha256: 'invalid' },
  { ...release, publishedAt: 'invalid' },
])('rejects malformed release data rather than creating unsafe links (%j)', async (data) => {
  ready(data); render(<App />);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(apkLinks()).toHaveLength(0);
});

test('unexpected 404 is an error, not Coming soon', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: { code: 'NOT_FOUND' } }) }));
  render(<App />);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Coming soon' })).not.toBeInTheDocument();
});

test('iPhone has Android-only labels and no APK links', async () => {
  device('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'); ready();
  render(<App />);
  await screen.findByRole('heading', { name: 'Version 0.1.1' });
  expect(screen.getAllByText('Android only for now')).toHaveLength(4);
  expect(apkLinks()).toHaveLength(0);
  expect(screen.queryByText(/Open this page on your Android/)).not.toBeInTheDocument();
});

test('Android sticky download appears only after hero passes and stays hidden beyond install', async () => {
  device('Mozilla/5.0 (Linux; Android 15; Pixel 9)'); ready();
  const { container } = render(<App />);
  await screen.findByRole('heading', { name: 'Version 0.1.1' });
  const hero = container.querySelector('.hero-download');
  const install = container.querySelector('#install');
  const observer = TestObserver.instances.find((instance) => instance.targets.has(hero));
  let heroRect = { top: -60, bottom: -12 };
  let installRect = { top: 2000, bottom: 4000 };
  vi.spyOn(hero, 'getBoundingClientRect').mockImplementation(() => heroRect);
  vi.spyOn(install, 'getBoundingClientRect').mockImplementation(() => installRect);
  act(() => observer.emit(hero, false));
  expect(screen.getByRole('complementary', { name: 'Android download' })).toBeInTheDocument();
  expect(within(screen.getByRole('complementary')).getByRole('link', { name: 'Download' })).toHaveAttribute('href', `${apiOrigin}${release.apkUrl}`);
  installRect = { top: 100, bottom: 2000 };
  act(() => observer.emit(install, true));
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  installRect = { top: -1000, bottom: -1 };
  act(() => observer.emit(install, false));
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  // A fast anchor jump may leave both observed elements non-intersecting.
  installRect = { top: 2000, bottom: 4000 };
  act(() => window.dispatchEvent(new Event('scroll')));
  await waitFor(() => expect(screen.getByRole('complementary')).toBeInTheDocument());
  heroRect = { top: 400, bottom: 450 };
  act(() => observer.emit(hero, true));
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  expect(screen.queryByText(/Open this page on your Android/)).not.toBeInTheDocument();
});

test('install guide, roadmap and native FAQ describe only the early shell', async () => {
  ready(); render(<App />);
  await screen.findByRole('heading', { name: 'Version 0.1.1' });
  expect(screen.getAllByText('In development')).toHaveLength(5);
  expect(screen.getByText(/Only the Android download is available today/)).toBeInTheDocument();
  expect(screen.getByText(/Play Protect may warn because/)).toBeInTheDocument();
  const summary = screen.getByText('What permissions does it need?');
  expect(summary.tagName).toBe('SUMMARY');
  await userEvent.click(summary);
  expect(summary.parentElement).toHaveAttribute('open');
  await waitFor(() => expect(screen.getByText(/INTERNET is the only Android platform permission/)).toBeVisible());
  expect(within(screen.getByRole('region', { name: /INSTALL THE/ })).getAllByRole('listitem')).toHaveLength(4);
});

test('optional size is shown only when provided by the API', async () => {
  ready({ fileSizeBytes: 4194304 }); render(<App />);
  expect(await screen.findByText('4.0 MB')).toBeInTheDocument();
});


test('iPhone can Retry a release error without receiving an APK link', async () => {
  device('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, status: 200, json: async () => release }));
  render(<App />);
  await screen.findByRole('alert');
  await userEvent.click(screen.getAllByRole('button', { name: 'Retry release download' })[0]);
  await screen.findByRole('heading', { name: 'Version 0.1.1' });
  expect(apkLinks()).toHaveLength(0);
  expect(screen.getAllByText('Android only for now')).toHaveLength(4);
});


test('footer and hero footnote contain only current product copy and in-page navigation', async () => {
  ready(); const { container } = render(<App />);
  await screen.findByRole('heading', { name: 'Version 0.1.1' });
  const footer = screen.getByRole('contentinfo');
  expect(footer.textContent).toBe('TERRITORY RUN© 2026 Territory RunDownload APKHow it worksInstallFAQBack to top');
  expect(container.querySelector('.hero-footnote').textContent).toBe('ANDROID / EARLY ACCESS');
  for (const link of screen.getAllByRole('link')) {
    const href = link.getAttribute('href');
    expect(href.startsWith('#') || href.startsWith(`${apiOrigin}/downloads/`)).toBe(true);
  }
});

test('skip link is the first focusable element and points to the main landmark', async () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  render(<App />);
  const skip = screen.getByRole('link', { name: 'Skip to content' });
  await userEvent.tab();
  expect(skip).toHaveFocus();
  expect(skip).toHaveAttribute('href', '#main');
  expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
});

test('install troubleshooting opens the warning question without leaving the page', async () => {
  ready(); render(<App />);
  await screen.findByRole('heading', { name: 'Version 0.1.1' });
  await userEvent.click(screen.getByRole('link', { name: 'Read about the Android warning' }));
  expect(document.getElementById('android-warning')).toHaveAttribute('open');
});
