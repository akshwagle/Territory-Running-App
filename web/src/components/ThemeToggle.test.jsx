import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeToggle from './ThemeToggle.jsx';

describe('ThemeToggle component', () => {
  it('renders correctly in dark mode', () => {
    render(<ThemeToggle theme="dark" onToggle={() => {}} />);
    const button = screen.getByRole('button', { name: 'Switch to light theme' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('LIGHT');
  });

  it('renders correctly in light mode', () => {
    render(<ThemeToggle theme="light" onToggle={() => {}} />);
    const button = screen.getByRole('button', { name: 'Switch to dark theme' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('DARK');
  });

  it('fires onToggle callback when clicked', async () => {
    const handleToggle = vi.fn();
    render(<ThemeToggle theme="dark" onToggle={handleToggle} />);
    const button = screen.getByRole('button', { name: 'Switch to light theme' });
    await userEvent.click(button);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });
});
