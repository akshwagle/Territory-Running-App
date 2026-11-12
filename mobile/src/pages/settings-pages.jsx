import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/context.jsx';
import { friendlyMessage } from '../auth/errors.js';
import { DISCARD_CONFIRMATION } from '../auth/pending-work.js';
import { AuthForm, Notice, newPasswordField } from '../components/forms.jsx';
import { GoogleButton } from './auth-pages.jsx';

function useResource(load) {
  const [state, setState] = useState({ phase: 'loading', value: null, error: '' });
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const id = ++sequence.current; setState(old => ({ ...old, phase: 'loading', error: '' }));
    try { const value = await load(); if (id === sequence.current) setState({ phase: 'ready', value, error: '' }); }
    catch (error) { if (id === sequence.current) setState(old => ({ ...old, phase: 'error', error: friendlyMessage(error) })); }
  }, [load]);
  useEffect(() => { reload(); return () => { sequence.current++; }; }, [reload]);
  return { ...state, reload };
}

export function SignOutControl() {
  const { auth } = useAuth(), navigate = useNavigate();
  const [stage, setStage] = useState('idle'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function finish(mode, confirmation) {
    setBusy(true); setError('');
    try { await auth.signOut({ mode, confirmation }); navigate('/login', { replace: true }); }
    catch (failure) { setError(friendlyMessage(failure)); }
    finally { setBusy(false); }
  }
  async function check() {
    setBusy(true); setError('');
    try { if (await auth.pendingCount()) setStage('warn'); else await finish('keep'); }
    catch (failure) { setError(friendlyMessage(failure)); }
    finally { setBusy(false); }
  }
  return <div className="sign-out">
    <button className="secondary" disabled={busy} onClick={check}>{busy ? 'Working…' : 'Sign out'}</button>
    {stage !== 'idle' && <div className="confirm-panel" role="dialog" aria-modal="false" aria-labelledby="sign-out-title">
      <h2 id="sign-out-title">{stage === 'warn' ? 'Keep your unsent data?' : 'Discard the saved data?'}</h2>
      {stage === 'warn' ? <><p>There is unsent data on this phone. You can upload first, or sign out and keep it encrypted for this account.</p>
        <button className="primary" disabled={busy} onClick={() => finish('upload')}>Upload first, then sign out</button>
        <button className="secondary" disabled={busy} onClick={() => finish('keep')}>Sign out and keep data</button>
        <button className="danger" disabled={busy} onClick={() => setStage('discard')}>Discard data…</button></> :
        <><p>This permanently removes this account’s unsent data from this phone. It cannot be recovered.</p>
          <button className="danger" disabled={busy} onClick={() => finish('discard', DISCARD_CONFIRMATION)}>Yes, discard data and sign out</button></>}
      <button className="secondary" disabled={busy} onClick={() => { setStage('idle'); setError(''); }}>Cancel</button>
    </div>}
    <Notice error>{error}</Notice>
  </div>;
}

export function HomePage() {
  const { state } = useAuth();
  return <section><p className="eyebrow">Your field guide</p><h1>Good to see you,<br />{state.user.displayName}.</h1>
    <p>You’re signed in. Run recording will arrive in a later build.</p>
    <Link className="button primary" to="/settings">Account settings</Link>
  </section>;
}

export function SettingsPage() {
  const { state } = useAuth();
  return <section><p className="eyebrow">Your account</p><h1>Settings</h1>
    <p className="account-name">{state.user.displayName}</p><p className="wrap">{state.user.email}</p>
    <nav className="settings-nav" aria-label="Account settings"><Link to="/settings/methods">Sign-in methods <span aria-hidden="true">→</span></Link>
      <Link to="/settings/sessions">Active sessions <span aria-hidden="true">→</span></Link>
      <Link to="/settings/password">Change password <span aria-hidden="true">→</span></Link>
      <Link to="/verify">Email verification <span aria-hidden="true">→</span></Link></nav>
    <SignOutControl />
  </section>;
}

export function MethodsPage() {
  const { auth } = useAuth();
  const load = useCallback(() => auth.api.request('/api/auth/identities'), [auth]);
  const data = useResource(load), [linked, setLinked] = useState(false);
  return <section><p className="eyebrow">Account settings</p><h1>Sign-in methods</h1>
    {data.phase === 'loading' && <Notice>Loading sign-in methods…</Notice>}
    {data.phase === 'error' && <><Notice error>{data.error}</Notice><button className="secondary" onClick={data.reload}>Try again</button></>}
    {data.phase === 'ready' && <>
      {data.value.identities.length ? <ul className="resource-list">{data.value.identities.map(identity => <li key={identity.id}><strong>{identity.provider === 'PASSWORD' ? 'Password' : 'Google'}</strong><span>Linked to your account</span></li>)}</ul> : <p>No sign-in methods were found. Try refreshing this page.</p>}
      {data.value.identities.length === 1 && <p className="notice">Only one sign-in method is linked. Keep access to that method, or add another.</p>}
      {!data.value.identities.some(identity => identity.provider === 'GOOGLE') && <GoogleButton link onLinked={() => { setLinked(true); data.reload(); }} />}
      <Notice>{linked ? 'Google is linked to your account.' : ''}</Notice>
    </>}
    <Link className="text-link" to="/settings">Back to settings</Link>
  </section>;
}

export function SessionsPage() {
  const { auth } = useAuth(), load = useCallback(() => auth.api.request('/api/auth/sessions'), [auth]);
  const data = useResource(load), [revoking, setRevoking] = useState(null), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function revoke(id) {
    setRevoking(id); setError(''); setMessage('');
    try { await auth.api.request(`/api/auth/sessions/${id}`, { method: 'DELETE' }); setMessage('Session revoked. That device must sign in again.'); await data.reload(); }
    catch (failure) { setError(friendlyMessage(failure)); }
    finally { setRevoking(null); }
  }
  return <section><p className="eyebrow">Account settings</p><h1>Active sessions</h1>
    {data.phase === 'loading' && <Notice>Loading sessions…</Notice>}
    {data.phase === 'error' && <><Notice error>{data.error}</Notice><button className="secondary" onClick={data.reload}>Try again</button></>}
    {data.phase === 'ready' && (data.value.sessions.length ? <ul className="resource-list">{data.value.sessions.map(session => <li key={session.id}>
      <strong>{session.deviceLabel}</strong><span>{session.current ? 'This device' : 'Another signed-in device'}</span>
      <span className="small">Started {new Date(session.createdAt).toLocaleString()}<br />Last used {new Date(session.lastUsedAt).toLocaleString()}</span>
      {!session.current && <button className="secondary" disabled={Boolean(revoking)} onClick={() => revoke(session.id)}>{revoking === session.id ? 'Revoking…' : 'Revoke'}</button>}
    </li>)}</ul> : <p>No active sessions were found.</p>)}
    <Notice error>{error}</Notice><Notice>{message}</Notice><Link className="text-link" to="/settings">Back to settings</Link>
  </section>;
}

export function ChangePasswordPage() {
  const { auth } = useAuth(), load = useCallback(() => auth.api.request('/api/auth/identities'), [auth]);
  const methods = useResource(load);
  return <section><p className="eyebrow">Account settings</p><h1>Change password</h1>
    {methods.phase === 'loading' && <Notice>Checking your sign-in methods…</Notice>}
    {methods.phase === 'error' && <><Notice error>{methods.error}</Notice><button className="secondary" onClick={methods.reload}>Try again</button></>}
    {methods.phase === 'ready' && (methods.value.identities.some(identity => identity.provider === 'PASSWORD') ? <>
      <p>Your current session stays signed in. Other sessions end immediately.</p>
      <AuthForm kind="change" fields={[{ name: 'currentPassword', label: 'Current password', type: 'password', autoComplete: 'current-password' }, newPasswordField]}
        submitLabel="Change password" busyLabel="Changing password…" onSubmit={body => auth.api.request('/api/auth/password/change', { method: 'POST', body })} />
    </> : <><p>You sign in with Google. To set your first password, request a password reset link and confirm it from your email.</p><Link className="button secondary" to="/forgot">Set a password</Link></>)}
    <Link className="text-link" to="/settings">Back to settings</Link>
  </section>;
}
