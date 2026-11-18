/**
 * RUN & CONQUER — Replaceable IP Geolocation Fallback Service
 *
 * Provides an optional, replaceable IP geolocation fallback.
 * Strictly adheres to fitness/territory-conquest integrity rules:
 * - IP location is marked explicitly as approximate (isVerifiedGps = false).
 * - IP location is NEVER used silently.
 * - IP location is NEVER used for run recording or territory claiming.
 * - No hardcoded fallback cities (e.g. New Delhi).
 * - Pluggable provider interface without dependency on trials or hardcoded keys.
 */

export function createEmptyIpLocationResult(note = 'No IP geolocation provider is configured.') {
  return {
    isConfigured: false,
    isApproximate: true,
    isVerifiedGps: false,
    source: 'ip',
    city: null,
    region: null,
    country: null,
    coords: null,
    note,
    warning: 'Approximate network location. Not valid for GPS running or territory conquest.',
  };
}

/**
 * Default Null IP Geolocation provider.
 */
export class NullIpLocationProvider {
  name = 'NullIpLocationProvider';
  isConfigured = false;

  async detectLocation() {
    return createEmptyIpLocationResult();
  }
}

/**
 * Configurable IP Geolocation Provider.
 * Allows connecting an explicitly configured corporate or compliant IP lookup endpoint.
 */
export class ConfiguredIpLocationProvider {
  name = 'ConfiguredIpLocationProvider';
  isConfigured = true;

  constructor(options = {}) {
    this.endpointUrl = options.endpointUrl || '';
    this.customHeaders = options.customHeaders || {};
    this.parseResponse = options.parseResponse || this.defaultParser;
  }

  defaultParser(data) {
    if (!data) return null;
    const lat = Number(data.latitude || data.lat);
    const lon = Number(data.longitude || data.lon || data.lng);

    return {
      city: data.city || null,
      region: data.region || data.state || null,
      country: data.country_name || data.country || null,
      coords:
        !Number.isNaN(lat) && !Number.isNaN(lon)
          ? {
              latitude: lat,
              longitude: lon,
              accuracy: 25000, // Explicitly documented ~25km approximate accuracy
            }
          : null,
    };
  }

  async detectLocation() {
    if (!this.endpointUrl) {
      return createEmptyIpLocationResult('Custom IP geolocation endpoint URL is empty.');
    }

    try {
      const response = await fetch(this.endpointUrl, {
        headers: {
          'Accept': 'application/json',
          ...this.customHeaders,
        },
      });

      if (!response.ok) {
        throw new Error(`IP location HTTP error: ${response.status}`);
      }

      const raw = await response.json();
      const parsed = this.parseResponse(raw);

      if (!parsed || !parsed.coords) {
        return createEmptyIpLocationResult('IP geolocation response could not be parsed into coordinates.');
      }

      return {
        isConfigured: true,
        isApproximate: true,
        isVerifiedGps: false,
        source: 'ip',
        city: parsed.city,
        region: parsed.region,
        country: parsed.country,
        coords: parsed.coords,
        note: null,
        warning: 'Approximate network location. Not valid for GPS running or territory conquest.',
      };
    } catch (err) {
      return createEmptyIpLocationResult(`IP location request failed: ${err.message || 'Network error'}`);
    }
  }
}

/**
 * Service managing the IP location fallback provider.
 */
export class IpLocationService {
  constructor(provider = new NullIpLocationProvider()) {
    this.provider = provider;
  }

  setProvider(provider) {
    this.provider = provider || new NullIpLocationProvider();
  }

  get isConfigured() {
    return this.provider.isConfigured;
  }

  async detectLocation() {
    return this.provider.detectLocation();
  }
}

// Global default singleton instance
export const defaultIpLocationService = new IpLocationService();
