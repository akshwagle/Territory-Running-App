import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HexSheet, Legend } from './TerritoryMapPage.jsx';

describe('map UI', () => {
  it('legend lists the four layers', () => {
    render(<Legend/>);
    expect(screen.getByLabelText('Map legend').querySelectorAll('li')).toHaveLength(4);
  });
  it('hex sheet shows a status chip for restricted, cooldown and capturable cells', () => {
    const now = Date.now(), close = vi.fn();
    const { rerender } = render(<HexSheet hex={{ restricted: true, h3: 'x' }} now={now} onClose={close}/>);
    expect(screen.getByText('Restricted')).toBeTruthy();
    rerender(<HexSheet hex={{ owner: { kind: 'other', ownerId: 'u', displayName: 'Sam' }, cooldownUntil: new Date(now + 3600e3).toISOString() }} now={now} onClose={close}/>);
    expect(screen.getByText(/In cooldown/)).toBeTruthy();
    rerender(<HexSheet hex={{ owner: { kind: 'other', ownerId: 'u', displayName: 'Sam' }, cooldownUntil: new Date(now - 1000).toISOString() }} now={now} onClose={close}/>);
    expect(screen.getByText('Can be captured')).toBeTruthy();
    fireEvent.click(screen.getByText('Close'));
    expect(close).toHaveBeenCalled();
  });
});
