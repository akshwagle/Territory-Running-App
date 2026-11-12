import { useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { getDevice } from './useDownloadVisibility.js';

export function shouldLoadMotion() {
  return getDevice() === 'desktop' && window.matchMedia('(min-width: 768px)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function loadMotion() {
  // Cut headline/reveal effects on phones to keep their complete JS transfer below 90 kB.
  // Map progression is independent and still respects reduced motion and visibility.
  return shouldLoadMotion() ? import('../motion-features.js').then((module) => module.default) : Promise.resolve({});
}

export default function usePresentationMotion() {
  const reduced = useReducedMotion();
  // Keep a static session static on resize; it should never need the larger feature chunk.
  const [enabled] = useState(shouldLoadMotion);
  return enabled && !reduced;
}
