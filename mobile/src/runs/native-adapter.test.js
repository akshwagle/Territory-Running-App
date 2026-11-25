import {it,expect,vi} from 'vitest';
import {createNativeFetch,createRunAdapter} from './native-adapter.js';
it('LIFE-07 native HTTP passes auth only in each in-memory request, disables redirects and exposes Retry-After',async()=>{
 const http={request:vi.fn(async()=>({status:429,headers:{'Retry-After':'45'},data:{error:{code:'RATE_LIMITED'}}}))};const fetch=createNativeFetch({platform:'android',http});
 const response=await fetch('https://example.test/api/runs',{method:'POST',headers:{Authorization:'Bearer fixture'},body:'{"a":1}'});
 expect(http.request).toHaveBeenCalledWith(expect.objectContaining({disableRedirects:true,headers:{Authorization:'Bearer fixture'},data:{a:1},responseType:'json'}));expect(response.ok).toBe(false);expect(response.headers.get('Retry-After')).toBe('45');expect((await response.json()).error.code).toBe('RATE_LIMITED');
});
it('LIFE-07 native timeout abort settles once even if the underlying socket returns later',async()=>{
 let resolve;const http={request:()=>new Promise(done=>{resolve=done;})},abort=new AbortController(),fetch=createNativeFetch({platform:'android',http});
 const pending=fetch('https://example.test/api/runs',{signal:abort.signal});abort.abort();await expect(pending).rejects.toMatchObject({name:'AbortError'});resolve({status:200,headers:{},data:{}});
});
it('PERM-03 native-only recorder rejects browser capture and forwards both listener arguments unchanged',async()=>{
 await expect(createRunAdapter({platform:'web'}).start()).rejects.toMatchObject({code:'ANDROID_REQUIRED'});const callback=()=>{},native={addListener:vi.fn(async()=>({remove:()=>{}}))};await createRunAdapter({platform:'android',native}).addListener('stateChanged',callback);expect(native.addListener).toHaveBeenCalledWith('stateChanged',callback);
});
