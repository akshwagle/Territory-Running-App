/**
 * RUN & CONQUER — Browser Geolocation Detection Service
 * Encapsulates high-accuracy single-shot GPS location detection with comprehensive
 * error normalization and human-understandable messaging.
 */

export const GEOLOCATION_CONFIG = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};

export const GEOLOCATION_ERROR_CODES = {
  UNSUPPORTED: 'UNSUPPORTED',
  INSECURE_CONTEXT: 'INSECURE_CONTEXT',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  POSITION_UNAVAILABLE: 'POSITION_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Checks if geolocation is supported in the current runtime environment.
 */
export function isGeolocationSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'geolocation' in navigator &&
    navigator.geolocation != null
  );
}

/**
 * Checks if the current window context is secure (HTTPS or localhost).
 * Geolocation requires a secure context in modern browsers.
 */
export function isSecureLocationContext() {
  if (typeof window === 'undefined') return false;
  if (typeof window.isSecureContext === 'boolean') {
    return window.isSecureContext;
  }
  // Fallback check for protocol
  const protocol = window.location?.protocol;
  const hostname = window.location?.hostname;
  return protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Normalizes browser GeolocationPositionError or environment errors into
 * clear, understandable user-facing guidance.
 */
export function normalizeGeolocationError(error) {
  if (!error) {
    return {
      code: GEOLOCATION_ERROR_CODES.UNKNOWN,
      message: 'An unexpected location detection error occurred. Please try again.',
    };
  }

  // Pre-flight errors
  if (error.code === GEOLOCATION_ERROR_CODES.UNSUPPORTED) {
    return {
      code: GEOLOCATION_ERROR_CODES.UNSUPPORTED,
      message: 'Your browser does not support GPS location detection. Please use an updated modern browser.',
    };
  }

  if (error.code === GEOLOCATION_ERROR_CODES.INSECURE_CONTEXT) {
    return {
      code: GEOLOCATION_ERROR_CODES.INSECURE_CONTEXT,
      message: 'Location access requires a secure connection (HTTPS). Please open this site over HTTPS or localhost.',
    };
  }

  // W3C GeolocationPositionError codes
  switch (error.code) {
    case 1: // GeolocationPositionError.PERMISSION_DENIED
      return {
        code: GEOLOCATION_ERROR_CODES.PERMISSION_DENIED,
        message: 'Location permission was denied. Please allow location access in your browser address bar settings to detect your position.',
      };
    case 2: // GeolocationPositionError.POSITION_UNAVAILABLE
      return {
        code: GEOLOCATION_ERROR_CODES.POSITION_UNAVAILABLE,
        message: 'GPS location is currently unavailable. Please verify that your device has location services enabled and a clear GPS signal.',
      };
    case 3: // GeolocationPositionError.TIMEOUT
      return {
        code: GEOLOCATION_ERROR_CODES.TIMEOUT,
        message: 'GPS location request timed out. Please check your signal and click "Retry Detection".',
      };
    default:
      return {
        code: GEOLOCATION_ERROR_CODES.UNKNOWN,
        message: error.message || 'Unable to determine your GPS position. Please try again.',
      };
  }
}

/**
 * Single-shot GPS location detection.
 * Requests location only on explicit call (never automatically on import or load).
 *
 * @param {PositionOptions} [customOptions]
 * @returns {Promise<import('./types').GpsPositionResult>}
 */
export async function detectCurrentPosition(customOptions = {}) {
  if (!isGeolocationSupported()) {
    const err = { code: GEOLOCATION_ERROR_CODES.UNSUPPORTED };
    throw normalizeGeolocationError(err);
  }

  if (!isSecureLocationContext()) {
    const err = { code: GEOLOCATION_ERROR_CODES.INSECURE_CONTEXT };
    throw normalizeGeolocationError(err);
  }

  const options = {
    ...GEOLOCATION_CONFIG,
    ...customOptions,
  };

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = position.coords;
        resolve({
          coords: {
            latitude,
            longitude,
            accuracy,
            altitude: altitude ?? null,
            altitudeAccuracy: altitudeAccuracy ?? null,
            heading: heading ?? null,
            // Preserve speed as null if not provided; do NOT interpret missing speed as 0
            speed: typeof speed === 'number' && !Number.isNaN(speed) ? speed : null,
          },
          timestamp: position.timestamp || Date.now(),
          source: 'gps',
          isVerifiedGps: true,
        });
      },
      (error) => {
        reject(normalizeGeolocationError(error));
      },
      options
    );
  });
}
