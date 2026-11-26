import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

import { Banner, Card, Chip, ListRow, Segmented, StatGrid, StatTile, EmptyState } from './index.jsx';
it('T02 button: ghost and small variants, block width, loading keeps label, disabled shows its reason', () => {
  render(<><Button variant="ghost" size="sm" block>Skip</Button><Button disabled reason="Accept the notices first">Start</Button><Button loading>Saving…</Button></>);
  expect(screen.getByRole('button', { name: 'Skip' })).toHaveClass('ui-button--ghost', 'ui-button--sm', 'ui-button--block');
  expect(screen.getByRole('button', { name: 'Start' })).toHaveAccessibleDescription('Accept the notices first');
  expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute('aria-busy', 'true');
});
it('T02 text field shows the validation error on blur, keeps the value, and clears with a named button', async () => {
  const user = userEvent.setup(); render(<TextField label="Email" clearable validate={v => (v.includes('@') ? '' : 'Enter a valid email.')}/>);
  const input = screen.getByLabelText('Email', { exact: true }); await user.type(input, 'nope'); expect(screen.queryByRole('alert')).toBeNull();
  await user.tab(); expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email.'); expect(input).toHaveValue('nope'); expect(input).toHaveAttribute('aria-invalid', 'true');
  await user.type(input, '@x.io'); expect(screen.queryByRole('alert')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Clear email' })); expect(input).toHaveValue(''); expect(input).toHaveFocus();
});
it('T02 segmented and chip expose pressed state and change once', async () => {
  const user = userEvent.setup(), change = vi.fn(); render(<><Segmented label="Period" options={['Week', { value: 'm', label: 'Month' }]} value="Week" onChange={change}/><Chip selected>Mine</Chip></>);
  expect(screen.getByRole('group', { name: 'Period' })).toBeVisible(); expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Week' })); expect(change).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Month' })); expect(change).toHaveBeenCalledWith('m'); expect(screen.getByRole('button', { name: 'Mine' })).toHaveAttribute('aria-pressed', 'true');
});
it('T02 card is static, or a pressable button/link; stat tile pairs label, value, unit and delta', async () => {
  const user = userEvent.setup(), tap = vi.fn();
  render(<MemoryRouter><Card>Plain</Card><Card onClick={tap}>Press me</Card><Card to="/x">Go</Card><StatGrid><StatTile label="Distance" value="5.2" unit="km" delta="+0.4"/></StatGrid></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: 'Press me' })); expect(tap).toHaveBeenCalledOnce();
  expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute('href', '/x'); expect(screen.getByText('Plain').tagName).toBe('ARTICLE');
  expect(screen.getByText('Distance').tagName).toBe('DT'); expect(screen.getByText('5.2').closest('dd')).toHaveTextContent('5.2 km +0.4');
});
it('T02 list row renders subtitle, leading, trailing, and can drop the chevron', () => {
  const { container } = render(<MemoryRouter><ListRow to="/a" label="Ada" subtitle="12 hexes" leading={<b>A</b>} trailing={<i>#1</i>} chevron={false}/></MemoryRouter>);
  expect(screen.getByRole('link', { name: /Ada.*12 hexes/ })).toBeVisible(); expect(screen.getByText('#1')).toBeVisible(); expect(container.querySelector('svg')).toBeNull();
});
it('T02 banner announces politely, errors assertively, and its action works', async () => {
  const user = userEvent.setup(), retry = vi.fn();
  render(<><Banner tone="offline">Offline.</Banner><Banner tone="error" action="Retry" onAction={retry}>Sign-in expired.</Banner></>);
  expect(screen.getByRole('status')).toHaveTextContent('Offline.'); await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' })); expect(retry).toHaveBeenCalledOnce();
});
it('T02 sheet has a grabber that closes only after a long drag', () => {
  const close = vi.fn(); render(<Sheet title="Hex" onClose={close}>Body</Sheet>); const grabber = screen.getByTestId('sheet-grabber');
  fireEvent.pointerDown(grabber, { clientY: 100, pointerId: 1 }); fireEvent.pointerUp(grabber, { clientY: 140, pointerId: 1 }); expect(close).not.toHaveBeenCalled();
  fireEvent.pointerDown(grabber, { clientY: 100, pointerId: 1 }); fireEvent.pointerMove(grabber, { clientY: 220, pointerId: 1 }); fireEvent.pointerUp(grabber, { clientY: 220, pointerId: 1 }); expect(close).toHaveBeenCalledOnce();
  expect(screen.getByRole('dialog')).not.toHaveStyle({ transform: 'translateY(120px)' });
});
it('T02 skeleton shapes keep one status label; empty and error states take title and optional action', () => {
  render(<><Skeleton shape="row" lines={2} label="Loading runners"/><EmptyState title="No runs yet" action={<Button>Start</Button>}>Record a run.</EmptyState><ErrorState title="Stats unavailable">Offline.</ErrorState></>);
  expect(screen.getByRole('status')).toHaveTextContent('Loading runners'); expect(screen.getByRole('heading', { name: 'No runs yet' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Stats unavailable' })).toBeVisible(); expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
});
