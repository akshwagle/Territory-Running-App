import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router';
import { closeTopOverlay, Screen, TabBar } from './index.jsx';
import { exitApp, parentRoute, ROOT_ROUTES, watchBack } from '../platform/navigation.js';

export const TABS = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/you', label: 'You', icon: 'user' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];
const TITLES = { '/home': 'Territory Run', '/you': 'You', '/you/privacy': 'Privacy', '/you/consent': 'Consent',
  '/settings': 'Settings', '/settings/methods': 'Sign-in methods', '/settings/sessions': 'Active sessions',
  '/settings/password': 'Password', '/settings/export': 'Export data', '/settings/delete': 'Delete account',
  '/login': 'Log in', '/signup': 'Create account', '/forgot': 'Password help', '/reset': 'Reset password', '/verify': 'Email verification' };
const CACHEABLE = new Set(['/home', '/you', '/you/privacy', '/you/consent', '/settings', '/settings/methods', '/settings/sessions', '/settings/export']);

export function Shell({ user, children, renderRoutes, footer, nativeBack = watchBack, exit = exitApp }) {
  const location = useLocation(), navigate = useNavigate(), type = useNavigationType();
  const scroll = useRef(null), positions = useRef(new Map()), cache = useRef(new Map());
  const identity = user?.id || null, priorIdentity = useRef(identity), last = useRef(null), history = useRef([]);
  const [barError, setBarError] = useState(false);
  if (identity !== priorIdentity.current) { cache.current.clear(); positions.current.clear(); history.current = []; priorIdentity.current = identity; }
  if (last.current?.key !== location.key) {
    if (type === 'POP') { const index = history.current.findIndex(entry => entry.key === location.key); history.current = index < 0 ? [location] : history.current.slice(0, index + 1); }
    else if (type === 'REPLACE') history.current = [...history.current.slice(0, -1), location];
    else history.current.push(location);
    last.current = location;
  }
  const canCache = identity && CACHEABLE.has(location.pathname);
  if (canCache) cache.current.set(location.pathname, location);
  const activeTab = location.pathname.startsWith('/you') ? '/you' : location.pathname.startsWith('/settings') || location.pathname === '/verify' ? '/settings' : '/home';
  const root = ROOT_ROUTES.has(location.pathname), backRef = useRef(null);
  backRef.current = (native = false) => {
    if (closeTopOverlay()) return;
    if (root) { if (native) exit(); return; }
    const previous = history.current.at(-2);
    // Tabs are roots. After logout/deep links the old account's history must
    // never cause a Protected -> login redirect loop.
    if (previous && (!identity || ['/home', '/you', '/settings'].some(prefix => previous.pathname.startsWith(prefix)))) navigate(-1);
    else navigate(parentRoute(location.pathname), { replace: true });
  };
  useEffect(() => {
    let cancelled = false, dispose;
    nativeBack({ onBack: () => backRef.current(true) }).then(stop => { if (cancelled) stop(); else dispose = stop; }).catch(() => setBarError(true));
    return () => { cancelled = true; dispose?.(); };
  }, [nativeBack]);
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = positions.current.get(location.pathname) || 0;
    const heading = scroll.current?.querySelector('[data-active=true] h1, :scope > .route-page h1');
    heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true });
  }, [location.key, location.pathname]);
  const direction = location.state?.tab ? 'tab' : type === 'POP' ? 'back' : 'forward';
  return <Screen title={TITLES[location.pathname] || 'Territory Run'} onBack={!root ? () => backRef.current() : undefined}
    className={location.pathname === '/' ? 'shell-welcome' : ''} scrollRef={scroll}
    onScroll={event => positions.current.set(location.pathname, event.currentTarget.scrollTop)}
    bottom={identity ? <TabBar tabs={TABS} active={activeTab} onSelect={(event, tab) => { event.preventDefault(); if (tab.to !== location.pathname) navigate(tab.to, { state: { tab: true } }); }}/>:null}>
    {barError && <p className="small" role="alert">System back is unavailable. Use the Back button above, or reopen the app.</p>}
    {children}
    {[...cache.current.entries()].map(([path, entry]) => <div key={`${identity}:${path}`} hidden={!canCache || path !== location.pathname} inert={!canCache || path !== location.pathname} data-active={canCache && path === location.pathname} className="route-page" data-direction={direction}>{renderRoutes(entry)}</div>)}
    {!canCache && <div key={`${identity}:${location.pathname}`} className="route-page" data-direction={direction}>{renderRoutes(location)}</div>}
    {footer && <div className="screen-edition">{footer}</div>}
  </Screen>;
}
