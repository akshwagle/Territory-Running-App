/**
 * RUN & CONQUER — Location Management React Hook
 *
 * Coordinates browser GPS detection, reverse geocoding, manual location selection,
 * and optional IP-based fallback with strict integrity validation.
 */

import { useState, useCallback } from 'react';
import { detectCurrentPosition } from '../services/location/geolocationService.js';
import { defaultGeocodingService } from '../services/location/geocodingService.js';
import { defaultIpLocationService } from '../services/location/ipLocationService.js';
import { isValidCoordinate } from '../services/location/locationUtils.js';

const STORAGE_KEY = 'run_conquer_selected_location';

export function useLocation(initialLocation = null) {
  const [location, setLocation] = useState(() => {
    if (initialLocation) return initialLocation;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore localStorage access failures
    }
    // Default location label without hardcoding coordinates
    return null;
  });

  const [status, setStatus] = useState('idle'); // 'idle' | 'detecting' | 'success' | 'error'
  const [error, setError] = useState(null);
  const [reverseGeocodeInfo, setReverseGeocodeInfo] = useState(null);
  const [isIpFallbackAvailable] = useState(() => defaultIpLocationService.isConfigured);

  // Sync to localStorage when confirmed
  const persistLocation = useCallback((newLoc) => {
    setLocation(newLoc);
    try {
      if (newLoc) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newLoc));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  /**
   * Detect current location using high-accuracy browser GPS.
   */
  const detectLocation = useCallback(async () => {
    setStatus('detecting');
    setError(null);

    try {
      const gpsResult = await detectCurrentPosition();
      const { latitude, longitude, accuracy } = gpsResult.coords;

      // Attempt reverse geocoding through the abstraction
      let geocodeData = null;
      try {
        geocodeData = await defaultGeocodingService.reverseGeocode(latitude, longitude);
        setReverseGeocodeInfo(geocodeData);
      } catch {
        // Geocoding failure does not invalidate valid GPS coordinates
        geocodeData = null;
      }

      const detectedLocation = {
        coords: {
          latitude,
          longitude,
          accuracy,
        },
        address: geocodeData?.formattedAddress || null,
        city: geocodeData?.city || null,
        state: geocodeData?.state || null,
        country: geocodeData?.country || null,
        postalCode: geocodeData?.postalCode || null,
        source: 'gps',
        isVerifiedGps: true,
        isApproximate: false,
        timestamp: gpsResult.timestamp,
      };

      setLocation(detectedLocation);
      setStatus('success');
      return detectedLocation;
    } catch (err) {
      setError({
        code: err.code || 'UNKNOWN',
        message: err.message || 'Location detection failed.',
      });
      setStatus('error');
      return null;
    }
  }, []);

  /**
   * Manually select or override location.
   */
  const setManualLocation = useCallback(
    async (manualData) => {
      const { latitude, longitude, city, state, country, postalCode, label } = manualData;
      if (!isValidCoordinate(latitude, longitude)) {
        const err = { code: 'INVALID_COORDINATES', message: 'Selected coordinates are invalid.' };
        setError(err);
        setStatus('error');
        return;
      }

      const manualLocation = {
        coords: {
          latitude,
          longitude,
          accuracy: null, // Manual picks don't have GPS error radius
        },
        address: label || (city ? `${city}, ${country || ''}`.trim() : null),
        city: city || null,
        state: state || null,
        country: country || null,
        postalCode: postalCode || null,
        source: 'manual',
        isVerifiedGps: false,
        isApproximate: false,
        timestamp: Date.now(),
      };

      setLocation(manualLocation);
      setStatus('success');
      setError(null);
      return manualLocation;
    },
    []
  );

  /**
   * Fallback to IP Geolocation if configured and requested.
   */
  const tryIpFallback = useCallback(async () => {
    setStatus('detecting');
    setError(null);

    try {
      const ipResult = await defaultIpLocationService.detectLocation();
      if (!ipResult.isConfigured || !ipResult.coords) {
        throw new Error(ipResult.note || 'IP geolocation provider is not configured.');
      }

      const ipLocation = {
        coords: ipResult.coords,
        address: ipResult.city ? `${ipResult.city}, ${ipResult.country || ''}`.trim() : null,
        city: ipResult.city,
        state: ipResult.region,
        country: ipResult.country,
        postalCode: null,
        source: 'ip',
        isVerifiedGps: false,
        isApproximate: true,
        timestamp: Date.now(),
        warning: ipResult.warning,
      };

      setLocation(ipLocation);
      setStatus('success');
      return ipLocation;
    } catch (err) {
      setError({
        code: 'IP_LOCATION_FAILED',
        message: err.message || 'IP location detection unavailable.',
      });
      setStatus('error');
      return null;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    if (status === 'error') setStatus('idle');
  }, [status]);

  return {
    location,
    status,
    error,
    isDetecting: status === 'detecting',
    reverseGeocodeInfo,
    isIpFallbackAvailable,
    detectLocation,
    retry: detectLocation,
    setManualLocation,
    tryIpFallback,
    confirmLocation: persistLocation,
    clearError,
  };
}
