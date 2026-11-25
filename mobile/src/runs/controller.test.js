import {it,expect,vi} from 'vitest';
import {createRecordingController} from './controller.js';
import {ApiError} from '../auth/errors.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const runId='11111111-1111-4111-8111-111111111111';
function setup(){
 let clock=1000,auth={status:'authenticated'},saved={state:'IDLE',ownerScope:'scope'},intent={},jobs=[],listeners={},failure=null,requests=[];
 const native={addListener:vi.fn(async(name,listener)=>{listeners[name]=listener;}),deviceInfo:vi.fn(async()=>({installId:runId,versionCode:6})),setOwner:vi.fn(async()=>saved),snapshot:vi.fn(async()=>saved),
  permissions:vi.fn(async()=>({location:'precise',background:true,notifications:true,activity:true,gps:true,storageBytes:9999999})),
  prepareIntent:vi.fn(async({body})=>(intent=structuredClone(body))),intent:vi.fn(async()=>intent),clearIntent:vi.fn(async()=>{intent={};}),
  start:vi.fn(async({run})=>{saved={...saved,state:'ACTIVE',runId:run.id};return saved;}),
  pause:vi.fn(async()=>{saved={...saved,state:'PAUSED'};return saved;}),resume:vi.fn(async()=>{saved={...saved,state:'ACTIVE',recovery:false};return saved;}),
  finish:vi.fn(async()=>{saved={...saved,state:'FINISHING'};return saved;}),discard:vi.fn(async()=>{saved={...saved,state:'DISCARDING'};return saved;}),
  suspend:vi.fn(async()=>{saved={...saved,state:saved.state==='ACTIVE'?'PAUSED':saved.state};return saved;}),
  nextUpload:vi.fn(async()=>jobs[0]||{}),acknowledge:vi.fn(async({id})=>{expect(jobs[0].id).toBe(id);const job=jobs.shift();return job.action==='finish'?{completedRunId:runId}:saved;}),
  erase:vi.fn(async()=>{}),count:vi.fn(async()=>({count:1})),countAll:vi.fn(async()=>({count:1})),requestLocation:vi.fn(async()=>{}),openSettings:vi.fn(async()=>{}),debugFeed:vi.fn(async()=>{})};
 const api={setInstallId:vi.fn(),serverNow:()=>new Date(100000),request:vi.fn(async(path,options={})=>{
  requests.push({path,...structuredClone(options)});
  if(failure)throw failure;
  if(path==='/api/me/consents')return {consents:['LOCATION','TERMS','PRIVACY'].map(type=>({type,accepted:true,requiresAcceptance:false}))};
  if(path==='/api/me/profile')return {profile:{preferredUnits:'mi'}};
  if(path==='/api/runs')return {run:{id:runId,status:'ACTIVE',...options.body}};
  if(path.includes('?active=true'))return {runs:[{id:runId}]};
  if(path.endsWith('/finish'))return {run:{id:runId,status:'PENDING_VALIDATION'}};
  return {highestSeq:99999,recordingAllowed:true};
 })};
 const recorder=createRecordingController({api,native,getAuth:()=>auth,now:()=>clock,random:()=>.5});
 async function ready(){recorder.source.resume('owner');await tick();await tick();native.suspend.mockClear();}
 return {recorder,api,native,requests,ready,emit:data=>listeners.stateChanged?.(data),jobs:value=>{jobs=value;},saved:value=>{saved={...saved,...value};},fail:value=>{failure=value;},clock:value=>{clock=value;},auth:value=>{auth={status:value};}};
}
it('LIFE-07 an acknowledged run continues offline while uploading pauses; a fresh offline start is blocked',async()=>{
 const f=setup();await f.ready();await f.recorder.prepare();await f.recorder.start();
 f.recorder.source.pause('connection');f.auth('offline');expect(f.native.suspend).not.toHaveBeenCalled();expect(f.recorder.getSnapshot().sync).toBe('waiting');
 await expect(f.recorder.start()).rejects.toMatchObject({code:'ONLINE_START_REQUIRED'});
 expect(f.recorder.getSnapshot().state).toBe('ACTIVE');
});
it('LIFE-06 new recording begins only after a server acknowledgement and uses the profile units',async()=>{
 const f=setup();await f.ready();await f.recorder.start();
 expect(f.api.request.mock.invocationCallOrder.find((_,i)=>f.api.request.mock.calls[i][0]==='/api/runs')).toBeLessThan(f.native.start.mock.invocationCallOrder[0]);
 expect(f.native.start).toHaveBeenCalledWith(expect.objectContaining({miles:true,run:expect.objectContaining({status:'ACTIVE'})}));
});
it('LIFE-07 timeout retries the identical persisted start intent rather than creating a second run',async()=>{
 const f=setup();await f.ready();const original=f.api.request.getMockImplementation();let failCreate=true;
 f.api.request.mockImplementation(async(path,options)=>{if(path==='/api/runs'&&failCreate){failCreate=false;throw new ApiError('REQUEST_TIMEOUT','Retry.');}return original(path,options);});
 await expect(f.recorder.start()).rejects.toThrow();const intent=await f.native.intent();await f.recorder.start();
 expect(f.native.prepareIntent).toHaveBeenCalledOnce();expect(f.requests.find(r=>r.path==='/api/runs').body).toEqual(intent);expect(f.native.start).toHaveBeenCalledOnce();
});
it('LIFE-07 retry keeps the native batch body and key unchanged and never acknowledges on a failed response',async()=>{
 const f=setup();await f.ready();const job={id:`${runId}:0`,action:'points',runId,body:{batchKey:`${runId}:0`,points:[{seq:0}]}};f.jobs([job]);f.fail(new ApiError('NETWORK_UNAVAILABLE','Offline.'));
 await expect(f.recorder.retry()).rejects.toThrow();expect(f.native.acknowledge).not.toHaveBeenCalled();expect(f.recorder.getSnapshot().sync).toBe('waiting');
 f.fail(null);f.clock(3000);await f.recorder.retry();
 const attempts=f.requests.filter(r=>r.path.endsWith('/points'));expect(attempts).toHaveLength(2);expect(attempts[0].body).toEqual(attempts[1].body);expect(f.native.acknowledge).toHaveBeenCalledWith({id:job.id,response:{highestSeq:99999,recordingAllowed:true}});
});
it('LIFE-07 Retry-After prevents even an explicit retry from hammering a rate limit',async()=>{
 const f=setup();await f.ready();f.jobs([{id:'batch',runId,action:'points',body:{}}]);f.fail(new ApiError('RATE_LIMITED','Wait.',429,60));
 await expect(f.recorder.retry()).rejects.toThrow();const calls=f.api.request.mock.calls.length;await f.recorder.retry();expect(f.api.request).toHaveBeenCalledTimes(calls);
 f.fail(null);f.clock(62000);await f.recorder.retry();expect(f.native.acknowledge).toHaveBeenCalledOnce();
});
it('LIFE-01 process recovery offers saved state without automatically resuming GPS',async()=>{
 const f=setup();f.saved({state:'PAUSED',recovery:true,reboot:false,runId});await f.ready();
 expect(f.recorder.getSnapshot()).toMatchObject({state:'PAUSED',recovery:true});expect(f.native.resume).not.toHaveBeenCalled();await f.recorder.resume();expect(f.recorder.getSnapshot().state).toBe('ACTIVE');
});
it('LIFE-03 a reboot recovery preserves the native finish-only decision and does not start another run',async()=>{
 const f=setup();f.saved({state:'PAUSED',recovery:true,reboot:true,runId});await f.ready();f.native.resume.mockRejectedValueOnce(new ApiError('FINISH_AFTER_REBOOT','Finish saved run.'));
 await expect(f.recorder.resume()).rejects.toMatchObject({code:'FINISH_AFTER_REBOOT'});await f.recorder.finish();expect(f.native.start).not.toHaveBeenCalled();
});
it('PRIV-02 withdrawal stops collection, blocks resume and requires an explicit choice to upload earlier data',async()=>{
 const f=setup();await f.ready();f.jobs([{id:'batch',runId,action:'points',body:{}}]);await f.recorder.source.stopRecording('owner','consent-withdrawn');
 await f.recorder.retry();expect(f.native.nextUpload).toHaveBeenCalledTimes(1);await expect(f.recorder.resume()).rejects.toMatchObject({code:'CONSENT_REQUIRED'});
 await f.recorder.source.upload('owner');expect(f.native.acknowledge).toHaveBeenCalledOnce();
});
it('AUTH-07 sign-out preserves ciphertext and a late response cannot acknowledge into the next account',async()=>{
 const f=setup();await f.ready();f.jobs([{id:'batch',runId,action:'points',body:{}}]);let resolve;
 f.api.request.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const pending=f.recorder.retry();await tick();f.recorder.source.pause('session-ended');resolve({highestSeq:0});await pending;
 expect(f.native.acknowledge).not.toHaveBeenCalled();expect(f.native.erase).not.toHaveBeenCalled();expect(f.native.suspend).toHaveBeenCalledWith({reason:'session-ended'});
});
it('PRIV-04 account erasure removes the owner journal and key while ordinary sign-out never erases',async()=>{
 const f=setup();await f.ready();await f.recorder.source.discard('owner','confirmation',{eraseAccount:true});expect(f.native.erase).toHaveBeenCalledWith({ownerId:'owner'});
});
it('PERM-01 blocked location opens settings without looping a system prompt; PERM-06 approximate never starts',async()=>{
 const f=setup();await f.ready();f.native.permissions.mockResolvedValue({location:'blocked'});await f.recorder.prepare();expect(f.recorder.getSnapshot().flow).toBe('location');await f.recorder.openSettings();expect(f.native.requestLocation).not.toHaveBeenCalled();
 f.native.permissions.mockResolvedValue({location:'approximate'});await expect(f.recorder.start()).rejects.toMatchObject({code:'PRECISE_LOCATION_REQUIRED'});expect(f.native.start).not.toHaveBeenCalled();
});
it('PERM-03 real permissions are checked again at every start; PERM-04 background denial does not block',async()=>{
 const f=setup();await f.ready();await f.recorder.prepare();f.native.permissions.mockResolvedValue({location:'denied'});await expect(f.recorder.start()).rejects.toThrow();
 f.native.permissions.mockResolvedValue({location:'precise',background:false,gps:true,storageBytes:9999999});await f.recorder.start();expect(f.native.start).toHaveBeenCalledOnce();
});
it('PERM-08 optional activity refusal proceeds to Ready without a required step signal',async()=>{
 const f=setup();await f.ready();f.native.permissions.mockResolvedValue({location:'precise',background:true,notifications:true,activity:false});await f.recorder.prepare();expect(f.recorder.getSnapshot().flow).toBe('activity');f.recorder.nextPermission();expect(f.recorder.getSnapshot().flow).toBe('ready');
});
it('LIFE-04 start is blocked on low storage and a committed native run survives a bridge failure',async()=>{
 const f=setup();await f.ready();f.native.permissions.mockResolvedValueOnce({location:'precise',gps:true,storageBytes:1024});await expect(f.recorder.start()).rejects.toMatchObject({code:'LOW_STORAGE'});
 f.native.start.mockImplementationOnce(async()=>{f.saved({state:'PAUSED',runId});throw new ApiError('RUN_STORAGE_UNAVAILABLE','Retry storage.');});await expect(f.recorder.start()).rejects.toThrow();expect(f.requests.some(r=>r.method==='DELETE')).toBe(false);expect(f.recorder.getSnapshot().runId).toBe(runId);
});
it('LIFE-09 discard is explicit, finish waits for native points/control jobs and the server result replaces live estimates',async()=>{
 const f=setup();await f.ready();f.jobs([{id:'points',runId,action:'points',body:{}},{id:'pause',runId,action:'pause',body:{}},{id:'finish',runId,action:'finish',body:{}}]);await f.recorder.finish();await tick();
 expect(f.requests.map(r=>r.path.split('/').at(-1))).toEqual(['points','pause','finish']);expect(f.recorder.getSnapshot()).toMatchObject({state:'DONE',lastFinished:{id:runId,run:{status:'PENDING_VALIDATION'}}});expect(f.native.discard).not.toHaveBeenCalled();
});
it('PERM-06 approximate-only location never reserves or begins a run',async()=>{
 const f=setup();await f.ready();f.native.permissions.mockResolvedValue({location:'approximate',gps:true,storageBytes:9999999});await expect(f.recorder.start()).rejects.toMatchObject({code:'PRECISE_LOCATION_REQUIRED'});expect(f.requests.some(r=>r.path==='/api/runs')).toBe(false);expect(f.native.start).not.toHaveBeenCalled();
});
it('LIFE-05 recreating the controller reuses the installed journal lease and finishes its upload without erasure',async()=>{
 const f=setup();await f.ready();f.saved({state:'UPLOADING',runId,pendingPoints:200});const body={batchKey:`${runId}:0`,points:[{seq:0}]};f.jobs([{id:body.batchKey,runId,action:'points',body},{id:'finish',runId,action:'finish',body:{}}]);
 const upgraded=createRecordingController({api:f.api,native:f.native,getAuth:()=>({status:'authenticated'})});upgraded.source.resume('owner');await tick();await tick();
 expect(f.requests.filter(r=>r.path.endsWith('/points'))).toHaveLength(1);expect(f.requests.find(r=>r.path.endsWith('/points')).body).toEqual(body);expect(upgraded.getSnapshot().lastFinished.run.status).toBe('PENDING_VALIDATION');expect(f.native.erase).not.toHaveBeenCalled();
});
it('AUTH-07 metadata from the prior runner never remains in the next account screen snapshot',async()=>{
 const f=setup();f.saved({state:'PAUSED',distanceM:9876,elapsedMs:123000,runId,simulated:true});await f.ready();f.recorder.source.pause('session-ended');expect(f.recorder.getSnapshot()).toMatchObject({state:'IDLE',distanceM:0,elapsedMs:0,runId:null,simulated:false,ownerId:null});expect(f.native.erase).not.toHaveBeenCalled();
});
