import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { Icon } from './icons.jsx';
import { tap } from './haptics.js';
import { CountUp } from './motion.jsx';
import './ui.css';

export { Icon, BrandMark } from './icons.jsx';
export { CountUp, HoldButton, useCountUp, prefersReducedMotion } from './motion.jsx';
const FeedbackContext = createContext(null);
const overlays = [];
export function closeTopOverlay() { const close = overlays.at(-1); if (!close) return false; close(); return true; }
export function UIProvider({ children }) {
  const [toast, setToast] = useState(null);
  const sequence = useRef(0);
  const show = useRef(message => setToast({ message, key: ++sequence.current }));
  return <FeedbackContext.Provider value={show.current}>{children}{toast && <Toast key={toast.key} onDismiss={() => setToast(null)}>{toast.message}</Toast>}</FeedbackContext.Provider>;
}
export function useToast() { return useContext(FeedbackContext); }
export function Success({ children }) {
  const show = useToast();
  useEffect(() => { if (children && show) show(children); }, [children, show]);
  return children && !show ? <Toast>{children}</Toast> : null;
}
// variant: primary | secondary | ghost (alias quiet) | destructive. size "sm" keeps the 44 px minimum.
// block = full width. reason explains a disabled button when it is not obvious.
export function Button({ children, variant = 'primary', size, block = false, loading = false, disabled, reason, to, className = '', ...props }) {
  const kind = variant === 'quiet' ? 'ghost' : variant, reasonId = useId();
  const classes = `ui-button ui-button--${kind} ${size === 'sm' ? 'ui-button--sm' : ''} ${block ? 'ui-button--block' : ''} ${className}`;
  if (to) return <Link className={classes} to={to} {...props}>{children}</Link>;
  const { onClick, ...rest } = props, why = disabled && reason;
  const button = <button type="button" className={classes} disabled={disabled || loading} aria-busy={loading || undefined} aria-describedby={why ? reasonId : undefined} onClick={event => { tap(kind === 'primary' ? 'confirm' : 'light'); onClick?.(event); }} {...rest}>{loading && <span className="button-busy" aria-hidden="true"/>}{children}</button>;
  return why ? <>{button}<p id={reasonId} className="ui-button-reason">{reason}</p></> : button;
}
// error (from the form) wins over the blur-time message produced by validate(value).
export function TextField({ id: givenId, label, error: formError, help, type = 'text', className = '', onChange, onBlur, validate, clearable = false, ...props }) {
  const generated = useId(), id = givenId || generated;
  const [visible, setVisible] = useState(false), [typed, setTyped] = useState(''), [touched, setTouched] = useState('');
  const input = useRef(null), error = formError || touched;
  useEffect(() => { const form = input.current?.form; const reset = () => { setVisible(false); setTyped(''); setTouched(''); }; form?.addEventListener('reset', reset); return () => form?.removeEventListener('reset', reset); }, []);
  const password = type === 'password', rules = password && props.autoComplete === 'new-password';
  return <div className={`ui-field field ${className}`}>
    <label htmlFor={id}>{label}</label><div className="ui-input-row">
      <input ref={input} id={id} type={password && visible ? 'text' : type} aria-invalid={Boolean(error)} aria-describedby={error || help || rules ? `${id}-help` : undefined}
        onChange={event => { setTyped(event.target.value); if (touched) setTouched(validate?.(event.target.value) || ''); onChange?.(event); }}
        onBlur={event => { if (validate) setTouched(validate(event.target.value) || ''); onBlur?.(event); }} {...props}/>
      {clearable && !password && typed && !props.disabled && <button className="ui-eye" type="button" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => {
        const node = input.current, set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(node, ''); node.dispatchEvent(new Event('input', { bubbles: true })); setTyped(''); node.focus();
      }}><Icon name="close"/></button>}
      {password && <button className="ui-eye" type="button" disabled={props.disabled} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(old => !old)}><Icon name={visible ? 'eye-off' : 'eye'}/></button>}
    </div>{(error || help || rules) && <p id={`${id}-help`} role={error ? 'alert' : undefined} className={`field-help ${error ? 'error-text' : ''}`}>{error || (rules && typed ? `${[...typed].length >= 10 && [...typed].length <= 128 ? 'Length is OK.' : 'Use 10–128 characters.'} Spaces are allowed.` : help || 'Use 10–128 characters. Spaces are allowed.')}</p>}
  </div>;
}
export function Switch({ label, ...props }) {
  return <label className="ui-switch"><span>{label}</span><input type="checkbox" role="switch" {...props} onChange={event => { tap('light'); props.onChange?.(event); }}/><span className="ui-switch-track" aria-hidden="true"/></label>;
}
export function Chip({ selected = false, children, ...props }) { return <button type="button" className="ui-chip" aria-pressed={selected} {...props}>{selected && <Icon name="check"/>}{children}</button>; }
// Segmented: single-choice pill group. options are strings or { value, label }.
export function Segmented({ label, options, value, onChange }) {
  return <div className="ui-segmented" role="group" aria-label={label}>{options.map(option => {
    const { value: v, label: text } = typeof option === 'string' ? { value: option, label: option } : option;
    return <button key={v} type="button" aria-pressed={value === v} onClick={() => { if (value !== v) { tap('light'); onChange(v); } }}>{text}</button>;
  })}</div>;
}
// Card: raised surface. With `to` or `onClick` it becomes a tappable link/button with a pressed state.
export function Card({ to, onClick, as: Tag = 'article', className = '', children, ...props }) {
  const classes = `ui-card ${to || onClick ? 'ui-card--tap' : ''} ${className}`;
  if (to) return <Link className={classes} to={to} {...props}>{children}</Link>;
  if (onClick) return <button type="button" className={classes} onClick={onClick} {...props}>{children}</button>;
  return <Tag className={classes} {...props}>{children}</Tag>;
}
// StatTile belongs inside StatGrid (a <dl>): caption label, tabular number, unit, optional delta chip.
export function StatGrid({ children, className = '', ...props }) { return <dl className={`ui-stat-grid ${className}`} {...props}>{children}</dl>; }
export function StatTile({ label, value, unit, delta, tone, count = false, className = '' }) {
  return <div className={`ui-stat ${tone ? `ui-stat--${tone}` : ''} ${className}`}><dt>{label}</dt>
    <dd><span className="ui-stat-value">{count && Number.isInteger(value) ? <CountUp value={value}/> : value}</span>{unit && <span className="ui-stat-unit">{unit}</span>}{delta && <span className="ui-delta">{delta}</span>}</dd></div>;
}
// Banner: calm sticky strip for offline, syncing and limited-GPS states. tone: info | offline | syncing | warn | error.
export function Banner({ children, tone = 'info', action, onAction, onDismiss, className = '' }) {
  return children ? <div className={`ui-banner ui-banner--${tone} ${className}`} role={tone === 'error' ? 'alert' : 'status'}>
    <Icon name="warning"/><span>{children}</span>{action && <button type="button" onClick={onAction}>{action}</button>}
    {onDismiss && <button type="button" aria-label="Dismiss banner" onClick={onDismiss}><Icon name="close"/></button>}
  </div> : null;
}
// ListRow: 56+ px; leading icon name or node (avatar), label + subtitle, trailing value/node, chevron unless chevron={false}.
export function ListRow({ to, label, subtitle, value, icon, leading, trailing, chevron = true, children, ...props }) {
  const content = <>{leading || (icon && <Icon name={icon}/>)}<span className="ui-row-label">{label}{subtitle && <span className="ui-row-sub">{subtitle}</span>}{children}</span>{value && <span className="ui-row-value" dir="auto">{value}</span>}{trailing}{chevron && <Icon name="chevron"/>}</>;
  return to ? <Link className="ui-row" to={to} {...props}>{content}</Link> : <button type="button" className="ui-row" {...props}>{content}</button>;
}
export function Section({ title, className = '', children }) { return <section className={`ui-section ${className}`.trim()}>{title && <h2>{title}</h2>}{children}</section>; }
function Modal({ title, children, onClose, sheet = false }) {
  const titleId = useId(), panel = useRef(null), closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement, close = () => closeRef.current();
    overlays.push(close);
    const app = document.querySelector('.app-shell'), wasInert = app?.inert;
    if (app) app.inert = true;
    const controls = () => [...panel.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select, textarea, [tabindex="0"]')];
    (controls()[0] || panel.current).focus();
    function keydown(event) {
      if (overlays.at(-1) !== close) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const items = controls(), first = items[0], last = items.at(-1);
        if (!first) { event.preventDefault(); panel.current.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => { overlays.splice(overlays.indexOf(close), 1); document.removeEventListener('keydown', keydown); if (app) app.inert = wasInert || false; previous?.focus?.(); };
  }, []);
  // Drag-to-dismiss on the grabber: only transform changes while dragging; release past 96 px closes.
  const drag = useRef(null);
  const dragProps = !sheet ? {} : {
    onPointerDown: event => { drag.current = event.clientY; event.currentTarget.setPointerCapture?.(event.pointerId); },
    onPointerMove: event => { if (drag.current === null) return; const dy = Math.max(0, event.clientY - drag.current); panel.current.style.transform = `translateY(${dy}px)`; },
    onPointerUp: event => {
      if (drag.current === null) return; const dy = event.clientY - drag.current; drag.current = null;
      panel.current.style.transform = ''; if (dy > 96) onClose();
    },
    onPointerCancel: () => { drag.current = null; panel.current.style.transform = ''; },
  };
  return createPortal(<div className="ui-scrim" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} className={sheet ? 'ui-sheet' : 'ui-dialog'} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      {sheet && <div className="ui-grabber" data-testid="sheet-grabber" aria-hidden="true" {...dragProps}><span/></div>}
      <div className="ui-modal-heading"><h2 id={titleId}>{title}</h2><button type="button" className="ui-icon-button" aria-label="Close" onClick={onClose}><Icon name="close"/></button></div>{children}
    </div></div>, document.body);
}
export function Sheet(props) { return <Modal {...props} sheet/>; }
export function Dialog(props) { return <Modal {...props}/>; }
export function Toast({ children, onDismiss }) {
  const [visible, setVisible] = useState(true), dismiss = useRef(onDismiss); dismiss.current = onDismiss;
  useEffect(() => { setVisible(true); const timer = setTimeout(() => { setVisible(false); dismiss.current?.(); }, 4000); return () => clearTimeout(timer); }, [children]);
  return visible ? <div className="ui-toast" role="status"><span>{children}</span><button type="button" aria-label="Dismiss message" onClick={() => { setVisible(false); onDismiss?.(); }}><Icon name="close"/></button></div> : null;
}
export function InlineNotice({ children, error = false, action, onAction, onDismiss, className = '' }) {
  return children ? <div className={`ui-notice ${error ? 'ui-notice--error' : ''} ${className}`} role={error ? 'alert' : 'status'}>
    {error && <Icon name="warning"/>}<span>{children}</span>{action && <button type="button" onClick={onAction}>{action}</button>}{onDismiss && <button type="button" aria-label="Dismiss notice" onClick={onDismiss}><Icon name="close"/></button>}
  </div> : null;
}
// shape: lines (default) | row (avatar + two lines, repeated by `lines`) | card (block) | stat (tile grid). Mirrors final layouts.
export function Skeleton({ label = 'Loading…', lines = 3, shape = 'lines' }) {
  return <div className={`ui-skeleton ui-skeleton--${shape}`} role="status"><span className="sr-only">{label}</span>{Array.from({ length: shape === 'card' ? 1 : lines }, (_, i) => shape === 'row' ? <span key={i} className="ui-skeleton-row" aria-hidden="true"><span/><span/></span> : <span key={i} aria-hidden="true"/>)}</div>;
}
export function EmptyState({ title, children, action }) { return <div className="ui-empty"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><path d="M32 3 57 18v28L32 61 7 46V18Z" fill="none" stroke="currentColor"/><path d="M32 18v28m-12-7 24-14" stroke="currentColor"/></svg>{title && <h2>{title}</h2>}<p>{children}</p>{action}</div>; }
export function ErrorState({ children, onRetry, label = 'Retry', title }) { return <div className="ui-error">{title && <h2>{title}</h2>}<InlineNotice error>{children}</InlineNotice>{onRetry && <Button variant="secondary" onClick={onRetry}>{label}</Button>}</div>; }
export function Avatar({ id = 0, color = '#1F5A46', size = 48 }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="ui-avatar"><path d="M24 2 43 13v22L24 46 5 35V13Z" fill={color}/><g transform={`rotate(${(id % 6) * 60} 24 24)`} fill="none" stroke="#F3EEE4" strokeWidth="3">{id < 6 ? <path d="M13 31 24 13l11 18M18 24h12"/> : <><path d="m13 17 11 17 11-17M17 24h14"/><path d="M24 10v5"/></>}</g></svg>;
}
export function Screen({ title, onBack, children, bottom, className = '', scrollRef, onScroll }) {
  const [scrolled, setScrolled] = useState(false);
  return <div className={`app-shell ui-screen ${className}`}>
    <header className={`ui-header ${scrolled ? 'is-scrolled' : ''}`}>
      {onBack && <button className="ui-icon-button" type="button" aria-label="Back" onClick={onBack}><Icon name="back"/></button>}
      <span className="ui-header-title">{title}</span>
    </header>
    <main id="main" ref={scrollRef} onScroll={event => { setScrolled(event.currentTarget.scrollTop > 0); onScroll?.(event); }}>{children}</main>{bottom}
  </div>;
}
export function TabBar({ tabs, active, onSelect }) { return <nav className="ui-tabs" aria-label="Main navigation">{tabs.map(tab => <Link key={tab.to} to={tab.to} onClick={event => onSelect?.(event, tab)} aria-current={active === tab.to ? 'page' : undefined}><span className="ui-tab-icon"><Icon name={tab.icon}/>{tab.badge>0&&<span className="tab-badge" role="status" aria-label={`${tab.badge} unread notifications`}>{tab.badge>9?'9+':tab.badge}</span>}</span><span>{tab.label}</span></Link>)}</nav>; }

// Flat, tabular figures for live recording and finished summaries.
export function RunStats({time,distance,pace}){return <dl className="ui-run-stats"><div><dt>Distance</dt><dd>{distance}</dd></div><div><dt>Time</dt><dd>{time}</dd></div><div><dt>Pace</dt><dd>{pace}</dd></div></dl>;}
export function RouteTrace({paths=[]}){return paths.length?<figure className="ui-route-trace"><svg viewBox="0 0 300 300" role="img" aria-label="Simplified route trace. Gaps and pauses are separate lines.">{paths.map((d,i)=><path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}</svg><figcaption className="small">Route trace · no map or gap interpolation.</figcaption></figure>:<EmptyState title="No route trace">A route needs accepted GPS points. Stationary and treadmill runs record time, with no distance or territory.</EmptyState>;}
