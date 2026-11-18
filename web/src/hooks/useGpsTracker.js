/**
 * RUN & CONQUER — Live GPS Tracking React Hook
 *
 * Exposes real-time GPS run tracking controls and metrics with automatic unmount cleanup.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { GpsTrackingService, TRACKING_STATUS } from '../services/location/gpsTrackingService.js';

export function useGpsTracker(options = {}) {
  const serviceRef = useRef(null);
  if (!serviceRef.current) {
    serviceRef.current = new GpsTrackingService(options);
  }

  const [state, setState] = useState(() => serviceRef.current.getSnapshot());

  useEffect(() => {
    const service = serviceRef.current;
    const unsubscribe = service.subscribe((snapshot) => {
      setState(snapshot);
    });

    return () => {
      unsubscribe();
      // Safeguard: Stop tracking and clear browser watchPosition when component unmounts
      service.clearWatch();
      service.stopTimer();
    };
  }, []);

  const start = useCallback(() => {
    serviceRef.current.start();
  }, []);

  const pause = useCallback(() => {
    serviceRef.current.pause();
  }, []);

  const resume = useCallback(() => {
    serviceRef.current.resume();
  }, []);

  const stop = useCallback(() => {
    serviceRef.current.stop();
  }, []);

  const reset = useCallback(() => {
    serviceRef.current.reset();
  }, []);

  return {
    ...state,
    isTracking: state.status === TRACKING_STATUS.TRACKING,
    isPaused: state.status === TRACKING_STATUS.PAUSED,
    isStopped: state.status === TRACKING_STATUS.STOPPED,
    isSignalLost: state.status === TRACKING_STATUS.SIGNAL_LOST,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
