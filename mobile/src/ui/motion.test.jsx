import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { CountUp, HoldButton, StatTile } from './index.jsx';

const reduced = on => { globalThis.matchMedia = query => ({ matches: on && query.includes('reduce'), addEventListener() {}, removeEventListener() {} }); };
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); delete globalThis.matchMedia; });

describe('CountUp', () => {
  it('shows the final value at once under reduced motion', () => {
    reduced(true);
    render(<CountUp value={12}/>);
    expect(screen.getAllByText('12').length).toBeGreaterThan(0);
  });
  it('starts at 0 and reaches the final value', async () => {
    reduced(false);
    render(<CountUp value={12}/>);
    expect(document.querySelector('.ui-count [aria-hidden]').textContent).toBe('0');
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(document.querySelector('.ui-count [aria-hidden]').textContent).toBe('12');
    expect(document.querySelector('.ui-count .sr-only').textContent).toBe('12');
  });
  it('StatTile counts integers only when asked', () => {
    reduced(true);
    render(<dl><StatTile label="A" value="3.2" count/><StatTile label="B" value={4}/></dl>);
    expect(screen.getByText('3.2')).toBeTruthy(); expect(screen.getByText('4')).toBeTruthy();
  });
});

describe('HoldButton', () => {
  it('completes only after the full hold', () => {
    const done = vi.fn(); render(<HoldButton onComplete={done}>Finish</HoldButton>);
    const button = screen.getByRole('button');
    fireEvent.pointerDown(button); act(() => { vi.advanceTimersByTime(900); });
    expect(button.dataset.holding).toBe('true'); expect(done).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(150); });
    expect(done).toHaveBeenCalledTimes(1); expect(button.dataset.holding).toBeUndefined();
  });
  it('releasing early cancels', () => {
    const done = vi.fn(); render(<HoldButton onComplete={done}>Finish</HoldButton>);
    const button = screen.getByRole('button');
    fireEvent.pointerDown(button); act(() => { vi.advanceTimersByTime(500); }); fireEvent.pointerUp(button);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(done).not.toHaveBeenCalled();
  });
  it('works from the keyboard and ignores disabled', () => {
    const done = vi.fn(); const { rerender } = render(<HoldButton onComplete={done}>Finish</HoldButton>);
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'Enter' }); act(() => { vi.advanceTimersByTime(1000); });
    expect(done).toHaveBeenCalledTimes(1);
    rerender(<HoldButton onComplete={done} disabled>Finish</HoldButton>);
    fireEvent.pointerDown(screen.getByRole('button')); act(() => { vi.advanceTimersByTime(1500); });
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe('motion CSS rules', () => {
  const css = ['./ui.css', './motion.css', '../styles.css'].map(f => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  it('keyframes animate only transform and opacity', () => {
    const frames = [...css.matchAll(/@keyframes ([\w-]+) \{((?:[^{}]|\{[^{}]*\})*)\}/g)];
    expect(frames.length).toBeGreaterThan(8);
    for (const [, name, body] of frames) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map(m => m[1]);
      for (const p of props) expect(['opacity', 'transform'], `${name}: ${p}`).toContain(p);
    }
  });
  it('has a reduced-motion block that disables animation and press scaling', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
    expect(css).toMatch(/button:active[\s\S]*transform: none/);
  });
  it('toast sits at the top and skeleton no longer pulses', () => {
    expect(css).toMatch(/\.ui-toast \{[^}]*top: calc/);
    expect(css).not.toMatch(/skeleton-pulse/);
  });
});
