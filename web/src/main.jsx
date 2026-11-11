import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow-condensed/latin-800.css';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);
