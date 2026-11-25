import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';
import { useAuth } from '../auth/context.jsx';
import { friendlyMessage } from '../auth/errors.js';
import { Button, InlineNotice, Sheet } from '../ui/index.jsx';
import { TILE_ATTRIBUTION, TILE_URL, MIN_ZOOM, boundary, boxQuery, boxTooLarge, createHexCache, describeHex, hexStyle, snapBounds } from './hexes.js';

export function Legend() {
  return <ul className="map-legend" aria-label="Map legend">
    <li><span className="swatch mine"/>Yours</li><li><span className="swatch other"/>Other runners</li>
    <li><span className="swatch restricted"/>Restricted</li><li><span className="swatch cooling"/>In cooldown</li>
  </ul>;
}
export function HexSheet({ hex, now = Date.now(), onClose }) {
  const d = describeHex(hex, now);
  return <Sheet title={d.kind === 'restricted' ? 'Restricted area' : d.kind === 'mine' ? 'Your territory' : 'Runner territory'} onClose={onClose}>
    {d.note && <p>{d.note}</p>}
    {!d.note && <dl className="hex-detail">
      <div><dt>Owner</dt><dd>{d.owner ?? 'A runner who keeps their profile private'}</dd></div>
      {d.claimed && <div><dt>Claimed</dt><dd>{d.claimed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</dd></div>}
      <div><dt>Cooldown</dt><dd>{d.cooldown ? `${d.cooldown} remaining` : d.kind === 'mine' ? 'Ready: run through it again to refresh' : 'Over: it can be captured now'}</dd></div>
    </dl>}
    <div className="editor-actions"><Button onClick={onClose}>Close</Button></div>
  </Sheet>;
}

export function TerritoryMapPage({ geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : undefined, debounceMs = 400 }) {
  const { auth } = useAuth(), box = useRef(null), refs = useRef({}), cache = useRef(createHexCache());
  const [zoomedOut, setZoomedOut] = useState(true), [loading, setLoading] = useState(false), [error, setError] = useState(''), [selected, setSelected] = useState(null);
  const [location, setLocation] = useState(geolocation ? 'waiting' : 'unsupported'), [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine !== false), [truncated, setTruncated] = useState(false);
  const request = auth.api.request.bind(auth.api);

  const draw = useCallback(data => {
    const { map, layer } = refs.current; if (!map) return;
    layer.clearLayers(); const now = Date.now();
    const add = (hex, cell) => { const ring = boundary(cell); if (!ring) return; L.polygon(ring, { ...hexStyle(hex, now), renderer: refs.current.renderer }).on('click', () => setSelected(hex)).addTo(layer); };
    for (const hex of data.hexes || []) add(hex, hex.h3);
    for (const cell of data.restricted || []) add({ h3: cell, restricted: true }, cell);
    setTruncated(Boolean(data.truncated));
  }, []);

  const refresh = useCallback(async (force = false) => {
    const { map } = refs.current; if (!map) return;
    if (map.getZoom() < MIN_ZOOM) { setZoomedOut(true); refs.current.layer.clearLayers(); setError(''); return; }
    const b = map.getBounds(), query = snapBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    if (boxTooLarge(query)) { setZoomedOut(true); return; }
    setZoomedOut(false);
    const key = boxQuery(query), hit = !force && cache.current.get(key);
    if (hit) { setError(''); draw(hit); return; }
    const ticket = refs.current.ticket = (refs.current.ticket || 0) + 1;
    setLoading(true);
    try {
      const data = await request(`/api/territory/hexes?${key}`);
      if (ticket !== refs.current.ticket) return;
      cache.current.set(key, data); setError(''); draw(data);
    } catch (failure) {
      if (ticket === refs.current.ticket) setError(navigator.onLine === false ? 'You are offline. The map will refresh when you reconnect.' : friendlyMessage(failure));
    } finally { if (ticket === refs.current.ticket) setLoading(false); }
  }, [request, draw]);
  refs.current.refresh = refresh;

  useEffect(() => {
    const map = L.map(box.current, { zoomControl: false, attributionControl: true, minZoom: 3, maxZoom: 19 }).setView([20, 0], 2);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
    const renderer = L.canvas({ padding: .5 }), layer = L.layerGroup().addTo(map);
    refs.current = { ...refs.current, map, layer, renderer };
    let timer; const schedule = () => { clearTimeout(timer); timer = setTimeout(() => refs.current.refresh(), debounceMs); };
    map.on('moveend', schedule);
    const onNet = () => { setOnline(navigator.onLine !== false); if (navigator.onLine !== false) refs.current.refresh(true); };
    window.addEventListener('online', onNet); window.addEventListener('offline', onNet);
    return () => { clearTimeout(timer); window.removeEventListener('online', onNet); window.removeEventListener('offline', onNet); refs.current = {}; map.remove(); };
  }, [debounceMs]);

  const watchId = useRef(null), centred = useRef(false);
  const startLocation = useCallback(() => {
    if (!geolocation) return;
    setLocation('waiting'); if (watchId.current != null) geolocation.clearWatch(watchId.current);
    watchId.current = geolocation.watchPosition(pos => {
      const { map } = refs.current; if (!map) return;
      const at = [pos.coords.latitude, pos.coords.longitude]; setLocation('ready'); refs.current.here = at;
      if (!refs.current.dot) refs.current.dot = L.circleMarker(at, { radius: 8, color: '#fff', weight: 3, fillColor: '#2f8bff', fillOpacity: 1, interactive: false }).addTo(map); else refs.current.dot.setLatLng(at);
      if (!centred.current) { centred.current = true; map.setView(at, 17); }
    }, err => setLocation(err.code === 1 ? 'denied' : 'unavailable'), { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }, [geolocation]);
  useEffect(() => { startLocation(); return () => { if (watchId.current != null) geolocation?.clearWatch(watchId.current); }; }, [startLocation, geolocation]);

  const recenter = () => {
    const { map, here } = refs.current;
    if (here) map.setView(here, Math.max(map.getZoom(), 17)); else if (location !== 'waiting') { centred.current = false; startLocation(); }
  };

  return <section className="map-page">
    <h1 className="sr-only">Territory map</h1>
    <div className="map-canvas" ref={box} role="region" aria-label="Territory map"/>
    <div className="map-overlay">
      {!online && <InlineNotice error>You are offline. Territory and map tiles may be out of date.</InlineNotice>}
      {error && online && <InlineNotice error action="Retry" onAction={() => refresh(true)}>{error}</InlineNotice>}
      {location === 'denied' && <InlineNotice action="Try again" onAction={startLocation}>Location is off for Territory Run, so your position is hidden. Allow it in Android settings, or pan the map yourself.</InlineNotice>}
      {location === 'unavailable' && <InlineNotice action="Try again" onAction={startLocation}>Your location is not available right now.</InlineNotice>}
      {location === 'unsupported' && <InlineNotice>This device cannot share its location with the map.</InlineNotice>}
      {zoomedOut && <InlineNotice>Zoom in to see territory.</InlineNotice>}
      {truncated && <InlineNotice>Showing part of this area. Zoom in to see every cell.</InlineNotice>}
      {loading && <p className="small map-status" role="status">Loading territory…</p>}
    </div>
    <button type="button" className="map-recenter" aria-label="Centre on my location" disabled={location === 'unsupported'} onClick={recenter}>◎</button>
    <Legend/>
    {selected && <HexSheet hex={selected} onClose={() => setSelected(null)}/>}
  </section>;
}
