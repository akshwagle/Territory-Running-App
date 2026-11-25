/**
 * RUN & CONQUER — Location & GPS Mathematics Utilities
 * Provides high-precision distance, pace, bearing, formatting, and Slippy Map calculations.
 */

export const EARTH_RADIUS_METRES = 6371000;

export function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

/**
 * Validates latitude and longitude bounds.
 */
export function isValidCoordinate(lat, lon) {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Great-circle distance between two GPS coordinates in metres (Haversine formula).
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
    return 0;
  }
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METRES * c;
}

/**
 * Calculate compass bearing in degrees (0°..360°) between two coordinates.
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
    return 0;
  }
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLambda = toRadians(lon2 - lon1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  return (toDegrees(theta) + 360) % 360;
}

/**
 * Human-readable directional coordinates string, e.g. "12.97160° N, 77.59457° E".
 */
export function formatCoordinates(lat, lon, precision = 5) {
  if (!isValidCoordinate(lat, lon)) return 'Coordinates unavailable';
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(precision)}° ${latDir}, ${Math.abs(lon).toFixed(precision)}° ${lonDir}`;
}

/**
 * Plain decimal coordinate string, e.g. "12.971599, 77.594566".
 */
export function formatDecimalCoords(lat, lon, precision = 6) {
  if (!isValidCoordinate(lat, lon)) return '--, --';
  return `${lat.toFixed(precision)}, ${lon.toFixed(precision)}`;
}

/**
 * Classifies and formats GPS accuracy in metres.
 */
export function formatAccuracy(meters) {
  if (meters == null || Number.isNaN(meters) || meters < 0) {
    return { level: 'unknown', label: 'Unknown accuracy', text: 'Accuracy unavailable' };
  }
  const rounded = Math.round(meters);
  if (meters <= 15) {
    return { level: 'high', label: 'High accuracy', text: `±${rounded} m (High accuracy)` };
  }
  if (meters <= 45) {
    return { level: 'moderate', label: 'Moderate accuracy', text: `±${rounded} m (Moderate accuracy)` };
  }
  return { level: 'low', label: 'Low accuracy', text: `±${rounded} m (Low accuracy)` };
}

/**
 * Formats distance in metres to human-friendly format (m or km).
 */
export function formatDistance(meters) {
  if (meters == null || Number.isNaN(meters) || meters <= 0) return '0.00 km';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Formats pace in seconds per kilometre to MM:SS /km.
 */
export function formatPace(secondsPerKm) {
  if (
    secondsPerKm == null ||
    Number.isNaN(secondsPerKm) ||
    !Number.isFinite(secondsPerKm) ||
    secondsPerKm <= 0 ||
    secondsPerKm > 3600
  ) {
    return '--:-- /km';
  }
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.floor(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')} /km`;
}

/**
 * Formats speed in metres per second to km/h.
 */
export function formatSpeed(mps) {
  if (mps == null || Number.isNaN(mps) || mps < 0) return '-- km/h';
  const kmh = mps * 3.6;
  return `${kmh.toFixed(1)} km/h`;
}

/**
 * Formats elapsed duration in seconds to HH:MM:SS or MM:SS.
 */
export function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '00:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Slippy map projection helpers for OpenStreetMap tiles.
 */
export function lonToTileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

export function latToTileY(lat, zoom) {
  const rad = toRadians(lat);
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

export function getOsmTileUrl(x, y, zoom) {
  const maxTile = Math.pow(2, zoom) - 1;
  const wrappedX = ((x % (maxTile + 1)) + (maxTile + 1)) % (maxTile + 1);
  return `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${Math.max(0, Math.min(maxTile, y))}.png`;
}
