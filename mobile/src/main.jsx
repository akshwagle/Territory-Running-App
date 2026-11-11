import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const apiOrigin = new URL(import.meta.env.VITE_API_URL || 'http://localhost:4000').origin;

function App() {
  const [status, setStatus] = useState('Checking server…');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let disposed = false;
    setStatus('Checking server…');
    async function check() {
      try {
        const response = await fetch(`${apiOrigin}/api/health`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok || body.status !== 'ok' || body.db !== 'up') throw new Error('Unavailable');
        if (!disposed) setStatus('Connected');
      } catch { if (!disposed) setStatus("Can't reach server"); }
      finally { clearTimeout(timeout); }
    }
    check();
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);
  return <main>
    <h1>Territory Run</h1>
    <p>Version {__APP_VERSION__}</p>
    <p>API URL: <code>{apiOrigin}</code></p>
    <p role="status">{status}</p>
    <button onClick={() => setAttempt((value) => value + 1)}>Check connection</button>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
