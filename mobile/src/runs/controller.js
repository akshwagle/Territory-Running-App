import { ApiError } from '../auth/errors.js';
import { recordingDecision } from '../profile/consent-controls.js';

export function createRecordingController({api,native,getAuth,now=()=>Date.now(),random=Math.random}) {
  const debugBuild=typeof __RUN_DEBUG__!=='undefined'&&__RUN_DEBUG__;
  const clearRun={runId:null,distanceM:0,elapsedMs:0,pendingPoints:0,pointCount:0,pendingActions:0,recovery:false,reboot:false,simulated:false,foregroundOnly:false,storageFailed:false,rescueCount:0,weakGps:false,gettingGps:false,pauseReason:'',startPending:false,units:null,message:''};
  let state={...clearRun,state:'IDLE',available:false,ownerId:null,distanceM:0,elapsedMs:0,pendingPoints:0,busy:false,error:'',sync:'saved',flow:null};
  let owner=null,scope=null,generation=0,flushing=null,listening=null,allowedUpload=false,attempts=0,nextAttempt=0,rateLimited=false;
  const listeners=new Set();
  const set=patch=>{state={...state,...patch};for(const listener of listeners)listener();};
  const update=data=>{if(data&&owner&&(!scope||data.ownerScope===scope))set({...(data.state==='IDLE'?clearRun:{}),...data,ownerId:owner});};
  async function listen() {
    if(!listening)listening=(async()=>{
      await native.addListener('stateChanged',data=>{if(scope&&data.ownerScope===scope)update(data);});
      await native.addListener('syncDue',()=>{flush().catch(()=>{});});
    })().catch(error=>{listening=null;throw error;});
    return listening;
  }
  async function readyOwner(id) {
    const gen=++generation;owner=id;scope=null;allowedUpload=true;set({...clearRun,state:'IDLE',available:false,ownerId:id,error:'',flow:null,remoteRun:null,lastFinished:null});
    try {
      await listen();const device=await native.deviceInfo();if(gen!==generation)return;api.setInstallId(device.installId);
      const data=await native.setOwner({ownerId:id});if(gen!==generation)return;scope=data.ownerScope;update(data);set({available:true});
      if(allowedUpload)flush().catch(()=>{});
    } catch(error){if(gen===generation)set({error:error.message,available:false});}
  }
  async function perform(method,args) {
    if(state.busy)return;
    set({busy:true,error:''});
    try{const result=await native[method](args);update(result);return result;}
    catch(error){set({error:error.message});throw error;}
    finally{set({busy:false});}
  }
  async function flush({force=false}={}) {
    if(flushing)return flushing;
    if(!owner||!allowedUpload||(!force&&now()<nextAttempt)||(rateLimited&&now()<nextAttempt))return;
    const expectedOwner=owner,gen=generation;
    flushing=(async()=>{
      try{
        for(;;){
          if(!allowedUpload||expectedOwner!==owner||gen!==generation)return;
          const job=await native.nextUpload();if(expectedOwner!==owner||gen!==generation||!allowedUpload)return;
          if(!job.action){set({sync:'saved',error:state.error==='Waiting for signal.'?'':state.error});return;}
          set({sync:'uploading'});
          const path=`/api/runs/${job.runId}${job.action==='delete'?'':`/${job.action}`}`;
          const response=await api.request(path,{method:job.action==='delete'?'DELETE':'POST',body:job.body});
          if(expectedOwner!==owner||gen!==generation)return;
          const data=await native.acknowledge({id:job.id,response:response||{}});update(data);attempts=0;nextAttempt=0;rateLimited=false;set({error:''});
          if(data.completedRunId)set({...clearRun,state:data.discarded?'IDLE':'DONE',sync:'saved',lastFinished:{id:data.completedRunId,discarded:data.discarded,run:response?.run||null},error:''});
          if(response?.recordingAllowed===false){await native.suspend({reason:'consent-withdrawn'});allowedUpload=false;set({sync:'waiting',consentBlocked:true,error:'Location consent changed. Recording stopped. Choose whether to upload the earlier points or discard the saved run.'});return;}
        }
      }catch(error){
        if(gen!==generation||expectedOwner!==owner)return;
        rateLimited=error.status===429;
        nextAttempt=now()+Math.max((error.retryAfter||0)*1000,Math.min(60000,1000*2**Math.min(attempts++,6))*(.8+random()*.4));
        if(error.code==='CONSENT_REQUIRED'){allowedUpload=false;await native.suspend({reason:'consent-withdrawn'}).catch(()=>{});set({consentBlocked:true});}
        set({sync:'waiting',error:['NETWORK_UNAVAILABLE','REQUEST_TIMEOUT'].includes(error.code)?'Waiting for signal.':`${error.message} Saved data stays encrypted on this phone.`});
        throw error;
      }finally{flushing=null;}
    })();return flushing;
  }
  async function prepare() {
    if(!owner||getAuth().status!=='authenticated')throw new ApiError('ONLINE_START_REQUIRED','Connect and confirm your sign-in before starting a new run. An acknowledged run can continue offline.');
    set({busy:true,error:'',flow:null});
    try{
      const saved=await native.snapshot();update(saved);
      if(saved.state!=='IDLE')return;
      const notices=await api.request('/api/me/consents');
      if(!recordingDecision(notices.consents,'precise').allowed){set({flow:'consent'});return;}
      const permission=await native.permissions();set({permissions:permission,flow:permission.location==='precise'?'background':'location'});
      if(permission.location==='precise'&&permission.background)set({flow:permission.notifications?'activity':'notifications'});
      if(permission.location==='precise'&&permission.background&&permission.notifications&&permission.activity)set({flow:'ready'});
    }catch(error){set({error:error.message});throw error;}finally{set({busy:false});}
  }
  async function permission(action) {
    const result=await perform(action);const current=await native.permissions();set({permissions:current});return result;
  }
  function nextPermission() {
    const flow=state.flow,p=state.permissions;
    if(flow==='location'){if(p.location==='precise')set({flow:p.background?(p.notifications?'activity':'notifications'):'background'});}
    else if(flow==='background')set({flow:p.notifications?'activity':'notifications'});
    else if(flow==='notifications')set({flow:p.activity?'ready':'activity'});
    else if(flow==='activity')set({flow:'ready'});
  }
  async function start({simulated=false}={}) {
    if(state.busy)return;
    if(simulated&&!debugBuild)throw new ApiError('SIMULATOR_DEBUG_ONLY','Simulation is only available in a debug build.');
    if(!owner||getAuth().status!=='authenticated')throw new ApiError('ONLINE_START_REQUIRED','Reconnect before starting a new run.');
    set({busy:true,error:''});let reserved=null;
    try{
      const p=await native.permissions();if(p.location!=='precise')throw new ApiError('PRECISE_LOCATION_REQUIRED','Choose Precise location in Android settings before recording.');
      if(!p.gps)throw new ApiError('GPS_DISABLED','Turn on Location services before starting.');
      if(p.storageBytes<5*1024*1024)throw new ApiError('LOW_STORAGE','Free at least 5 MB of phone storage before starting a run.');
      const device=await native.deviceInfo();api.setInstallId(device.installId);
      const profile=await api.request('/api/me/profile');
      const existing=await native.intent();
      const body=existing.clientRunId?existing:await native.prepareIntent({body:{clientRunId:crypto.randomUUID(),startedAt:new Date(+api.serverNow()-1000).toISOString(),device}});
      const created=await api.request('/api/runs',{method:'POST',body});reserved=created.run;
      update(await native.start({run:created.run,serverTime:created.serverTime||api.serverNow().toISOString(),miles:profile.profile.preferredUnits==='mi',simulated}));
      if(debugBuild&&simulated)await native.debugFeed({mode:'walk'});
      set({flow:null,remoteRun:null,consentBlocked:false,lastFinished:null});
    }catch(error){
      if(error.status&&[400,403,409,410,426].includes(error.status))await native.clearIntent().catch(()=>{});
      if(error.code==='RUN_ACTIVE_ELSEWHERE'){
        const active=await api.request('/api/runs?active=true&limit=1');set({remoteRun:active.runs[0]||null,flow:null});
      }
      if(reserved){
        const saved=await native.snapshot().catch(()=>null);
        if(saved?.runId===reserved.id)update(saved);
        else try{await api.request(`/api/runs/${reserved.id}`,{method:'DELETE',body:{}});await native.clearIntent();}catch{/* Preserve the start intent until the reservation can be recovered. */}
      }
      set({error:error.message});throw error;
    }finally{set({busy:false});}
  }
  async function finish(){const result=await perform('finish');flush({force:true}).catch(()=>{});return result;}
  async function discard(){const result=await perform('discard');flush({force:true}).catch(()=>{});return result;}
  const source={
    resume(id){if(owner!==id){readyOwner(id).catch(()=>{});return;}allowedUpload=true;flush().catch(()=>{});},
    pause(reason='session-ended'){allowedUpload=false;if(reason==='connection'){set({sync:'waiting'});return;}if(reason==='initializing')return;generation++;scope=null;owner=null;native.suspend({reason}).catch(error=>set({error:error.message}));set({...clearRun,state:'IDLE',available:false,ownerId:null,lastFinished:null});},
    stopRecording:async(id,reason)=>{if(owner===id){if(reason==='consent-withdrawn'){allowedUpload=false;set({consentBlocked:true});}update(await native.suspend({reason}));}},
    count:async id=>(await native.count({ownerId:id})).count,
    countAll:async()=>(await native.countAll()).count,
    async upload(id){if(owner!==id)throw new ApiError('UNAUTHORIZED','Sign in to the account that owns this run first.');allowedUpload=true;await flush({force:true});},
    async discard(id,_confirmation,{eraseAccount=false}={}){if(eraseAccount){await native.erase({ownerId:id});if(owner===id)set({...clearRun,state:'IDLE'});return;}if(owner!==id)throw new ApiError('UNAUTHORIZED','Sign in to discard this account’s saved run.');await discard();},
  };
  return {getSnapshot:()=>state,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},source,prepare,permission,nextPermission,start,
    pause:()=>perform('pause'),resume:()=>{if(state.consentBlocked||state.pauseReason==='CONSENT_WITHDRAWN')return Promise.reject(new ApiError('CONSENT_REQUIRED','Finish or discard this run before starting another under accepted notices.'));return perform('resume').then(async result=>{if(debugBuild&&state.simulated)await native.debugFeed({mode:'walk'});return result;});},finish,discard,retry:()=>flush({force:true}),retryStorage:()=>perform('retryStorage'),
    openSettings:()=>permission('openSettings'),batterySettings:()=>native.batterySettings(),
    async debug(action){if(!debugBuild)throw new ApiError('SIMULATOR_DEBUG_ONLY','Desk tools are not available in this build.');return action==='storage-failure'?perform('debugStorageFault'):perform('debugFeed',{mode:action});},
    cancelFlow:()=>set({flow:null,remoteRun:null,error:''}),
    async endStale(){if(!state.remoteRun)return;set({busy:true,error:''});try{await api.request(`/api/runs/${state.remoteRun.id}/end-stale`,{method:'POST',body:{}});set({remoteRun:null,error:''});}catch(error){set({error:error.message});throw error;}finally{set({busy:false});}},
  };
}
