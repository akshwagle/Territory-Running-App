import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { AuthContext } from '../auth/context.jsx';
import { ApiError } from '../auth/errors.js';
import { session } from '../auth/test-helpers.js';
import { NotificationsPage } from './pages.jsx';
import { UnreadProvider } from './unread.jsx';
import { TabBar } from '../ui/index.jsx';
import { MyBadges } from './MyBadges.jsx';

const note = (n, read = false) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, type: 'SYSTEM', title: `Title ${n}`, body: `Body ${n}`, read, createdAt: '2026-11-01T10:00:00.000Z' });
function mount(handler, element = <NotificationsPage/>) {
  const request = vi.fn(async (path, opts = {}) => handler(path, opts));
  const snap = { status: 'authenticated', user: session().user, message: '' };
  const auth = { getSnapshot: () => snap, subscribe: () => () => {}, api: { request } };
  render(<AuthContext.Provider value={auth}><MemoryRouter><UnreadProvider api={{ request }} userId={snap.user.id}>{element}</UnreadProvider></MemoryRouter></AuthContext.Provider>);
  return { request, user: userEvent.setup() };
}
const counted = (path) => path.endsWith('unread-count') ? { unreadCount: 2 } : null;

it('lists notifications and marks one read', async () => {
  const { request, user } = mount((path) => counted(path) || (path.includes('/read') ? { unreadCount: 1 } : { notifications: [note(1), note(2, true)], nextCursor: null, unreadCount: 2 }));
  await user.click(await screen.findByRole('button', { name: /Title 1, unread/ }));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/me/notifications/00000000-0000-4000-8000-000000000001/read', { method: 'POST', body: {} }));
  expect(screen.getByRole('button', { name: 'Title 1' })).toBeInTheDocument();
});
it('marks all as read and shows the empty state', async () => {
  const { request, user } = mount((path) => counted(path) || (path.endsWith('read-all') ? { unreadCount: 0 } : { notifications: [note(1)], nextCursor: null, unreadCount: 1 }));
  await user.click(await screen.findByRole('button', { name: 'Mark all as read' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/me/notifications/read-all', { method: 'POST', body: {} }));
  expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull();
});
it('shows an empty state and an error state with retry', async () => {
  mount((path) => counted(path) || { notifications: [], nextCursor: null, unreadCount: 0 });
  expect(await screen.findByText('Nothing new')).toBeInTheDocument();
});
it('reports load failure honestly', async () => {
  mount((path) => { if (path.endsWith('unread-count')) return { unreadCount: 0 }; throw new ApiError('OFFLINE', 'offline', 0); });
  expect(await screen.findByText(/offline/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});
it('tab bar shows an unread badge only when there are unread items', () => {
  const tabs = [{ to: '/home', label: 'Home', icon: 'home', badge: 12 }, { to: '/you', label: 'You', icon: 'user' }];
  render(<MemoryRouter><TabBar tabs={tabs} active="/home"/></MemoryRouter>);
  expect(screen.getByRole('status')).toHaveTextContent('9+');
});
it('profile badges list only earned badges', async () => {
  mount(() => ({ badges: [{ id: 'a', name: 'Ten runs', earned: true }, { id: 'b', name: 'Hex century', earned: false }] }), <MyBadges/>);
  expect(await screen.findByText('Ten runs')).toBeInTheDocument();
  expect(screen.queryByText('Hex century')).toBeNull();
});
