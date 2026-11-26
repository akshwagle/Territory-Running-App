import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/context.jsx';
import { HomePage, todayStatus } from './feed-pages.jsx';

const user = { displayName: 'Mira', avatarId: 1, avatarColor: '#1F5A46' };
const series = Array.from({ length: 7 }, (_, i) => ({ start: new Date(Date.UTC(2026, 10, 20 + i)).toISOString(), runs: 0, distanceM: i * 100, durationS: 0 }));
function mount(request) {
  const state = { status: 'authenticated', user }, auth = { api: { request }, getSnapshot: () => state, subscribe: () => () => {} };
  return render(<AuthContext.Provider value={auth}><MemoryRouter><HomePage/></MemoryRouter></AuthContext.Provider>);
}
const route = (map) => vi.fn(async path => { for (const [k, v] of Object.entries(map)) if (path.includes(k)) { if (v instanceof Error) throw v; return v; } return {}; });

describe('Home', () => {
  it('shows hero, territory snapshot and weekly chart from real endpoints', async () => {
    const now = new Date().toISOString();
    mount(route({
      '/territory/me': { count: 12, nextCursor: null, hexes: [{ h3: 'a', claimedAt: now, onCooldown: true }, { h3: 'b', claimedAt: '2020-01-01T00:00:00Z', onCooldown: false }] },
      '/stats/overview': { bucket: 'day', series, totals: { runs: 2, distanceM: 4200, durationS: 1500 }, streak: { current: 3, best: 3, lastRunOn: null } },
      '/profile': { profile: { preferredUnits: 'km' } },
      '/community/feed': { runs: [], nextCursor: null },
    }));
    expect(screen.getByRole('link', { name: 'Start run' })).toHaveAttribute('href', '/run');
    expect(await screen.findByText('Hexes held')).toBeVisible();
    expect(screen.getByText('Gained this week')).toBeVisible();
    expect(await screen.findByRole('img', { name: /Distance per day/ })).toBeVisible();
    expect(await screen.findByText(/Run today to keep your 3-day streak/)).toBeVisible();
  });
  it('shows empty and error states without crashing', async () => {
    mount(route({ '/territory/me': { count: 0, hexes: [], nextCursor: null }, '/stats/overview': new Error('Offline'), '/community/feed': { runs: [], nextCursor: null } }));
    expect(await screen.findByText('No territory yet')).toBeVisible();
    expect(await screen.findAllByRole('button', { name: 'Try again' })).not.toHaveLength(0);
  });
  it('todayStatus words the streak kindly', () => {
    const now = new Date(2026, 10, 26, 12);
    expect(todayStatus({ current: 0, lastRunOn: null }, now)).toBe('No run yet today.');
    expect(todayStatus({ current: 4, lastRunOn: '2026-11-26' }, now)).toBe('You ran today. 4-day streak.');
    expect(todayStatus(null, now)).toBe('');
  });
});
