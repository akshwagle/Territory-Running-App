import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';
import * as m from 'motion/react-m';
import Logo from './components/Logo.jsx';
import DownloadControl from './components/DownloadControl.jsx';
import TerritoryMap from './components/TerritoryMap.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import Roadmap from './components/Roadmap.jsx';
import InstallGuide from './components/InstallGuide.jsx';
import FAQ from './components/FAQ.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import useRelease, { releaseDate, releaseErrorMessage } from './hooks/useRelease.js';
import useDownloadVisibility, { getDevice } from './hooks/useDownloadVisibility.js';
import useScrolled from './hooks/useScrolled.js';
import useStickyPresence from './hooks/useStickyPresence.js';
import usePresentationMotion, { loadMotion } from './hooks/usePresentationMotion.js';
import { useTheme } from './hooks/useTheme.js';
import { useAuth } from './hooks/useAuth.js';

const Dashboard = lazy(() => import('./components/Dashboard.jsx'));
const AuthPage = lazy(() => import('./components/AuthPage.jsx'));

function LandingPage({ theme, toggleTheme, onNavigate, isAuthenticated }) {
  const { state, retry } = useRelease();
  const [device] = useState(getDevice);
  const heroRef = useRef(null);
  const installRef = useRef(null);
  const animate = usePresentationMotion();
  const showSticky = useDownloadVisibility(heroRef, installRef, device === 'android');
  const sticky = useStickyPresence(showSticky);
  const scrolled = useScrolled();
  const control = { state, retry, device };

  return <div className={sticky.present ? 'landing-page has-sticky' : 'landing-page'}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="topbar" data-scrolled={scrolled}>
      <nav className="container topbar-inner" aria-label="Main">
        <a className="brand-link" href="#top" aria-label="Territory Run home">
          <span className="brand-logo-mark" aria-hidden="true">
            <svg viewBox="0 0 28 28" width="24" height="24" fill="none">
              <path d="M4 22L12 4l6 10 6-10v18" stroke="var(--accent-lime)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="brand-text-block">
            <span className="brand-title font-heading">RUN & CONQUER</span>
            <span className="brand-tagline">RUN · CLAIM · DEFEND</span>
          </span>
        </a>
        <div className="topbar-links">
          <a href="#top" className="topbar-nav-link active">Home</a>
          <a href="#activities" className="topbar-nav-link" onClick={(e) => { e.preventDefault(); onNavigate('dashboard'); }}>Activities</a>
          <a href="#communities" className="topbar-nav-link" onClick={(e) => { e.preventDefault(); onNavigate('dashboard'); }}>Communities</a>
          <a href="#map" className="topbar-nav-link" onClick={(e) => { e.preventDefault(); onNavigate('dashboard'); }}>Map</a>
          <a href="#challenges" className="topbar-nav-link" onClick={(e) => { e.preventDefault(); onNavigate('dashboard'); }}>Challenges</a>
          <a href="#leaderboard" className="topbar-nav-link" onClick={(e) => { e.preventDefault(); onNavigate('dashboard'); }}>Leaderboard</a>
        </div>
        <div className="topbar-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button type="button" className="btn-nav-login" onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'auth')}>Log In</button>
          <button type="button" className="btn-nav-get-started" onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'auth')}>Get Started →</button>
          <div className="sr-only"><DownloadControl {...control} compact /></div>
        </div>
      </nav>
    </header>

    <main id="main" tabIndex={-1}>
      <section id="top" className="hero container athletic-hero" aria-labelledby="hero-title">
        <div className="hero-two-column-layout">
          {/* LEFT COLUMN: ~45% */}
          <div className="hero-copy-column">
            <p className="eyebrow hero-kicker">GPS RUNNING / TERRITORY CONQUEST</p>
            <h1 id="hero-title" aria-label="Run it. Claim it. Defend it.">
              {['RUN IT.', 'CLAIM IT.', 'DEFEND IT.'].map((line, index) => (
                <m.span
                  key={line}
                  className={line === 'DEFEND IT.' ? (theme === 'light' ? 'hero-headline-defend brush-highlight' : 'hero-headline-defend glow-defend') : 'hero-headline-line'}
                  aria-hidden="true"
                  initial={!animate ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                >
                  {line}
                </m.span>
              ))}
            </h1>
            <p className="hero-description">
              Turn your everyday runs into a battle for territory. Track your routes, claim real-world areas and compete with runners around you.
            </p>
            <div className="hero-cta-group">
              <button type="button" className="hero-btn-primary" onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'auth')}>
                Get Started <span aria-hidden="true">→</span>
              </button>
              <button type="button" className="hero-btn-secondary" onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'auth')}>
                Explore the Platform
              </button>
            </div>

            {/* Accessible slots for release download tests and intersection observers without visual clutter */}
            <div className="sr-only">
              <div className="hero-download" ref={heroRef}><DownloadControl {...control} /></div>
              <div className={`hero-release${state.kind === 'loading' ? ' release-placeholder' : ''}`} aria-live="polite" aria-busy={state.kind === 'loading'}>
                {state.kind === 'release' && <><span className="version-chip">v{state.release.versionName} · Android · early build</span><time dateTime={state.release.publishedAt}>Released {releaseDate(state.release.publishedAt)}</time></>}
                {state.kind === 'loading' && <p role="status">Checking for the latest version…</p>}
                {state.kind === 'empty' && <p role="status">The first version is coming soon.</p>}
                {state.kind === 'error' && <p role="alert">{releaseErrorMessage}</p>}
              </div>
              {device === 'desktop' && <p className="desktop-note" data-ready={state.kind === 'release'} aria-hidden={state.kind !== 'release'}>Open this page on your Android phone to install.</p>}
            </div>
          </div>

          {/* RIGHT COLUMN: ~55% VISUAL STAGE */}
          <div className="hero-visual-stage" aria-hidden="true">
            {/* Fine lime-green topographic contour lines */}
            <svg className="hero-topo-bg" viewBox="0 0 700 500" fill="none" preserveAspectRatio="xMidYMid slice">
              <g stroke="var(--accent-lime)" strokeWidth="1" strokeOpacity="0.22">
                <ellipse cx="380" cy="260" rx="360" ry="220" />
                <ellipse cx="380" cy="260" rx="280" ry="170" />
                <ellipse cx="380" cy="260" rx="200" ry="120" strokeDasharray="3 5" />
                <ellipse cx="380" cy="260" rx="130" ry="80" />
                <path d="M 50,420 Q 200,340 380,360 T 700,310" />
                <path d="M 80,120 Q 280,180 500,140 T 700,160" strokeDasharray="4 6" />
              </g>
            </svg>

            {/* Technical markings and coordinates */}
            <div className="hero-tech-overlays font-mono">
              <span className="tech-coord-vert">27.1767° N · 78.0081° E</span>
              <span className="tech-crosshair ch-tl">+</span>
              <span className="tech-crosshair ch-br">+</span>
            </div>

            {/* Hexagonal territory outlines in upper-right */}
            <div className="hero-hex-cluster">
              <svg viewBox="0 0 220 180" width="200" height="160" fill="none">
                <polygon points="40,15 75,35 75,75 40,95 5,75 5,35" stroke="var(--accent-lime)" strokeWidth="1.5" strokeOpacity="0.35" />
                <polygon points="110,15 145,35 145,75 110,95 75,75 75,35" stroke="var(--accent-lime)" strokeWidth="1.5" strokeOpacity="0.5" />
                <polygon points="180,15 215,35 215,75 180,95 145,75 145,35" stroke="var(--accent-lime)" strokeWidth="1.5" strokeOpacity="0.3" />
                <polygon points="75,80 110,100 110,140 75,160 40,140 40,100" stroke="var(--accent-lime)" strokeWidth="1.5" strokeOpacity="0.45" />
                {/* Highlighted central territory hexagon */}
                <polygon points="145,80 180,100 180,140 145,160 110,140 110,100" fill="var(--accent-lime)" fillOpacity="0.85" stroke="var(--accent-lime)" strokeWidth="2" />
                <path d="M140 126l-3-6 4 2 4-5 4 5 4-2-3 6z" fill="#070907" />
              </svg>
            </div>

            {/* Sprinting Athlete Image (occupying right half, seamless transparent edges) */}
            <div className="hero-athlete-wrap">
              <img
                src={theme === 'dark' ? '/assets/athlete-runner-dark.png' : '/assets/athlete-runner-light.png'}
                alt="Sprinting runner in athletic motion"
                className="hero-athlete-img"
              />
            </div>

            {/* Floating LIVE RUN Information Panel */}
            <div className="live-run-panel">
              <div className="live-run-header">
                <span className="live-run-pulse-dot" />
                <span className="live-run-title font-mono">LIVE RUN</span>
              </div>
              <div className="live-run-sparkline">
                <svg viewBox="0 0 120 30" width="120" height="30" fill="none" stroke="var(--accent-lime)" strokeWidth="2">
                  <path d="M0 24 Q30 8 60 18 T120 10" />
                  <path d="M0 24 Q30 8 60 18 T120 10 L120 30 L0 30 Z" fill="var(--accent-lime)" fillOpacity="0.15" stroke="none" />
                </svg>
              </div>
              <div className="live-run-metric-primary">
                <span className="live-dist-val font-heading">5.42</span>
                <span className="live-dist-unit font-mono">km</span>
              </div>
              <div className="live-run-metrics-row font-mono">
                <div className="live-metric-col">
                  <span className="live-metric-label">PACE</span>
                  <span className="live-metric-val">4:18 <small>/km</small></span>
                </div>
                <div className="live-metric-divider" />
                <div className="live-metric-col">
                  <span className="live-metric-label">HR</span>
                  <span className="live-metric-val">164 <small>bpm</small></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM FEATURE STRIP */}
        <div className="hero-features-strip" aria-label="Key Features">
          <div className="hero-feature-card">
            <div className="feature-icon-badge">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="5" r="2" />
                <path d="M10 22v-6l-2-2 3-5 3 2 3-1" />
                <path d="M7 11l3-1 2 3 4-2" />
              </svg>
            </div>
            <div className="feature-info">
              <h3 className="feature-title font-heading">TRACK RUNS</h3>
              <p className="feature-desc">GPS-based running with distance, pace and route history.</p>
            </div>
          </div>

          <div className="hero-feature-card">
            <div className="feature-icon-badge">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
            </div>
            <div className="feature-info">
              <h3 className="feature-title font-heading">CLAIM TERRITORY</h3>
              <p className="feature-desc">Convert your running routes into real-world territories.</p>
            </div>
          </div>

          <div className="hero-feature-card">
            <div className="feature-icon-badge">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <div className="feature-info">
              <h3 className="feature-title font-heading">DEFEND & EXPAND</h3>
              <p className="feature-desc">Run again to strengthen and defend your controlled areas.</p>
            </div>
          </div>

          <div className="hero-feature-card">
            <div className="feature-icon-badge">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h3M18 9h3a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-3" />
                <path d="M6 2h12v7a6 6 0 0 1-12 0V2zM12 15v5M8 20h8" />
              </svg>
            </div>
            <div className="feature-info">
              <h3 className="feature-title font-heading">COMPETE</h3>
              <p className="feature-desc">Climb leaderboards and win seasonal challenges.</p>
            </div>
          </div>
        </div>

        {/* Down arrow indicator */}
        <div className="hero-scroll-prompt">
          <a href="#how-it-works" className="hero-scroll-arrow" aria-label="Scroll to how it works">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </a>
        </div>

        <div className="hero-footnote font-mono sr-only"><span>ANDROID / EARLY ACCESS</span></div>
      </section>

      <HowItWorks />

      <Roadmap />

      <InstallGuide control={control} sectionRef={installRef} />

      <FAQ />

    </main>
    <footer className="footer"><div className="container footer-grid">
      <a className="brand-link" href="#top" aria-label="Territory Run home"><Logo /></a>
      <p className="copyright font-mono">© 2026 Territory Run</p>
      <nav className="footer-links" aria-label="Footer">
        <DownloadControl {...control} text />
        <a href="#how-it-works">How it works</a><a href="#install">Install</a><a href="#faq">FAQ</a><a href="#top">Back to top</a>
      </nav>
    </div></footer>
    {sticky.present && <aside className="mobile-download" data-visible={sticky.entered} aria-label="Android download" aria-hidden={!showSticky} inert={!showSticky}>
      <span>TERRITORY RUN<br /><small>{state.kind === 'release' ? `v${state.release.versionName} · Early build` : 'Android early build'}</small></span><DownloadControl {...control} compact />
    </aside>}
  </div>;
}

export default function App() {
  const auth = useAuth();
  const [view, setView] = useState(() => {
    if (typeof window === 'undefined') return 'landing';
    const hash = window.location.hash;
    if (hash === '#dashboard') return 'dashboard';
    if (hash === '#auth' || hash === '#login' || hash === '#register') return 'auth';
    return 'landing';
  });
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === '#dashboard') {
        setView('dashboard');
      } else if (hash === '#auth' || hash === '#login' || hash === '#register') {
        setView('auth');
      } else if (hash === '#home' || hash === '#top' || hash === '') {
        setView('landing');
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleNavigate = (newView) => {
    setView(newView);
    if (newView === 'dashboard') {
      window.location.hash = '#dashboard';
    } else if (newView === 'auth') {
      window.location.hash = '#auth';
    } else {
      window.location.hash = '#top';
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadMotion} strict>
        {view === 'auth' ? (
          <Suspense fallback={<div className="dashboard-loading font-mono">Loading Authentication...</div>}>
            <AuthPage
              theme={theme}
              onToggleTheme={toggleTheme}
              onNavigateLanding={() => handleNavigate('landing')}
              onSuccess={() => handleNavigate('dashboard')}
              auth={auth}
            />
          </Suspense>
        ) : view === 'dashboard' ? (
          <Suspense fallback={<div className="dashboard-loading font-mono">Loading Tactical Dashboard...</div>}>
            <Dashboard
              theme={theme}
              onToggleTheme={toggleTheme}
              onNavigateLanding={() => handleNavigate('landing')}
              onLogout={async () => {
                await auth.logout();
                handleNavigate('landing');
              }}
              user={auth.user}
              profile={auth.profile}
            />
          </Suspense>
        ) : (
          <LandingPage
            theme={theme}
            toggleTheme={toggleTheme}
            onNavigate={handleNavigate}
            isAuthenticated={auth.isAuthenticated}
          />
        )}
      </LazyMotion>
    </MotionConfig>
  );
}
