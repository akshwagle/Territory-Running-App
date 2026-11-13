import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { Button, TextField, Switch, Dialog, Sheet, UIProvider, useToast, closeTopOverlay, TabBar, Skeleton, ErrorState } from './index.jsx';

afterEach(() => vi.useRealTimers());
it('UI-03 password field reveals without clearing the native value and shows rules while typing', async () => {
  const user = userEvent.setup(); render(<TextField label="New password" name="password" type="password" autoComplete="new-password"/>);
  await user.type(screen.getByLabelText('New password', { exact: true }), 'mountain trail');
  expect(screen.getByText(/Length is OK/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Show new password' }));
  expect(screen.getByLabelText('New password', { exact: true })).toHaveValue('mountain trail');
  expect(screen.getByLabelText('New password', { exact: true })).toHaveAttribute('type', 'text');
});
it('UI-05 dialog traps focus, native back closes it first, and cleanup restores focus', async () => {
  const user = userEvent.setup(), close = vi.fn(); const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
  const view = render(<Dialog title="Discard?" onClose={close}><Button>Keep data</Button><Button>Discard data</Button></Dialog>);
  const first = screen.getByRole('button', { name: 'Close' }), last = screen.getByRole('button', { name: 'Discard data' });
  expect(first).toHaveFocus(); last.focus(); await user.tab(); expect(first).toHaveFocus();
  expect(closeTopOverlay()).toBe(true); expect(close).toHaveBeenCalledOnce(); view.unmount();
  expect(trigger).toHaveFocus(); expect(closeTopOverlay()).toBe(false); trigger.remove();
});
it('UI-05 sheet dismisses with Escape and announces a proper dialog title', () => {
  const close = vi.fn(); render(<Sheet title="Hex avatar" onClose={close}>Options</Sheet>);
  expect(screen.getByRole('dialog', { name: 'Hex avatar' })).toHaveAttribute('aria-modal', 'true');
  fireEvent.keyDown(document, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
});
it('one toast replaces the last message, dismisses after four seconds and never stacks', () => {
  vi.useFakeTimers();
  function Test() { const show = useToast(); return <><button onClick={() => show('Saved')}>One</button><button onClick={() => show('Updated')}>Two</button></>; }
  render(<UIProvider><Test/></UIProvider>); fireEvent.click(screen.getByText('One')); fireEvent.click(screen.getByText('Two'));
  expect(screen.getAllByRole('status')).toHaveLength(1); expect(screen.queryByText('Saved')).toBeNull(); expect(screen.getByRole('status')).toHaveTextContent('Updated');
  act(() => vi.advanceTimersByTime(4000)); expect(screen.queryByRole('status')).toBeNull();
});
it('UI-07 busy button blocks repeated taps; error has a working Retry; skeleton announces loading', async () => {
  const click = vi.fn(), retry = vi.fn(), user = userEvent.setup();
  render(<><Button loading onClick={click}>Saving…</Button><Skeleton label="Loading profile"/><ErrorState onRetry={retry}>Offline.</ErrorState></>);
  await user.click(screen.getByRole('button', { name: 'Saving…' })); expect(click).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('Loading profile'); await user.click(screen.getByRole('button', { name: 'Retry' })); expect(retry).toHaveBeenCalledOnce();
});
it('UI-09 controls have names, switch state and a labelled current tab; decorative icons are hidden', async () => {
  const user = userEvent.setup(); render(<MemoryRouter><Switch label="Share routes" defaultChecked/><TabBar active="/home" tabs={[{ to: '/home', icon: 'home', label: 'Home' }, { to: '/you', icon: 'user', label: 'You' }]}/></MemoryRouter>);
  expect(screen.getByRole('switch', { name: 'Share routes' })).toBeChecked(); await user.click(screen.getByRole('switch')); expect(screen.getByRole('switch')).not.toBeChecked();
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page'); expect(screen.queryByRole('img')).toBeNull();
});
it('password form reset clears the visible-password toggle and the live length hint', async () => {
  const user = userEvent.setup(); render(<form><TextField label="Password" type="password" autoComplete="new-password"/><button type="reset">Clear form</button></form>);
  await user.type(screen.getByLabelText('Password', { exact: true }), 'a long password'); await user.click(screen.getByRole('button', {name:'Show password'}));
  await user.click(screen.getByRole('button', {name:'Clear form'})); expect(screen.getByLabelText('Password', {exact:true})).toHaveAttribute('type','password');
  expect(screen.queryByText(/Length is OK/)).toBeNull();
});
