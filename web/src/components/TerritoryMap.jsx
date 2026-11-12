import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

const radius = 30;
const position = ([q, r]) => [260 + Math.sqrt(3) * radius * (q + r / 2), 243 + radius * 1.5 * r];
const points = Array.from({ length: 6 }, (_, i) => {
  const a = (i * 60 - 90) * Math.PI / 180;
  return `${Math.cos(a) * 28.5},${Math.sin(a) * 28.5}`;
}).join(' ');
const cells = [];
for (let q = -5; q <= 5; q++) for (let r = -4; r <= 4; r++) {
  const [x, y] = position([q, r]);
  if (x > 25 && x < 495 && y > 40 && y < 444) cells.push([q, r]);
}
const route = [[-2, 1], [-1, 1], [0, 0], [1, 0], [1, -1], [2, -1]];
const cycleLength = 15;

export default function TerritoryMap() {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(!document.hidden);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!window.IntersectionObserver) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(ref.current);
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);
  useEffect(() => {
    if (reduced || !visible || !tabVisible) return;
    const timer = setInterval(() => setFrame((value) => (value + 1) % cycleLength), 350);
    return () => clearInterval(timer);
  }, [reduced, visible, tabVisible]);
  const step = reduced ? 8 : frame;

  return <figure className="map-figure" ref={ref}>
    <div className="map-topline"><span>FIELD NOTES / 001</span><span>~50 M / HEX</span></div>
    <svg className="territory-map" viewBox="0 0 520 492" role="img" aria-labelledby="map-title map-desc">
      <title id="map-title">How territory could change after a run</title>
      <desc id="map-desc">An illustrative street grid. Six pine hexes follow a running route; a clay rival takes one back. This is not a live map.</desc>
      <defs><clipPath id="map-clip"><rect x="1" y="1" width="518" height="490" /></clipPath></defs>
      <g clipPath="url(#map-clip)">
        <g fill="none" stroke="var(--color-line)" strokeWidth="1">
          <path d="M-20 108 535 108M-20 351 535 351M101 -20V512M416 -20V512" strokeWidth="12" />
          <path d="M-20 108 535 108M-20 351 535 351M101 -20V512M416 -20V512" stroke="var(--color-paper)" strokeWidth="10" />
          <path d="m-40 470 600-405" strokeWidth="20" />
          <path d="m-40 470 600-405" stroke="var(--color-paper)" strokeWidth="18" />
        </g>
        <g fill="none" stroke="var(--color-line)" strokeWidth="1">
          {cells.map((cell) => <polygon key={cell.join(',')} points={points} transform={`translate(${position(cell).join(' ')})`} />)}
        </g>
        <g fill="var(--color-pine)">
          {route.map((cell, i) => <polygon key={i} points={points} transform={`translate(${position(cell).join(' ')})`} opacity={step > i ? 1 : 0} />)}
        </g>
        <path d={`M${route.map((cell) => position(cell).join(',')).join(' L')}`} fill="none" stroke="var(--color-paper)" strokeWidth="2" strokeDasharray="3 5" />
        <g fill="var(--color-clay)">
          <polygon points={points} transform={`translate(${position([2, 0]).join(' ')})`} opacity={step >= 7 ? 1 : 0} />
          <polygon className="rival-takeover" points={points} transform={`translate(${position([1, 0]).join(' ')})`} opacity={step >= 8 ? 1 : 0} />
        </g>
        <g className="map-labels" fill="var(--color-muted)">
          <text x="21" y="95">NORTH STREET</text><text x="267" y="376">PARK ROAD</text>
          <text x="439" y="56">N ↑</text>
        </g>
        <g transform="translate(24 454)" stroke="var(--color-muted)" fill="none"><path d="M0-4V4M0 0h100M100-4V4" /></g>
        <text x="134" y="459" className="map-labels" fill="var(--color-muted)">ILLUSTRATION, NOT TO SCALE</text>
      </g>
    </svg>
    <figcaption><span><i className="legend-pine" />Your territory</span><span><i className="legend-clay" />A rival’s territory</span><small>Illustration, not a live map</small></figcaption>
  </figure>;
}
