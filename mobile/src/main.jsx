import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow-condensed/latin-800.css';
import { App } from './App.jsx';
import { AuthContext } from './auth/context.jsx';
import { createAuthController } from './auth/controller.js';
import { createGoogleAdapter } from './auth/google-adapter.js';
import { createPendingJournal, createPendingWork } from './auth/pending-work.js';
import { platformStorage } from './auth/platform-storage.js';
import './styles.css';

const storage = platformStorage();
const pending = createPendingWork(createPendingJournal(storage));
const auth = createAuthController({ origin: import.meta.env.VITE_API_URL || 'http://localhost:4000',
  storage, pending, google: createGoogleAdapter() });
const downloadUrl = import.meta.env.VITE_DOWNLOAD_URL || 'http://localhost:5173/#download';
createRoot(document.getElementById('root')).render(<AuthContext.Provider value={auth}>
  <HashRouter><App downloadUrl={downloadUrl} /></HashRouter>
</AuthContext.Provider>);
