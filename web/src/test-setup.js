import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn((media) => ({
  matches: false, media, onchange: null, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
})) });

export class TestObserver {
  static instances = [];
  constructor(callback) { this.callback = callback; this.targets = new Set(); TestObserver.instances.push(this); }
  observe(target) {
    this.targets.add(target);
    queueMicrotask(() => {
      if (this.targets.has(target)) this.emit(target, true);
    });
  }
  unobserve(target) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); }
  emit(target, isIntersecting, rect = { top: 100, bottom: 200 }) {
    this.callback([{ target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0, boundingClientRect: rect }]);
  }
}
Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: TestObserver });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); TestObserver.instances = []; });
