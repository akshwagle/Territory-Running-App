import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyMessage } from '../auth/errors.js';

export function useResource(load) {
  const [state, setState] = useState({ phase: 'loading', value: null, error: '' });
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const id = ++sequence.current; setState(old => ({ ...old, phase: 'loading', error: '' }));
    try { const value = await load(); if (id === sequence.current) setState({ phase: 'ready', value, error: '' }); }
    catch (error) { if (id === sequence.current) setState(old => ({ ...old, phase: 'error', error: friendlyMessage(error) })); }
  }, [load]);
  useEffect(() => { reload(); return () => { sequence.current++; }; }, [reload]);
  return { ...state, reload };
}
