/**
 * RUN & CONQUER — Location Selection & GPS Detection Modal
 *
 * Implements high-accuracy browser GPS acquisition, reverse geocoding display,
 * manual coordinates/city selection, and optional IP fallback with clear integrity disclosures.
 */

import { useState, useEffect } from 'react';
import { useLocation } from '../hooks/useLocation.js';
import { formatCoordinates, formatAccuracy } from '../services/location/locationUtils.js';
import InteractiveMap from './InteractiveMap.jsx';

const CITY_PRESETS = [
  { city: 'Bengaluru', state: 'Karnataka', country: 'India', lat: 12.9716, lon: 77.5946 },
  { city: 'Mumbai', state: 'Maharashtra', country: 'India', lat: 18.922, lon: 72.8347 },
  { city: 'Delhi', state: 'Delhi', country: 'India', lat: 28.6139, lon: 77.209 },
  { city: 'Hyderabad', state: 'Telangana', country: 'India', lat: 17.385, lon: 78.4867 },
  { city: 'Chennai', state: 'Tamil Nadu', country: 'India', lat: 13.0827, lon: 80.2707 },
  { city: 'Pune', state: 'Maharashtra', country: 'India', lat: 18.5204, lon: 73.8567 },
];

export default function LocationSelectorModal({
  isOpen,
  onClose,
  currentLocation,
  onLocationConfirmed,
  theme = 'dark',
}) {
  const {
    location,
    error,
    isDetecting,
    reverseGeocodeInfo,
    isIpFallbackAvailable,
    detectLocation,
    retry,
    setManualLocation,
    tryIpFallback,
    confirmLocation,
    clearError,
  } = useLocation(currentLocation);

  const [activeTab, setActiveTab] = useState('detect'); // 'detect' | 'manual'
  const [customLat, setCustomLat] = useState('');
  const [customLon, setCustomLon] = useState('');

  // Sync custom inputs when location changes
  useEffect(() => {
    if (location?.coords) {
      setCustomLat(location.coords.latitude.toFixed(6));
      setCustomLon(location.coords.longitude.toFixed(6));
    }
  }, [location]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (location) {
      confirmLocation(location);
      if (onLocationConfirmed) onLocationConfirmed(location);
    }
    onClose();
  };

  const handleSelectPreset = (preset) => {
    setManualLocation({
      latitude: preset.lat,
      longitude: preset.lon,
      city: preset.city,
      state: preset.state,
      country: preset.country,
      label: `${preset.city}, ${preset.country}`,
    });
  };

  const handleApplyCustomCoords = (e) => {
    e.preventDefault();
    const lat = parseFloat(customLat);
    const lon = parseFloat(customLon);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      setManualLocation({
        latitude: lat,
        longitude: lon,
        label: `Manual (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
      });
    }
  };

  const accuracyData = location?.coords?.accuracy ? formatAccuracy(location.coords.accuracy) : null;

  return (
    <div className="location-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="loc-modal-title">
      <div className="location-modal-card">
        {/* Modal Header */}
        <div className="location-modal-header">
          <div className="loc-header-title-wrap">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--accent-lime)" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
            </svg>
            <h2 id="loc-modal-title" className="font-heading">Location & Sector Configuration</h2>
          </div>
          <button type="button" className="loc-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="loc-modal-tabs">
          <button
            type="button"
            className={`loc-tab-btn ${activeTab === 'detect' ? 'is-active' : ''}`}
            onClick={() => { setActiveTab('detect'); clearError(); }}
          >
            GPS Detection
          </button>
          <button
            type="button"
            className={`loc-tab-btn ${activeTab === 'manual' ? 'is-active' : ''}`}
            onClick={() => { setActiveTab('manual'); clearError(); }}
          >
            Manual Preset & Coords
          </button>
        </div>

        {/* Tab 1: GPS Detection */}
        {activeTab === 'detect' && (
          <div className="loc-tab-content">
            <div className="loc-action-row">
              <button
                type="button"
                className="btn-loc-detect"
                onClick={detectLocation}
                disabled={isDetecting}
              >
                {isDetecting ? (
                  <>
                    <span className="loc-spinner" />
                    <span>Acquiring High-Accuracy GPS...</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                    <span>Detect My Current Location</span>
                  </>
                )}
              </button>
            </div>

            {/* Error Message Box */}
            {error && (
              <div className="loc-error-card" role="alert">
                <div className="loc-error-icon">⚠️</div>
                <div className="loc-error-body">
                  <div className="loc-error-title font-heading">Location Detection Failed</div>
                  <div className="loc-error-desc">{error.message}</div>
                  <div className="loc-error-actions">
                    <button type="button" className="btn-loc-retry" onClick={retry}>
                      Retry Detection
                    </button>
                    {isIpFallbackAvailable && (
                      <button type="button" className="btn-loc-fallback" onClick={tryIpFallback}>
                        Use Approximate IP Location
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Approximate IP Notice */}
            {location?.source === 'ip' && (
              <div className="loc-warning-banner" role="status">
                <span className="warning-badge">APPROXIMATE IP</span>
                <span>{location.warning || 'Approximate network location. Not valid for GPS running or territory conquest.'}</span>
              </div>
            )}

            {/* Detected Details Card */}
            {location?.coords && (
              <div className="loc-details-card">
                <div className="loc-coords-grid">
                  <div className="loc-stat-box">
                    <span className="loc-stat-label">COORDINATES</span>
                    <span className="loc-stat-value font-mono">
                      {formatCoordinates(location.coords.latitude, location.coords.longitude)}
                    </span>
                  </div>

                  <div className="loc-stat-box">
                    <span className="loc-stat-label">GPS ACCURACY</span>
                    <span className={`loc-accuracy-pill ${accuracyData?.level || 'unknown'} font-mono`}>
                      {accuracyData?.text || 'Manual / Verified'}
                    </span>
                  </div>

                  <div className="loc-stat-box full-width">
                    <span className="loc-stat-label">ADDRESS / SECTOR</span>
                    <span className="loc-address-text">
                      {location.address || (location.city ? `${location.city}, ${location.country || ''}` : 'Raw GPS Coordinates (No address lookup configured)')}
                    </span>
                    {reverseGeocodeInfo?.note && (
                      <small className="loc-note-text">{reverseGeocodeInfo.note}</small>
                    )}
                  </div>
                </div>

                {/* Interactive OSM Map Preview */}
                <div className="loc-map-preview-wrap">
                  <InteractiveMap
                    latitude={location.coords.latitude}
                    longitude={location.coords.longitude}
                    accuracy={location.coords.accuracy}
                    theme={theme}
                    height="180px"
                    markerLabel={location.city || 'Current GPS Fix'}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Manual Selection */}
        {activeTab === 'manual' && (
          <div className="loc-tab-content">
            <div className="loc-manual-section">
              <span className="loc-section-title font-heading">QUICK SECTOR PRESETS</span>
              <div className="loc-presets-grid">
                {CITY_PRESETS.map((preset) => (
                  <button
                    key={preset.city}
                    type="button"
                    className={`loc-preset-chip ${location?.city === preset.city ? 'is-selected' : ''}`}
                    onClick={() => handleSelectPreset(preset)}
                  >
                    <span className="preset-city font-heading">{preset.city}</span>
                    <span className="preset-state">{preset.state}</span>
                  </button>
                ))}
              </div>
            </div>

            <form className="loc-custom-coords-form" onSubmit={handleApplyCustomCoords}>
              <span className="loc-section-title font-heading">CUSTOM COORDINATES</span>
              <div className="loc-inputs-row">
                <div className="loc-input-group">
                  <label htmlFor="custom-lat">Latitude</label>
                  <input
                    id="custom-lat"
                    type="number"
                    step="0.000001"
                    min="-90"
                    max="90"
                    value={customLat}
                    onChange={(e) => setCustomLat(e.target.value)}
                    placeholder="e.g. 12.9716"
                    className="loc-input font-mono"
                    required
                  />
                </div>
                <div className="loc-input-group">
                  <label htmlFor="custom-lon">Longitude</label>
                  <input
                    id="custom-lon"
                    type="number"
                    step="0.000001"
                    min="-180"
                    max="180"
                    value={customLon}
                    onChange={(e) => setCustomLon(e.target.value)}
                    placeholder="e.g. 77.5946"
                    className="loc-input font-mono"
                    required
                  />
                </div>
                <button type="submit" className="btn-loc-apply">
                  Set Coords
                </button>
              </div>
            </form>

            {/* Interactive Preview for Manual Selection */}
            {location?.coords && (
              <div className="loc-map-preview-wrap" style={{ marginTop: '16px' }}>
                <InteractiveMap
                  latitude={location.coords.latitude}
                  longitude={location.coords.longitude}
                  theme={theme}
                  height="160px"
                  markerLabel={location.city || 'Selected Coordinates'}
                />
              </div>
            )}
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="location-modal-footer">
          <button type="button" className="btn-loc-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-loc-confirm"
            onClick={handleConfirm}
            disabled={!location?.coords}
          >
            Confirm & Save Sector
          </button>
        </div>
      </div>
    </div>
  );
}
