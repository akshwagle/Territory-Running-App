import { describe, expect, it } from 'vitest';
import { hexStyle, mapColor } from './hexes.js';

describe('map colours', () => {
  it('falls back to the pine/slate palette without CSS and never to lime', () => {
    expect(mapColor('mine')).toBe('#6fb59a');
    expect(mapColor('other')).toBe('#6f86a6');
  });
  it('styles my, other, restricted and cooling hexes from the tokens', () => {
    const me = { owner: { kind: 'me' } }, them = { owner: { kind: 'other', ownerId: 'x' } };
    expect(hexStyle(me).fillColor).toBe('#6fb59a');
    expect(hexStyle(them).fillColor).toBe('#6f86a6');
    expect(hexStyle({ restricted: true, owner: {} }).dashArray).toBe('2 4');
    const cooling = hexStyle({ ...me, cooldownUntil: new Date(Date.now() + 60000).toISOString() });
    expect(cooling.color).toBe('#e0b454');
  });
});
