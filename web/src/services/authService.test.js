import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeEmail,
  validatePhone,
  validateDisplayName,
  validatePassword,
  getStoredSession,
  saveSession,
  clearStoredSession,
  registerUser,
  loginUser,
  googleLoginUser,
  logoutUser,
  authenticatedFetch,
  AUTH_SESSION_KEY,
} from './authService.js';

describe('authService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Validation & Normalization', () => {
    it('normalizes emails to lowercase trimmed format', () => {
      expect(normalizeEmail('  Arjun.Sharma@GMAIL.COM  ')).toBe('arjun.sharma@gmail.com');
      expect(normalizeEmail('TEST@Example.com')).toBe('test@example.com');
      expect(normalizeEmail(null)).toBe('');
    });

    it('validates phone numbers correctly', () => {
      expect(validatePhone('+919876543210')).toBe(true);
      expect(validatePhone('+91 98765 43210')).toBe(true);
      expect(validatePhone('(555) 123-4567')).toBe(true);
      expect(validatePhone('9876543210')).toBe(true);
      expect(validatePhone('12345')).toBe(false);
      expect(validatePhone('abc123456789')).toBe(false);
      expect(validatePhone('')).toBe(false);
    });

    it('validates display names', () => {
      expect(validateDisplayName('Arjun Sharma')).toBe(true);
      expect(validateDisplayName('A')).toBe(false);
      expect(validateDisplayName('   ')).toBe(false);
      expect(validateDisplayName('A'.repeat(61))).toBe(false);
    });

    it('validates minimum password length', () => {
      expect(validatePassword('12345678')).toBe(true);
      expect(validatePassword('short')).toBe(false);
      expect(validatePassword('')).toBe(false);
    });
  });

  describe('Session Storage', () => {
    it('saves and retrieves valid sessions', () => {
      const mockSession = {
        accessToken: 'access.mock.jwt',
        refreshToken: 'refresh_mock_token_43_chars_long_string_123',
        user: { id: 'user-uuid-1', email: 'test@gmail.com', displayName: 'Test Runner' },
      };

      saveSession(mockSession);
      const retrieved = getStoredSession();
      expect(retrieved).toEqual(mockSession);

      clearStoredSession();
      expect(getStoredSession()).toBeNull();
    });

    it('returns null and clears corrupted session data', () => {
      localStorage.setItem(AUTH_SESSION_KEY, 'invalid-json');
      expect(getStoredSession()).toBeNull();
      expect(localStorage.getItem(AUTH_SESSION_KEY)).toBeNull();
    });
  });

  describe('API Authentication Flows', () => {
    it('registers a new user and saves the session', async () => {
      const mockResponse = {
        accessToken: 'access.mock.token',
        refreshToken: 'refresh.mock.token',
        user: { id: 'u1', email: 'runner@gmail.com', displayName: 'Runner One' },
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      }));

      const session = await registerUser({
        email: 'Runner@gmail.com',
        password: 'ValidPassword123',
        displayName: 'Runner One',
        phone: '+919876543210',
      });

      expect(session.user.email).toBe('runner@gmail.com');
      expect(session.phone).toBe('+919876543210');
      expect(getStoredSession()?.user?.id).toBe('u1');
    });

    it('rejects registration with friendly error when email already exists', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'AUTH_FAILED', message: 'Cannot register or sign in with these details.' } }),
      }));

      await expect(registerUser({
        email: 'existing@gmail.com',
        password: 'ValidPassword123',
        displayName: 'Existing User',
        phone: '+919876543210',
      })).rejects.toThrow(/An account with this email address already exists/i);
    });

    it('authenticates user on login and saves session', async () => {
      const mockResponse = {
        accessToken: 'access.mock.token',
        refreshToken: 'refresh.mock.token',
        user: { id: 'u2', email: 'runner2@gmail.com', displayName: 'Runner Two' },
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      }));

      const session = await loginUser({
        email: 'runner2@gmail.com',
        password: 'ValidPassword123',
      });

      expect(session.user.id).toBe('u2');
      expect(getStoredSession()?.user?.id).toBe('u2');
    });

    it('authenticates user with Google ID token', async () => {
      const mockResponse = {
        accessToken: 'access.mock.google',
        refreshToken: 'refresh.mock.google',
        user: { id: 'u3', email: 'google.runner@gmail.com', displayName: 'Google Runner' },
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      }));

      const session = await googleLoginUser('mock-id-token', '+919876543210');
      expect(session.user.email).toBe('google.runner@gmail.com');
      expect(getStoredSession()?.user?.id).toBe('u3');
    });

    it('logs out and revokes tokens', async () => {
      saveSession({
        accessToken: 'acc',
        refreshToken: 'ref',
        user: { id: 'u1' },
      });

      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
      vi.stubGlobal('fetch', fetchMock);

      await logoutUser();
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/auth/logout'), expect.objectContaining({
        method: 'POST',
      }));
      expect(getStoredSession()).toBeNull();
    });

    it('authenticatedFetch attaches Bearer token to request', async () => {
      saveSession({
        accessToken: 'valid-jwt-token',
        refreshToken: 'refresh-jwt-token',
        user: { id: 'u1' },
      });

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'u1', email: 'runner@gmail.com' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await authenticatedFetch('/api/me');
      expect(result.id).toBe('u1');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/me'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-jwt-token',
          }),
        })
      );
    });
  });
});
