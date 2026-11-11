import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const url = new URL(env.VITE_API_URL || 'http://localhost:4000');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('VITE_API_URL must be an HTTP(S) origin without credentials or a path.');
  }
  return { plugins: [react()], server: { host: '127.0.0.1', port: 5173, strictPort: true }, test: { environment: 'jsdom', setupFiles: ['./src/test-setup.js'] } };
});
