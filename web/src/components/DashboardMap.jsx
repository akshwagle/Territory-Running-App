/**
 * RUN & CONQUER — Dashboard Interactive Territory Map
 *
 * Professional street-map cockpit inspired by Strava's athletic design:
 * - 100% full-bleed map container fill with zero blank areas, cropped tiles, or distortion.
 * - Auto-detects visitor GPS location on mount and centers precisely on the user.
 * - Distinct pulsing current-location marker at zoom level 15.
 * - Real geographical resolution-11 territory overlays (green owned, orange contested, red rival).
 * - Luminous GPS running route polyline.
 * - Clean non-blocking permission-denied message with retry option.
 * - Clean UI with zero intrusive configuration boxes or debug panels covering map tiles.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import InteractiveMap from './InteractiveMap.jsx';
import { formatCoordinates } from '../services/location/locationUtils.js';

export default function DashboardMap({
  theme = 'dark',
  locationLabel = null,
  onOpenLocationSelector = null,
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [geoStatus, setGeoStatus] = useState('detecting'); // 'detecting' | 'granted' | 'denied' | 'unavailable' | 'timeout'
  const [geoError, setGeoError] = useState(null);
  const [userLocation, setUserLocation] = useState(null);

  // Optional Google Maps API key from environment
  const apiKey = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_GOOGLE_MAPS_API_KEY : '';
  const [googleMapsReady, setGoogleMapsReady] = useState(false);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  /**
   * Request browser geolocation on mount and wait for valid GPS coordinates
   */
  const requestUserLocation = useCallback(() => {
    setGeoStatus('detecting');
    setGeoError(null);

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoStatus('unavailable');
      setGeoError('Browser does not support geolocation.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setUserLocation({
          lat: latitude,
          lng: longitude,
          accuracy,
        });
        setGeoStatus('granted');
      },
      (err) => {
        if (err.code === 1) {
          setGeoStatus('denied');
          setGeoError('Location permission denied. Click to retry.');
        } else if (err.code === 3) {
          setGeoStatus('timeout');
          setGeoError('Location request timed out. Click to retry.');
        } else {
          setGeoStatus('unavailable');
          setGeoError('Location fix unavailable. Click to retry.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  }, []);

  // Request browser geolocation on initial mount
  useEffect(() => {
    requestUserLocation();
  }, [requestUserLocation]);

  // Optional: Load Google Maps if API key is provided in environment
  useEffect(() => {
    if (!apiKey) return;

    if (typeof window !== 'undefined' && window.google?.maps) {
      setGoogleMapsReady(true);
      return;
    }

    const scriptId = 'google-maps-js-sdk';
    let script = document.getElementById(scriptId);
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const handleLoad = () => setGoogleMapsReady(true);
    script.addEventListener('load', handleLoad);
    return () => script?.removeEventListener('load', handleLoad);
  }, [apiKey]);

  // If Google Maps is active and element is ready
  useEffect(() => {
    if (!googleMapsReady || !mapContainerRef.current || !window.google?.maps || !userLocation) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
        center: { lat: userLocation.lat, lng: userLocation.lng },
        zoom: 15,
        disableDefaultUI: false,
        zoomControl: true,
      });
      new window.google.maps.Marker({
        position: { lat: userLocation.lat, lng: userLocation.lng },
        map: mapInstanceRef.current,
        title: 'Your Current Position',
      });
    } else {
      mapInstanceRef.current.setCenter({ lat: userLocation.lat, lng: userLocation.lng });
    }
  }, [googleMapsReady, userLocation]);

  const activeLocationTitle = userLocation
    ? formatCoordinates(userLocation.lat, userLocation.lng, 3)
    : (locationLabel || (geoStatus === 'detecting' ? 'Acquiring GPS...' : 'Location Standby'));

  return (
    <div className={`dashboard-map-card ${fullscreen ? 'is-fullscreen' : ''}`}>
      {/* Map Header */}
      <div className="dashboard-map-header">
        <div className="map-title-wrap">
          <svg className="map-title-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
          <h3>Interactive Territory Map</h3>
        </div>

        <div className="map-meta-wrap">
          {/* Detected Location Badge */}
          <button
            type="button"
            className="map-location-badge is-clickable"
            onClick={onOpenLocationSelector || requestUserLocation}
            title="Click to detect or change operational sector"
            aria-label={`Current location: ${activeLocationTitle}. Click to detect or change.`}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            <span>{activeLocationTitle}</span>
          </button>

          {/* Fullscreen Expand/Collapse */}
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

      {/* Small Non-Blocking Geolocation Notification Banner */}
      {(geoStatus === 'denied' || geoStatus === 'unavailable' || geoStatus === 'timeout') && (
        <div className="map-geo-alert warning">
          <span>⚠️ {geoError}</span>
          <button type="button" className="btn-map-retry" onClick={requestUserLocation}>
            Retry Geolocation
          </button>
        </div>
      )}

      {/* Map Viewport Area: 100% Full-Bleed Container */}
      <div className="dashboard-map-canvas-container full-bleed">
        {/* If user coordinates are still detecting and no position yet, show sleek radar pulse */}
        {geoStatus === 'detecting' && !userLocation ? (
          <div className="map-radar-scanning-state">
            <div className="radar-sweep-spinner" />
            <div className="radar-status-text font-mono">
              <span>● ACQUIRING VISITOR GPS POSITION...</span>
              <small>Calibrating sector coordinates and resolution-11 hex grid</small>
            </div>
          </div>
        ) : apiKey && googleMapsReady ? (
          /* Render Google Maps when key is available */
          <div
            ref={mapContainerRef}
            className="google-map-render-target"
            style={{ width: '100%', height: '100%' }}
            aria-label="Google Maps Territory Map"
          />
        ) : (
          /* High-Performance Strava-Style Interactive Street Map */
          <InteractiveMap
            latitude={userLocation ? userLocation.lat : 12.9716}
            longitude={userLocation ? userLocation.lng : 77.5946}
            accuracy={userLocation?.accuracy || null}
            zoom={15}
            height="100%"
            theme={theme}
            markerLabel={
              userLocation
                ? `Current: ${formatCoordinates(userLocation.lat, userLocation.lng, 3)}`
                : 'Sector Center'
            }
          />
        )}

        {/* Floating Map Legend */}
        <div className="map-floating-legend">
          <div className="legend-row">
            <span className="legend-dot allied"></span>
            <span>Your Territory (Allied)</span>
          </div>
          <div className="legend-row">
            <span className="legend-dot contested"></span>
            <span>Contested Sector</span>
          </div>
          <div className="legend-row">
            <span className="legend-dot rival"></span>
            <span>Rival Territory</span>
          </div>
          <div className="legend-row">
            <span className="legend-line-sample"></span>
            <span>Your Run Route</span>
          </div>
        </div>
      </div>
    </div>
  );
}
