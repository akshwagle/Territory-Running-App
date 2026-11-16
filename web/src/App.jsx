import { useRef, useState } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';
import * as m from 'motion/react-m';
import Logo from './components/Logo.jsx';
import DownloadControl from './components/DownloadControl.jsx';
import TerritoryMap from './components/TerritoryMap.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import Roadmap from './components/Roadmap.jsx';
import InstallGuide from './components/InstallGuide.jsx';
import FAQ from './components/FAQ.jsx';
import useRelease, { releaseDate, releaseErrorMessage } from './hooks/useRelease.js';
import useDownloadVisibility, { getDevice } from './hooks/useDownloadVisibility.js';

import useScrolled from './hooks/useScrolled.js';
import useStickyPresence from './hooks/useStickyPresence.js';
import usePresentationMotion, { loadMotion } from './hooks/usePresentationMotion.js';
function LandingPage() {
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
      <div className="tactical-status-strip" aria-hidden="true">
        <div className="container tactical-status-inner">
          <div className="tactical-status-item">
            <span className="tactical-ping"></span>
            <span className="font-mono">DEFCON 2 // ACTIVE SECTOR RECON</span>
          </div>
          <div className="tactical-status-item hidden-mobile">
            <span className="font-mono">GPS FIX: 98% / 14 SATS</span>
            <span className="tactical-divider">•</span>
            <span className="font-mono">MGRS 32U PU 4821 9104</span>
          </div>
        </div>
      </div>
      <nav className="container topbar-inner" aria-label="Main">
        <a className="brand-link" href="#top" aria-label="Territory Run home"><Logo /></a>
        <div className="topbar-links">
          <a href="#how-it-works">Briefing</a>
          <a href="#roadmap">Roadmap</a>
          <a href="#install">Install</a>
          <a href="#faq">FAQ</a>
        </div>
        <DownloadControl {...control} compact />
      </nav>
    </header>

    <main id="main" tabIndex={-1}>
      <div className="tactical-hero-ribbon container" aria-label="Sector control overview">
        <div className="tactical-ribbon-live">
          <span className="tactical-live-dot" aria-hidden="true"></span>
          <span className="font-mono font-semibold">LIVE SECTOR FEED // ALPHA-7</span>
        </div>
        <div className="tactical-conquest-overview">
          <div className="conquest-legend font-mono">
            <span className="legend-allied"><i aria-hidden="true"></i> 42.4% ALLIED</span>
            <span className="legend-hostile"><i aria-hidden="true"></i> 35.2% HOSTILE</span>
            <span className="legend-contested"><i aria-hidden="true"></i> 14.1% CONTESTED</span>
            <span className="legend-neutral hidden-mobile"><i aria-hidden="true"></i> 8.3% NEUTRAL</span>
          </div>
          <div className="conquest-meter-bar" aria-hidden="true">
            <div className="bar-allied" style={{ width: '42.4%' }} />
            <div className="bar-hostile" style={{ width: '35.2%' }} />
            <div className="bar-contested" style={{ width: '14.1%' }} />
            <div className="bar-neutral" style={{ width: '8.3%' }} />
          </div>
        </div>
      </div>

      <section id="top" className="hero container grid-12" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow hero-kicker">GPS RUNNING // TACTICAL TERRITORY CONQUEST</p>
          <h1 id="hero-title" aria-label="Run it. Claim it. Defend it.">{['RUN IT.', 'CLAIM IT.', 'DEFEND IT.'].map((line, index) => <m.span key={line} aria-hidden="true" initial={!animate ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: index * 0.08 }}>{line}</m.span>)}</h1>
          <p className="hero-description">Every street you run turns hexes on the map into your territory. Another runner can take them back.</p>
          <div className="hero-download" ref={heroRef}><DownloadControl {...control} /></div>
          <div className={`hero-release${state.kind === 'loading' ? ' release-placeholder' : ''}`} aria-live="polite" aria-busy={state.kind === 'loading'}>
            {state.kind === 'release' && <><span className="version-chip">v{state.release.versionName} · Android · early build</span><time dateTime={state.release.publishedAt}>Released {releaseDate(state.release.publishedAt)}</time></>}
            {state.kind === 'loading' && <p role="status">Checking for the latest version…</p>}
            {state.kind === 'empty' && <p role="status">The first version is coming soon.</p>}
            {state.kind === 'error' && <p role="alert">{releaseErrorMessage}</p>}
          </div>
          {device === 'desktop' && <p className="desktop-note" data-ready={state.kind === 'release'} aria-hidden={state.kind !== 'release'}>Open this page on your Android phone to install.</p>}

          <div className="hero-telemetry-matrix" aria-label="Sortie metrics preview">
            <div className="telemetry-pod">
              <span className="pod-label">SORTIE DIST</span>
              <div className="pod-value font-telemetry">8.42<small>KM</small></div>
              <span className="pod-sub font-mono">GPS-HD // H3 R11</span>
            </div>
            <div className="telemetry-pod">
              <span className="pod-label">TARGET PACE</span>
              <div className="pod-value font-telemetry">4:32<small>/KM</small></div>
              <span className="pod-sub font-mono text-allied">+12s Sector Record</span>
            </div>
            <div className="telemetry-pod">
              <span className="pod-label">COMBAT PULSE</span>
              <div className="pod-value font-telemetry">164<small>BPM</small></div>
              <span className="pod-sub font-mono text-threat">Zone 4 Tactical</span>
            </div>
          </div>

          <a className="how-link" href="#how-it-works">Ops Briefing <span aria-hidden="true">↓</span></a>
        </div>
        <div className="hero-art">
          <div className="tactical-command-deck">
            <div className="command-deck-header font-mono" aria-hidden="true">
              <div className="deck-coordinates">
                <span className="text-allied">[+]</span>
                <span>LAT 60.1834° N / LON 24.9521° E</span>
              </div>
              <div className="deck-grid">
                <span className="grid-badge">GRID 4A-NORD</span>
                <span className="radar-status text-allied">● RADAR 3.2KM</span>
              </div>
            </div>
            <TerritoryMap />
            <div className="command-deck-footer font-mono" aria-hidden="true">
              <span>RADAR SCAN: 3.2KM RADIUS • AES-256-MIL</span>
              <span className="text-allied">[WAR ROOM ACTIVE]</span>
            </div>
          </div>
        </div>
        <div className="hero-footnote font-mono"><span>ANDROID / EARLY ACCESS</span></div>
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
  return <MotionConfig reducedMotion="user"><LazyMotion features={loadMotion} strict><LandingPage /></LazyMotion></MotionConfig>;
}
