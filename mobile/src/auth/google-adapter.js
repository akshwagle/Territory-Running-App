import { Capacitor } from '@capacitor/core';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { ApiError } from './errors.js';

// The only application file coupled to the native Google plugin. Never invoke
// its web flow inside Capacitor, request Google API scopes or persist ID tokens.
export function createGoogleAdapter({ platform = Capacitor.getPlatform(), plugin = GoogleSignIn,
  clientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID } = {}) {
  let ready;
  return {
    async signIn() {
      if (platform !== 'android') throw new ApiError('GOOGLE_UNAVAILABLE', 'Use the Android app for Google sign-in, or sign in with email here.');
      if (!clientId || !/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new ApiError('GOOGLE_NOT_CONFIGURED', 'Google sign-in is not configured in this build. Email login is still available.');
      try {
        // This plugin calls the Web client ID "clientId"; Android passes it to
        // GetSignInWithGoogleOption as the server client ID. No Android ID needed.
        ready ??= plugin.initialize({ clientId });
        await ready;
        // A fresh, user-initiated picker must not reuse a stale AccountReauth
        // selection. This clears app credential state, not the Google account
        // or its grants. There is no automatic sign-in retry loop.
        await plugin.signOut();
        const result = await plugin.signIn();
        if (typeof result?.idToken !== 'string' || !result.idToken) throw new ApiError('GOOGLE_NO_ID_TOKEN', 'Google returned no ID token. Try again or use email login.');
        if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(result.idToken)) throw new ApiError('GOOGLE_INVALID_ID_TOKEN', 'Google returned an unreadable ID token. Try again or use email login.');
        return result.idToken; // caller sends directly to our API, then releases it
      } catch (error) {
        ready = null;
        if (error instanceof ApiError) throw error;
        if (error.code === 'SIGN_IN_CANCELED') {
          if (/developer console|oauth client|developer_error|server client|client.?id|28444|UNREGISTERED_ON_API_CONSOLE|not registered.*oauth/i.test(error.message || '')) throw new ApiError('GOOGLE_CONFIGURATION_ERROR', 'Google could not verify this app’s sign-in configuration. Email login is still available.');
          // Google also hides OAuth app-registration failures behind this
          // cancellation reason. Do not tell users to remove/re-add an account
          // when the provider has not identified the underlying cause.
          if (/reauth|re-auth/i.test(error.message || '')) throw new ApiError('GOOGLE_REAUTH_REQUIRED', 'Google could not finish sign-in. The account or this app’s Google setup needs attention. Email login is still available.');
          throw new ApiError('GOOGLE_CANCELLED', 'Google closed sign-in before returning an ID token. Try again or use email login.');
        }
        if (['PROVIDER_CONFIGURATION_ERROR', 'NO_CREDENTIAL_AVAILABLE'].includes(error.code)) throw new ApiError('GOOGLE_UNAVAILABLE', 'Google sign-in is unavailable. Check that a Google account and up-to-date Play Services are on this phone, or use email login.');
        throw new ApiError('GOOGLE_FAILED', 'Google sign-in could not finish. Try again or use email login.');
      }
    },
    async signOut() { if (platform === 'android') await plugin.signOut(); },
  };
}
