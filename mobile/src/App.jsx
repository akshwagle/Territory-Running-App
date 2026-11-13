import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useAuth } from './auth/context.jsx';
import { parseAuthLink, watchNativeAuth } from './auth/deep-links.js';
import { Notice } from './components/forms.jsx';
import { friendlyMessage } from './auth/errors.js';
import { WelcomePage, SignupPage, LoginPage, ForgotPage, ResetPage, VerifyPage } from './pages/auth-pages.jsx';
import { HomePage, SettingsPage, MethodsPage, SessionsPage, ChangePasswordPage, SignOutControl } from './pages/settings-pages.jsx';

import { UIProvider, Skeleton, InlineNotice } from './ui/index.jsx';
import { Shell } from './ui/Shell.jsx';
import { PendingNotice } from './ui/PendingNotice.jsx';
const ProfilePage = lazy(() => import('./pages/profile-pages.jsx').then(m => ({ default: m.ProfilePage })));
const PrivacyPage = lazy(() => import('./pages/profile-pages.jsx').then(m => ({ default: m.PrivacyPage })));
const ConsentPage = lazy(() => import('./pages/data-pages.jsx').then(m => ({ default: m.ConsentPage })));
const ExportPage = lazy(() => import('./pages/data-pages.jsx').then(m => ({ default: m.ExportPage })));
const DeletePage = lazy(() => import('./pages/data-pages.jsx').then(m => ({ default: m.DeletePage })));

export function UpdateBanner({ api, versionCode, downloadUrl }) {
  const [attempt, setAttempt] = useState(0), [state, setState] = useState({ phase: 'loading' });
  useEffect(() => {
    let active = true; setState({ phase: 'loading' });
    api.request('/api/releases/latest', { auth: false }).then(release => {
      if (active) setState({ phase: release.versionCode > versionCode ? 'newer' : 'current' });
    }).catch(error => { if (active) setState({ phase: error.code === 'NO_RELEASE' ? 'empty' : 'error' }); });
    return () => { active = false; };
  }, [api, versionCode, attempt]);
  if (state.phase === 'newer') return <p className="small update-check"><span>Update available. </span><a href={downloadUrl} target="_blank" rel="noreferrer">Open download page</a></p>;
  if (state.phase === 'error') return <aside className="small update-check"><span>Couldn’t check for updates.</span><button className="text-link" onClick={() => setAttempt(attempt + 1)}>Retry update check</button></aside>;
  return <p className="small update-check" role="status">{state.phase === 'loading' ? 'Checking for updates…' : state.phase === 'empty' ? 'No published update yet.' : 'You have the latest published build.'}</p>;
}

function Protected({ children }) {
  const { state } = useAuth();
  return state.user ? children : <Navigate to="/login" replace />;
}

function VerificationBanner() {
  const { auth } = useAuth();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  async function resend() {
    setBusy(true); setError(''); setMessage('');
    try { const result = await auth.api.request('/api/auth/verify-email/request', { method: 'POST', body: {} }); setMessage(result.message); }
    catch (failure) { setError(friendlyMessage(failure)); }
    finally { setBusy(false); }
  }
  return <><InlineNotice action={busy ? 'Sending…' : 'Resend email'} onAction={() => { if (!busy) resend(); }}>Verify your email</InlineNotice><Notice>{message}</Notice><Notice error>{error}</Notice></>;

}

export function App(props) { return <UIProvider><AppContent {...props}/></UIProvider>; }
function AppContent({ downloadUrl, nativeWatch = watchNativeAuth }) {
  const { auth, state } = useAuth(), navigate = useNavigate(), location = useLocation();
  const [{ link, generation }, setLinkState] = useState({ link: null, generation: 0 }), [linkError, setLinkError] = useState('');
  const clearLink = expected => setLinkState(current => current.link === expected ? { ...current, link: null } : current);
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  useEffect(() => { auth.start(); }, [auth]);
  useEffect(() => {
    let cancelled = false, dispose;
    const receive = raw => {
      if (cancelled) return;
      const parsed = parseAuthLink(raw, new URL(downloadUrl).origin);
      if (parsed) { setLinkState(current => ({ link: parsed, generation: current.generation + 1 })); navigateRef.current(`/${parsed.action}`, { replace: true }); }
    };
    nativeWatch({ onLink: receive, onResume: () => auth.loadMe().catch(() => {}) }).then(cleanup => {
      if (cancelled) cleanup(); else dispose = cleanup;
    }).catch(() => { if (!cancelled) setLinkError('App links are unavailable. Close and reopen the app, then open the email link again.'); });
    const online = () => auth.loadMe().catch(() => {});
    window.addEventListener('online', online);
    return () => { cancelled = true; dispose?.(); window.removeEventListener('online', online); };
  }, [auth, downloadUrl, nativeWatch]);
  useEffect(() => {
    // Scrub preview query tokens from browser history; native tokens also live
    // only in component memory, never in router state or browser storage.
    if (['/verify', '/reset'].includes(location.pathname) && location.search) {
      const parsed = parseAuthLink(`territoryrun:/${location.pathname}${location.search}`);
      if (parsed) setLinkState(current => ({ link: parsed, generation: current.generation + 1 }));
      navigate(location.pathname, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);
  const pageRoutes = routeLocation => <Suspense fallback={<Skeleton label="Loading screen…"/>}><Routes location={routeLocation}>
    <Route path="/" element={state.user ? <Navigate to="/home" replace /> : <WelcomePage notice={state.authOutcome?.kind === 'error' ? state.authOutcome.message : linkError} />} />
    <Route path="/signup" element={<SignupPage />} /><Route path="/login" element={<LoginPage />} /><Route path="/forgot" element={<ForgotPage />} />
    <Route path="/reset" element={<ResetPage key={generation} link={link} clearLink={clearLink} />} /><Route path="/verify" element={<VerifyPage key={generation} link={link} clearLink={clearLink} />} />
    <Route path="/home" element={<Protected><HomePage /></Protected>} /><Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
    <Route path="/settings/methods" element={<Protected><MethodsPage /></Protected>} /><Route path="/settings/sessions" element={<Protected><SessionsPage /></Protected>} />
    <Route path="/you" element={<Protected><ProfilePage /></Protected>} /><Route path="/you/privacy" element={<Protected><PrivacyPage /></Protected>} />
    <Route path="/you/consent" element={<Protected><ConsentPage /></Protected>} /><Route path="/settings/export" element={<Protected><ExportPage /></Protected>} />
    <Route path="/settings/delete" element={<Protected><DeletePage /></Protected>} /><Route path="/settings/password" element={<Protected><ChangePasswordPage /></Protected>} />
    <Route path="/settings/profile" element={<Navigate to="/you" replace/>}/><Route path="/settings/privacy" element={<Navigate to="/you/privacy" replace/>}/><Route path="/settings/consent" element={<Navigate to="/you/consent" replace/>}/>
    <Route path="*" element={<section><h1>Page not found</h1><Link className="button secondary" to="/">Go home</Link></section>} />
  </Routes></Suspense>;
  const ready = !['restoring', 'storageError', 'blocked'].includes(state.status) &&
    !(state.status === 'reauthRequired' && !['/login', '/signup', '/forgot', '/verify', '/reset'].includes(location.pathname));
  return <Shell user={state.user} renderRoutes={ready ? pageRoutes : () => null}
    footer={(!state.user || location.pathname === '/settings') && <><UpdateBanner api={auth.api} versionCode={__APP_VERSION_CODE__} downloadUrl={downloadUrl}/><p className="small">Territory Run · Android {__APP_VERSION__}</p></>}>
      {location.pathname !== '/' && state.authOutcome?.code !== 'ACCOUNT_LINK_REQUIRED' && state.authOutcome?.kind !== 'progress' && state.authOutcome && <Notice error={state.authOutcome.kind === 'error'}>{state.authOutcome.message}</Notice>}
      {location.pathname !== '/' && !state.authOutcome && linkError && <InlineNotice error>{linkError}</InlineNotice>}
      {state.status === 'restoring' ? <section><h1>Getting ready</h1><Skeleton label="Restoring your sign-in securely…"/></section> :
        state.status === 'storageError' ? <section><h1>Sign-in storage unavailable</h1><Notice error>{state.message}</Notice><p>Saved data is kept on this phone.</p><button className="primary" onClick={() => auth.start()}>Try again</button></section> :
          state.status === 'blocked' ? <section><h1>Account unavailable</h1><Notice error>{state.message}</Notice><SignOutControl /></section> :
            state.status === 'reauthRequired' && !['/login', '/signup', '/forgot', '/verify', '/reset'].includes(location.pathname) ? <section><h1>Sign in again</h1><InlineNotice>{state.message}</InlineNotice><Link className="button primary" to="/login">Go to login</Link></section> : <>
            {['offline', 'unavailable'].includes(state.status) ? <InlineNotice error action="Retry" onAction={() => auth.loadMe().catch(() => {})}>{state.message} Uploads are paused until the connection and sign-in are confirmed.</InlineNotice> :
              state.user && state.user.emailVerified !== true && location.pathname !== '/verify' && <VerificationBanner />}
            {state.status === 'signedOut' && state.message && <Notice>{state.message}</Notice>}
            {location.pathname !== '/' && <PendingNotice/>}


          </>}
  </Shell>;
}
