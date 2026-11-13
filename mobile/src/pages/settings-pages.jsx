import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/context.jsx';
import { friendlyMessage } from '../auth/errors.js';
import { DISCARD_CONFIRMATION } from '../auth/pending-work.js';
import { AuthForm, Notice, newPasswordField } from '../components/forms.jsx';
import { GoogleButton } from './auth-pages.jsx';
import { Button, Dialog, EmptyState, ErrorState, ListRow, Section, Skeleton } from '../ui/index.jsx';

export function useResource(load) {
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
    <Button variant="secondary" disabled={busy} onClick={check}>{busy ? 'Working…' : 'Sign out'}</Button>
    {stage !== 'idle' && <Dialog title={stage === 'warn' ? 'Keep your unsent data?' : 'Discard the saved data?'} onClose={() => { setStage('idle'); setError(''); }}>
      {stage === 'warn' ? <><p>There is unsent data on this phone. You can upload first, or sign out and keep it encrypted for this account.</p>
        <Button disabled={busy} onClick={() => finish('upload')}>Upload first, then sign out</Button>
        <Button variant="secondary" disabled={busy} onClick={() => finish('keep')}>Sign out and keep data</Button>
        <Button variant="destructive" disabled={busy} onClick={() => setStage('discard')}>Discard data…</Button></> :
        <><p>This permanently removes this account’s unsent data from this phone. It cannot be recovered.</p>
          <Button variant="destructive" disabled={busy} onClick={() => finish('discard', DISCARD_CONFIRMATION)}>Yes, discard data and sign out</Button></>}
      <Button variant="secondary" disabled={busy} onClick={() => { setStage('idle'); setError(''); }}>Cancel</Button><Notice error>{error}</Notice>
    </Dialog>}
    {stage === 'idle' && <Notice error>{error}</Notice>}
  </div>;
}

export function HomePage() {
  const { state } = useAuth();
  return <section className="home-page"><p className="eyebrow">A little ground. A good run.</p>
    <h1>Good to see you,<br/><bdi>{state.user.displayName}</bdi>.</h1>
    <EmptyState title="Room to run">You’re signed in. Run recording will arrive in a later build.</EmptyState>
    <div className="home-key"><span className="home-swatch"/>Pine will mark your territory.</div>
  </section>;
}
export function SettingsPage() {
  const { state } = useAuth();
  return <section><p className="eyebrow">Your account</p><h1>Settings</h1>
    <div className="account-summary"><div><strong dir="auto">{state.user.displayName}</strong><p className="copyable" dir="auto">{state.user.email}</p></div></div>
    <nav aria-label="Account settings"><Section title="Sign-in & security">
      <ListRow to="/settings/methods" label="Sign-in methods"/>
      <ListRow to="/settings/sessions" label="Active sessions"/>
      <ListRow to="/settings/password" label="Change password"/>
      <ListRow to="/verify" label="Email verification" value={state.user.emailVerified ? 'Verified' : 'Needed'}/>
    </Section><Section title="Your data">
      <ListRow to="/settings/export" label="Export my data"/>
      <ListRow to="/settings/delete" label="Delete account"/>
    </Section></nav><SignOutControl/>
  </section>;
}

export function MethodsPage() {
  const { auth } = useAuth();
  const load = useCallback(() => auth.api.request('/api/auth/identities'), [auth]);
  const data = useResource(load), [linked, setLinked] = useState(false);
  return <section><p className="eyebrow">Account settings</p><h1>Sign-in methods</h1>
    {data.phase === 'loading' && <Skeleton label="Loading sign-in methods…"/>}
    {data.phase === 'error' && <ErrorState onRetry={data.reload} label="Try again">{data.error}</ErrorState>}
    {data.phase === 'ready' && <>
      {data.value.identities.length ? <ul className="resource-list">{data.value.identities.map(identity => <li key={identity.id}><strong>{identity.provider === 'PASSWORD' ? 'Password' : 'Google'}</strong><span>Linked to your account</span></li>)}</ul> : <EmptyState>No sign-in methods were found. Try refreshing this page.</EmptyState>}
      {data.value.identities.length === 1 && <p className="small">Only one sign-in method is linked. Keep access to that method, or add another.</p>}
      {!data.value.identities.some(identity => identity.provider === 'GOOGLE') && <GoogleButton link onLinked={() => { setLinked(true); data.reload(); }} />}
      <Notice>{linked ? 'Google is linked to your account.' : ''}</Notice>
    </>}
    
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
    {data.phase === 'loading' && <Skeleton label="Loading sessions…"/>}
    {data.phase === 'error' && <ErrorState onRetry={data.reload} label="Try again">{data.error}</ErrorState>}
    {data.phase === 'ready' && (data.value.sessions.length ? <ul className="resource-list">{data.value.sessions.map(session => <li key={session.id}>
      <strong>{session.deviceLabel}</strong><span>{session.current ? 'This device' : 'Another signed-in device'}</span>
      <span className="small">Started {new Date(session.createdAt).toLocaleString()}<br />Last used {new Date(session.lastUsedAt).toLocaleString()}</span>
      {!session.current && <Button variant="secondary" disabled={Boolean(revoking)} onClick={() => revoke(session.id)}>{revoking === session.id ? 'Revoking…' : 'Revoke'}</Button>}
    </li>)}</ul> : <EmptyState>No active sessions were found.</EmptyState>)}
    <Notice error>{error}</Notice><Notice>{message}</Notice>
  </section>;
}

export function ChangePasswordPage() {
  const { auth } = useAuth(), load = useCallback(() => auth.api.request('/api/auth/identities'), [auth]);
  const methods = useResource(load);
  return <section><p className="eyebrow">Account settings</p><h1>Change password</h1>
    {methods.phase === 'loading' && <Skeleton label="Checking your sign-in methods…"/>}
    {methods.phase === 'error' && <ErrorState onRetry={methods.reload} label="Try again">{methods.error}</ErrorState>}
    {methods.phase === 'ready' && (methods.value.identities.some(identity => identity.provider === 'PASSWORD') ? <>
      <p>Your current session stays signed in. Other sessions end immediately.</p>
      <AuthForm kind="change" fields={[{ name: 'currentPassword', label: 'Current password', type: 'password', autoComplete: 'current-password' }, newPasswordField]}
        submitLabel="Change password" busyLabel="Changing password…" onSubmit={body => auth.api.request('/api/auth/password/change', { method: 'POST', body })} />
    </> : <><p>You sign in with Google. To set your first password, request a password reset link and confirm it from your email.</p><Link className="button secondary" to="/forgot">Set a password</Link></>)}
    
  </section>;
}
