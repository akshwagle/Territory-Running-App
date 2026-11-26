import { cellToBoundary } from 'h3-js';

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const MIN_ZOOM = 15;
export const MAX_SPAN_DEG = 0.1;
const SNAP = 0.005, CACHE_TTL_MS = 30000, CACHE_MAX = 24;

// Snap the visible box outward to a coarse grid so small pans reuse a response.
export function snapBounds({ south, west, north, east }) {
  const lo = v => Math.floor(v / SNAP) * SNAP, hi = v => Math.ceil(v / SNAP) * SNAP;
  const clamp = (v, m) => Math.max(-m, Math.min(m, v));
  return { minLat: +clamp(lo(south), 90).toFixed(5), minLng: +clamp(lo(west), 180).toFixed(5), maxLat: +clamp(hi(north), 90).toFixed(5), maxLng: +clamp(hi(east), 180).toFixed(5) };
}
export const boxTooLarge = box => box.maxLat - box.minLat > MAX_SPAN_DEG || box.maxLng - box.minLng > MAX_SPAN_DEG;
export const boxQuery = box => `minLat=${box.minLat}&minLng=${box.minLng}&maxLat=${box.maxLat}&maxLng=${box.maxLng}`;

export function createHexCache(now = () => Date.now()) {
  const store = new Map();
  return {
    get(key) { const hit = store.get(key); if (!hit) return null; if (now() - hit.at > CACHE_TTL_MS) { store.delete(key); return null; } return hit.value; },
    set(key, value) { store.delete(key); store.set(key, { at: now(), value }); while (store.size > CACHE_MAX) store.delete(store.keys().next().value); },
    clear() { store.clear(); },
  };
}

export function boundary(cell) { try { return cellToBoundary(cell); } catch { return null; } }

export function cooldownLabel(until, now = Date.now()) {
  const ms = +new Date(until) - now;
  if (!(ms > 0)) return null;
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (hours < 48) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  return `${Math.ceil(hours / 24)} days`;
}

// Style key for one server hex; restricted cells arrive as bare ids.
export function hexKind(hex) { return hex.restricted ? 'restricted' : hex.owner.kind === 'me' ? 'mine' : 'other'; }
export function describeHex(hex, now = Date.now()) {
  if (hex.restricted) return { kind: 'restricted', owner: null, claimed: null, cooldown: null, note: 'Claiming is not allowed in this area.' };
  const cooldown = cooldownLabel(hex.cooldownUntil, now);
  const owner = hex.owner.kind === 'me' ? 'You' : hex.owner.ownerId ? hex.owner.displayName : null;
  return { kind: hexKind(hex), owner, ownerHidden: hex.owner.kind !== 'me' && !hex.owner.ownerId, claimed: hex.claimedAt ? new Date(hex.claimedAt) : null, cooldown, note: null };
}
// Leaflet needs literal colours, so read the theme tokens (styles.css) at use time.
// Fallbacks are the dark-theme values for environments without CSS (tests).
const MAP_FALLBACK = { mine: '#6fb59a', other: '#6f86a6', cooldown: '#e0b454', restricted: '#e58a72', meDot: '#8ccbb1', route: '#6fb59a' };
const MAP_VARS = { mine: '--map-mine', other: '--map-other', cooldown: '--map-cooldown', restricted: '--map-restricted', meDot: '--map-me-dot', route: '--map-mine' };
export function mapColor(name) {
  try { return getComputedStyle(document.documentElement).getPropertyValue(MAP_VARS[name]).trim() || MAP_FALLBACK[name]; }
  catch { return MAP_FALLBACK[name]; }
}
export function hexStyles() {
  const mine = mapColor('mine'), other = mapColor('other'), restricted = mapColor('restricted');
  return {
    mine: { color: mine, fillColor: mine, fillOpacity: .38 },
    other: { color: other, fillColor: other, fillOpacity: .32 },
    restricted: { color: restricted, fillColor: restricted, fillOpacity: .22, dashArray: '2 4' },
  };
}
export function hexStyle(hex, now = Date.now()) {
  const base = hexStyles()[hexKind(hex)], cooling = !hex.restricted && cooldownLabel(hex.cooldownUntil, now);
  return { ...base, ...(cooling ? { color: mapColor('cooldown') } : {}), weight: cooling ? 2.5 : 1, opacity: cooling ? 1 : .7, dashArray: cooling ? '5 4' : base.dashArray };
}
