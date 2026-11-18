/**
 * RUN & CONQUER — Professional Interactive Street Map Component
 *
 * Implements a 100% full-bleed, responsive street map renderer inspired by Strava's
 * athletic aesthetic:
 * - 100% container fill without blank areas, cropped edges, or aspect ratio distortion.
 * - Dynamic continuous tile coverage for any viewport dimensions.
 * - Smooth drag panning and zoom controls (11–18).
 * - Real-time visitor GPS position beacon with concentric radar rings and accuracy circle.
 * - Geographical resolution-11 hexagonal territory overlays (Allied, Contested, Rival)
 *   and energetic glowing GPS running route.
 * - Full Dark Theme (tactical Strava-dark contrast) and Light Theme support.
 * - Fully compliant with OpenStreetMap tile usage guidelines and standard attribution.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  lonToTileX,
  latToTileY,
  getOsmTileUrl,
  isValidCoordinate,
} from '../services/location/locationUtils.js';

// Hexagon clusters in axial (q, r) offsets relative to center
const ALLIED_HEX_OFFSETS = [
  [0, 0], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1],
  [-2, 1], [-2, 2], [-1, 2], [0, 2], [1, 1], [2, 0], [-2, 0],
  [-3, 1], [-3, 2], [-1, -1]
];

const CONTESTED_HEX_OFFSETS = [
  [2, -2], [3, -3], [2, -3], [3, -2], [1, -2]
];

const RIVAL_HEX_OFFSETS = [
  [0, 3], [1, 3], [0, 4], [1, 2], [2, 2]
];

const RUN_ROUTE_OFFSETS = [
  [-3.5, 2.5], [-3, 2], [-2, 2], [-2, 1], [-1, 1], [0, 1], [0, 0],
  [1, 0], [2, -1], [2.5, -2], [3, -2]
];

/**
 * Web Mercator projection: (lat, lon) -> local pixel coordinate relative to container center
 */
function projectToPixel(lat, lon, zoom, width, height, centerLat, centerLon, panOffset) {
  const n = Math.pow(2, zoom);
  const ptX = ((lon + 180) / 360) * n;
  const ptRad = (lat * Math.PI) / 180;
  const ptY =
    ((1 - Math.log(Math.tan(ptRad) + 1 / Math.cos(ptRad)) / Math.PI) / 2) * n;

  const cX = ((centerLon + 180) / 360) * n;
  const cRad = (centerLat * Math.PI) / 180;
  const cY =
    ((1 - Math.log(Math.tan(cRad) + 1 / Math.cos(cRad)) / Math.PI) / 2) * n;

  const px = (ptX - cX) * 256 + width / 2 + panOffset.x;
  const py = (ptY - cY) * 256 + height / 2 + panOffset.y;
  return [px, py];
}

/**
 * Compute geographical center of an axial hex (q, r)
 */
function computeHexGeoCenter(centerLat, centerLon, q, r, radiusMeters = 55) {
  const dx = Math.sqrt(3) * radiusMeters * (q + r / 2);
  const dy = 1.5 * radiusMeters * r;
  const latOffset = dy / 111320;
  const lonOffset = dx / (111320 * Math.cos((centerLat * Math.PI) / 180));
  return [centerLat + latOffset, centerLon + lonOffset];
}

/**
 * Compute SVG polygon points for an axial hex (q, r)
 */
function computeHexPolygonPoints(centerLat, centerLon, q, r, zoom, width, height, panOffset, radiusMeters = 55) {
  const [hexLat, hexLon] = computeHexGeoCenter(centerLat, centerLon, q, r, radiusMeters);
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((i * 60 - 90) * Math.PI) / 180;
    const dy = (radiusMeters - 2) * Math.sin(angle);
    const dx = (radiusMeters - 2) * Math.cos(angle);
    const vLat = hexLat + dy / 111320;
    const vLon = hexLon + dx / (111320 * Math.cos((hexLat * Math.PI) / 180));
    const [px, py] = projectToPixel(vLat, vLon, zoom, width, height, centerLat, centerLon, panOffset);
    pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  return pts.join(' ');
}

export default function InteractiveMap({
  latitude,
  longitude,
  accuracy = null,
  routePoints = [],
  zoom = 15,
  height = '100%',
  theme = 'dark',
  interactive = true,
  markerLabel = 'Your Current Position',
  showTerritories = true,
  ariaLabel = 'OpenStreetMap interactive map',
}) {
  const containerRef = useRef(null);
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialPanX: 0, initialPanY: 0 });

  // Container dimensions (with sensible desktop default for initial/SSR render)
  const [dimensions, setDimensions] = useState({ width: 680, height: 420 });

  // Sync zoom prop changes
  useEffect(() => {
    setCurrentZoom(zoom);
  }, [zoom]);

  // Reset pan when coordinates change
  useEffect(() => {
    setPanOffset({ x: 0, y: 0 });
  }, [latitude, longitude]);

  // Responsive container observer: ensures 100% full-bleed coverage
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    };

    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateSize);
      observer.observe(container);
      return () => observer.disconnect();
    }
  }, []);

  const valid = isValidCoordinate(latitude, longitude);
  const centerLat = valid ? latitude : 12.9716;
  const centerLon = valid ? longitude : 77.5946;

  const width = dimensions.width;
  const mapHeight = dimensions.height;
  const centerX = width / 2;
  const centerY = mapHeight / 2;

  // Slippy tile math
  const tileX = lonToTileX(centerLon, currentZoom);
  const tileY = latToTileY(centerLat, currentZoom);

  const n = Math.pow(2, currentZoom);
  const exactX = ((centerLon + 180) / 360) * n;
  const latRad = (centerLat * Math.PI) / 180;
  const exactY =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  const offsetX = (exactX - tileX) * 256;
  const offsetY = (exactY - tileY) * 256;

  // Dynamically compute exact tile coverage grid covering 100% of container
  const tiles = useMemo(() => {
    const minDx = Math.floor((-centerX + offsetX - panOffset.x) / 256) - 1;
    const maxDx = Math.ceil((width - centerX + offsetX - panOffset.x) / 256) + 1;
    const minDy = Math.floor((-centerY + offsetY - panOffset.y) / 256) - 1;
    const maxDy = Math.ceil((mapHeight - centerY + offsetY - panOffset.y) / 256) + 1;

    const list = [];
    for (let dy = minDy; dy <= maxDy; dy++) {
      for (let dx = minDx; dx <= maxDx; dx++) {
        const tX = tileX + dx;
        const tY = tileY + dy;
        list.push({
          x: tX,
          y: tY,
          left: Math.round(centerX + dx * 256 - offsetX + panOffset.x),
          top: Math.round(centerY + dy * 256 - offsetY + panOffset.y),
          url: getOsmTileUrl(tX, tY, currentZoom),
        });
      }
    }
    return list;
  }, [width, mapHeight, centerX, centerY, tileX, tileY, offsetX, offsetY, panOffset, currentZoom]);

  // Metres per pixel for accuracy ring scale
  const metresPerPixel =
    (156543.03392 * Math.cos(latRad)) / Math.pow(2, currentZoom);
  const accuracyRadiusPx = accuracy ? Math.max(12, accuracy / metresPerPixel) : 0;

  // User position on screen
  const [userPx, userPy] = projectToPixel(
    centerLat,
    centerLon,
    currentZoom,
    width,
    mapHeight,
    centerLat,
    centerLon,
    panOffset
  );

  // Mouse / Touch Drag Panning Handlers
  const handleMouseDown = useCallback((e) => {
    if (!interactive) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialPanX: panOffset.x,
      initialPanY: panOffset.y,
    };
  }, [interactive, panOffset]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanOffset({
      x: dragStartRef.current.initialPanX + dx,
      y: dragStartRef.current.initialPanY + dy,
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback((e) => {
    if (!interactive || e.touches.length !== 1) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      initialPanX: panOffset.x,
      initialPanY: panOffset.y,
    };
  }, [interactive, panOffset]);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStartRef.current.x;
    const dy = e.touches[0].clientY - dragStartRef.current.y;
    setPanOffset({
      x: dragStartRef.current.initialPanX + dx,
      y: dragStartRef.current.initialPanY + dy,
    });
  }, [isDragging]);

  // Active run route polyline points
  const runRoutePointsString = useMemo(() => {
    if (routePoints && routePoints.length > 0) {
      return routePoints
        .filter((pt) => isValidCoordinate(pt.latitude, pt.longitude))
        .map((pt) => {
          const [px, py] = projectToPixel(
            pt.latitude,
            pt.longitude,
            currentZoom,
            width,
            mapHeight,
            centerLat,
            centerLon,
            panOffset
          );
          return `${px.toFixed(1)},${py.toFixed(1)}`;
        })
        .join(' ');
    }

    // Default route weaving through user's local sector
    return RUN_ROUTE_OFFSETS.map(([q, r]) => {
      const [rLat, rLon] = computeHexGeoCenter(centerLat, centerLon, q, r, 55);
      const [px, py] = projectToPixel(
        rLat,
        rLon,
        currentZoom,
        width,
        mapHeight,
        centerLat,
        centerLon,
        panOffset
      );
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    }).join(' ');
  }, [routePoints, currentZoom, width, mapHeight, centerLat, centerLon, panOffset]);

  return (
    <div
      ref={containerRef}
      className={`osm-interactive-map-container strava-style ${theme === 'dark' ? 'theme-dark' : 'theme-light'} ${isDragging ? 'is-dragging' : ''}`}
      style={{ height, width: '100%' }}
      role="region"
      aria-label={ariaLabel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    >
      {/* Dynamic 100% Full-Bleed Tile Layer */}
      <div className="osm-tiles-viewport">
        {tiles.map((tile) => (
          <img
            key={`${tile.x}-${tile.y}-${currentZoom}`}
            src={tile.url}
            alt=""
            loading="lazy"
            draggable={false}
            className="osm-tile-img"
            style={{
              position: 'absolute',
              left: `${tile.left}px`,
              top: `${tile.top}px`,
              width: '256px',
              height: '256px',
              pointerEvents: 'none',
            }}
          />
        ))}
      </div>

      {/* SVG Vector Overlays: Coordinates-Mapped Territories, Route, and Position */}
      <svg
        className="osm-svg-overlay full-bleed"
        viewBox={`0 0 ${width} ${mapHeight}`}
        style={{ width: '100%', height: '100%' }}
      >
        <defs>
          <radialGradient id="userGpsRadarPulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#b5ff14" stopOpacity="0.4" />
            <stop offset="60%" stopColor="#b5ff14" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#b5ff14" stopOpacity="0" />
          </radialGradient>
        </defs>

        {showTerritories && (
          <>
            {/* Allied Hexagons (Green) */}
            <g className="hex-group-allied">
              {ALLIED_HEX_OFFSETS.map(([q, r]) => (
                <polygon
                  key={`allied-${q}-${r}`}
                  points={computeHexPolygonPoints(centerLat, centerLon, q, r, currentZoom, width, mapHeight, panOffset)}
                  className="strava-hex-allied"
                />
              ))}
            </g>

            {/* Contested Hexagons (Orange) */}
            <g className="hex-group-contested">
              {CONTESTED_HEX_OFFSETS.map(([q, r]) => (
                <polygon
                  key={`contested-${q}-${r}`}
                  points={computeHexPolygonPoints(centerLat, centerLon, q, r, currentZoom, width, mapHeight, panOffset)}
                  className="strava-hex-contested"
                />
              ))}
            </g>

            {/* Rival Hexagons (Red) */}
            <g className="hex-group-rival">
              {RIVAL_HEX_OFFSETS.map(([q, r]) => (
                <polygon
                  key={`rival-${q}-${r}`}
                  points={computeHexPolygonPoints(centerLat, centerLon, q, r, currentZoom, width, mapHeight, panOffset)}
                  className="strava-hex-rival"
                />
              ))}
            </g>
          </>
        )}

        {/* Luminous Active GPS Running Route (Strava-Style Core & Glow) */}
        {runRoutePointsString && (
          <g className="strava-run-route">
            <polyline points={runRoutePointsString} className="strava-route-glow" />
            <polyline points={runRoutePointsString} className="strava-route-core" />
          </g>
        )}

        {/* Accuracy Radius Circle */}
        {accuracyRadiusPx > 0 && (
          <circle
            cx={userPx}
            cy={userPy}
            r={accuracyRadiusPx}
            className="strava-accuracy-circle"
          />
        )}

        {/* Current User Position Radar Beacon */}
        <circle cx={userPx} cy={userPy} r="22" className="strava-radar-ring outer" fill="url(#userGpsRadarPulse)" />
        <circle cx={userPx} cy={userPy} r="12" className="strava-radar-ring inner" />
        <circle cx={userPx} cy={userPy} r="6" className="strava-radar-dot" />
      </svg>

      {/* Floating Tactical Marker Label */}
      <div
        className="osm-marker-label font-mono"
        style={{
          position: 'absolute',
          left: `${Math.max(12, Math.min(width - 180, userPx - 70))}px`,
          top: `${Math.max(12, userPy - 42)}px`,
        }}
      >
        <span className="osm-marker-dot" />
        <span>{markerLabel}</span>
      </div>

      {/* Map Zoom & Recenter Controls */}
      {interactive && (
        <div className="osm-zoom-controls">
          <button
            type="button"
            className="osm-zoom-btn"
            onClick={(e) => {
              e.stopPropagation();
              setCurrentZoom((z) => Math.min(z + 1, 18));
            }}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="osm-zoom-btn"
            onClick={(e) => {
              e.stopPropagation();
              setCurrentZoom((z) => Math.max(z - 1, 11));
            }}
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="osm-zoom-btn recenter"
            onClick={(e) => {
              e.stopPropagation();
              setPanOffset({ x: 0, y: 0 });
            }}
            aria-label="Recenter on current location"
            title="Recenter on current location"
          >
            ⌖
          </button>
        </div>
      )}

      {/* OpenStreetMap Attribution */}
      <div className="osm-attribution">
        <span>© </span>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenStreetMap
        </a>
        <span> contributors</span>
      </div>
    </div>
  );
}
