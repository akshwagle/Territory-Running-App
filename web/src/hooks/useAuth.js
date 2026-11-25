import { useState, useEffect, useCallback } from 'react';
import {
  getStoredSession,
  saveSession,
  loginUser,
  registerUser,
  googleLoginUser,
  logoutUser,
  fetchCurrentUser,
} from '../services/authService.js';

export function useAuth() {
  const [session, setSession] = useState(() => getStoredSession());
  const [user, setUser] = useState(() => session?.user || null);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState(() => (session?.accessToken ? 'authenticated' : 'unauthenticated'));
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Synchronize with server profile on initial mount if session exists
  useEffect(() => {
    let active = true;
    const initialSession = getStoredSession();
    if (!initialSession?.accessToken) {
      setStatus('unauthenticated');
      return;
    }

    fetchCurrentUser()
      .then((data) => {
        if (!active) return;
        if (data.user) {
          setUser(data.user);
          setProfile(data.profile);
          setStatus('authenticated');
          // Update cached user in stored session
          const current = getStoredSession();
          if (current) {
            saveSession({ ...current, user: data.user });
          }
        }
      })
      .catch((err) => {
        if (!active) return;
        if (err.status === 401) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setStatus('unauthenticated');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleLogin = useCallback(async ({ email, password }) => {
    setIsLoading(true);
    setError(null);
    try {
      const newSession = await loginUser({ email, password });
      setSession(newSession);
      setUser(newSession.user);
      setStatus('authenticated');
      // Fetch fresh profile in parallel
      fetchCurrentUser()
        .then((data) => {
          if (data.profile) setProfile(data.profile);
        })
        .catch(() => {});
      return newSession;
    } catch (err) {
      setError(err.message || 'Login failed.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRegister = useCallback(async ({ email, password, displayName, phone }) => {
    setIsLoading(true);
    setError(null);
    try {
      const newSession = await registerUser({ email, password, displayName, phone });
      setSession(newSession);
      setUser(newSession.user);
      setStatus('authenticated');
      return newSession;
    } catch (err) {
      setError(err.message || 'Registration failed.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleGoogleLogin = useCallback(async (idToken, phone = '') => {
    setIsLoading(true);
    setError(null);
    try {
      const newSession = await googleLoginUser(idToken, phone);
      setSession(newSession);
      setUser(newSession.user);
      setStatus('authenticated');
      fetchCurrentUser()
        .then((data) => {
          if (data.profile) setProfile(data.profile);
        })
        .catch(() => {});
      return newSession;
    } catch (err) {
      setError(err.message || 'Google sign-in failed.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setIsLoading(true);
    try {
      await logoutUser();
    } finally {
      setSession(null);
      setUser(null);
      setProfile(null);
      setStatus('unauthenticated');
      setError(null);
      setIsLoading(false);
    }
  }, []);

  return {
    user,
    profile,
    session,
    status,
    isAuthenticated: status === 'authenticated' && Boolean(user),
    isLoading,
    error,
    login: handleLogin,
    register: handleRegister,
    googleLogin: handleGoogleLogin,
    logout: handleLogout,
  };
}
