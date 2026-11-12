import { createContext, useContext, useSyncExternalStore } from 'react';

export const AuthContext = createContext(null);
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw Error('An auth controller is required.');
  const state = useSyncExternalStore(auth.subscribe, auth.getSnapshot);
  return { auth, state };
}
