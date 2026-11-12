import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

// Never call this plugin's web implementation: it uses unencrypted localStorage.
// Browser previews intentionally keep credentials in memory for this tab only.
export function platformStorage(platform = Capacitor.getPlatform(), plugin = SecureStorage) {
  if (platform === 'web') {
    const memory = new Map();
    return { durable: false, get: async key => memory.get(key) ?? null,
      set: async (key, value) => { memory.set(key, structuredClone(value)); },
      remove: async key => { memory.delete(key); } };
  }
  if (platform !== 'android') throw Error('Android is required.');
  let ready;
  const initialize = () => ready ??= plugin.setKeyPrefix('territoryrun_');
  return {
    durable: true,
    async get(key) { await initialize(); return plugin.get(key, false); },
    async set(key, value) { await initialize(); await plugin.set(key, value, false); },
    async remove(key) { await initialize(); await plugin.remove(key); },
  };
}
