import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { AuthContext } from '../auth/context.jsx';
import { ApiError } from '../auth/errors.js';
import { session } from '../auth/test-helpers.js';
import { CommunityPage } from './community-pages.jsx';
import { HomePage } from './feed-pages.jsx';

const runner = (n, extra = {}) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, displayName: `Runner ${n}`, avatarId: 1, avatarColor: '#1F5A46', canOpen: true, ...extra });
function mount(routes, element = <CommunityPage/>) {
  const request = vi.fn(async (path, opts = {}) => {
    for (const [key, value] of Object.entries(routes)) if (`${opts.method || 'GET'} ${path}`.startsWith(key)) return typeof value === 'function' ? value(path, opts) : value;
    throw new ApiError('NOT_FOUND', 'Unexpected request.', 404);
  });
  const snap = { status: 'authenticated', user: session().user, message: '' };
  const auth = { getSnapshot: () => snap, subscribe: () => () => {}, api: { request } };
  render(<AuthContext.Provider value={auth}><MemoryRouter>{element}</MemoryRouter></AuthContext.Provider>);
  return { request, user: userEvent.setup() };
}
const board = (extra = {}) => ({ metric: 'hexes', period: 'all', scope: 'global', season: null, entries: [], total: 0, me: null, optedIn: true, ...extra });

it('leaderboard shows real entries, my rank and no sample content', async () => {
  mount({ 'GET /api/community/leaderboard': board({ entries: [{ rank: 1, value: 12, isMe: false, ...runner(1) }, { rank: 2, value: 3, isMe: true, ...runner(2) }], me: { rank: 2, value: 3 } }) });
  expect(await screen.findByText('Runner 1')).toBeVisible();
  expect(screen.getByText('Your rank: #2 · 3')).toBeVisible();
  expect(screen.queryByText(/Sample/)).toBeNull();
});

it('leaderboard empty state, opt-out hint and error retry are honest', async () => {
  let fail = true;
  const { user } = mount({ 'GET /api/community/leaderboard': () => { if (fail) { fail = false; throw new ApiError('NETWORK_UNAVAILABLE', 'Cannot reach the server.'); } return board({ optedIn: false }); } });
  expect(await screen.findByText('Cannot reach the server.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('The board is open')).toBeVisible();
  expect(screen.getByText(/Appear on leaderboards/)).toBeVisible();
});

it('changing metric and scope requests the matching query', async () => {
  const { request, user } = mount({ 'GET /api/community/leaderboard': board() });
  await screen.findByText('The board is open');
  await user.click(screen.getByRole('button', { name: 'Distance' })); await user.click(screen.getByRole('button', { name: 'Following' }));
  await waitFor(() => expect(request).toHaveBeenLastCalledWith('/api/community/leaderboard?metric=distance&period=week&scope=following&limit=25'));
});

it('runners tab searches and follows, then lists nothing-yet states', async () => {
  const found = runner(3, { following: false });
  const { request, user } = mount({ 'GET /api/me/following': { count: 0, users: [], nextCursor: null }, 'GET /api/community/search': { users: [found] }, 'PUT /api/users/': { following: true }, 'GET /api/community/leaderboard': board() });
  await user.click(screen.getByRole('button', { name: 'Runners' }));
  expect(await screen.findByText('Not following anyone')).toBeVisible();
  await user.type(screen.getByLabelText('Find runners by name'), 'Runner'); await user.click(screen.getByRole('button', { name: 'Search' }));
  await user.click(await screen.findByRole('button', { name: 'Follow Runner 3' }));
  expect(await screen.findByRole('button', { name: 'Unfollow Runner 3' })).toBeVisible();
  expect(request).toHaveBeenCalledWith(`/api/users/${found.id}/follow`, { method: 'PUT' });
});

it('teams tab creates a team when you have none', async () => {
  let team = null;
  const { request, user } = mount({
    'GET /api/teams/me/members': { members: [] }, 'GET /api/teams/me': () => ({ team }), 'GET /api/community/team-leaderboard': { teams: [] }, 'GET /api/community/leaderboard': board(),
    'POST /api/teams': () => { team = { id: 't1', name: 'Dawn Crew', colorHex: '#1F5A46', role: 'CAPTAIN', memberCount: 1, maxMembers: 50, inviteCode: 'ABCDEFGHJK' }; return { team }; },
  });
  await user.click(screen.getByRole('button', { name: 'Teams' }));
  expect(await screen.findByText('Run with a team')).toBeVisible();
  await user.type(screen.getByLabelText('Team name'), 'Dawn Crew'); await user.click(screen.getByRole('button', { name: 'Create team' }));
  expect(await screen.findByText('ABCDEFGHJK')).toBeVisible();
  expect(request).toHaveBeenCalledWith('/api/teams', { method: 'POST', body: { name: 'Dawn Crew', colorHex: '#1F5A46' } });
});

it('team join errors from the server are shown', async () => {
  const { user } = mount({ 'GET /api/teams/me': { team: null }, 'GET /api/community/team-leaderboard': { teams: [] }, 'GET /api/community/leaderboard': board(),
    'POST /api/teams/join': () => { throw new ApiError('TEAM_FULL', 'This team is full.', 409); } });
  await user.click(screen.getByRole('button', { name: 'Teams' }));
  await user.type(await screen.findByLabelText('Invite code'), 'ABCDEFGH'); await user.click(screen.getByRole('button', { name: 'Join team' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This team is full.');
});

it('home feed renders followed runners’ real runs, and shows an empty state', async () => {
  const run = { id: 'r1', startedAt: '2026-11-20T06:00:00Z', distanceM: 5000, durationS: 1500, cells: 4, captured: 3, runner: runner(1) };
  mount({ 'GET /api/community/feed': { runs: [run], nextCursor: null } }, <HomePage/>);
  expect(await screen.findByText('Runner 1')).toBeVisible();
  expect(screen.getByText('5.00 km')).toBeVisible(); expect(screen.getByText('Captured 3 hexes')).toBeVisible();
});

it('home feed empty state points to finding runners', async () => {
  mount({ 'GET /api/community/feed': { runs: [], nextCursor: null } }, <HomePage/>);
  expect(await screen.findByText('Your feed is quiet')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Find runners to follow' })).toHaveAttribute('href', '/community');
});

it('pins a you-row with my rank and marks my own row', async () => {
  mount({ 'GET /api/community/leaderboard': board({ entries: [{ rank: 1, value: 12, isMe: false, ...runner(1) }, { rank: 2, value: 3, isMe: true, ...runner(2) }], me: { rank: 2, value: 3 } }) });
  expect((await screen.findByText('Your rank: #2 · 3')).closest('.you-row')).toBeVisible();
  expect(screen.getByText('Runner 2').closest('li')).toHaveAttribute('aria-current', 'true');
  expect(screen.getByText('Runner 1').closest('li')).not.toHaveAttribute('aria-current');
});
