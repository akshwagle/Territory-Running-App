import { useState } from 'react';
import { useAuth } from '../auth/context.jsx';
import { Button, Sheet } from './index.jsx';

const key = id => `territory.intro.v1.${id}`;
function seen(id) { try { return window.localStorage.getItem(key(id)) === '1'; } catch { return true; } }
function remember(id) { try { window.localStorage.setItem(key(id), '1'); } catch { /* Shown again next launch. */ } }

// One-time explanation shown after the first sign-in on this phone. It requests
// nothing itself: Android prompts only appear later, when a run is started.
export function FirstRunIntro() {
  const { state } = useAuth(), id = state.user?.id, [open, setOpen] = useState(true);
  if (!id || !open || seen(id)) return null;
  const close = () => { remember(id); setOpen(false); };
  return <Sheet title="Before your first run" onClose={close}>
    <h3>Location</h3>
    <p>Territory Run records your route with precise GPS while you run, so the cells you cross can become your territory. Android asks for permission when you start your first run; background location keeps recording with the screen off. Recording stops when you finish.</p>
    <h3>Notifications</h3>
    <p>Run results, lost territory, followers and badges appear in the bell on Home. This build sends no push notifications, so Android will not ask for notification permission.</p>
    <p className="small">You can review or withdraw location consent in Profile → Privacy at any time.</p>
    <div className="editor-actions"><Button onClick={close}>Got it</Button></div>
  </Sheet>;
}
