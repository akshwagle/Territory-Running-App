import Reveal from './Reveal.jsx';
import { lazy, Suspense } from 'react';
import { hexPoints } from './Logo.jsx';
import usePresentationMotion from '../hooks/usePresentationMotion.js';

const AnimatedOutline = lazy(() => import('../motion-features.js').then(module => ({ default: module.StepOutline })));
function StaticOutline() { return <polygon points={hexPoints} fill="none" stroke="currentColor" strokeWidth="1" />; }

const how = [
  ['Run', 'Record a GPS run through your local streets.'],
  ['Claim', 'Each hex your valid run passes through becomes yours. The route determines which cells you claim.'],
  ['Defend', 'After a cooldown, another runner can claim those streets. Run through those hexes again to reclaim them.'],
];

export default function HowItWorks() {
  const animate = usePresentationMotion();
  return <section id="how-it-works" className="section container grid-12" aria-labelledby="how-title">
        <div className="section-intro"><p className="eyebrow">01 &nbsp; HOW IT WORKS</p><h2 id="how-title">HOW TERRITORY<br />WORKS.</h2><p>Run tracking and territory claiming are in development.</p><p className="hex-size">Each hex represents an area about 50 m across.</p></div>
        <Reveal className="how-list"><ol>{how.map(([title, copy], i) => <li key={title}><span className="step-hex" aria-hidden="true"><svg viewBox="-32 -32 64 64">{animate ? <Suspense fallback={<StaticOutline />}><AnimatedOutline /></Suspense> : <StaticOutline />}</svg><span>{String(i + 1).padStart(2, '0')}</span></span><div><h3>{title}</h3><p>{copy}</p></div></li>)}</ol></Reveal>
      </section>;
}
