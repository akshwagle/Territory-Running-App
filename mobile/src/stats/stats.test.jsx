import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { AuthContext } from '../auth/context.jsx';
import { ApiError } from '../auth/errors.js';
import { session } from '../auth/test-helpers.js';
import { StatsPage, newlyEarned } from './pages.jsx';
import { barGeometry, historyQuery, shareText } from './chart.js';
import { canShare, shareSummary } from './share.js';
import { distanceLabel, timeLabel, paceLabel } from '../runs/format.js';

function mount(routes) {
  const request = vi.fn(async (path, opts = {}) => {
    for (const [key, value] of Object.entries(routes)) if (`${opts.method || 'GET'} ${path}`.startsWith(key)) return typeof value === 'function' ? value(path) : value;
    throw new ApiError('NOT_FOUND', 'Unexpected request.', 404);
  });
  const snap = { status: 'authenticated', user: session().user, message: '' };
  const auth = { getSnapshot: () => snap, subscribe: () => () => {}, api: { request } };
  render(<AuthContext.Provider value={auth}><MemoryRouter><StatsPage/></MemoryRouter></AuthContext.Provider>);
  return { request, user: userEvent.setup() };
}
const days = Array.from({ length: 7 }, (_, i) => ({ start: new Date(Date.UTC(2026, 10, 20 + i)).toISOString(), runs: i === 6 ? 1 : 0, distanceM: i === 6 ? 5000 : 0, durationS: i === 6 ? 1500 : 0 }));
const overview = (extra = {}) => ({ range: 'week', bucket: 'day', series: days, totals: { runs: 1, distanceM: 5000, durationS: 1500, paceSecondsPerKm: 300 }, lifetime: { runs: 4, distanceM: 20000, durationS: 6000 }, streak: { current: 2, best: 5 }, ...extra });

it('stats page shows totals, chart and streak from the API', async () => {
  mount({ 'GET /api/me/profile': { profile: { preferredUnits: 'km' } }, 'GET /api/me/stats/overview': overview() });
  expect(await screen.findByText('5.00 km')).toBeVisible();
  expect(screen.getByRole('img', { name: /Distance per day/ })).toBeVisible();
  expect(screen.getByText('5 days')).toBeVisible();
});

it('stats empty state, error retry and range switch', async () => {
  let fail = true;
  const { user, request } = mount({ 'GET /api/me/profile': { profile: { preferredUnits: 'km' } }, 'GET /api/me/stats/overview': path => { if (fail) { fail = false; throw new ApiError('NETWORK_UNAVAILABLE', 'Cannot reach the server.'); } return overview({ lifetime: { runs: 0, distanceM: 0, durationS: 0 }, range: path.includes('year') ? 'year' : 'week' }); } });
  expect(await screen.findByText('Cannot reach the server.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Your stats start with a run')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '12 months' }));
  expect(request).toHaveBeenCalledWith('/api/me/stats/overview?range=year');
});

it('records and achievements tabs render real rows and empty states', async () => {
  const rec = { runId: '00000000-0000-4000-8000-000000000001', startedAt: '2026-11-01T10:00:00Z', distanceM: 10500, durationS: 3600 };
  const { user } = mount({ 'GET /api/me/profile': { profile: { preferredUnits: 'mi' } }, 'GET /api/me/stats/overview': overview(),
    'GET /api/me/stats/records': { longestDistance: rec, longestDuration: rec, fastest: { '1k': rec, '5k': rec, '10k': rec, half: null }, bestWeek: null, mostCellsInRun: null, bestStreakDays: 3 },
    'GET /api/me/stats/achievements': { badges: [{ id: 'a', name: 'First steps', description: null, unit: 'runs', threshold: 5, progress: 2, earned: false }] } });
  await user.click(screen.getByRole('tab', { name: 'Records' }));
  expect(await screen.findByText('Longest run')).toBeVisible();
  expect(screen.getByText(/Half marathon or more/)).toBeVisible();
  await user.click(screen.getByRole('tab', { name: 'Badges' }));
  expect(await screen.findByText('First steps')).toBeVisible();
  expect(screen.getByText('2 / 5 runs')).toBeVisible();
});

it('chart geometry scales bars, history filters map to query and share text is plain', () => {
  const bars = barGeometry(days);
  expect(bars).toHaveLength(7); expect(bars[6].height).toBe(140); expect(bars[0].height).toBe(0);
  const q = historyQuery({ period: '7d', distance: 'mid', status: 'VALID' }, new Date('2026-11-26T00:00:00Z'));
  expect(q.get('from')).toBe('2026-11-19T00:00:00.000Z'); expect(q.get('minDistanceM')).toBe('5000'); expect(q.get('maxDistanceM')).toBe('9999'); expect(q.get('status')).toBe('VALID');
  expect(historyQuery({}).get('from')).toBeNull();
  expect(shareText({ startedAt: '2026-11-01T10:00:00Z', distanceM: 5000, durationS: 1500 }, 'km', { distanceLabel, timeLabel, paceLabel })).toContain('5.00 km in 25:00 (5:00 /km)');
});

it('share uses the existing Capacitor plugin on Android and ignores user cancel', async () => {
  const share = { share: vi.fn().mockResolvedValue({}), canShare: vi.fn().mockResolvedValue({ value: true }) };
  expect(await canShare({ platform: 'android', share })).toBe(true);
  expect(await shareSummary('hi', { platform: 'android', share })).toBe(true);
  share.share.mockRejectedValueOnce(Object.assign(new Error('Share canceled'), { name: 'Error' }));
  expect(await shareSummary('hi', { platform: 'android', share })).toBe(false);
  share.share.mockRejectedValueOnce(new Error('boom'));
  await expect(shareSummary('hi', { platform: 'android', share })).rejects.toThrow('boom');
  expect(await canShare({ platform: 'web' })).toBe(false);
});

it('achievements celebrate only newly earned badges, once, and can be dismissed', async () => {
  const badges = [{ id: 'a', name: 'First steps', description: null, unit: 'runs', threshold: 1, progress: 1, earned: true }, { id: 'b', name: 'Ten runs', description: null, unit: 'runs', threshold: 10, progress: 3, earned: false }];
  expect(newlyEarned(badges, null)).toEqual([]);
  expect(newlyEarned(badges, ['a'])).toEqual([]);
  expect(newlyEarned(badges, [])).toHaveLength(1);
  localStorage.setItem('tr.badges.seen', '[]');
  const { user } = mount({ 'GET /api/me/profile': { profile: { preferredUnits: 'km' } }, 'GET /api/me/stats/overview': overview(), 'GET /api/me/stats/achievements': { badges } });
  await user.click(screen.getByRole('tab', { name: 'Badges' }));
  expect(await screen.findByText('New badge: First steps')).toBeVisible();
  expect(screen.getByText('Earned (1)')).toBeVisible();
  expect(screen.getByText('3 / 10 runs')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByText('New badge: First steps')).toBeNull();
  expect(JSON.parse(localStorage.getItem('tr.badges.seen'))).toEqual(['a']);
  localStorage.clear();
});
