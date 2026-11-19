import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import DashboardMap from './DashboardMap.jsx';

describe('DashboardMap Component', () => {
  let geoSuccessCallback = null;
  let geoErrorCallback = null;
  let originalGeolocation;

  beforeEach(() => {
    originalGeolocation = navigator.geolocation;
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((success, error) => {
          geoSuccessCallback = success;
          geoErrorCallback = error;
        }),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalGeolocation) {
      Object.defineProperty(navigator, 'geolocation', { value: originalGeolocation, configurable: true });
    }
    vi.restoreAllMocks();
  });

  it('automatically requests browser geolocation on mount and shows clean scanning state', () => {
    render(<DashboardMap theme="dark" />);

    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/ACQUIRING VISITOR GPS POSITION/i)).toBeInTheDocument();
  });

  it('centers on visitor location and displays territories when geolocation is granted', () => {
    render(<DashboardMap theme="dark" />);

    act(() => {
      geoSuccessCallback({
        coords: {
          latitude: 19.076,
          longitude: 72.8777,
          accuracy: 5.2,
        },
      });
    });

    const matches = screen.getAllByText(/19\.076° N, 72\.878° E/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/ACQUIRING VISITOR GPS POSITION/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Your Territory \(Allied\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Contested Sector/i)).toBeInTheDocument();
    expect(screen.getByText(/Rival Territory/i)).toBeInTheDocument();
  });

  it('displays sensible fallback and non-blocking retry button when location permission is denied', () => {
    render(<DashboardMap theme="dark" />);

    act(() => {
      geoErrorCallback({
        code: 1, // PERMISSION_DENIED
        message: 'User denied geolocation',
      });
    });

    expect(screen.getByText(/Location permission denied/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /Retry Geolocation/i });
    expect(retryBtn).toBeInTheDocument();

    // Click retry
    fireEvent.click(retryBtn);
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('does NOT render configuration boxes or debugging panels over the map tiles', () => {
    render(<DashboardMap theme="dark" />);

    act(() => {
      geoSuccessCallback({
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 8,
        },
      });
    });

    // Verification of requirement 3: Completely remove configuration boxes over map tiles
    expect(screen.queryByText(/GOOGLE MAPS JAVASCRIPT API CONFIGURATION/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/VITE_GOOGLE_MAPS_API_KEY=your_key_here/i)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /OpenStreetMap interactive map/i })).toBeInTheDocument();
  });

  it('initializes Google Map instance when window.google.maps is available with API key', () => {
    const mockMapInstance = {
      setCenter: vi.fn(),
      setZoom: vi.fn(),
      setOptions: vi.fn(),
    };
    const mockSetMap = vi.fn();

    function MockMap() { return mockMapInstance; }
    function MockMarker() { return { setMap: mockSetMap }; }

    const mapSpy = vi.fn().mockImplementation(MockMap);
    const markerSpy = vi.fn().mockImplementation(MockMarker);

    window.google = {
      maps: {
        Map: mapSpy,
        Marker: markerSpy,
      },
    };

    // Temporarily set import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    const originalKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY = 'TEST_KEY_123';

    render(<DashboardMap theme="dark" />);

    act(() => {
      geoSuccessCallback({
        coords: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
      });
    });

    expect(mapSpy).toHaveBeenCalled();
    expect(markerSpy).toHaveBeenCalled();

    import.meta.env.VITE_GOOGLE_MAPS_API_KEY = originalKey;
    delete window.google;
  });
});
