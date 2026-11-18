/**
 * RUN & CONQUER — Replaceable Geocoding Service Abstraction
 *
 * Implements reverse geocoding with caching, request throttling, and safe fallback.
 * Strictly avoids unsolicited requests to public OSM/Nominatim endpoints.
 * Allows explicitly configured self-hosted or commercial endpoints to be connected.
 */

/**
 * Standard normalized reverse geocoding result.
 */
export function createEmptyGeocodeResult(lat, lon, note = 'Address lookup is not configured. Coordinates displayed.') {
  return {
    formattedAddress: null,
    locality: null,
    city: null,
    state: null,
    country: null,
    postalCode: null,
    coordinatesText: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    providerName: 'None (Unconfigured)',
    isConfigured: false,
    note,
  };
}

/**
 * Null provider used by default when no explicit external provider is configured.
 */
export class NullGeocodingProvider {
  name = 'NullGeocodingProvider';
  isConfigured = false;

  async reverseGeocode(lat, lon) {
    return createEmptyGeocodeResult(lat, lon);
  }
}

/**
 * Configurable provider for explicitly supplied self-hosted Nominatim or compliant endpoints.
 * Requires explicit endpoint URL and complies with rate limiting and User-Agent headers.
 */
export class ConfiguredNominatimProvider {
  name = 'ConfiguredNominatimProvider';
  isConfigured = true;

  constructor(options = {}) {
    this.endpointUrl = options.endpointUrl || '';
    this.userAgent = options.userAgent || 'TerritoryRunningApp/1.0';
    this.customHeaders = options.customHeaders || {};
  }

  async reverseGeocode(lat, lon) {
    if (!this.endpointUrl) {
      return createEmptyGeocodeResult(lat, lon, 'Custom geocoding endpoint URL is empty.');
    }

    try {
      const url = new URL(this.endpointUrl);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lon));
      url.searchParams.set('addressdetails', '1');

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': this.userAgent,
          ...this.customHeaders,
        },
      });

      if (!response.ok) {
        throw new Error(`Geocoding HTTP error: ${response.status}`);
      }

      const data = await response.json();
      if (!data || !data.address) {
        return createEmptyGeocodeResult(lat, lon, 'No address details found for coordinates.');
      }

      const a = data.address;
      return {
        formattedAddress: data.display_name || null,
        locality: a.suburb || a.neighbourhood || a.quarter || a.road || null,
        city: a.city || a.town || a.municipality || a.village || a.county || null,
        state: a.state || a.province || a.region || null,
        country: a.country || null,
        postalCode: a.postcode || null,
        coordinatesText: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        providerName: this.name,
        isConfigured: true,
        note: null,
      };
    } catch (err) {
      return createEmptyGeocodeResult(
        lat,
        lon,
        `Address lookup failed: ${err.message || 'Network error'}`
      );
    }
  }
}

/**
 * Geocoding Service with in-memory caching and request throttling.
 */
export class GeocodingService {
  constructor(provider = new NullGeocodingProvider(), options = {}) {
    this.provider = provider;
    this.throttleMs = options.throttleMs ?? 1000;
    this.lastRequestTime = 0;
    this.cache = new Map(); // Key: "lat,lon" rounded to ~11m
    this.maxCacheSize = options.maxCacheSize ?? 100;
  }

  /**
   * Replace the active geocoding provider.
   */
  setProvider(provider) {
    this.provider = provider || new NullGeocodingProvider();
    this.cache.clear();
  }

  /**
   * Cache key rounded to 4 decimal places (~11 metres).
   */
  getCacheKey(lat, lon) {
    return `${lat.toFixed(4)},${lon.toFixed(4)}`;
  }

  /**
   * Reverse geocode with caching and throttling.
   */
  async reverseGeocode(lat, lon) {
    const key = this.getCacheKey(lat, lon);
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    if (!this.provider.isConfigured) {
      const result = await this.provider.reverseGeocode(lat, lon);
      return result;
    }

    // Throttling to respect provider policies
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.throttleMs) {
      await new Promise((resolve) => setTimeout(resolve, this.throttleMs - elapsed));
    }
    this.lastRequestTime = Date.now();

    const result = await this.provider.reverseGeocode(lat, lon);

    // Cache the result
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, result);

    return result;
  }
}

// Global default singleton service instance
export const defaultGeocodingService = new GeocodingService();
