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
    <header className="topbar" data-scrolled={scrolled}><nav className="container topbar-inner" aria-label="Main">
      <a className="brand-link" href="#top" aria-label="Territory Run home"><Logo /></a>
      <DownloadControl {...control} compact />
    </nav></header>
    <main id="main" tabIndex={-1}>
      <section id="top" className="hero container grid-12" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow hero-kicker">GPS RUNNING / TERRITORY CAPTURE</p>
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
          <a className="how-link" href="#how-it-works">How it works <span aria-hidden="true">↓</span></a>
        </div>
        <div className="hero-art"><TerritoryMap /></div>
        <div className="hero-footnote"><span>ANDROID / EARLY ACCESS</span></div>
      </section>

      <HowItWorks />

      <Roadmap />

      <InstallGuide control={control} sectionRef={installRef} />

      <FAQ />

    </main>
    <footer className="footer"><div className="container footer-grid">
      <a className="brand-link" href="#top" aria-label="Territory Run home"><Logo /></a>
      <p className="copyright">© 2026 Territory Run</p>
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
