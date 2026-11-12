import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const version = JSON.parse(readFileSync(new URL('./app-version.json', import.meta.url), 'utf8'));
if (!Number.isInteger(version.versionCode) || version.versionCode < 1 || version.versionCode > 2100000000 || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version.versionName) || version.versionName.length > 20) {
  throw new Error('app-version.json needs a valid versionName and positive Android versionCode.');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const api = new URL(env.VITE_API_URL || 'http://localhost:4000');
  if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password || api.search || api.hash || api.pathname !== '/') {
    throw new Error('VITE_API_URL must be an HTTP(S) origin without credentials or a path.');
  }
  return { plugins: [react()], define: { __APP_VERSION__: JSON.stringify(version.versionName), __APP_VERSION_CODE__: JSON.stringify(version.versionCode) },
    test: { environment: 'jsdom', setupFiles: ['./src/test-setup.js'] } };
});
