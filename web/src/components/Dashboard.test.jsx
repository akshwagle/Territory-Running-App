import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from './Dashboard.jsx';

describe('Dashboard Component', () => {
  it('renders welcome greeting and stats correctly', () => {
    render(<Dashboard theme="dark" onToggleTheme={() => {}} onNavigateLanding={() => {}} />);
    expect(screen.getByRole('heading', { name: /Welcome back, Prashant/i })).toBeInTheDocument();
    expect(screen.getAllByText('124.8 km')).toHaveLength(2);
    expect(screen.getByText('36')).toBeInTheDocument();
    expect(screen.getByText('268')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
    expect(screen.getByText('Level 12')).toBeInTheDocument();
  });

  it('renders active challenge, recent activity and leaderboard', () => {
    render(<Dashboard theme="light" onToggleTheme={() => {}} onNavigateLanding={() => {}} />);
    expect(screen.getByText('Conquer 25 Hexes')).toBeInTheDocument();
    expect(screen.getByText('Evening Run')).toBeInTheDocument();
    expect(screen.getByText('Aarya S.')).toBeInTheDocument();
    expect(screen.getByText('Prashant C.')).toBeInTheDocument();
    expect(screen.getByText('Vajra Clan')).toBeInTheDocument();
    expect(screen.getByText('10 Runs')).toBeInTheDocument();
  });

  it('calls onNavigateLanding when clicking Log Out', async () => {
    const handleLogout = vi.fn();
    render(<Dashboard theme="dark" onToggleTheme={() => {}} onNavigateLanding={handleLogout} />);
    const logoutBtn = screen.getByRole('button', { name: /Log Out/i });
    await userEvent.click(logoutBtn);
    expect(handleLogout).toHaveBeenCalledTimes(1);
  });
});
