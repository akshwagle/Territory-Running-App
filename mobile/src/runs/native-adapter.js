import { Capacitor, registerPlugin, CapacitorHttp } from '@capacitor/core';
import { ApiError } from '../auth/errors.js';
const plugin = registerPlugin('TerritoryRecorder');

export function createRunAdapter({platform = Capacitor.getPlatform(), native = plugin} = {}) {
  function required() { if (platform !== 'android') throw new ApiError('ANDROID_REQUIRED', 'Run recording is available in the Android app.'); }
  return new Proxy({}, {get: (_target, name) => async (...args) => {
    required();
    try { return await native[name](...args); }
    catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(error.code || 'RUN_STORAGE_UNAVAILABLE', error.message || 'Saved run data is unavailable. Keep the app installed and retry.'); }
  }});
}
// Native HTTP avoids WebView network throttling during a screen-off run. The
// built-in transport keeps these request headers in memory; no plugin config
// ever receives or persists an auth token. Redirects stay disabled.
export function createNativeFetch({platform = Capacitor.getPlatform(), http = CapacitorHttp, webFetch = globalThis.fetch} = {}) {
  if (platform !== 'android') return (...args) => webFetch(...args);
  return async (url, options = {}) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const request = http.request({url,method:options.method || 'GET',headers:options.headers || {},
      ...(options.body === undefined ? {} : {data:JSON.parse(options.body)}),
      connectTimeout:15000,readTimeout:15000,disableRedirects:true,responseType:'json'});
    let abort;
    const cancelled = new Promise((_resolve,reject) => { abort=()=>reject(new DOMException('Aborted','AbortError'));options.signal?.addEventListener('abort',abort,{once:true}); });
    try {
      const response = await Promise.race([request,cancelled]);
      return {status:response.status,ok:response.status>=200&&response.status<300,headers:new Headers(response.headers),json:async()=>typeof response.data==='string'?JSON.parse(response.data):response.data};
    } finally { options.signal?.removeEventListener('abort',abort); }
  };
}
