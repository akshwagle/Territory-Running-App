import { apiOrigin } from '../hooks/useRelease.js';

export const AUTH_SESSION_KEY = 'run_conquer_auth_session_v1';

/**
 * Normalizes email address to standard lowercase ASCII form.
 */
export function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim().toLowerCase();
  return text;
}

/**
 * Validates standard phone number format (at least 10 digits).
 */
export function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/[\s\-()]/g, '');
  // Must be digits optionally starting with +, between 10 and 15 digits
  return /^\+?[0-9]{10,15}$/.test(cleaned);
}

/**
 * Validates display / full name (2 to 60 characters).
 */
export function validateDisplayName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 60;
}

/**
 * Validates minimum password criteria (at least 8 characters).
 */
export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

/**
 * Retrieves the stored session from localStorage.
 */
export function getStoredSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session?.accessToken && session?.refreshToken && session?.user?.id) {
      return session;
    }
  } catch {
    // Malformed session, clear it
    localStorage.removeItem(AUTH_SESSION_KEY);
  }
  return null;
}

/**
 * Saves authenticated session to localStorage.
 */
export function saveSession(session) {
  if (typeof window === 'undefined' || !session) return;
  try {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage quota or unavailable
  }
}

/**
 * Removes session from localStorage.
 */
export function clearStoredSession() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Refreshes an active session with the backend using the refresh token.
 */
export async function refreshSession(refreshToken) {
  if (!refreshToken) throw new Error('No refresh token available');
  const response = await fetch(`${apiOrigin}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    clearStoredSession();
    const errorData = await response.json().catch(() => ({}));
    const code = errorData?.error?.code || 'SESSION_EXPIRED';
    const message = errorData?.error?.message || 'Your session has expired. Please sign in again.';
    throw Object.assign(new Error(message), { code, status: response.status });
  }

  const nextSession = await response.json();
  const current = getStoredSession();
  const merged = { ...current, ...nextSession };
  saveSession(merged);
  return merged;
}

/**
 * Authenticated API request wrapper with automatic single-flight token rotation.
 */
export async function authenticatedFetch(path, options = {}) {
  let session = getStoredSession();
  if (!session?.accessToken) {
    throw Object.assign(new Error('Please sign in to continue.'), { code: 'UNAUTHORIZED', status: 401 });
  }

  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${session.accessToken}`,
    ...(options.headers || {}),
  };

  let response = await fetch(`${apiOrigin}${path}`, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized with token refresh and retry
  if (response.status === 401 && session.refreshToken) {
    try {
      session = await refreshSession(session.refreshToken);
      headers.Authorization = `Bearer ${session.accessToken}`;
      response = await fetch(`${apiOrigin}${path}`, {
        ...options,
        headers,
      });
    } catch (refreshErr) {
      clearStoredSession();
      throw refreshErr;
    }
  }

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = data?.error?.code || 'REQUEST_FAILED';
    const message = data?.error?.message || 'The server could not complete this request.';
    throw Object.assign(new Error(message), { code, status: response.status, data });
  }

  return data;
}

/**
 * Registers a new user account with email, password, and display name.
 */
export async function registerUser({ email, password, displayName, phone = '' }) {
  const normEmail = normalizeEmail(email);
  if (!normEmail) throw new Error('Please enter a valid email address.');
  if (!validateDisplayName(displayName)) throw new Error('Full name must be between 2 and 60 characters.');
  if (phone && !validatePhone(phone)) throw new Error('Please enter a valid phone number (e.g. +91 98765 43210).');
  if (!validatePassword(password)) throw new Error('Password must be at least 8 characters long.');

  const response = await fetch(`${apiOrigin}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: normEmail,
      password,
      displayName: displayName.trim(),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error?.code || 'REGISTRATION_FAILED';
    let message = data?.error?.message || 'Could not complete registration.';
    if (code === 'AUTH_FAILED' || code === 'CONFLICT' || response.status === 409 || response.status === 401) {
      message = 'An account with this email address already exists. Please log in.';
    }
    throw Object.assign(new Error(message), { code, status: response.status });
  }

  const session = { ...data, phone: phone.trim() };
  saveSession(session);
  return session;
}

/**
 * Authenticates an existing user with email and password.
 */
export async function loginUser({ email, password }) {
  const normEmail = normalizeEmail(email);
  if (!normEmail) throw new Error('Please enter a valid email address.');
  if (!password) throw new Error('Please enter your password.');

  const response = await fetch(`${apiOrigin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normEmail, password }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error?.code || 'AUTH_FAILED';
    const message = data?.error?.message || 'Invalid email or password.';
    throw Object.assign(new Error(message), { code, status: response.status });
  }

  saveSession(data);
  return data;
}

/**
 * Authenticates or registers a user with a verified Google ID token.
 */
export async function googleLoginUser(idToken, phone = '') {
  if (!idToken) throw new Error('Google identity token is required.');

  const response = await fetch(`${apiOrigin}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error?.code || 'GOOGLE_AUTH_FAILED';
    const message = data?.error?.message || 'Google sign-in could not be completed. Please try again.';
    throw Object.assign(new Error(message), { code, status: response.status });
  }

  const session = { ...data, phone: phone.trim() };
  saveSession(session);
  return session;
}

/**
 * Ends the user session and revokes the refresh token on the server.
 */
export async function logoutUser() {
  const session = getStoredSession();
  if (session?.refreshToken) {
    try {
      await fetch(`${apiOrigin}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
    } catch {
      // Best-effort logout: ignore network failures
    }
  }
  clearStoredSession();
}

/**
 * Fetches the authenticated user profile from /api/me and /api/me/profile.
 */
export async function fetchCurrentUser() {
  const [me, profileData] = await Promise.all([
    authenticatedFetch('/api/me'),
    authenticatedFetch('/me/profile').catch(() => null),
  ]);

  return {
    user: me,
    profile: profileData?.profile || null,
    regions: profileData?.regions || [],
  };
}
