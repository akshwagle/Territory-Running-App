import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { getStoredTheme } from './hooks/useTheme.js';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow-condensed/latin-800.css';
import './styles.css';

document.documentElement.setAttribute('data-theme', getStoredTheme());
createRoot(document.getElementById('root')).render(<App />);
