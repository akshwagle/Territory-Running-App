/**
 * RUN & CONQUER — Live GPS Running & Territory Conquest Tracker
 *
 * Provides real-time GPS tracking cockpit, sports HUD metrics, breadcrumbs route map,
 * and fitness-grade signal quality indicators.
 */

import { useGpsTracker } from '../hooks/useGpsTracker.js';
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  formatAccuracy,
  formatCoordinates,
} from '../services/location/locationUtils.js';
import InteractiveMap from './InteractiveMap.jsx';

export default function LiveRunTracker({ theme = 'dark', _onNavigateMap = null }) {
  const {
    status,
    isTracking,
    isPaused,
    isStopped,
    isSignalLost,
    points,
    pointCount,
    currentPoint,
    totalDistance,
    elapsedSeconds,
    currentPace,
    averagePace,
    start,
    pause,
    resume,
    stop,
    reset,
  } = useGpsTracker();

  const accuracyData = currentPoint?.accuracy ? formatAccuracy(currentPoint.accuracy) : null;

  return (
    <div className="live-run-tracker-container">
      {/* Cockpit Status Header */}
      <div className="run-tracker-header">
        <div className="run-tracker-title-wrap">
          <div className="run-pulse-beacon" />
          <div>
            <h2 className="run-cockpit-title font-heading">LIVE RUN & TERRITORY CONQUEST</h2>
            <p className="run-cockpit-subtitle">GPS Breadcrumbs & Resolution-11 Hex Traversal</p>
          </div>
        </div>

        {/* GPS Quality Status Badge */}
        <div className="run-status-badge-wrap">
          {status === 'idle' && (
            <span className="gps-pill idle font-mono">STANDBY / READY</span>
          )}
          {status === 'starting' && (
            <span className="gps-pill starting font-mono">ACQUIRING GPS FIX...</span>
          )}
          {status === 'tracking' && (
            <span className="gps-pill locked font-mono">
              ● GPS LOCKED ({accuracyData?.text || 'High accuracy'})
            </span>
          )}
          {isSignalLost && (
            <span className="gps-pill warning font-mono">⚠️ GPS SIGNAL LOST</span>
          )}
          {isPaused && (
            <span className="gps-pill paused font-mono">❚❚ RUN PAUSED</span>
          )}
          {isStopped && (
            <span className="gps-pill stopped font-mono">✓ RUN FINISHED</span>
          )}
        </div>
      </div>

      {/* Primary HUD Metric Cards */}
      <div className="run-hud-grid">
        <div className="run-hud-card primary">
          <div className="hud-metric-label">DISTANCE</div>
          <div className="hud-metric-value font-heading">{formatDistance(totalDistance)}</div>
          <div className="hud-metric-sub font-mono">{pointCount} verified GPS points</div>
        </div>

        <div className="run-hud-card">
          <div className="hud-metric-label">DURATION</div>
          <div className="hud-metric-value font-heading">{formatDuration(elapsedSeconds)}</div>
          <div className="hud-metric-sub font-mono">Active moving time</div>
        </div>

        <div className="run-hud-card">
          <div className="hud-metric-label">CURRENT PACE</div>
          <div className="hud-metric-value font-heading">{formatPace(currentPace)}</div>
          <div className="hud-metric-sub font-mono">Speed: {formatSpeed(currentPoint?.speed)}</div>
        </div>

        <div className="run-hud-card">
          <div className="hud-metric-label">AVERAGE PACE</div>
          <div className="hud-metric-value font-heading">{formatPace(averagePace)}</div>
          <div className="hud-metric-sub font-mono">Overall session split</div>
        </div>
      </div>

      {/* Live Map & Breadcrumb Trail */}
      <div className="run-map-section">
        <div className="run-map-card">
          <InteractiveMap
            latitude={currentPoint?.latitude ?? 12.9716}
            longitude={currentPoint?.longitude ?? 77.5946}
            accuracy={currentPoint?.accuracy ?? null}
            routePoints={points}
            zoom={16}
            height="340px"
            theme={theme}
            markerLabel={
              currentPoint
                ? `Current: ${formatCoordinates(currentPoint.latitude, currentPoint.longitude, 4)}`
                : 'Awaiting GPS lock'
            }
          />
        </div>
      </div>

      {/* Control Actions Bar */}
      <div className="run-controls-card">
        <div className="run-controls-row">
          {status === 'idle' && (
            <button type="button" className="btn-run-action start" onClick={start}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>START RUN</span>
            </button>
          )}

          {isTracking && (
            <>
              <button type="button" className="btn-run-action pause" onClick={pause}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
                <span>PAUSE</span>
              </button>
              <button type="button" className="btn-run-action stop" onClick={stop}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <rect x="5" y="5" width="14" height="14" />
                </svg>
                <span>FINISH RUN</span>
              </button>
            </>
          )}

          {isPaused && (
            <>
              <button type="button" className="btn-run-action resume" onClick={resume}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>RESUME</span>
              </button>
              <button type="button" className="btn-run-action stop" onClick={stop}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <rect x="5" y="5" width="14" height="14" />
                </svg>
                <span>FINISH RUN</span>
              </button>
            </>
          )}

          {isStopped && (
            <button type="button" className="btn-run-action reset" onClick={reset}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              <span>START NEW RUN</span>
            </button>
          )}
        </div>

        {/* GPS Verification Notice */}
        <div className="run-integrity-footnote font-mono">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>
            Run & Conquer uses verified hardware GPS only for territory capture (accuracy ≤ 35 m).
            IP coordinates and simulated positions are rejected.
          </span>
        </div>
      </div>
    </div>
  );
}
