import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/context.jsx';
import { PendingNotice } from './PendingNotice.jsx';
import { UIProvider } from './index.jsx';
function renderNotice(count) {
  const state = { status: 'signedOut', user: null };
  const auth = { getSnapshot: () => state, subscribe: () => () => {}, pendingTotal: vi.fn(count) };
  render(<AuthContext.Provider value={auth}><UIProvider><PendingNotice/></UIProvider></AuthContext.Provider>);
  return auth;
}
it('a clean login never claims there is unsent data', async () => {
  const auth = renderNotice(async () => 0); await act(async () => {});
  expect(auth.pendingTotal).toHaveBeenCalledOnce(); expect(screen.queryByRole('status')).toBeNull();
});
it('real pending data has one dismissible notice and an explanation without exposing its contents', async () => {
  renderNotice(async () => 2); const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Details' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('2 saved items');
  await user.click(screen.getByRole('button', { name: 'Got it' })); expect(screen.queryByRole('status')).toBeNull(); expect(screen.queryByRole('dialog')).toBeNull();
});
it('a failed encrypted-data check offers retry without claiming data is absent', async () => {
  const count = vi.fn().mockRejectedValueOnce(Error('read failed')).mockResolvedValueOnce(1); renderNotice(count); const user = userEvent.setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t check saved data');
  await user.click(screen.getByRole('button', { name: 'Retry' })); expect(await screen.findByRole('status')).toHaveTextContent('Unsent data is encrypted');
});
