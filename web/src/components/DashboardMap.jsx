import { useState } from 'react';

export default function DashboardMap({ theme = 'dark' }) {
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  // Hexagon math
  const radius = 24;
  const hexPoints = Array.from({ length: 6 }, (_, i) => {
    const a = (i * 60 - 90) * Math.PI / 180;
    return `${Math.cos(a) * (radius - 1.5)},${Math.sin(a) * (radius - 1.5)}`;
  }).join(' ');

  const pos = ([q, r]) => [
    320 + Math.sqrt(3) * radius * (q + r / 2),
    200 + radius * 1.5 * r,
  ];

  // Hex clusters matching reference screenshots (Bengaluru sector)
  const alliedHexes = [
    [0, 0], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1],
    [-2, 1], [-2, 2], [-1, 2], [0, 2], [1, 1], [2, 0], [-2, 0],
    [-3, 1], [-3, 2], [-1, -1]
  ];

  const contestedHexes = [
    [2, -2], [3, -3], [2, -3], [3, -2], [1, -2]
  ];

  const rivalHexes = [
    [0, 3], [1, 3], [0, 4], [1, 2], [2, 2]
  ];

  const runRoute = [
    [-3.5, 2.5], [-3, 2], [-2, 2], [-2, 1], [-1, 1], [0, 1], [0, 0],
    [1, 0], [2, -1], [2.5, -2], [3, -2]
  ];

  const runPoints = runRoute.map((p) => pos(p).join(',')).join(' ');

  return (
    <div className={`dashboard-map-card ${fullscreen ? 'is-fullscreen' : ''}`}>
      <div className="dashboard-map-header">
        <div className="map-title-wrap">
          <svg className="map-title-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3z" />
            <path d="M9 4v16M15 1v16" />
          </svg>
          <h3>Your Territory</h3>
        </div>
        <div className="map-meta-wrap">
          <span className="map-location-badge">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            Bengaluru, IN
          </span>
          <button
            type="button"
            className="map-action-btn"
            onClick={() => setFullscreen(!fullscreen)}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Expand map'}
            title={fullscreen ? 'Exit fullscreen' : 'Expand map'}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="dashboard-map-canvas-container">
        <svg
          className="dashboard-map-svg"
          viewBox="0 0 640 400"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
        >
          {/* Real satellite city map background */}
          <image
            href={theme === 'light' ? '/assets/map-satellite-light.jpg' : '/assets/map-satellite-dark.jpg'}
            x="0"
            y="0"
            width="640"
            height="400"
            preserveAspectRatio="xMidYMid slice"
            className="map-satellite-base"
          />

          {/* Aerial city street & avenue grid overlay */}
          <g className="map-city-grid-layer" opacity={theme === 'light' ? '0.35' : '0.45'} stroke="currentColor" strokeWidth="1" fill="none">
            <ellipse cx="320" cy="200" rx="270" ry="160" stroke="var(--accent-lime)" strokeWidth="1.2" strokeOpacity="0.35" />
            <ellipse cx="320" cy="200" rx="190" ry="110" stroke="var(--accent-lime)" strokeWidth="0.8" strokeOpacity="0.25" strokeDasharray="4 6" />
            <path d="M 0,110 L 640,290" stroke="var(--accent-lime)" strokeWidth="1.5" strokeOpacity="0.35" />
            <path d="M 0,280 L 640,120" stroke="var(--accent-lime)" strokeWidth="1.5" strokeOpacity="0.35" />
            <path d="M 210,0 L 430,400" stroke="var(--text-muted)" strokeWidth="1" strokeOpacity="0.25" />
            <path d="M 430,0 L 210,400" stroke="var(--text-muted)" strokeWidth="1" strokeOpacity="0.25" />
          </g>

          {/* Hexagons: Allied */}
          <g className="hex-group-allied">
            {alliedHexes.map(([q, r]) => (
              <polygon
                key={`a-${q}-${r}`}
                points={hexPoints}
                transform={`translate(${pos([q, r]).join(' ')})`}
                className="hex-allied"
              />
            ))}
          </g>

          {/* Center stronghold crown */}
          <g transform={`translate(${pos([0, 0]).join(' ')})`} className="stronghold-crown">
            <circle cx="0" cy="0" r="14" className="crown-circle" />
            <path
              d="M-7,5 L-7,-3 L-3,1 L0,-5 L3,1 L7,-3 L7,5 Z"
              fill="currentColor"
              className="crown-glyph"
            />
          </g>

          {/* Hexagons: Contested */}
          <g className="hex-group-contested">
            {contestedHexes.map(([q, r]) => (
              <polygon
                key={`c-${q}-${r}`}
                points={hexPoints}
                transform={`translate(${pos([q, r]).join(' ')})`}
                className="hex-contested"
              />
            ))}
          </g>

          {/* Hexagons: Rival */}
          <g className="hex-group-rival">
            {rivalHexes.map(([q, r]) => (
              <polygon
                key={`r-${q}-${r}`}
                points={hexPoints}
                transform={`translate(${pos([q, r]).join(' ')})`}
                className="hex-rival"
              />
            ))}
          </g>

          {/* Active run route polyline */}
          <polyline points={runPoints} className="run-route-glow" />
          <polyline points={runPoints} className="run-route-line" />

          {/* Waypoints */}
          <circle cx={pos(runRoute[0])[0]} cy={pos(runRoute[0])[1]} r="5" className="run-waypoint-start" />
          <circle cx={pos(runRoute[runRoute.length - 1])[0]} cy={pos(runRoute[runRoute.length - 1])[1]} r="4" className="run-waypoint-end" />
        </svg>

        {/* Map overlay controls */}
        <div className="map-zoom-controls">
          <button type="button" onClick={() => setZoom((z) => Math.min(z + 0.2, 1.8))} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => setZoom((z) => Math.max(z - 0.2, 0.8))} aria-label="Zoom out">−</button>
        </div>

        {/* Floating Legend */}
        <div className="map-floating-legend">
          <div className="legend-row">
            <span className="legend-dot allied"></span>
            <span>Your Territory</span>
          </div>
          <div className="legend-row">
            <span className="legend-dot contested"></span>
            <span>Contested</span>
          </div>
          <div className="legend-row">
            <span className="legend-dot rival"></span>
            <span>Rival Territory</span>
          </div>
          <div className="legend-row">
            <span className="legend-line-sample"></span>
            <span>Your Run (5.42 km)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
