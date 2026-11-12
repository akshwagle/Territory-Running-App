import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/context.jsx';
import { friendlyMessage } from '../auth/errors.js';
import { AuthForm, Notice, emailField, passwordField, newPasswordField } from '../components/forms.jsx';

export function GoogleButton({ link = false, onLinked = () => {} }) {
  const { auth } = useAuth(), navigate = useNavigate();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [needsLink, setNeedsLink] = useState(false);
  async function signIn() {
    setBusy(true); setError(''); setNeedsLink(false);
    try { if (link) onLinked(await auth.linkGoogle()); else { await auth.googleSignIn(); navigate('/home', { replace: true }); } }
    catch (failure) { if (failure.code === 'ACCOUNT_LINK_REQUIRED') setNeedsLink(true); else if (!auth.getSnapshot().authOutcome) setError(friendlyMessage(failure)); }
    finally { setBusy(false); }
  }
  return <div className="google-action">
    <button className="secondary google" onClick={signIn} disabled={busy}>{busy ? 'Opening Google…' : link ? 'Link Google' : 'Continue with Google'}</button>
    {needsLink && <div className="notice" role="alert"><p>An account with this email already exists. Sign in with your password, then link Google from Settings.</p><Link className="button secondary" to="/login">Go to login</Link></div>}
    <Notice error>{error}</Notice>
  </div>;
}

export function WelcomePage() {
  return <section className="welcome">
    <p className="eyebrow">A little ground. A good run.</p><h1>Make your<br />next run count.</h1>
    <p>Sign in to Territory Run. Your account travels with you.</p>
    <div className="stack"><Link className="button primary" to="/signup">Create an account</Link><Link className="button secondary" to="/login">Log in with email</Link></div>
    <p className="divider">or</p><GoogleButton />
    <p className="small">Android edition · {__APP_VERSION__}</p>
  </section>;
}

export function SignupPage() {
  const { auth } = useAuth(), navigate = useNavigate();
  return <section><p className="eyebrow">Start here</p><h1>Create an account</h1>
    <AuthForm kind="signup" fields={[{ name: 'displayName', label: 'Display name', autoComplete: 'nickname' }, emailField,
      { ...passwordField, autoComplete: 'new-password', help: 'Use 10–128 characters. Spaces are allowed.' }]}
      submitLabel="Create account" busyLabel="Creating account…" onSubmit={auth.signup} onSuccess={() => navigate('/home', { replace: true })} />
    <GoogleButton /><p>Already have an account? <Link to="/login">Log in</Link>.</p>
  </section>;
}

export function LoginPage() {
  const { auth } = useAuth(), navigate = useNavigate();
  return <section><p className="eyebrow">Good to see you</p><h1>Log in</h1>
    <AuthForm kind="login" fields={[{ ...emailField, autoComplete: 'username' }, passwordField]} submitLabel="Log in" busyLabel="Signing in…"
      onSubmit={auth.login} onSuccess={() => navigate('/home', { replace: true })} />
    <p><Link to="/forgot">Forgot your password?</Link></p><GoogleButton />
    <p>New here? <Link to="/signup">Create an account</Link>.</p>
  </section>;
}

export function ForgotPage() {
  const { auth } = useAuth();
  return <section><p className="eyebrow">Back on track</p><h1>Reset your password</h1>
    <p>Enter your email. If an account exists, we’ll send a link that lasts 30 minutes.</p>
    <AuthForm kind="forgot" fields={[emailField]} submitLabel="Send reset link" busyLabel="Requesting link…"
      onSubmit={body => auth.api.request('/api/auth/password/forgot', { auth: false, method: 'POST', body })} />
    <Link className="text-link" to="/login">Back to login</Link>
  </section>;
}

export function ResetPage({ link, clearLink }) {
  const { auth } = useAuth(), [done, setDone] = useState(false);
  if (done) return <section><h1>Password updated</h1><p role="status">Sign in with your new password. Your saved data stays on this phone.</p><Link className="button primary" to="/login">Go to login</Link></section>;
  return <section><p className="eyebrow">Back on track</p><h1>Choose a new password</h1>
    {!link?.token || link.action !== 'reset' ? <><Notice error>{link?.error || 'Open the reset link from your email to continue.'}</Notice><Link className="button secondary" to="/forgot">Request a new link</Link></> :
      <><p>This changes your password and ends all existing sessions. It does not sign you in.</p>
        <AuthForm kind="reset" fields={[newPasswordField]} submitLabel="Update password" busyLabel="Updating password…"
          onSubmit={body => auth.resetPassword({ ...body, token: link.token })} onSuccess={() => { clearLink(link); setDone(true); }} />
        <Link className="text-link" to="/forgot">Request a new link</Link></>}
  </section>;
}

export function VerifyPage({ link, clearLink }) {
  const { auth, state } = useAuth();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [done, setDone] = useState(false);
  const hasToken = link?.action === 'verify' && link.token;
  async function act(confirm) {
    setBusy(true); setMessage(''); setError('');
    try {
      const result = confirm ? await auth.confirmEmail(link.token) : await auth.api.request('/api/auth/verify-email/request', { method: 'POST', body: {} });
      setMessage(result.message);
      if (confirm) { clearLink(link); setDone(true); }
    } catch (failure) { setError(friendlyMessage(failure)); }
    finally { setBusy(false); }
  }
  // An explicit email link must be checked even when this phone's current
  // account is already verified; it may be expired or belong to someone else.
  const verified = done || (!link && state.user?.emailVerified === true);
  return <section><p className="eyebrow">One small step</p><h1>{verified ? 'Email verified' : 'Verify your email'}</h1>
    <Notice>{state.message}</Notice>
    <p>{verified ? 'Your email is confirmed. You can return to the app.' : 'Check your inbox and open the verification link on this phone. Links last 24 hours.'}</p>
    {!verified && hasToken && <button className="primary" disabled={busy} onClick={() => act(true)}>{busy ? 'Confirming…' : 'Confirm email'}</button>}
    {!verified && !hasToken && link?.error && <Notice error>{link.error}</Notice>}
    {!verified && state.user && <><button className="secondary" disabled={busy} onClick={() => act(false)}>{busy && !hasToken ? 'Requesting email…' : 'Resend verification email'}</button>
      <button className="text-link" disabled={busy} onClick={async () => { setError(''); try { await auth.loadMe(); } catch (failure) { setError(friendlyMessage(failure)); } }}>I’ve verified my email · check again</button></>}
    {!verified && !state.user && !hasToken && <Link className="button secondary" to="/login">Log in to request a new email</Link>}
    <Notice>{message}</Notice><Notice error>{error}</Notice>
    <p className="small">Opening a link never signs you in.</p><Link className="text-link" to={state.user ? '/home' : '/login'}>Return to {state.user ? 'home' : 'login'}</Link>
  </section>;
}
