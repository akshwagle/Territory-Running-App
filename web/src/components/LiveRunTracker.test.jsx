import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import LiveRunTracker from './LiveRunTracker.jsx';

describe('LiveRunTracker Component', () => {
  let watchCb = null;
  let clearWatchMock;

  beforeEach(() => {
    clearWatchMock = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: vi.fn((success) => {
          watchCb = success;
          return 99;
        }),
        clearWatch: clearWatchMock,
      },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders standby state initially with start button and metrics', () => {
    render(<LiveRunTracker theme="dark" />);

    expect(screen.getByText('LIVE RUN & TERRITORY CONQUEST')).toBeInTheDocument();
    expect(screen.getByText('STANDBY / READY')).toBeInTheDocument();
    expect(screen.getByText('START RUN')).toBeInTheDocument();
    expect(screen.getByText('DISTANCE')).toBeInTheDocument();
    expect(screen.getByText('0.00 km')).toBeInTheDocument();
  });

  it('scenario 5 & 9: handles start, live GPS updates, pause, resume, and stop flow', () => {
    render(<LiveRunTracker theme="dark" />);

    // Click Start Run
    fireEvent.click(screen.getByText('START RUN'));
    expect(navigator.geolocation.watchPosition).toHaveBeenCalled();

    // Emit valid GPS position
    act(() => {
      watchCb({
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 5,
          speed: 4.2, // ~15 km/h
        },
        timestamp: 1000,
      });
    });

    expect(screen.getByText(/GPS LOCKED/i)).toBeInTheDocument();
    expect(screen.getByText('PAUSE')).toBeInTheDocument();
    expect(screen.getByText('FINISH RUN')).toBeInTheDocument();

    // Emit moving point (~100m away)
    act(() => {
      watchCb({
        coords: {
          latitude: 12.9725,
          longitude: 77.5955,
          accuracy: 6,
          speed: 4.5,
        },
        timestamp: 4000,
      });
    });

    expect(screen.getByText(/2 verified GPS points/i)).toBeInTheDocument();

    // Pause
    fireEvent.click(screen.getByText('PAUSE'));
    expect(screen.getByText(/RUN PAUSED/i)).toBeInTheDocument();
    expect(screen.getByText('RESUME')).toBeInTheDocument();

    // Resume
    fireEvent.click(screen.getByText('RESUME'));
    expect(screen.getByText(/GPS LOCKED/i)).toBeInTheDocument();

    // Finish / Stop
    fireEvent.click(screen.getByText('FINISH RUN'));
    expect(screen.getByText('START NEW RUN')).toBeInTheDocument();
    expect(clearWatchMock).toHaveBeenCalledWith(99);
  });

  it('displays OpenStreetMap attribution and interactive map container', () => {
    render(<LiveRunTracker theme="dark" />);

    expect(screen.getByText('OpenStreetMap')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /OpenStreetMap interactive map/i })).toBeInTheDocument();
  });

  it('scenario 10: supports both dark and light themes smoothly', () => {
    const { rerender, container } = render(<LiveRunTracker theme="dark" />);
    expect(container.querySelector('.theme-dark')).toBeInTheDocument();

    rerender(<LiveRunTracker theme="light" />);
    expect(container.querySelector('.theme-light')).toBeInTheDocument();
  });
});
