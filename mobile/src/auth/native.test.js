import { it, expect, vi } from 'vitest';
import { createGoogleAdapter } from './google-adapter.js';
import { parseAuthLink, watchNativeAuth } from './deep-links.js';

const clientId = '123-test.apps.googleusercontent.com';
it('native Google requests only a Web-client audience ID token and keeps the result transient', async () => {
  const plugin = { initialize: vi.fn(async () => {}), signOut: vi.fn(async () => {}), signIn: vi.fn(async () => ({ idToken: 'mock.id.token' })) };
  const adapter = createGoogleAdapter({ platform: 'android', plugin, clientId });
  expect(await adapter.signIn()).toBe('mock.id.token'); expect(await adapter.signIn()).toBe('mock.id.token');
  expect(plugin.initialize).toHaveBeenCalledExactlyOnceWith({ clientId });
  expect(plugin.signIn).toHaveBeenCalledWith();
  expect(plugin.signOut).toHaveBeenCalledTimes(2);
});
it.each(['SIGN_IN_CANCELED', 'NO_CREDENTIAL_AVAILABLE', 'PROVIDER_CONFIGURATION_ERROR', 'unknown'])('AUTH-09 %s gives a friendly Google error without exposing native details', async code => {
  const plugin = { initialize: async () => {}, signOut: async () => {}, signIn: async () => { throw Object.assign(Error('sensitive native details'), { code }); } };
  await expect(createGoogleAdapter({ platform: 'android', plugin, clientId }).signIn()).rejects.toMatchObject({ message: expect.stringMatching(/email login/) });
});
it('native Google never falls back to embedded WebView OAuth or an unconfigured client', async () => {
  const plugin = { initialize: vi.fn() };
  await expect(createGoogleAdapter({ platform: 'web', plugin, clientId }).signIn()).rejects.toMatchObject({ code: 'GOOGLE_UNAVAILABLE' });
  await expect(createGoogleAdapter({ platform: 'android', plugin, clientId: '' }).signIn()).rejects.toMatchObject({ code: 'GOOGLE_NOT_CONFIGURED' });
  expect(plugin.initialize).not.toHaveBeenCalled();
});
it.each([undefined, {}, { idToken: '' }, { idToken: 'not-a-jwt' }])('a missing or unreadable native ID token is a specific visible failure', async result => {
  const plugin = { initialize: async () => {}, signOut: async () => {}, signIn: async () => result };
  await expect(createGoogleAdapter({ platform: 'android', plugin, clientId }).signIn()).rejects.toMatchObject({ code: expect.stringMatching(/^GOOGLE_(NO|INVALID)_ID_TOKEN$/), message: expect.stringMatching(/ID token/) });
});
it('auth deep links accept only exact actions and canonical tokens; unrelated links are ignored', () => {
  for (const action of ['verify', 'reset']) expect(parseAuthLink(`territoryrun://${action}?token=${'A'.repeat(43)}`)).toEqual({ action, token: 'A'.repeat(43), error: null });
  expect(parseAuthLink('territoryrun://verify?token=bad')).toMatchObject({ token: null, error: expect.any(String) });
  expect(parseAuthLink(`territoryrun://reset?token=${'A'.repeat(43)}&extra=1`).token).toBeNull();
  for (const raw of ['evil://reset', 'territoryrun://reset/other', 'https://evil.test/reset', 'territoryrun://login']) expect(parseAuthLink(raw, 'https://territory.test')).toBeNull();
  expect(parseAuthLink(`https://territory.test/reset?token=${'A'.repeat(43)}`, 'https://territory.test')?.action).toBe('reset');
});
it.each([
  ['[28444] Developer console is not set up correctly.', 'GOOGLE_CONFIGURATION_ERROR'],
  ['[8] Unknown error [status=UNREGISTERED_ON_API_CONSOLE].', 'GOOGLE_CONFIGURATION_ERROR'],
  ['This android application is not registered to use OAuth2.0.', 'GOOGLE_CONFIGURATION_ERROR'],
  ['Account reauth failed.', 'GOOGLE_REAUTH_REQUIRED'],
  ['The user canceled the sign-in flow.', 'GOOGLE_CANCELLED'],
])('provider cancellation reason maps to a precise account/configuration/user outcome', async (message, code) => {
  const plugin = { initialize: async () => {}, signOut: async () => {}, signIn: async () => { throw Object.assign(Error(message), { code: 'SIGN_IN_CANCELED' }); } };
  await expect(createGoogleAdapter({ platform: 'android', plugin, clientId }).signIn()).rejects.toMatchObject({ code });
});
it('AUTH-09 account-reauth failure gives account/app guidance without claiming the user must re-add an account', async () => {
  const plugin = { initialize: async () => {}, signOut: async () => {}, signIn: async () => { throw Object.assign(Error('[16] Account reauth failed.'), { code: 'SIGN_IN_CANCELED' }); } };
  await expect(createGoogleAdapter({ platform: 'android', plugin, clientId }).signIn()).rejects.toMatchObject({
    code: 'GOOGLE_REAUTH_REQUIRED',
    message: 'Google could not finish sign-in. The account or this app’s Google setup needs attention. Email login is still available.',
  });
});
it('cold/warm native links and foreground events are delivered and listeners are removed', async () => {
  const listeners = {}, remove = vi.fn(), onLink = vi.fn(), onResume = vi.fn();
  const plugin = { addListener: async (name, callback) => { listeners[name] = callback; return { remove }; },
    getLaunchUrl: async () => ({ url: 'territoryrun://verify?token=example' }) };
  const stop = await watchNativeAuth({ platform: 'android', plugin, onLink, onResume });
  listeners.appUrlOpen({ url: 'territoryrun://reset?token=example' }); listeners.appStateChange({ isActive: true }); stop();
  expect(onLink).toHaveBeenCalledTimes(2); expect(onResume).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledTimes(2);
});
