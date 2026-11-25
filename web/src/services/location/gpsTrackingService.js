/**
 * RUN & CONQUER — Live GPS Tracking Service for Running
 *
 * Implements real-time continuous GPS point collection using watchPosition,
 * rigorous fitness-grade data quality filters, and run metric calculations.
 */

import { haversineDistance, isValidCoordinate } from './locationUtils.js';

export const TRACKING_STATUS = {
  IDLE: 'idle',
  STARTING: 'starting',
  TRACKING: 'tracking',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  SIGNAL_LOST: 'signal_lost',
  ERROR: 'error',
};

export const DEFAULT_TRACKING_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
  maxAccuracyThreshold: 35, // Reject GPS readings with error radius > 35m
  minDistanceDelta: 0.5, // Ignore stationary jitter (< 0.5m)
  signalLostTimeoutMs: 20000, // Signal loss warning if no fix for 20s
};

export class GpsTrackingService {
  constructor(options = {}) {
    this.options = { ...DEFAULT_TRACKING_OPTIONS, ...options };
    this.watchId = null;
    this.status = TRACKING_STATUS.IDLE;
    this.points = [];
    this.totalDistanceMetres = 0;
    this.elapsedSeconds = 0;
    this.timerId = null;
    this.signalTimeoutTimer = null;
    this.lastFixTimestamp = 0;
    this.listeners = new Set();
  }

  /**
   * Register a state change subscriber.
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        // Prevent subscriber errors from disrupting GPS stream
        console.error('Error in GPS tracker subscriber:', err);
      }
    }
  }

  getSnapshot() {
    const currentPoint = this.points.length > 0 ? this.points[this.points.length - 1] : null;
    let avgPaceSec = null;
    if (this.totalDistanceMetres > 10 && this.elapsedSeconds > 0) {
      avgPaceSec = this.elapsedSeconds / (this.totalDistanceMetres / 1000);
    }

    let currentPaceSec = null;
    if (currentPoint && typeof currentPoint.speed === 'number' && currentPoint.speed > 0.5) {
      currentPaceSec = 1000 / currentPoint.speed;
    } else if (this.points.length >= 2) {
      const p1 = this.points[this.points.length - 2];
      const p2 = this.points[this.points.length - 1];
      const dt = (p2.timestamp - p1.timestamp) / 1000;
      const d = haversineDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
      if (dt > 0 && d > 1) {
        currentPaceSec = (dt / d) * 1000;
      }
    }

    return {
      status: this.status,
      points: this.points,
      pointCount: this.points.length,
      currentPoint,
      totalDistance: this.totalDistanceMetres,
      elapsedSeconds: this.elapsedSeconds,
      currentPace: currentPaceSec,
      averagePace: avgPaceSec,
      lastFixTimestamp: this.lastFixTimestamp,
    };
  }

  /**
   * Starts tracking GPS movement.
   */
  start() {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this.status = TRACKING_STATUS.ERROR;
      this.notify();
      throw new Error('Geolocation is not supported by your browser.');
    }

    if (this.status === TRACKING_STATUS.TRACKING) {
      return;
    }

    this.points = [];
    this.totalDistanceMetres = 0;
    this.elapsedSeconds = 0;
    this.status = TRACKING_STATUS.STARTING;
    this.notify();

    this.startTimer();
    this.resetSignalLossTimer();

    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handlePositionUpdate(position),
      (error) => this.handlePositionError(error),
      {
        enableHighAccuracy: this.options.enableHighAccuracy,
        timeout: this.options.timeout,
        maximumAge: this.options.maximumAge,
      }
    );
  }

  /**
   * Process a single incoming GPS position update with quality filtration.
   */
  handlePositionUpdate(position) {
    if (this.status === TRACKING_STATUS.PAUSED || this.status === TRACKING_STATUS.STOPPED) {
      return;
    }

    const { latitude, longitude, accuracy, altitude, speed } = position.coords;
    const timestamp = position.timestamp || Date.now();

    // 1. Coordinates validity check
    if (!isValidCoordinate(latitude, longitude)) {
      return;
    }

    // 2. Accuracy threshold check (reject low-accuracy degraded fixes)
    if (accuracy > this.options.maxAccuracyThreshold) {
      // Degraded signal - notify but don't add to run route
      return;
    }

    // 3. Duplicate / jitter check
    let delta = 0;
    if (this.points.length > 0) {
      const lastPoint = this.points[this.points.length - 1];
      delta = haversineDistance(lastPoint.latitude, lastPoint.longitude, latitude, longitude);

      // Filter out stationary micro-jitter
      if (delta < this.options.minDistanceDelta && timestamp - lastPoint.timestamp < 1000) {
        return;
      }
    }

    // Valid GPS point accepted
    const acceptedPoint = {
      latitude,
      longitude,
      accuracy,
      altitude: altitude ?? null,
      // Strictly preserve missing speed as null (do NOT interpret missing speed as zero)
      speed: typeof speed === 'number' && !Number.isNaN(speed) ? speed : null,
      timestamp,
      distanceFromPrevious: delta,
    };

    this.points.push(acceptedPoint);
    this.totalDistanceMetres += delta;
    this.lastFixTimestamp = timestamp;

    if (this.status !== TRACKING_STATUS.TRACKING) {
      this.status = TRACKING_STATUS.TRACKING;
    }

    this.resetSignalLossTimer();
    this.notify();
  }

  handlePositionError(error) {
    if (this.status === TRACKING_STATUS.PAUSED || this.status === TRACKING_STATUS.STOPPED) {
      return;
    }

    if (error.code === 3) {
      // Timeout - check for signal loss
      this.status = TRACKING_STATUS.SIGNAL_LOST;
      this.notify();
    } else if (error.code === 1) {
      // Permission denied
      this.status = TRACKING_STATUS.ERROR;
      this.stop();
      this.notify();
    }
  }

  resetSignalLossTimer() {
    if (this.signalTimeoutTimer) {
      clearTimeout(this.signalTimeoutTimer);
    }
    this.signalTimeoutTimer = setTimeout(() => {
      if (this.status === TRACKING_STATUS.TRACKING) {
        this.status = TRACKING_STATUS.SIGNAL_LOST;
        this.notify();
      }
    }, this.options.signalLostTimeoutMs);
  }

  startTimer() {
    this.stopTimer();
    this.timerId = setInterval(() => {
      if (this.status === TRACKING_STATUS.TRACKING || this.status === TRACKING_STATUS.STARTING) {
        this.elapsedSeconds += 1;
        this.notify();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Pauses tracking (stops clock and ignores position updates).
   */
  pause() {
    if (this.status === TRACKING_STATUS.TRACKING || this.status === TRACKING_STATUS.STARTING) {
      this.status = TRACKING_STATUS.PAUSED;
      if (this.signalTimeoutTimer) clearTimeout(this.signalTimeoutTimer);
      this.notify();
    }
  }

  /**
   * Resumes tracking from paused state.
   */
  resume() {
    if (this.status === TRACKING_STATUS.PAUSED) {
      this.status = TRACKING_STATUS.TRACKING;
      this.resetSignalLossTimer();
      this.notify();
    }
  }

  /**
   * Stops tracking and clears all GPS watchers and timers.
   */
  stop() {
    this.clearWatch();
    this.stopTimer();
    if (this.signalTimeoutTimer) {
      clearTimeout(this.signalTimeoutTimer);
      this.signalTimeoutTimer = null;
    }
    if (this.status !== TRACKING_STATUS.ERROR) {
      this.status = TRACKING_STATUS.STOPPED;
    }
    this.notify();
  }

  /**
   * Clears browser watchPosition hook.
   */
  clearWatch() {
    if (this.watchId != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /**
   * Resets all tracking state back to idle.
   */
  reset() {
    this.stop();
    this.points = [];
    this.totalDistanceMetres = 0;
    this.elapsedSeconds = 0;
    this.lastFixTimestamp = 0;
    this.status = TRACKING_STATUS.IDLE;
    this.notify();
  }
}
