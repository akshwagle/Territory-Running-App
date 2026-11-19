import { useState } from 'react';
import ThemeToggle from './ThemeToggle.jsx';
import { normalizeEmail, validatePhone, validateDisplayName, validatePassword } from '../services/authService.js';

export default function AuthPage({
  theme,
  onToggleTheme,
  onNavigateLanding,
  onSuccess,
  auth,
  initialMode = 'login',
}) {
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [localError, setLocalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    const normEmail = normalizeEmail(email);
    if (!normEmail || !normEmail.includes('@')) {
      setLocalError('Please enter a valid Gmail / email address.');
      return;
    }

    if (mode === 'register') {
      if (!validateDisplayName(displayName)) {
        setLocalError('Full name must be between 2 and 60 characters.');
        return;
      }
      if (!validatePhone(phone)) {
        setLocalError('Please enter a valid phone number (at least 10 digits).');
        return;
      }
      if (!validatePassword(password)) {
        setLocalError('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match. Please re-enter.');
        return;
      }

      setIsSubmitting(true);
      try {
        await auth.register({
          email: normEmail,
          password,
          displayName,
          phone,
        });
        onSuccess?.();
      } catch (err) {
        setLocalError(err.message || 'Registration failed.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Login mode
      if (!password) {
        setLocalError('Please enter your password.');
        return;
      }

      setIsSubmitting(true);
      try {
        await auth.login({ email: normEmail, password });
        onSuccess?.();
      } catch (err) {
        setLocalError(err.message || 'Invalid email or password.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleGoogleAuth = async () => {
    setLocalError('');
    // If the browser has Google OneTap / Google Identity Services initialized
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          setLocalError('Google prompt closed. Please sign in with email/password.');
        }
      });
      return;
    }

    // Friendly prompt when Google Web Client ID is in dev or not yet configured
    setLocalError('Google OAuth is initializing. Enter your Gmail address and details below to authenticate.');
  };

  const isDuplicateAccountError = localError.toLowerCase().includes('already exists');

  return (
    <div className={`auth-page-container ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`}>
      {/* Top Bar Navigation */}
      <header className="auth-topbar">
        <div className="auth-brand" onClick={onNavigateLanding} role="button" tabIndex={0} aria-label="Go to Home">
          <div className="brand-logo-mark">
            <svg viewBox="0 0 28 28" width="24" height="24" fill="none">
              <path d="M4 22L12 4l6 10 6-10v18" stroke="var(--accent-lime)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-title font-heading">RUN & CONQUER</span>
            <span className="brand-tagline">TACTICAL AUTHENTICATION</span>
          </div>
        </div>

        <div className="auth-topbar-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button type="button" className="btn-auth-back" onClick={onNavigateLanding}>
            ← Back to Home
          </button>
        </div>
      </header>

      {/* Main Authentication Card */}
      <main className="auth-card-wrapper">
        <div className="auth-card">
          <div className="auth-card-header">
            <span className="auth-eyebrow font-mono">● OPERATIONAL ACCESS</span>
            <h1 className="auth-title font-heading">
              {mode === 'login' ? 'SIGN IN TO COMMAND' : 'ENLIST NEW RUNNER'}
            </h1>
            <p className="auth-subtitle">
              {mode === 'login'
                ? 'Enter your verified account credentials to resume conquest.'
                : 'Join the territory warfare. One verified Gmail account per runner.'}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="auth-mode-tabs" role="tablist" aria-label="Authentication Mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`auth-mode-tab ${mode === 'login' ? 'is-active' : ''}`}
              onClick={() => {
                setMode('login');
                setLocalError('');
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`auth-mode-tab ${mode === 'register' ? 'is-active' : ''}`}
              onClick={() => {
                setMode('register');
                setLocalError('');
              }}
            >
              Create Account
            </button>
          </div>

          {/* Error Banner */}
          {localError && (
            <div className="auth-alert-banner" role="alert">
              <span className="alert-icon">⚠️</span>
              <div className="alert-content">
                <p className="alert-message">{localError}</p>
                {isDuplicateAccountError && mode === 'register' && (
                  <button
                    type="button"
                    className="btn-alert-action"
                    onClick={() => {
                      setMode('login');
                      setLocalError('');
                    }}
                  >
                    Switch to Sign In →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Google Sign-In Action */}
          <div className="google-auth-section">
            <button
              type="button"
              className="btn-google-auth"
              onClick={handleGoogleAuth}
              title="Authenticate securely with Google"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" className="google-icon">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}</span>
            </button>
            <div className="auth-divider">
              <span>{mode === 'login' ? 'OR SIGN IN WITH EMAIL' : 'OR REGISTER WITH DETAILS'}</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            {mode === 'register' && (
              <>
                <div className="form-group">
                  <label htmlFor="reg-fullname" className="form-label">
                    Full Name <span className="required-star">*</span>
                  </label>
                  <input
                    id="reg-fullname"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Arjun Sharma"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="reg-phone" className="form-label">
                    Phone Number <span className="required-star">*</span>
                  </label>
                  <input
                    id="reg-phone"
                    type="tel"
                    className="form-input font-mono"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label htmlFor="auth-email" className="form-label">
                Gmail / Email Address <span className="required-star">*</span>
              </label>
              <input
                id="auth-email"
                type="email"
                className="form-input font-mono"
                placeholder="runner@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="auth-password" className="form-label">
                Password <span className="required-star">*</span>
              </label>
              <input
                id="auth-password"
                type="password"
                className="form-input"
                placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                required
                disabled={isSubmitting}
              />
            </div>

            {mode === 'register' && (
              <div className="form-group">
                <label htmlFor="reg-confirm-password" className="form-label">
                  Confirm Password <span className="required-star">*</span>
                </label>
                <input
                  id="reg-confirm-password"
                  type="password"
                  className="form-input"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  disabled={isSubmitting}
                />
              </div>
            )}

            <button
              type="submit"
              className="btn-auth-submit font-heading"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span>● COMMUNICATING WITH SERVER...</span>
              ) : mode === 'login' ? (
                'SIGN IN TO COMMAND →'
              ) : (
                'COMPLETE ENLISTMENT →'
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="auth-card-footer">
            {mode === 'login' ? (
              <p>
                Don&apos;t have an account yet?{' '}
                <button
                  type="button"
                  className="btn-link-switch"
                  onClick={() => {
                    setMode('register');
                    setLocalError('');
                  }}
                >
                  Enlist now
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  className="btn-link-switch"
                  onClick={() => {
                    setMode('login');
                    setLocalError('');
                  }}
                >
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
