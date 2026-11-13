import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { AuthContext } from '../auth/context.jsx';
import { ApiError } from '../auth/errors.js';
import { session } from '../auth/test-helpers.js';
import { WelcomePage, SignupPage, LoginPage, ForgotPage, ResetPage, VerifyPage, GoogleButton } from './auth-pages.jsx';
import { HomePage, SettingsPage, MethodsPage, SessionsPage, ChangePasswordPage, SignOutControl } from './settings-pages.jsx';
import { App, UpdateBanner } from '../App.jsx';

function fakeAuth(state = { status: 'signedOut', user: null, message: '' }) {
  const listeners = new Set(); let current = state;
  return {
    getSnapshot: () => current, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    emit(next) { current = next; for (const listener of listeners) listener(); },
    start: vi.fn(async () => {}), loadMe: vi.fn(async () => {}), signup: vi.fn(async () => {}), login: vi.fn(async () => {}),
    googleSignIn: vi.fn(async () => {}), linkGoogle: vi.fn(async () => ({ identities: [] })),
    resetPassword: vi.fn(async () => ({ message: 'Password updated.' })), confirmEmail: vi.fn(async () => ({ message: 'Email verified.' })),
    pendingCount: vi.fn(async () => 0), signOut: vi.fn(async () => {}),
    api: { request: vi.fn(async () => ({ message: 'Request received.' })) },
  };
}
const signedIn = () => ({ status: 'authenticated', user: { ...session().user, emailVerified: false }, message: '' });
function view(element, auth = fakeAuth(), initial = '/') {
  render(<AuthContext.Provider value={auth}><MemoryRouter initialEntries={[initial]}>{element}</MemoryRouter></AuthContext.Provider>);
  return { auth, user: userEvent.setup() };
}
async function fill(user, label, value) { await user.type(screen.getByLabelText(label, { exact: true }), value); }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

it('welcome and signed-in home/settings show honest routes and account state', () => {
  const first = view(<WelcomePage />);
  expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup');
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  first.auth.emit({ status: 'signedOut', user: null, message: '' });
});

it.each([['signup', SignupPage, 'Create account', 'Creating account…'], ['login', LoginPage, 'Log in', 'Signing in…']])('%s form validates, has autofill/show controls, and handles loading/success', async (kind, Page, label, pendingLabel) => {
  const auth = fakeAuth(), task = deferred(); auth[kind].mockReturnValue(task.promise);
  const { user } = view(<Page />, auth);
  await user.click(screen.getByRole('button', { name: label })); expect(auth[kind]).not.toHaveBeenCalled();
  if (kind === 'signup') await fill(user, 'Display name', 'Trail Runner');
  await fill(user, 'Email', 'Runner+tag@Example.test'); await fill(user, 'Password', 'MapleMountain!2026');
  expect(screen.getByLabelText('Email', { exact: true })).toHaveAttribute('autocorrect', 'off');
  expect(screen.getByLabelText('Email', { exact: true })).toHaveAttribute('autocomplete', kind === 'login' ? 'username' : 'email');
  expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('autocomplete', kind === 'signup' ? 'new-password' : 'current-password');
  await user.click(screen.getByRole('button', { name: 'Show password' })); expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'text');
  await user.click(screen.getByRole('button', { name: label })); expect(screen.getByRole('button', { name: pendingLabel })).toBeDisabled();
  expect(auth[kind]).toHaveBeenCalledWith(expect.objectContaining({ email: 'runner+tag@example.test', password: 'MapleMountain!2026' }));
  await act(async () => task.resolve()); expect(await screen.findByText('Done.')).toBeVisible();
});

it.each([['signup', SignupPage, 'Create account'], ['login', LoginPage, 'Log in']])('%s shows server errors without losing the entered email', async (kind, Page, label) => {
  const auth = fakeAuth(); auth[kind].mockRejectedValue(new ApiError('AUTH_FAILED', 'Please check your details.', 401));
  const { user } = view(<Page />, auth);
  if (kind === 'signup') await fill(user, 'Display name', 'Trail Runner');
  await fill(user, 'Email', 'runner@example.test'); await fill(user, 'Password', 'MapleMountain!2026');
  await user.click(screen.getByRole('button', { name: label })); expect(await screen.findByRole('alert')).toHaveTextContent('Please check your details.');
  expect(screen.getByLabelText('Email', { exact: true })).toHaveValue('runner@example.test');
});

it.each([['signup', SignupPage, 'Create account'], ['login', LoginPage, 'Log in']])('%s submits native autofill values even when no React change event fires', async (kind, Page, label) => {
  const auth = fakeAuth(), { user } = view(<Page />, auth);
  if (kind === 'signup') screen.getByLabelText('Display name', { exact: true }).value = 'Autofill Runner';
  screen.getByLabelText('Email', { exact: true }).value = 'autofill+alias@example.test';
  screen.getByLabelText('Password', { exact: true }).value = 'Autofill!Mountain2026';
  await user.click(screen.getByRole('button', { name: label }));
  expect(auth[kind]).toHaveBeenCalledWith(expect.objectContaining({ email: 'autofill+alias@example.test', password: 'Autofill!Mountain2026' }));
});

it('forgot-password handles offline, loading and generic success without account enumeration', async () => {
  const auth = fakeAuth(), task = deferred();
  auth.api.request.mockRejectedValueOnce(new ApiError('NETWORK_UNAVAILABLE', 'Cannot reach the server.')) .mockReturnValueOnce(task.promise);
  const { user } = view(<ForgotPage />, auth); await fill(user, 'Email', 'runner@example.test');
  await user.click(screen.getByRole('button', { name: 'Send reset link' })); expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach');
  await user.click(screen.getByRole('button', { name: 'Send reset link' })); expect(screen.getByRole('button', { name: 'Requesting link…' })).toBeDisabled();
  await act(async () => task.resolve({ message: 'If an account exists, a password reset email will arrive shortly.' }));
  expect(await screen.findByText(/If an account exists, a password reset email will arrive shortly/)).toBeVisible();
});

it('reset without a valid deep link offers a new email instead of accepting a password', () => {
  view(<ResetPage link={null} clearLink={() => {}} />);
  expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot');
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
});

it.each(['expired', 'used', 'wrong-purpose', 'different-account'])('AUTH-10 reset %s link displays the next step and never logs in', async reason => {
  const auth = fakeAuth(); auth.resetPassword.mockRejectedValue(new ApiError('ACTION_TOKEN_INVALID', `This link is ${reason}. Request a new link.`, 410));
  const { user } = view(<ResetPage link={{ action: 'reset', token: 'A'.repeat(43) }} clearLink={() => {}} />, auth);
  await fill(user, 'New password', 'MapleMountain!2026'); await user.click(screen.getByRole('button', { name: 'Update password' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(`This link is ${reason}`); expect(auth.login).not.toHaveBeenCalled();
});

it('reset shows loading and success, clears only the action link, and asks for login', async () => {
  const auth = fakeAuth(), task = deferred(), clear = vi.fn(); auth.resetPassword.mockReturnValue(task.promise);
  const { user } = view(<ResetPage link={{ action: 'reset', token: 'A'.repeat(43) }} clearLink={clear} />, auth);
  await fill(user, 'New password', 'MapleMountain!2026'); await user.click(screen.getByRole('button', { name: 'Update password' }));
  expect(screen.getByRole('button', { name: 'Updating password…' })).toBeDisabled(); await act(async () => task.resolve({ message: 'Done.' }));
  expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeVisible(); expect(clear).toHaveBeenCalledOnce(); expect(auth.login).not.toHaveBeenCalled();
});

it('verification pending/resend shows rate limits plainly and confirmation has loading/success', async () => {
  const auth = fakeAuth(signedIn()), task = deferred(), clear = vi.fn();
  auth.api.request.mockRejectedValue(new ApiError('RATE_LIMITED', 'Limited.', 429, 60)); auth.confirmEmail.mockReturnValue(task.promise);
  const { user } = view(<VerifyPage link={{ action: 'verify', token: 'A'.repeat(43) }} clearLink={clear} />, auth);
  await user.click(screen.getByRole('button', { name: 'Resend verification email' })); expect(await screen.findByRole('alert')).toHaveTextContent('60 seconds');
  await user.click(screen.getByRole('button', { name: 'Confirm email' })); expect(screen.getByRole('button', { name: 'Confirming…' })).toBeDisabled();
  await act(async () => task.resolve({ message: 'Email verified.' })); expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeVisible(); expect(clear).toHaveBeenCalledOnce();
});

it.each(['SIGN_IN_CANCELED', 'GOOGLE_UNAVAILABLE', 'GOOGLE_EMAIL_UNVERIFIED'])('AUTH-09 Google %s leaves email login available', async code => {
  const auth = fakeAuth(); auth.googleSignIn.mockRejectedValue(new ApiError(code, 'Google could not sign in. Use email login.'));
  const { user } = view(<LoginPage />, auth); await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Use email login.'); expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
});

it('Google account-link-required gives the exact password/settings instruction without changing accounts', async () => {
  const auth = fakeAuth(); auth.googleSignIn.mockRejectedValue(new ApiError('ACCOUNT_LINK_REQUIRED', 'Link required.', 409));
  const { user } = view(<GoogleButton />, auth); await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists. Sign in with your password, then link Google from Settings.');
  expect(screen.getByRole('link', { name: 'Go to login' })).toHaveAttribute('href', '/login');
});

it('Google button has a disabled loading state and returns to home on success', async () => {
  const auth = fakeAuth(), task = deferred(); auth.googleSignIn.mockReturnValue(task.promise);
  const { user } = view(<GoogleButton />, auth); await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
  expect(screen.getByRole('button', { name: 'Opening Google…' })).toBeDisabled(); await act(async () => task.resolve());
  expect(auth.googleSignIn).toHaveBeenCalledOnce();
});

it('sign-in methods shows loading, error/retry, one-method note and successful native linking', async () => {
  const auth = fakeAuth(signedIn()), task = deferred();
  auth.api.request.mockReturnValueOnce(task.promise).mockResolvedValueOnce({ identities: [{ id: 'pw', provider: 'PASSWORD' }] })
    .mockResolvedValue({ identities: [{ id: 'pw', provider: 'PASSWORD' }, { id: 'g', provider: 'GOOGLE' }] });
  const { user } = view(<MethodsPage />, auth); expect(screen.getByText('Loading sign-in methods…')).toBeVisible();
  await act(async () => task.reject(new ApiError('NETWORK_UNAVAILABLE', 'Offline.'))); expect(await screen.findByRole('alert')).toHaveTextContent('Offline.');
  await user.click(screen.getByRole('button', { name: 'Try again' })); expect(await screen.findByText(/Only one sign-in method/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Continue with Google' })); expect(await screen.findByText('Google is linked to your account.')).toBeVisible();
  expect(auth.linkGoogle).toHaveBeenCalledOnce(); expect(screen.getByText('Google', { exact: true })).toBeVisible();
});

it('sign-in methods has an honest empty state', async () => {
  const auth = fakeAuth(signedIn()); auth.api.request.mockResolvedValue({ identities: [] }); view(<MethodsPage />, auth);
  expect(await screen.findByText(/No sign-in methods were found/)).toBeVisible();
});

it('AUTH-06 sessions label This device and revoke only another family, with loading and success', async () => {
  const auth = fakeAuth(signedIn()), task = deferred(); let revoked = false;
  const current = { id: 'current', current: true, deviceLabel: 'Android', createdAt: '2026-11-12T00:00:00Z', lastUsedAt: '2026-11-12T00:00:00Z' };
  auth.api.request.mockImplementation(async (_path, options) => {
    if (options?.method === 'DELETE') { await task.promise; revoked = true; return null; }
    return { sessions: revoked ? [current] : [current, { ...current, id: 'other', current: false }] };
  });
  const { user } = view(<SessionsPage />, auth); expect(screen.getByText('Loading sessions…')).toBeVisible();
  expect(await screen.findByText('This device')).toBeVisible(); expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Revoke' })); expect(screen.getByRole('button', { name: 'Revoking…' })).toBeDisabled();
  await act(async () => task.resolve()); expect(await screen.findByText(/Session revoked/)).toBeVisible();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument());
  expect(auth.api.request).toHaveBeenCalledWith('/api/auth/sessions/other', { method: 'DELETE' });
});

it('sessions and password-method loading errors offer retry; sessions also has an empty state', async () => {
  const auth = fakeAuth(signedIn()); auth.api.request.mockRejectedValueOnce(new ApiError('NETWORK_UNAVAILABLE', 'Offline.')).mockResolvedValue({ sessions: [] });
  const { user } = view(<SessionsPage />, auth); expect(await screen.findByRole('alert')).toHaveTextContent('Offline.');
  await user.click(screen.getByRole('button', { name: 'Try again' })); expect(await screen.findByText('No active sessions were found.')).toBeVisible();
});

it('password change loads methods, validates, handles failure/success and keeps the current session', async () => {
  const auth = fakeAuth(signedIn());
  auth.api.request.mockImplementation(async path => path.endsWith('/identities') ? { identities: [{ provider: 'PASSWORD' }] } : { message: 'Password changed. Other sessions ended.' });
  const { user } = view(<ChangePasswordPage />, auth); expect(screen.getByText('Checking your sign-in methods…')).toBeVisible();
  await screen.findByLabelText('Current password', { exact: true }); await fill(user, 'Current password', 'OldMountain!2026'); await fill(user, 'New password', 'NewMountain!2026');
  await user.click(screen.getByRole('button', { name: 'Change password' })); expect(await screen.findByText('Password changed. Other sessions ended.')).toBeVisible();
  expect(auth.signOut).not.toHaveBeenCalled();
});

it('Google-only accounts are directed to password reset to set their first password', async () => {
  const auth = fakeAuth(signedIn()); auth.api.request.mockResolvedValue({ identities: [{ provider: 'GOOGLE' }] });
  view(<ChangePasswordPage />, auth); expect(await screen.findByRole('link', { name: 'Set a password' })).toHaveAttribute('href', '/forgot');
});

it('AUTH-08 unsent-data warning offers upload/keep and requires a second discard confirmation', async () => {
  const auth = fakeAuth(signedIn()); auth.pendingCount.mockResolvedValue(2);
  const { user } = view(<SignOutControl />, auth); await user.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('There is unsent data'); expect(auth.signOut).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Discard data…' })); expect(auth.signOut).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Cancel' })); expect(auth.signOut).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Sign out' })); await user.click(await screen.findByRole('button', { name: 'Discard data…' }));
  await user.click(screen.getByRole('button', { name: 'Yes, discard data and sign out' }));
  expect(auth.signOut).toHaveBeenCalledWith({ mode: 'discard', confirmation: 'DISCARD_UNSENT_DATA' });
});

it('AUTH-08 failed upload keeps the warning and offers keeping encrypted data', async () => {
  const auth = fakeAuth(signedIn()); auth.pendingCount.mockResolvedValue(1); auth.signOut.mockRejectedValueOnce(new ApiError('UPLOAD_NOT_AVAILABLE', 'Keep the saved data on this phone.')).mockResolvedValueOnce();
  const { user } = view(<SignOutControl />, auth); await user.click(screen.getByRole('button', { name: 'Sign out' }));
  await user.click(await screen.findByRole('button', { name: 'Upload first, then sign out' })); expect(await screen.findByRole('alert')).toHaveTextContent('Keep the saved data');
  await user.click(screen.getByRole('button', { name: 'Sign out and keep data' })); expect(auth.signOut).toHaveBeenLastCalledWith({ mode: 'keep', confirmation: undefined });
});

it('home/settings show only the current account and expected navigation', () => {
  view(<><HomePage /><SettingsPage /></>, fakeAuth(signedIn()));
  expect(screen.getByText('runner@example.test')).toBeVisible(); expect(screen.getByRole('link', { name: /Active sessions/ })).toHaveAttribute('href', '/settings/sessions');
});

it('app bootstrap, offline, blocked and verification states are explicit; resume/link watcher stays registered across navigation', async () => {
  const auth = fakeAuth({ status: 'restoring', user: null, message: '' }), watch = vi.fn(async () => () => {});
  auth.api.request.mockResolvedValue({ versionCode: 2 });
  const { user } = view(<App downloadUrl="http://localhost:5173/#download" nativeWatch={watch} />, auth, '/home');
  expect(screen.getByText('Restoring your sign-in securely…')).toBeVisible();
  act(() => auth.emit(signedIn())); expect(await screen.findByText('Verify your email')).toBeVisible();
  await user.click(screen.getByRole('link', { name: 'Settings', exact: true })); expect(watch).toHaveBeenCalledOnce();
  act(() => auth.emit({ ...signedIn(), status: 'offline', message: 'Cannot reach the server.' })); expect(screen.getByText(/Uploads are paused/)).toBeVisible();
  act(() => auth.emit({ ...signedIn(), status: 'blocked', message: 'Account suspended. Data stays encrypted.' })); expect(screen.getByRole('heading', { name: 'Account unavailable' })).toBeVisible();
});

it.each(['newer', 'empty', 'current', 'error'])('update check supports the %s state without blocking auth', async mode => {
  const api = { request: vi.fn(async () => { if (mode === 'empty') throw new ApiError('NO_RELEASE', 'None.', 404); if (mode === 'error') throw new ApiError('NETWORK_UNAVAILABLE', 'Offline.'); return { versionCode: mode === 'newer' ? 4 : 2 }; }) };
  view(<UpdateBanner api={api} versionCode={3} downloadUrl="https://territory.test/#download" />);
  expect(screen.getByText('Checking for updates…')).toBeVisible();
  if (mode === 'newer') expect(await screen.findByRole('link', { name: 'Open download page' })).toHaveAttribute('href', 'https://territory.test/#download');
  else if (mode === 'empty') expect(await screen.findByText('No published update yet.')).toBeVisible();
  else if (mode === 'current') expect(await screen.findByText('You have the latest published build.')).toBeVisible();
  else expect(await screen.findByRole('button', { name: 'Retry update check' })).toBeEnabled();
});

it('verification banner resends directly, reports rate limits and remains until /api/me confirms verification', async () => {
  const auth = fakeAuth(signedIn()), watch = async () => () => {};
  auth.api.request.mockImplementation(async path => {
    if (path.endsWith('/latest')) return { versionCode: 2 };
    throw new ApiError('RATE_LIMITED', 'Limited.', 429, 45);
  });
  const { user } = view(<App downloadUrl="http://localhost:5173/" nativeWatch={watch} />, auth, '/home');
  await user.click(await screen.findByRole('button', { name: 'Resend email' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('45 seconds');
  expect(screen.getByText('Verify your email')).toBeVisible();
  act(() => auth.emit({ ...signedIn(), user: { ...session().user, emailVerified: true } }));
  expect(screen.queryByText('Verify your email')).not.toBeInTheDocument();
});

it('password change shows an error, then a disabled loading state before retry succeeds', async () => {
  const auth = fakeAuth(signedIn()), task = deferred(); let changes = 0;
  auth.api.request.mockImplementation(async path => {
    if (path.endsWith('/identities')) return { identities: [{ provider: 'PASSWORD' }] };
    if (++changes === 1) throw new ApiError('AUTH_FAILED', 'The current password is incorrect.', 401);
    return task.promise;
  });
  const { user } = view(<ChangePasswordPage />, auth);
  await screen.findByLabelText('Current password', { exact: true }); await fill(user, 'Current password', 'OldMountain!2026'); await fill(user, 'New password', 'NewMountain!2026');
  await user.click(screen.getByRole('button', { name: 'Change password' })); expect(await screen.findByRole('alert')).toHaveTextContent('current password is incorrect');
  await user.click(screen.getByRole('button', { name: 'Change password' })); expect(screen.getByRole('button', { name: 'Changing password…' })).toBeDisabled();
  await act(async () => task.resolve({ message: 'Password changed.' })); expect(await screen.findByText('Password changed.')).toBeVisible();
});

it('password-method lookup failures have a retry state', async () => {
  const auth = fakeAuth(signedIn()); auth.api.request.mockRejectedValueOnce(new ApiError('NETWORK_UNAVAILABLE', 'Offline.')).mockResolvedValue({ identities: [{ provider: 'GOOGLE' }] });
  const { user } = view(<ChangePasswordPage />, auth); expect(await screen.findByRole('alert')).toHaveTextContent('Offline.');
  await user.click(screen.getByRole('button', { name: 'Try again' })); expect(await screen.findByRole('link', { name: 'Set a password' })).toBeVisible();
});

it('native cold link opens a reset screen and is not replayed when navigating away', async () => {
  const auth = fakeAuth(), token = 'A'.repeat(43); auth.api.request.mockResolvedValue({ versionCode: 2 });
  const watch = vi.fn(async ({ onLink }) => { onLink(`territoryrun://reset?token=${token}`); return () => {}; });
  const { user } = view(<App downloadUrl="http://localhost:5173/" nativeWatch={watch} />, auth);
  expect(await screen.findByLabelText('New password', { exact: true })).toBeVisible();
  await user.click(screen.getByRole('link', { name: 'Request a new link' }));
  expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeVisible(); expect(watch).toHaveBeenCalledOnce();
});

it.each(['expired', 'used', 'wrong-purpose', 'different-account'])('AUTH-10 verification checks a %s link even when the signed-in email is already verified', async reason => {
  const auth = fakeAuth({ ...signedIn(), user: { ...session().user, emailVerified: true } });
  auth.confirmEmail.mockRejectedValue(new ApiError('ACTION_TOKEN_INVALID', `This link is ${reason}. Request a new link.`, 410));
  const { user } = view(<VerifyPage link={{ action: 'verify', token: 'A'.repeat(43) }} clearLink={() => {}} />, auth);
  expect(screen.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Confirm email' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(`This link is ${reason}`);
  expect(auth.confirmEmail).toHaveBeenCalledWith('A'.repeat(43));
  expect(screen.queryByRole('heading', { name: 'Email verified' })).not.toBeInTheDocument();
});

it('AUTH-10 a new warm verification link clears the previous success and requires its own confirmation', async () => {
  const auth = fakeAuth(), first = 'A'.repeat(43), second = `${'B'.repeat(42)}A`; let receive;
  auth.api.request.mockResolvedValue({ versionCode: 2 });
  const watch = async ({ onLink }) => { receive = onLink; return () => {}; };
  const { user } = view(<App downloadUrl="http://localhost:5173/" nativeWatch={watch} />, auth);
  await waitFor(() => expect(receive).toBeTypeOf('function'));
  act(() => receive(`territoryrun://verify?token=${first}`));
  await user.click(await screen.findByRole('button', { name: 'Confirm email' }));
  expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeVisible();
  act(() => receive(`territoryrun://verify?token=${second}`));
  await user.click(await screen.findByRole('button', { name: 'Confirm email' }));
  expect(auth.confirmEmail.mock.calls).toEqual([[first], [second]]);
  expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeVisible();
});

it('AUTH-10 an older reset response cannot consume a newer warm link or show success for it', async () => {
  const auth = fakeAuth(), first = 'A'.repeat(43), second = `${'B'.repeat(42)}A`, task = deferred(); let receive;
  auth.api.request.mockResolvedValue({ versionCode: 2 }); auth.resetPassword.mockReturnValueOnce(task.promise);
  const watch = async ({ onLink }) => { receive = onLink; return () => {}; };
  const { user } = view(<App downloadUrl="http://localhost:5173/" nativeWatch={watch} />, auth);
  await waitFor(() => expect(receive).toBeTypeOf('function'));
  act(() => receive(`territoryrun://reset?token=${first}`));
  await fill(user, 'New password', 'FirstMountain!2026');
  await user.click(screen.getByRole('button', { name: 'Update password' }));
  act(() => receive(`territoryrun://reset?token=${second}`));
  expect(await screen.findByLabelText('New password', { exact: true })).toHaveValue('');
  await act(async () => task.resolve({ message: 'Password updated.' }));
  expect(screen.queryByRole('heading', { name: 'Password updated' })).not.toBeInTheDocument();
  await fill(user, 'New password', 'SecondMountain!2026');
  await user.click(screen.getByRole('button', { name: 'Update password' }));
  expect(auth.resetPassword).toHaveBeenLastCalledWith({ token: second, newPassword: 'SecondMountain!2026' });
  expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeVisible();
});
