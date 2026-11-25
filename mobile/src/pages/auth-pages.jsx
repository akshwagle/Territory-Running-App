import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/context.jsx';
import { friendlyMessage } from '../auth/errors.js';
import { AuthForm, Notice, emailField, passwordField, newPasswordField } from '../components/forms.jsx';
import { BrandMark, Button, InlineNotice } from '../ui/index.jsx';
import { PendingNotice } from '../ui/PendingNotice.jsx';
import googleG from '../assets/google-g.png';
import runnerHero from '../assets/runner-hero.jpg';
import archA from '../assets/arch-a.jpg';
import archB from '../assets/arch-b.jpg';
import archC from '../assets/arch-c.jpg';
import archD from '../assets/arch-d.jpg';
import archE from '../assets/arch-e.jpg';

/* ─── Splash / Onboarding page ─────────────────────────────────────── */
export function SplashPage() {
  const navigate = useNavigate();

  return (
    <section className="splash-page" aria-label="Territory Run welcome">
      {/* Full-bleed runner image background */}
      <div className="splash-bg" aria-hidden="true">
        <img
          src={runnerHero}
          alt=""
          className="splash-runner-img"
        />
        {/* Soft atmospheric vignette for text legibility */}
        <div className="splash-scrim" />
      </div>

      {/* Top Left: Logo */}
      <div className="splash-top-left">
        <div className="splash-brand">
          <div className="splash-brand-icon">
            <BrandMark width="20" height="20" />
          </div>
          <div className="splash-brand-text">
            <span className="splash-brand-title">TERRITORY</span>
            <span className="splash-brand-sub">RUN</span>
          </div>
        </div>
      </div>

      {/* Bottom Content: Clean, spacious, no clutter */}
      <div className="splash-content">
        <h1 className="splash-headline">
          Find Your Next<br />
          Big Challenge.
        </h1>

        {/* Action button */}
        <button
          type="button"
          className="splash-cta"
          onClick={() => navigate('/welcome')}
        >
          <span className="cta-label">Start Journey</span>
          <span className="cta-chevrons" aria-hidden="true">
            <span>›</span><span>›</span><span>›</span><span>›</span>
          </span>
        </button>

        <p className="splash-hint">
          Already have an account?{' '}
          <Link to="/login" className="splash-link">Log in</Link>
        </p>
      </div>
    </section>
  );
}

export function GoogleButton({ link = false, onLinked = () => {}, onError }) {
  const { auth } = useAuth(), navigate = useNavigate();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [needsLink, setNeedsLink] = useState(false);
  const inFlight = useRef(false);
  async function signIn() {
    if (inFlight.current) return; inFlight.current = true;
    setBusy(true); setError(''); setNeedsLink(false); onError?.('');
    try { if (link) onLinked(await auth.linkGoogle()); else { await auth.googleSignIn(); navigate('/home', { replace: true }); } }
    catch (failure) { if (failure.code === 'ACCOUNT_LINK_REQUIRED') { if (onError) onError('Sign in with your password, then link Google from Settings.'); else setNeedsLink(true); } else { const message = friendlyMessage(failure); if (onError) onError(message); else if (!auth.getSnapshot().authOutcome) setError(message); } }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="google-action">{link && <p className="small">Link Google to this account.</p>}
    <button type="button" className="google" onClick={signIn} disabled={busy}><img src={googleG} width="20" height="20" alt=""/>{busy ? 'Opening Google…' : 'Continue with Google'}</button>
    {needsLink && <InlineNotice error>An account with this email already exists. Sign in with your password, then link Google from Settings.<Link className="text-link" to="/login">Go to login</Link></InlineNotice>}
    <Notice error>{error}</Notice>
  </div>;
}

/* Onboarding hero: vertical arch panes behind a wireframe arch mesh. Each
   photo pane holds a different athlete (credits: assets/ARCH_CREDITS.md); the
   empty pane keeps the mesh readable between them. */
const ARCH_PANES = [
  { src: archA, height: '88%' },
  { src: archB, height: '100%' },
  { height: '58%' },
  { src: archC, height: '94%' },
  { src: archD, height: '80%' },
  { src: archE, height: '100%' },
];

function ArchField() {
  const arcs = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const radius = 30, cx = 52 + col * 66 + row * 24, top = 34 + row * 26, base = 300;
      arcs.push(`M${cx - radius} ${base}V${top + radius}a${radius} ${radius} 0 0 1 ${radius * 2} 0V${base}`);
    }
  }
  return <div className="welcome-arches" aria-hidden="true">
    {ARCH_PANES.map((pane, index) => <span key={index} className={pane.src ? 'welcome-arch' : 'welcome-arch welcome-arch--empty'} style={{ height: pane.height }}>{pane.src && <img src={pane.src} alt=""/>}</span>)}
    <svg className="welcome-contours" viewBox="0 0 440 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">{arcs.map((d, index) => <path key={index} d={d}/>)}</svg>
  </div>;
}

export function WelcomePage({ notice = '' }) {
  const [error, setError] = useState('');
  return <section className="welcome">
    <div className="welcome-hero"><div className="welcome-brand"><BrandMark width="44" height="44"/><span>TERRITORY<br/>RUN</span></div>
      <ArchField/>
      <h1>Make your<br/>next run count.</h1>
    </div>
    <div className="welcome-actions"><InlineNotice error>{notice || error}</InlineNotice><PendingNotice suppressed={Boolean(notice || error)}/>
      <div className="stack"><Link className="ui-button ui-button--primary" to="/signup">Create an account</Link><Link className="ui-button ui-button--secondary" to="/login">Log in</Link></div>
      <div className="welcome-or"><span>or</span></div><GoogleButton onError={setError}/>
    </div>
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

    <p>{verified ? 'Your email is confirmed. You can return to the app.' : 'Check your inbox and open the verification link on this phone. Links last 24 hours.'}</p>
    {!verified && hasToken && <Button disabled={busy} onClick={() => act(true)}>{busy ? 'Confirming…' : 'Confirm email'}</Button>}
    {!verified && !hasToken && link?.error && <Notice error>{link.error}</Notice>}
    {!verified && state.user && <><Button variant="secondary" disabled={busy} onClick={() => act(false)}>{busy && !hasToken ? 'Requesting email…' : 'Resend verification email'}</Button>
      <Button variant="quiet" disabled={busy} onClick={async () => { setError(''); try { await auth.loadMe(); } catch (failure) { setError(friendlyMessage(failure)); } }}>I’ve verified my email · check again</Button></>}
    {!verified && !state.user && !hasToken && <Link className="button secondary" to="/login">Log in to request a new email</Link>}
    <Notice>{message}</Notice><Notice error>{error}</Notice>
    <p className="small">Opening a link never signs you in.</p><Link className="text-link" to={state.user ? '/home' : '/login'}>Return to {state.user ? 'home' : 'login'}</Link>
  </section>;
}
