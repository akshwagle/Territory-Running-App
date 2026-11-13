import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { Icon } from './icons.jsx';
import './ui.css';

export { Icon, BrandMark } from './icons.jsx';
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
export function Button({ children, variant = 'primary', loading = false, disabled, to, className = '', ...props }) {
  const classes = `ui-button ui-button--${variant} ${className}`;
  if (to) return <Link className={classes} to={to} {...props}>{children}</Link>;
  return <button type="button" className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{loading && <span className="button-busy" aria-hidden="true"/>}{children}</button>;
}
export function TextField({ id: givenId, label, error, help, type = 'text', className = '', onChange, ...props }) {
  const generated = useId(), id = givenId || generated;
  const [visible, setVisible] = useState(false), [typed, setTyped] = useState('');
  const input = useRef(null);
  useEffect(() => { const form = input.current?.form; const reset = () => { setVisible(false); setTyped(''); }; form?.addEventListener('reset', reset); return () => form?.removeEventListener('reset', reset); }, []);
  const password = type === 'password', rules = password && props.autoComplete === 'new-password';
  return <div className={`ui-field field ${className}`}>
    <label htmlFor={id}>{label}</label><div className="ui-input-row">
      <input ref={input} id={id} type={password && visible ? 'text' : type} aria-invalid={Boolean(error)} aria-describedby={error || help || rules ? `${id}-help` : undefined}
        onChange={event => { setTyped(event.target.value); onChange?.(event); }} {...props}/>
      {password && <button className="ui-eye" type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(old => !old)}><Icon name={visible ? 'eye-off' : 'eye'}/></button>}
    </div>{(error || help || rules) && <p id={`${id}-help`} className={`field-help ${error ? 'error-text' : ''}`}>{error || (rules && typed ? `${[...typed].length >= 10 && [...typed].length <= 128 ? 'Length is OK.' : 'Use 10–128 characters.'} Spaces are allowed.` : help || 'Use 10–128 characters. Spaces are allowed.')}</p>}
  </div>;
}
export function Switch({ label, ...props }) {
  return <label className="ui-switch"><span>{label}</span><input type="checkbox" role="switch" {...props}/><span className="ui-switch-track" aria-hidden="true"/></label>;
}
export function Chip({ selected = false, children, ...props }) { return <button type="button" className="ui-chip" aria-pressed={selected} {...props}>{selected && <Icon name="check"/>}{children}</button>; }
export function ListRow({ to, label, value, icon, children, ...props }) {
  const content = <>{icon && <Icon name={icon}/>}<span className="ui-row-label">{label}{children}</span>{value && <span className="ui-row-value" dir="auto">{value}</span>}<Icon name="chevron"/></>;
  return to ? <Link className="ui-row" to={to} {...props}>{content}</Link> : <button type="button" className="ui-row" {...props}>{content}</button>;
}
export function Section({ title, children }) { return <section className="ui-section">{title && <h2>{title}</h2>}{children}</section>; }
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
  return createPortal(<div className="ui-scrim" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} className={sheet ? 'ui-sheet' : 'ui-dialog'} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
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
export function InlineNotice({ children, error = false, action, onAction, onDismiss }) {
  return children ? <div className={`ui-notice ${error ? 'ui-notice--error' : ''}`} role={error ? 'alert' : 'status'}>
    {error && <Icon name="warning"/>}<span>{children}</span>{action && <button type="button" onClick={onAction}>{action}</button>}{onDismiss && <button type="button" aria-label="Dismiss notice" onClick={onDismiss}><Icon name="close"/></button>}
  </div> : null;
}
export function Skeleton({ label = 'Loading…', lines = 3 }) { return <div className="ui-skeleton" role="status"><span className="sr-only">{label}</span>{Array.from({ length: lines }, (_, i) => <span key={i} aria-hidden="true"/>)}</div>; }
export function EmptyState({ title, children, action }) { return <div className="ui-empty"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><path d="M32 3 57 18v28L32 61 7 46V18Z" fill="none" stroke="currentColor"/><path d="M32 18v28m-12-7 24-14" stroke="currentColor"/></svg>{title && <h2>{title}</h2>}<p>{children}</p>{action}</div>; }
export function ErrorState({ children, onRetry, label = 'Retry' }) { return <div className="ui-error"><InlineNotice error>{children}</InlineNotice><Button variant="secondary" onClick={onRetry}>{label}</Button></div>; }
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
export function TabBar({ tabs, active, onSelect }) { return <nav className="ui-tabs" aria-label="Main navigation">{tabs.map(tab => <Link key={tab.to} to={tab.to} onClick={event => onSelect?.(event, tab)} aria-current={active === tab.to ? 'page' : undefined}><span className="ui-tab-icon"><Icon name={tab.icon}/></span><span>{tab.label}</span></Link>)}</nav>; }
