import {it,expect,vi} from 'vitest';
import {createAuthController} from '../auth/controller.js';
import {createPendingJournal,createPendingWork,DISCARD_CONFIRMATION} from '../auth/pending-work.js';
import {SESSION_KEY} from '../auth/vault.js';
import {memoryStorage,session,response} from '../auth/test-helpers.js';
import {ApiError} from '../auth/errors.js';
import {createConsentControls,discardSaved,recordingDecision} from './consent-controls.js';
import {createExportShare} from './export-share.js';

async function fixture(fetchOverride) {
  const storage=memoryStorage();await storage.set(SESSION_KEY,{version:2,session:session()});
  const journal=createPendingJournal(storage),pending=createPendingWork(journal);
  const google={signIn:vi.fn(async()=>'fresh.id.token'),signOut:vi.fn(async()=>{})},clearCaches=vi.fn(async()=>{});
  const requests=[];
  const auth=createAuthController({origin:'http://localhost:4000',storage,pending,google,clearCaches,
    fetchImpl:async(url,options)=>{requests.push({url,options});if(fetchOverride)return fetchOverride(url,options);return url.endsWith('/api/me')&&options.method==='GET'?response(200,{...session().user,emailVerified:false}):response(204);}});
  await auth.start();return {storage,journal,pending,google,clearCaches,requests,auth};
}
it('PRIV-04 deletion requires exact confirmation and a separate unsent-data acknowledgement before any request',async()=>{
  const f=await fixture();await f.journal.put('user-one','point',{sensitive:'kept'});
  await expect(f.auth.deleteAccount({confirmation:'delete',password:'private'})).rejects.toMatchObject({code:'CONFIRM_DELETE'});
  await expect(f.auth.deleteAccount({confirmation:'DELETE',password:'private'})).rejects.toMatchObject({code:'CONFIRM_UNSENT_ERASURE'});
  expect(f.requests).toHaveLength(1);expect(await f.pending.count('user-one')).toBe(1);
});
it('PRIV-04 confirmed deletion stops recording, clears credentials, own encrypted pending data, native Google state and caches',async()=>{
  const f=await fixture(),stopRecording=vi.fn(async()=>{});
  f.pending.register('recording',{count:async()=>0,discard:async()=>{},stopRecording});
  await f.journal.put('user-one','own',{secret:true});await f.journal.put('other-user','other',{preserved:true});
  await f.auth.deleteAccount({confirmation:'DELETE',password:'private',eraseUnsent:true});
  expect(stopRecording).toHaveBeenCalledWith('user-one','account-deletion');expect(f.storage.records.has(SESSION_KEY)).toBe(false);
  expect(await f.journal.list('user-one')).toEqual([]);expect(await f.journal.list('other-user')).toHaveLength(1);
  expect(f.google.signOut).toHaveBeenCalledOnce();expect(f.clearCaches).toHaveBeenCalledOnce();expect(f.auth.getSnapshot()).toMatchObject({status:'signedOut',user:null,message:expect.stringMatching(/deleted/)});
  expect(JSON.parse(f.requests.at(-1).options.body)).toEqual({confirmation:'DELETE',password:'private'});
});
it('PRIV-04 failed deletion preserves credentials and encrypted pending data and never clears caches',async()=>{
  const f=await fixture(async(url,opts)=>opts.method==='DELETE'?response(409,{error:{code:'TRY_AGAIN',message:'Try again.'}}):response(200,{...session().user,emailVerified:false}));
  await f.journal.put('user-one','own',{secret:true});
  await expect(f.auth.deleteAccount({confirmation:'DELETE',password:'private',eraseUnsent:true})).rejects.toMatchObject({code:'TRY_AGAIN'});
  expect(f.storage.records.has(SESSION_KEY)).toBe(true);expect(await f.pending.count('user-one')).toBe(1);expect(f.clearCaches).not.toHaveBeenCalled();
});
it('deletion obtains a fresh Google token without signing in to a different Territory account or persisting it',async()=>{
  const f=await fixture();await f.auth.deleteAccount({confirmation:'DELETE',method:'google'});
  expect(f.google.signIn).toHaveBeenCalledOnce();expect(JSON.parse(f.requests.at(-1).options.body)).toEqual({confirmation:'DELETE',idToken:'fresh.id.token'});
  expect(JSON.stringify([...f.storage.records])).not.toContain('fresh.id.token');expect(f.requests.some(r=>r.url.endsWith('/auth/google'))).toBe(false);
});
it('interrupted local deletion cleanup is retried on restart before restoring any session',async()=>{
  const f=await fixture();f.clearCaches.mockRejectedValueOnce(Error('device storage failure'));
  await expect(f.auth.deleteAccount({confirmation:'DELETE',password:'private'})).rejects.toMatchObject({code:'LOCAL_CLEANUP_REQUIRED'});
  expect(f.auth.getSnapshot().status).toBe('storageError');expect(f.storage.records.has('deleted-account-cleanup-v1')).toBe(true);
  await f.auth.start();expect(f.auth.getSnapshot().status).toBe('signedOut');expect(f.storage.records.has('deleted-account-cleanup-v1')).toBe(false);
});
it('PRIV-02 withdrawal stops recording before an offline request, preserves points, and needs explicit discard confirmation',async()=>{
  const f=await fixture(),order=[];await f.journal.put('user-one','saved',{point:true});
  f.pending.register('recording',{count:async()=>0,discard:async()=>{},stopRecording:async()=>order.push('stopped')});
  f.auth.api.request=vi.fn(async()=>{order.push('request');throw new ApiError('NETWORK_UNAVAILABLE','Offline.');});
  const controls=createConsentControls(f.auth);await expect(controls.withdraw({version:'v1'})).rejects.toMatchObject({code:'NETWORK_UNAVAILABLE'});
  expect(order).toEqual(['stopped','request']);expect(await f.pending.count('user-one')).toBe(1);
  await expect(controls.uploadEarlier()).rejects.toMatchObject({code:'UPLOAD_NOT_AVAILABLE'});
  await expect(discardSaved(controls,'no')).rejects.toMatchObject({code:'CONFIRM_DISCARD'});
  await discardSaved(controls,DISCARD_CONFIRMATION);expect(await f.pending.count('user-one')).toBe(0);
});
it('PRIV-03 current consent is checked before each future run; old versions require reacceptance',()=>{
  const consents=['LOCATION','TERMS','PRIVACY'].map(type=>({type,accepted:true,requiresAcceptance:false}));
  expect(recordingDecision(consents,'precise')).toEqual({allowed:true});
  expect(recordingDecision(consents.map(c=>c.type==='LOCATION'?{...c,accepted:false,requiresAcceptance:true}:c),'precise')).toMatchObject({allowed:false,reason:'CONSENT_REQUIRED'});
});
it.each(['approximate','denied','prompt',undefined])('PRIV-08 %s location is unusable; asks for precise location without requesting any OS permission',permission=>{
  const consents=['LOCATION','TERMS','PRIVACY'].map(type=>({type,accepted:true}));
  expect(recordingDecision(consents,permission)).toMatchObject({allowed:false,reason:'PRECISE_LOCATION_REQUIRED',message:expect.stringMatching(/Precise/)});
});
function nativeShare() {
  const events=[];let listener;
  const files={readdir:vi.fn(async()=>({files:[]})),mkdir:vi.fn(async()=>{}),writeFile:vi.fn(async()=>events.push('written')),
    getUri:vi.fn(async()=>({uri:'file:///private/cache/territory-exports/export-test.json'})),deleteFile:vi.fn(async()=>events.push('deleted'))};
  const lifecycle={addListener:vi.fn(async(_name,callback)=>{listener=callback;return {remove:vi.fn(async()=>{})};})};
  const share={share:vi.fn(async()=>{events.push('shared');})};
  const adapter=createExportShare({platform:'android',files,share,lifecycle});
  return {adapter,files,share,events,event:isActive=>listener({isActive})};
}
it('PRIV-06 Android sharing uses app cache only, never public storage, and deletes the temporary JSON',async()=>{
  const f=nativeShare();await f.adapter.send({own:'sensitive data'});
  expect(f.files.writeFile.mock.calls[0][0]).toMatchObject({directory:'CACHE',encoding:'utf8'});
  expect(f.share.share.mock.calls[0][0]).toMatchObject({files:[expect.stringMatching(/^file:/)]});expect(f.events).toEqual(['written','shared','deleted']);
});
it('PRIV-06 cache remains readable after chooser selection until the app resumes from the receiving app',async()=>{
  const f=nativeShare();f.share.share.mockImplementation(async()=>{f.event(false);});
  const task=f.adapter.send({own:true});await vi.waitFor(()=>expect(f.share.share).toHaveBeenCalled());expect(f.files.deleteFile).not.toHaveBeenCalled();
  f.event(true);await task;expect(f.files.deleteFile).toHaveBeenCalledOnce();
});
it('PRIV-06 cancelled share deletes cache; startup cleanup only touches this app export folder',async()=>{
  const f=nativeShare();f.share.share.mockRejectedValueOnce(Error('Share cancelled'));
  await expect(f.adapter.send({own:true})).rejects.toThrow('Share cancelled');expect(f.files.deleteFile).toHaveBeenCalledOnce();
  f.files.readdir.mockResolvedValue({files:[{name:'export-old.json'},{name:'unrelated.json'}]});await f.adapter.cleanup();
  expect(f.files.deleteFile).toHaveBeenLastCalledWith({path:'territory-exports/export-old.json',directory:'CACHE'});
  await expect(createExportShare({platform:'web'}).send({})).rejects.toMatchObject({code:'ANDROID_REQUIRED'});
});
