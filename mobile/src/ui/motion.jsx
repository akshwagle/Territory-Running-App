import { useEffect, useRef, useState } from 'react';
import { tap } from './haptics.js';

export function prefersReducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
}
// Count-up for hero values only (never live run numbers). Reduced motion or a
// non-finite value shows the final value at once. Returns the displayed number.
export function useCountUp(value, { duration = 700, enabled = true } = {}) {
  const target = Number.isFinite(value) ? value : null;
  const [shown, setShown] = useState(() => (target === null || !enabled || prefersReducedMotion() ? target : 0));
  const frame = useRef(0);
  useEffect(() => {
    if (target === null || !enabled || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') { setShown(target); return undefined; }
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      setShown(target * (1 - (1 - t) ** 3));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration, enabled]);
  return shown;
}
// <CountUp value={12} decimals={0}/> keeps tabular numerals; the accessible text is the final value.
export function CountUp({ value, decimals = 0, duration = 700, format }) {
  const shown = useCountUp(value, { duration });
  const fmt = n => (format ? format(n) : Number(n).toFixed(decimals));
  if (shown === null) return <span className="ui-count">{'–'}</span>;
  return <span className="ui-count"><span aria-hidden="true">{fmt(shown)}</span><span className="sr-only">{fmt(value)}</span></span>;
}
// Hold-to-finish: conic ring fills over `hold` ms (default 1000); releasing early resets in 150 ms.
// Keyboard: Enter/Space held for the same time completes; a plain tap only shows the hint.
export function HoldButton({ children, onComplete, hold = 1000, hint = 'Hold to finish', disabled = false, className = '', ...props }) {
  const [holding, setHolding] = useState(false), timer = useRef(null), done = useRef(false);
  const stop = () => { clearTimeout(timer.current); timer.current = null; setHolding(false); };
  const start = () => {
    if (disabled || timer.current) return;
    done.current = false; setHolding(true);
    timer.current = setTimeout(() => { timer.current = null; done.current = true; setHolding(false); tap('confirm'); onComplete?.(); }, hold);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return <button type="button" className={`ui-hold ${holding ? 'ui-hold--active' : ''} ${className}`} disabled={disabled} aria-describedby={undefined} aria-label={typeof children === 'string' ? `${children}. ${hint}` : hint}
    style={{ '--hold-ms': `${hold}ms` }} data-holding={holding || undefined}
    onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={event => event.preventDefault()}
    onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) { event.preventDefault(); start(); } }}
    onKeyUp={event => { if (event.key === 'Enter' || event.key === ' ') stop(); }} onBlur={stop} {...props}>
    <span className="ui-hold-ring" aria-hidden="true"/><span className="ui-hold-label">{children}</span>
  </button>;
}
