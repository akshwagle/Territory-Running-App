import { useEffect, useState } from 'react';
import { useAuth } from '../auth/context.jsx';
import { Button, InlineNotice, Sheet } from './index.jsx';
export function PendingNotice({ suppressed = false }) {
  const { auth, state } = useAuth();
  const [count, setCount] = useState(0), [dismissed, setDismissed] = useState(false), [details, setDetails] = useState(false), [failure, setFailure] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setFailure(false);
    auth.pendingTotal?.().then(value => { if (active) { setCount(value); if (!value) setDismissed(false); } }).catch(() => { if (active) setFailure(true); });
    return () => { active = false; };
  }, [auth, state.status, state.user?.id, attempt]);
  if (suppressed) return null;
  if (failure) return <InlineNotice error action="Retry" onAction={() => setAttempt(n => n + 1)}>Couldn’t check saved data. Keep the app installed and try again.</InlineNotice>;
  if (!count || dismissed) return null;
  return <><InlineNotice action="Details" onAction={() => setDetails(true)} onDismiss={() => setDismissed(true)}>Unsent data is encrypted on this phone.</InlineNotice>
    {details && <Sheet title="Your unsent data" onClose={() => setDetails(false)}><p>{count} saved {count === 1 ? 'item is' : 'items are'} still encrypted on this phone. Sign in to the account that saved them to continue. Signing out does not erase them.</p><p>Uploads arrive with run recording. Keep the app installed to retain this data.</p><Button onClick={() => { setDetails(false); setDismissed(true); }}>Got it</Button></Sheet>}</>;
}
