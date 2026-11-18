import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthPage from './AuthPage.jsx';

describe('AuthPage Component', () => {
  let mockAuth;
  let mockOnSuccess;
  let mockOnNavigateLanding;

  beforeEach(() => {
    mockOnSuccess = vi.fn();
    mockOnNavigateLanding = vi.fn();
    mockAuth = {
      login: vi.fn().mockResolvedValue({ user: { id: 'u1', email: 'test@gmail.com', displayName: 'Test Runner' } }),
      register: vi.fn().mockResolvedValue({ user: { id: 'u2', email: 'new@gmail.com', displayName: 'New Runner' } }),
      googleLogin: vi.fn().mockResolvedValue({ user: { id: 'u3', email: 'g@gmail.com', displayName: 'Google Runner' } }),
      isAuthenticated: false,
      user: null,
      profile: null,
    };
  });

  it('renders Sign In mode by default with Google sign-in and email inputs', () => {
    render(
      <AuthPage
        theme="dark"
        onToggleTheme={() => {}}
        onNavigateLanding={mockOnNavigateLanding}
        onSuccess={mockOnSuccess}
        auth={mockAuth}
      />
    );

    expect(screen.getByRole('heading', { name: /SIGN IN TO COMMAND/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Gmail \/ Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /SIGN IN TO COMMAND →/i })).toBeInTheDocument();
  });

  it('switches between Sign In and Create Account modes', async () => {
    const user = userEvent.setup();
    render(
      <AuthPage
        theme="dark"
        onToggleTheme={() => {}}
        onNavigateLanding={mockOnNavigateLanding}
        onSuccess={mockOnSuccess}
        auth={mockAuth}
      />
    );

    const createTab = screen.getByRole('tab', { name: /Create Account/i });
    await user.click(createTab);

    expect(screen.getByRole('heading', { name: /ENLIST NEW RUNNER/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Phone Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /COMPLETE ENLISTMENT →/i })).toBeInTheDocument();
  });

  it('validates registration fields and shows clear errors for invalid input', async () => {
    const user = userEvent.setup();
    render(
      <AuthPage
        theme="dark"
        onToggleTheme={() => {}}
        onNavigateLanding={mockOnNavigateLanding}
        onSuccess={mockOnSuccess}
        auth={mockAuth}
        initialMode="register"
      />
    );

    // Try submitting with invalid inputs
    await user.type(screen.getByLabelText(/Full Name/i), 'A');
    await user.type(screen.getByLabelText(/Phone Number/i), '123');
    await user.type(screen.getByLabelText(/Gmail \/ Email Address/i), 'runner@gmail.com');
    await user.type(screen.getByLabelText(/^Password \*/i), '12345678');
    await user.type(screen.getByLabelText(/Confirm Password/i), 'different123');

    await user.click(screen.getByRole('button', { name: /COMPLETE ENLISTMENT →/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Full name must be between 2 and 60 characters/i);
    expect(mockAuth.register).not.toHaveBeenCalled();
  });

  it('validates phone numbers on registration', async () => {
    const user = userEvent.setup();
    render(
      <AuthPage
        theme="dark"
        onToggleTheme={() => {}}
        onNavigateLanding={mockOnNavigateLanding}
        onSuccess={mockOnSuccess}
        auth={mockAuth}
        initialMode="register"
      />
    );

    await user.type(screen.getByLabelText(/Full Name/i), 'Arjun Sharma');
    await user.type(screen.getByLabelText(/Phone Number/i), 'not-a-number');
    await user.type(screen.getByLabelText(/Gmail \/ Email Address/i), 'arjun@gmail.com');
    await user.type(screen.getByLabelText(/^Password \*/i), 'SecretPass123');
    await user.type(screen.getByLabelText(/Confirm Password/i), 'SecretPass123');

    await user.click(screen.getByRole('button', { name: /COMPLETE ENLISTMENT →/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Please enter a valid phone number/i);
    expect(mockAuth.register).not.toHaveBeenCalled();
  });

  it('submits registration successfully and calls onSuccess', async () => {
    const user = userEvent.setup();
    render(
      <AuthPage
        theme="dark"
        onToggleTheme={() => {}}
        onNavigateLanding={mockOnNavigateLanding}
        onSuccess={mockOnSuccess}
        auth={mockAuth}
        initialMode="register"
      />
    );

    await user.type(screen.getByLabelText(/Full Name/i), 'Arjun Sharma');
    await user.type(screen.getByLabelText(/Phone Number/i), '+91 98765 43210');
    await user.type(screen.getByLabelText(/Gmail \/ Email Address/i), 'arjun.sharma@gmail.com');
    await user.type(screen.getByLabelText(/^Password \*/i), 'SecretPass123');
    await user.type(screen.getByLabelText(/Confirm Password/i), 'SecretPass123');

    await user.click(screen.getByRole('button', { name: /COMPLETE ENLISTMENT →/i }));

    await waitFor(() => {
      expect(mockAuth.register).toHaveBeenCalledWith({
        displayName: 'Arjun Sharma',
        phone: '+91 98765 43210',
        email: 'arjun.sharma@gmail.com',
        password: 'SecretPass123',
      });
      expect(mockOnSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('displays duplicate email error and switch button when email is already registered', async () => {
    const user = userEvent.setup();
    mockAuth.register.mockRejectedValueOnce(
      new Error('An account with this email address already exists. Please log in.')
    );

    render(
      <AuthPage
        theme="dark"
        onToggleTheme={() => {}}
        onNavigateLanding={mockOnNavigateLanding}
        onSuccess={mockOnSuccess}
        auth={mockAuth}
        initialMode="register"
      />
    );

    await user.type(screen.getByLabelText(/Full Name/i), 'Duplicate Runner');
    await user.type(screen.getByLabelText(/Phone Number/i), '+91 98765 43210');
    await user.type(screen.getByLabelText(/Gmail \/ Email Address/i), 'existing@gmail.com');
    await user.type(screen.getByLabelText(/^Password \*/i), 'SecretPass123');
    await user.type(screen.getByLabelText(/Confirm Password/i), 'SecretPass123');

    await user.click(screen.getByRole('button', { name: /COMPLETE ENLISTMENT →/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
    const switchBtn = screen.getByRole('button', { name: /Switch to Sign In →/i });
    expect(switchBtn).toBeInTheDocument();

    // Click switch button
    await user.click(switchBtn);
    expect(screen.getByRole('heading', { name: /SIGN IN TO COMMAND/i })).toBeInTheDocument();
  });

  it('authenticates login successfully and calls onSuccess', async () => {
    const user = userEvent.setup();
    render(
      <AuthPage
        theme="dark"
        onToggleTheme={() => {}}
        onNavigateLanding={mockOnNavigateLanding}
        onSuccess={mockOnSuccess}
        auth={mockAuth}
      />
    );

    await user.type(screen.getByLabelText(/Gmail \/ Email Address/i), 'arjun@gmail.com');
    await user.type(screen.getByLabelText(/^Password/i), 'SecretPass123');
    await user.click(screen.getByRole('button', { name: /SIGN IN TO COMMAND →/i }));

    await waitFor(() => {
      expect(mockAuth.login).toHaveBeenCalledWith({
        email: 'arjun@gmail.com',
        password: 'SecretPass123',
      });
      expect(mockOnSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('navigates back to home when clicking Back to Home', async () => {
    const user = userEvent.setup();
    render(
      <AuthPage
        theme="dark"
        onToggleTheme={() => {}}
        onNavigateLanding={mockOnNavigateLanding}
        onSuccess={mockOnSuccess}
        auth={mockAuth}
      />
    );

    await user.click(screen.getByRole('button', { name: /Back to Home/i }));
    expect(mockOnNavigateLanding).toHaveBeenCalledTimes(1);
  });
});
