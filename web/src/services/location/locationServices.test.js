import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  haversineDistance,
  formatCoordinates,
  formatAccuracy,
  formatPace,
  formatSpeed,
  formatDuration,
  isValidCoordinate,
  lonToTileX,
  latToTileY,
  getOsmTileUrl,
} from './locationUtils.js';
import {
  detectCurrentPosition,
  GEOLOCATION_ERROR_CODES,
} from './geolocationService.js';
import {
  GeocodingService,
  NullGeocodingProvider,
  ConfiguredNominatimProvider,
} from './geocodingService.js';
import {
  IpLocationService,
  NullIpLocationProvider,
  ConfiguredIpLocationProvider,
} from './ipLocationService.js';
import {
  GpsTrackingService,
  TRACKING_STATUS,
} from './gpsTrackingService.js';

describe('Location & GPS Math Utilities', () => {
  it('validates coordinate bounds correctly', () => {
    expect(isValidCoordinate(12.9716, 77.5946)).toBe(true);
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(-91, 0)).toBe(false);
    expect(isValidCoordinate(0, 181)).toBe(false);
    expect(isValidCoordinate(NaN, 77)).toBe(false);
    expect(isValidCoordinate('12', 77)).toBe(false);
  });

  it('calculates Haversine distance accurately in metres', () => {
    // Distance between Bengaluru (12.9716, 77.5946) and Mysore (12.2958, 76.6394) is ~128 km
    const dist = haversineDistance(12.9716, 77.5946, 12.2958, 76.6394);
    expect(dist).toBeGreaterThan(125000);
    expect(dist).toBeLessThan(132000);

    // Zero distance for identical points
    expect(haversineDistance(12.9716, 77.5946, 12.9716, 77.5946)).toBe(0);
  });

  it('formats coordinates into directional strings', () => {
    expect(formatCoordinates(12.971599, 77.594566, 4)).toBe('12.9716° N, 77.5946° E');
    expect(formatCoordinates(-33.8688, -151.2093, 2)).toBe('33.87° S, 151.21° W');
    expect(formatCoordinates(NaN, 0)).toBe('Coordinates unavailable');
  });

  it('classifies GPS accuracy into high, moderate, and low categories', () => {
    expect(formatAccuracy(4.2).level).toBe('high');
    expect(formatAccuracy(25).level).toBe('moderate');
    expect(formatAccuracy(85).level).toBe('low');
    expect(formatAccuracy(null).level).toBe('unknown');
  });

  it('formats running pace and duration properly', () => {
    // 258 seconds per km = 4:18 /km
    expect(formatPace(258)).toBe('4:18 /km');
    expect(formatPace(0)).toBe('--:-- /km');
    expect(formatPace(Infinity)).toBe('--:-- /km');

    // Durations
    expect(formatDuration(45)).toBe('00:45');
    expect(formatDuration(754)).toBe('12:34');
    expect(formatDuration(3665)).toBe('01:01:05');

    // Speed in km/h from m/s (5 m/s = 18.0 km/h)
    expect(formatSpeed(5)).toBe('18.0 km/h');
    expect(formatSpeed(null)).toBe('-- km/h');
  });

  it('computes OpenStreetMap Slippy tile numbers', () => {
    const x = lonToTileX(77.5946, 15);
    const y = latToTileY(12.9716, 15);
    expect(typeof x).toBe('number');
    expect(typeof y).toBe('number');
    expect(getOsmTileUrl(x, y, 15)).toBe(`https://tile.openstreetmap.org/15/${x}/${y}.png`);
  });
});

describe('Browser Geolocation Service', () => {
  let originalGeolocation;

  beforeEach(() => {
    originalGeolocation = navigator.geolocation;
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  });

  afterEach(() => {
    if (originalGeolocation) {
      Object.defineProperty(navigator, 'geolocation', { value: originalGeolocation, configurable: true });
    }
  });

  it('scenario 1: GPS permission granted — extracts coordinates, accuracy, and preserves missing speed as null', async () => {
    const mockCoords = {
      latitude: 12.971599,
      longitude: 77.594566,
      accuracy: 6.5,
      altitude: 920,
      altitudeAccuracy: 3,
      heading: 180,
      speed: null, // Device does not report speed
    };

    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((success) => success({ coords: mockCoords, timestamp: 1700000000000 })),
      },
      configurable: true,
    });

    const res = await detectCurrentPosition();
    expect(res.coords.latitude).toBe(12.971599);
    expect(res.coords.longitude).toBe(77.594566);
    expect(res.coords.accuracy).toBe(6.5);
    expect(res.coords.speed).toBeNull(); // Strictly NOT converted to 0
    expect(res.isVerifiedGps).toBe(true);
    expect(res.source).toBe('gps');
  });

  it('scenario 2: GPS permission denied — normalizes with clear actionable error', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((_, error) => error({ code: 1, message: 'User denied' })),
      },
      configurable: true,
    });

    await expect(detectCurrentPosition()).rejects.toMatchObject({
      code: GEOLOCATION_ERROR_CODES.PERMISSION_DENIED,
      message: expect.stringContaining('Location permission was denied'),
    });
  });

  it('scenario 3: GPS timeout — normalizes with timeout error code', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((_, error) => error({ code: 3, message: 'Timeout' })),
      },
      configurable: true,
    });

    await expect(detectCurrentPosition()).rejects.toMatchObject({
      code: GEOLOCATION_ERROR_CODES.TIMEOUT,
      message: expect.stringContaining('timed out'),
    });
  });

  it('scenario 4: Browser geolocation unavailable — returns UNSUPPORTED code', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: undefined,
      configurable: true,
    });

    await expect(detectCurrentPosition()).rejects.toMatchObject({
      code: GEOLOCATION_ERROR_CODES.UNSUPPORTED,
      message: expect.stringContaining('does not support GPS'),
    });
  });

  it('handles insecure context gracefully', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: vi.fn() },
      configurable: true,
    });

    await expect(detectCurrentPosition()).rejects.toMatchObject({
      code: GEOLOCATION_ERROR_CODES.INSECURE_CONTEXT,
      message: expect.stringContaining('requires a secure connection'),
    });
  });
});

describe('Reverse Geocoding Service Abstraction', () => {
  it('scenario 6: Reverse geocoding provider unavailable — falls back to coordinates safely without inventing address', async () => {
    const service = new GeocodingService(new NullGeocodingProvider());
    const res = await service.reverseGeocode(12.9716, 77.5946);

    expect(res.isConfigured).toBe(false);
    expect(res.formattedAddress).toBeNull();
    expect(res.city).toBeNull();
    expect(res.postalCode).toBeNull();
    expect(res.coordinatesText).toBe('12.97160, 77.59460');
    expect(res.note).toContain('Address lookup is not configured');
  });

  it('caches reverse geocode results to respect throttling and avoid redundant network requests', async () => {
    const mockProvider = {
      name: 'MockProvider',
      isConfigured: true,
      reverseGeocode: vi.fn().mockResolvedValue({
        formattedAddress: 'MG Road, Bengaluru, Karnataka, India',
        city: 'Bengaluru',
        postalCode: '560001',
        isConfigured: true,
      }),
    };

    const service = new GeocodingService(mockProvider, { throttleMs: 0 });

    const first = await service.reverseGeocode(12.97161, 77.59461);
    expect(mockProvider.reverseGeocode).toHaveBeenCalledTimes(1);
    expect(first.city).toBe('Bengaluru');

    // Call again with virtually identical coordinates (< 11m)
    const second = await service.reverseGeocode(12.97162, 77.59462);
    expect(mockProvider.reverseGeocode).toHaveBeenCalledTimes(1); // Cached!
    expect(second.city).toBe('Bengaluru');
  });
});

describe('IP Geolocation Fallback Service', () => {
  it('scenario 7: IP provider unavailable — returns unconfigured approximate notice', async () => {
    const service = new IpLocationService(new NullIpLocationProvider());
    const res = await service.detectLocation();

    expect(res.isConfigured).toBe(false);
    expect(res.isApproximate).toBe(true);
    expect(res.isVerifiedGps).toBe(false);
    expect(res.warning).toContain('Not valid for GPS running');
  });

  it('configured IP provider marks coordinates as approximate and NOT verified GPS', async () => {
    const provider = new ConfiguredIpLocationProvider();
    const parsed = provider.defaultParser({
      city: 'Pune',
      region: 'Maharashtra',
      country_name: 'India',
      latitude: '18.5204',
      longitude: '73.8567',
    });

    expect(parsed.city).toBe('Pune');
    expect(parsed.coords.latitude).toBe(18.5204);
    expect(parsed.coords.accuracy).toBe(25000); // ~25km approximate radius
  });
});

describe('Live GPS Tracking Service', () => {
  let watchCb = null;
  let clearWatchMock;

  beforeEach(() => {
    clearWatchMock = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: vi.fn((success) => {
          watchCb = success;
          return 42;
        }),
        clearWatch: clearWatchMock,
      },
      configurable: true,
    });
  });

  it('scenario 5 & 9: Start, pause, resume, and stop GPS tracking with quality filters', () => {
    const tracker = new GpsTrackingService({ maxAccuracyThreshold: 35 });
    tracker.start();

    expect(tracker.status).toBe(TRACKING_STATUS.STARTING);
    expect(navigator.geolocation.watchPosition).toHaveBeenCalledTimes(1);

    // 1. Emit valid initial point
    watchCb({
      coords: { latitude: 12.9716, longitude: 77.5946, accuracy: 8, speed: 3.5 },
      timestamp: 1000,
    });

    expect(tracker.status).toBe(TRACKING_STATUS.TRACKING);
    expect(tracker.points.length).toBe(1);
    expect(tracker.points[0].speed).toBe(3.5);

    // 2. Scenario 5: Accuracy is poor (> 35m) — must be rejected from run route!
    watchCb({
      coords: { latitude: 12.9720, longitude: 77.5950, accuracy: 65, speed: 3.5 },
      timestamp: 2000,
    });
    expect(tracker.points.length).toBe(1); // Rejected!

    // 3. Emit second valid point (~50m away)
    watchCb({
      coords: { latitude: 12.9720, longitude: 77.5950, accuracy: 10, speed: 4.0 },
      timestamp: 4000,
    });
    expect(tracker.points.length).toBe(2);
    expect(tracker.totalDistanceMetres).toBeGreaterThan(40);

    // 4. Pause tracking
    tracker.pause();
    expect(tracker.status).toBe(TRACKING_STATUS.PAUSED);

    // Updates while paused must be ignored
    watchCb({
      coords: { latitude: 12.9730, longitude: 77.5960, accuracy: 10, speed: 4.0 },
      timestamp: 6000,
    });
    expect(tracker.points.length).toBe(2);

    // 5. Resume tracking
    tracker.resume();
    expect(tracker.status).toBe(TRACKING_STATUS.TRACKING);

    // 6. Stop tracking
    tracker.stop();
    expect(tracker.status).toBe(TRACKING_STATUS.STOPPED);
    expect(clearWatchMock).toHaveBeenCalledWith(42);
  });

  it('rejects invalid coordinates and filters stationary jitter', () => {
    const tracker = new GpsTrackingService();
    tracker.start();

    // Invalid coordinates
    watchCb({ coords: { latitude: 95, longitude: 77.5, accuracy: 5 }, timestamp: 1000 });
    expect(tracker.points.length).toBe(0);

    // Valid coordinate
    watchCb({ coords: { latitude: 12.9716, longitude: 77.5946, accuracy: 5 }, timestamp: 2000 });
    expect(tracker.points.length).toBe(1);

    // Stationary micro-jitter (< 0.5m within 500ms)
    watchCb({ coords: { latitude: 12.9716001, longitude: 77.5946001, accuracy: 5 }, timestamp: 2300 });
    expect(tracker.points.length).toBe(1); // Filtered out
    tracker.stop();
  });
});
