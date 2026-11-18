import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LocationSelectorModal from './LocationSelectorModal.jsx';

describe('LocationSelectorModal UI Component', () => {
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

  it('renders modal with detection and preset tabs when open', () => {
    render(
      <LocationSelectorModal
        isOpen={true}
        onClose={vi.fn()}
        currentLocation={null}
        theme="dark"
      />
    );

    expect(screen.getByText('Location & Sector Configuration')).toBeInTheDocument();
    expect(screen.getByText('Detect My Current Location')).toBeInTheDocument();
    expect(screen.getByText('Manual Preset & Coords')).toBeInTheDocument();
  });

  it('scenario 1: triggers GPS detection and displays coordinates on success', async () => {
    const mockSuccess = {
      coords: {
        latitude: 12.9716,
        longitude: 77.5946,
        accuracy: 8.5,
        speed: null,
      },
      timestamp: Date.now(),
    };

    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((success) => success(mockSuccess)),
      },
      configurable: true,
    });

    render(
      <LocationSelectorModal
        isOpen={true}
        onClose={vi.fn()}
        currentLocation={null}
        theme="dark"
      />
    );

    const detectBtn = screen.getByText('Detect My Current Location');
    fireEvent.click(detectBtn);

    await waitFor(() => {
      expect(screen.getByText(/12\.97160° N, 77\.59460° E/i)).toBeInTheDocument();
      expect(screen.getByText(/±9 m \(High accuracy\)/i)).toBeInTheDocument();
    });
  });

  it('scenario 2: displays helpful error state and retry button on permission denied', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((_, error) => error({ code: 1, message: 'User denied' })),
      },
      configurable: true,
    });

    render(
      <LocationSelectorModal
        isOpen={true}
        onClose={vi.fn()}
        currentLocation={null}
        theme="dark"
      />
    );

    const detectBtn = screen.getByText('Detect My Current Location');
    fireEvent.click(detectBtn);

    await waitFor(() => {
      expect(screen.getByText('Location Detection Failed')).toBeInTheDocument();
      expect(screen.getByText(/Location permission was denied/i)).toBeInTheDocument();
      expect(screen.getByText('Retry Detection')).toBeInTheDocument();
    });
  });

  it('scenario 8: allows manual sector selection via quick city presets', async () => {
    const onLocationConfirmed = vi.fn();
    render(
      <LocationSelectorModal
        isOpen={true}
        onClose={vi.fn()}
        onLocationConfirmed={onLocationConfirmed}
        currentLocation={null}
        theme="dark"
      />
    );

    // Switch to manual tab
    fireEvent.click(screen.getByText('Manual Preset & Coords'));

    expect(screen.getByText('QUICK SECTOR PRESETS')).toBeInTheDocument();
    expect(screen.getByText('Mumbai')).toBeInTheDocument();

    // Select Mumbai
    fireEvent.click(screen.getByText('Mumbai'));

    // Check custom coordinate inputs update
    const latInput = screen.getByLabelText('Latitude');
    const lonInput = screen.getByLabelText('Longitude');
    expect(latInput.value).toBe('18.922000');
    expect(lonInput.value).toBe('72.834700');

    // Confirm selection
    const confirmBtn = screen.getByText('Confirm & Save Sector');
    fireEvent.click(confirmBtn);

    expect(onLocationConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        city: 'Mumbai',
        source: 'manual',
      })
    );
  });

  it('scenario 10: supports both dark and light themes without breaking layout', () => {
    const { rerender } = render(
      <LocationSelectorModal
        isOpen={true}
        onClose={vi.fn()}
        currentLocation={{
          city: 'Bengaluru',
          coords: { latitude: 12.9716, longitude: 77.5946, accuracy: 5 },
        }}
        theme="dark"
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Rerender with light theme
    rerender(
      <LocationSelectorModal
        isOpen={true}
        onClose={vi.fn()}
        currentLocation={{
          city: 'Bengaluru',
          coords: { latitude: 12.9716, longitude: 77.5946, accuracy: 5 },
        }}
        theme="light"
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
