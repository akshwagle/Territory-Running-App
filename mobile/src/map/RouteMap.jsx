import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';
import { decodeRoute } from '../runs/format.js';
import { TILE_ATTRIBUTION, TILE_URL } from './hexes.js';

// Recorded route on OpenStreetMap tiles. Each server segment is its own line,
// so pauses and signal gaps are never joined. Renders nothing without a route.
export function RouteMap({ encodedSegments }) {
  const box = useRef(null), segments = decodeRoute(encodedSegments), usable = segments.length > 0;
  useEffect(() => {
    if (!usable || !box.current) return;
    const map = L.map(box.current, { zoomControl: false, attributionControl: true, maxZoom: 19 });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
    const group = L.featureGroup(segments.map(s => s.length > 1
      ? L.polyline(s.map(([lng, lat]) => [lat, lng]), { color: '#a6e84c', weight: 5, opacity: .95, lineJoin: 'round' })
      : L.circleMarker([s[0][1], s[0][0]], { radius: 5, color: '#a6e84c', fillOpacity: 1 }))).addTo(map);
    map.fitBounds(group.getBounds(), { padding: [24, 24], maxZoom: 18 });
    return () => map.remove();
  }, [usable, JSON.stringify(encodedSegments)]);
  return usable ? <div className="route-map" ref={box} role="img" aria-label="Map of your recorded route"/> : null;
}
