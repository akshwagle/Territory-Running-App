import {useCallback,useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {useAuth} from '../auth/context.jsx';
import {useRecorder} from './context.jsx';
import {Button,Dialog,EmptyState,ErrorState,InlineNotice,ListRow,Section,Sheet,Skeleton,RunStats,RouteTrace} from '../ui/index.jsx';
import {useResource} from '../pages/settings-pages.jsx';
import {distanceLabel,timeLabel,paceLabel,routePaths,statusLabel} from './format.js';
import {ClaimResult} from './claim.jsx';

const safe=action=>()=>Promise.resolve().then(action).catch(()=>{});
function Stats({distanceM=0,durationS=0,units='km'}){return <RunStats time={timeLabel(durationS)} distance={distanceLabel(distanceM,units)} pace={paceLabel(distanceM,durationS,units)}/>;}
function useUnits(){const {auth}=useAuth(),{state}=useRecorder(),[units,setUnits]=useState(null);useEffect(()=>{let live=true;auth.api.request('/api/me/profile').then(data=>{if(live)setUnits(data.profile.preferredUnits);}).catch(()=>{});return()=>{live=false;};},[auth]);return units||state.units||'km';}
function PermissionFlow(){
 const {recorder,state}=useRecorder(),p=state.permissions||{},[working,setWorking]=useState(false);
 async function request(action,advance=true){setWorking(true);try{await recorder.permission(action);if(advance)recorder.nextPermission();}catch{/* Controller keeps the visible error. */}finally{setWorking(false);}}
 const refresh=()=>request('permissions',false),advance=()=>recorder.nextPermission();
 const panels={
  consent:<><h2>Read the current notices</h2><p>Recording needs your location, terms and privacy consent. Review the new location notice before your next run.</p><Button to="/you/consent" onClick={recorder.cancelFlow}>Review consent</Button></>,
  location:<><h2>Record your route</h2><p>Precise location measures your route and distance. We store the route encrypted on this phone before upload. Location runs only after the server confirms your start.</p>
    {p.location==='blocked'||p.location==='approximate'?<><InlineNotice>{p.location==='approximate'?'Approximate location cannot validate a route.':'Android has blocked further permission prompts.'} Open app settings → Permissions → Location, then enable Precise location.</InlineNotice><Button onClick={safe(recorder.openSettings)}>Open Android app settings</Button><Button variant="secondary" onClick={refresh}>Check permission again</Button></>:<Button loading={working} onClick={()=>request('requestLocation')}>Allow precise location</Button>}
    {p.location==='precise'&&<Button onClick={advance}>Continue</Button>}</>,
  background:<><h2>Keep recording screen off</h2><p>Background location keeps your acknowledged run recording when the screen locks or you use another app. It uses more battery and shows a recording notification. Choose “{p.backgroundLabel||'Allow all the time'}” in Android settings.</p>
    {!p.background&&<><Button loading={working} onClick={()=>request('requestBackground',false)}>Open background permission</Button><Button variant="secondary" onClick={refresh}>Check permission again</Button></>}
    <Button variant={p.background?'primary':'secondary'} onClick={advance}>{p.background?'Continue':'Use foreground only'}</Button>
    {!p.background&&<p className="small">Foreground only pauses when you leave this app or lock the screen. Keep the app visible.</p>}</>,
  notifications:<><h2>Controls while you run</h2><p>Allow notifications to see time, distance, Pause and Stop without opening the app. If declined, Android still runs its location service and lists it in Active apps; the drawer notification may be hidden.</p><Button loading={working} onClick={()=>request('requestNotifications')}>Allow recording notification</Button><Button variant="secondary" onClick={advance}>Continue without notification</Button></>,
  activity:<><h2>Optional step signal</h2><p>Activity recognition adds a step-count signal during GPS runs. It never replaces GPS distance. Declining does not affect your run or add a penalty.</p><Button loading={working} onClick={()=>request('requestActivity')}>Allow step signal</Button><Button variant="secondary" onClick={advance}>Continue without steps</Button></>,
  ready:<><h2>Ready when you are</h2><p>Starting needs a connection to reserve one run for this account. After confirmation, recording, pausing and finishing work offline; encrypted points upload when your connection returns.</p>{!p.background&&<InlineNotice>Foreground only: keep this app visible and the screen on.</InlineNotice>}<Button loading={state.busy} onClick={safe(()=>recorder.start())}>Start run</Button></>,
 };
 return <Sheet title="Before your run" onClose={recorder.cancelFlow}><div className="stack">{panels[state.flow]}{state.error&&<InlineNotice error>{state.error}</InlineNotice>}</div></Sheet>;
}
export function RunPage(){
 const {recorder,state}=useRecorder(),units=useUnits(),navigate=useNavigate(),[confirm,setConfirm]=useState(null),[guide,setGuide]=useState(false),[tools,setTools]=useState(false);
 const active=['ACTIVE','PAUSED'].includes(state.state),pending=['FINISHING','UPLOADING','DISCARDING'].includes(state.state);
 useEffect(()=>{if(['FINISHING','UPLOADING'].includes(state.state))navigate('/run/summary',{replace:true});},[state.state,navigate]);
 const notice=state.error||state.message||(state.foregroundOnly?'Foreground only. Keep this app visible and the screen on.':state.gettingGps?'Getting GPS signal. Distance starts with an accurate fix, or after 15 seconds.':state.weakGps&&state.state==='ACTIVE'?'Weak GPS. Points stay saved; gaps are kept separate.':'');
 return <section><p className="eyebrow">A little ground. A good run.</p><h1>{state.recovery?'Your saved run':state.state==='PAUSED'?'Run paused':'Run'}</h1>
   {notice&&<InlineNotice error={Boolean(state.error)}>{notice}</InlineNotice>}
   {!state.available&&!state.error&&<Skeleton label="Opening encrypted run storage…"/>}
   {state.available&&['IDLE','DONE'].includes(state.state)&&!state.remoteRun&&<><EmptyState title="Take it outside">GPS records your route. Standing still or using a treadmill records time, with no distance or territory. Steps-only runs are not supported.</EmptyState>
     <Button loading={state.busy} onClick={safe(recorder.prepare)}>{state.startPending?'Recover start confirmation':'Get ready to run'}</Button></>}
   {active&&<><Stats distanceM={state.distanceM} durationS={state.elapsedMs/1000} units={units}/>
     {state.simulated&&<InlineNotice>Simulated desk run. These points are marked mock and are not a real outdoor run.</InlineNotice>}
     <p className="small" role="status">{state.sync==='waiting'?'Waiting for signal':state.sync==='uploading'?'Uploading saved points…':'All saved'} · {state.pendingPoints||0} points waiting on this phone</p>
     {state.recovery&&<InlineNotice>{state.reboot?'Your phone restarted. Finish at the last saved point; no gap is filled.':'Recording was interrupted. Resume as a new segment, or finish the saved run. No location is invented for the gap.'}</InlineNotice>}
     {state.consentBlocked||state.pauseReason==='CONSENT_WITHDRAWN'?<InlineNotice>Location consent changed. Finish and upload only the earlier saved points, or discard this run.</InlineNotice>:state.reboot?null:<Button loading={state.busy} disabled={state.storageFailed} onClick={safe(state.state==='ACTIVE'?recorder.pause:recorder.resume)}>{state.state==='ACTIVE'?'Pause':state.recovery?'Resume your run':'Resume'}</Button>}
     <Button variant="secondary" disabled={state.busy||state.storageFailed} onClick={()=>setConfirm('finish')}>{state.reboot?'Finish saved run':'Finish run…'}</Button>
     <Button variant="destructive" disabled={state.busy} onClick={()=>setConfirm('discard')}>Discard run…</Button>
   </>}
   {pending&&<><InlineNotice>Your run is saved on this phone. {state.state==='DISCARDING'?'Reconnect to finish removing its server reservation.':'Uploads resume when connected.'}</InlineNotice><Button variant="secondary" onClick={safe(recorder.retry)}>Retry sync</Button></>}
   {state.storageFailed&&<Button onClick={safe(recorder.retryStorage)}>Retry storage</Button>}
   {state.remoteRun&&<Section title="A run is active elsewhere"><p>Resume it on its original phone, cancel this start, or end it here after ten minutes with no new points. This phone cannot take over its recording.</p><Button variant="secondary" onClick={safe(recorder.endStale)}>End inactive run</Button><Button variant="secondary" onClick={recorder.cancelFlow}>Cancel this start</Button></Section>}
   <Section><ListRow to="/run/history" label="Run history"/><ListRow label="Battery & recovery guide" onClick={()=>setGuide(true)}/></Section>
   {typeof __RUN_DEBUG__!=='undefined'&&__RUN_DEBUG__&&['IDLE','DONE'].includes(state.state)&&<Section title="Debug build only"><p className="small">Indoor simulation uses a clearly marked synthetic route. It still needs consent, permissions and an online start.</p><Button variant="secondary" onClick={safe(()=>recorder.start({simulated:true}))}>Start desk simulation</Button></Section>}
   {typeof __RUN_DEBUG__!=='undefined'&&__RUN_DEBUG__&&state.simulated&&active&&<ListRow label="Desk simulation tools" onClick={()=>setTools(true)}/>}
   {tools&&<Sheet title="Desk simulation only" onClose={()=>setTools(false)}><p>These controls feed mock points only to this app. Test a storage failure only while the phone stays open; Retry storage commits the held fix and pauses safely.</p><div className="stack"><Button variant="secondary" onClick={safe(async()=>{await recorder.debug('walk');setTools(false);})}>Feed walking points</Button><Button variant="secondary" onClick={safe(async()=>{await recorder.debug('still');setTools(false);})}>Feed stationary points</Button><Button variant="secondary" onClick={safe(async()=>{await recorder.debug('storage-failure');setTools(false);})}>Test storage stop</Button></div></Sheet>}
   {state.flow&&<PermissionFlow/>}
   {guide&&<Sheet title="Keep your run safe" onClose={()=>setGuide(false)}><p>Allow background location and keep the recording notification enabled. On Samsung, Xiaomi, Oppo and Vivo, restrictive battery settings may stop even a foreground service.</p><p>In Android battery settings, choose unrestricted battery use for Territory Run if you want screen-off recording. This uses more battery. After any interruption, reopen the app and choose Resume or Finish. Force-stop and a phone restart prevent collection until you reopen it; saved points stay encrypted.</p><Button onClick={safe(recorder.batterySettings)}>Open Android battery settings</Button></Sheet>}
   {confirm&&<Dialog title={confirm==='finish'?'Finish this run?':'Discard this run?'} onClose={()=>setConfirm(null)}><p>{confirm==='finish'?'Save your recorded points and upload when connected. Territory is calculated after upload.':`This erases the saved points and discards the server run when connected.${state.distanceM<200?' A short or accidental run can be discarded without a flag.':''}`}</p><Button variant={confirm==='finish'?'primary':'destructive'} onClick={safe(async()=>{if(confirm==='finish'){await recorder.finish();navigate('/run/summary',{replace:true});}else await recorder.discard();setConfirm(null);})}>{confirm==='finish'?'Yes, finish run':'Yes, discard run'}</Button><Button variant="secondary" onClick={()=>setConfirm(null)}>Keep recording data</Button></Dialog>}
 </section>;
}
export function RunSummaryPage(){
 const {recorder,state}=useRecorder(),units=useUnits(),run=state.lastFinished?.run;
 const hasRun=run||['FINISHING','UPLOADING'].includes(state.state);
 return <section><p className="eyebrow">Every bit counts</p><h1>Run saved</h1>{hasRun?<><Stats distanceM={run?.distanceM??state.distanceM} durationS={run?.durationS??state.elapsedMs/1000} units={units}/><p>{run?`Server totals · ${statusLabel(run.status).toLowerCase()}`:'Live estimate · encrypted on this phone until upload completes.'}</p>{run?<ClaimResult runId={run.id}/>:<InlineNotice>Territory is calculated after upload.</InlineNotice>}<p className="small" role="status">{run?'All saved':state.sync==='uploading'?'Uploading saved points…':'Waiting for signal. Keep this app installed; saved points are encrypted.'}</p>{state.error&&<InlineNotice error>{state.error}</InlineNotice>}{!run&&<Button variant="secondary" onClick={safe(recorder.retry)}>Retry upload</Button>}{run&&<ListRow to={`/run/history/${run.id}`} label="View run detail"/>}</>:<EmptyState title="Your runs are in history">No finished run is waiting on this phone.</EmptyState>}<ListRow to="/run/history" label="Run history"/><Button variant="secondary" to="/run">Back to Run</Button></section>;
}
export function RunHistoryPage(){
 const {auth,state:session}=useAuth(),units=useUnits(),[data,setData]=useState({phase:'loading',runs:[],cursor:null}),[attempt,setAttempt]=useState(0);
 const load=useCallback(async(cursor=null)=>{
   setData(old=>({...old,phase:cursor?'more':'loading',error:''}));
   try{const result=await auth.api.request(`/api/runs?active=false&limit=20${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);setData(old=>({phase:'ready',runs:cursor?[...new Map([...old.runs,...result.runs].map(run=>[run.id,run])).values()]:result.runs,cursor:result.nextCursor}));}
   catch(error){setData(old=>({...old,phase:'error',error:error.message}));}
 },[auth]);
 useEffect(()=>{let live=true;Promise.resolve().then(()=>{if(live)load();});return()=>{live=false;};},[load,attempt]);
 return <section><p className="eyebrow">Your time outside</p><h1>Run history</h1>{session.status==='offline'&&<InlineNotice>Offline. Your pending run remains encrypted on this phone; history needs a connection.</InlineNotice>}
   {data.phase==='loading'&&<Skeleton label="Loading your runs…"/>}{data.phase==='error'&&<ErrorState onRetry={()=>setAttempt(n=>n+1)}>{data.error}</ErrorState>}
   {!data.runs.length&&data.phase==='ready'&&<EmptyState title="Your first run starts here" action={<Button to="/run">Open Run</Button>}>Finished runs appear after upload. They stay private to your account in this build.</EmptyState>}
   <Section>{data.runs.map(run=><ListRow key={run.id} to={`/run/history/${run.id}`} label={new Date(run.startedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})} value={distanceLabel(run.distanceM,units)}><small className="row-support">{timeLabel(run.durationS)} · {run.mockGps?'Mock GPS · ':''}{statusLabel(run.status)}</small></ListRow>)}</Section>
   {data.cursor&&<Button variant="secondary" loading={data.phase==='more'} onClick={()=>load(data.cursor)}>Load more runs</Button>}
 </section>;
}
export function RunDetailPage(){
 const {id}=useParams(),{auth}=useAuth(),units=useUnits(),navigate=useNavigate(),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=useCallback(()=>auth.api.request(`/api/runs/${id}?pointLimit=1`),[auth,id]),data=useResource(load),run=data.value?.run;
 async function discard(){setBusy(true);try{await auth.api.request(`/api/runs/${id}`,{method:'DELETE',body:{}});navigate('/run/history',{replace:true});}catch(failure){setError(failure.message);}finally{setBusy(false);}}
 return <section><p className="eyebrow">Your recorded route</p><h1>Run detail</h1>{data.phase==='loading'&&<Skeleton label="Loading run…"/>}{data.phase==='error'&&<ErrorState onRetry={data.reload}>{data.error}</ErrorState>}{run&&<><p>{new Date(run.startedAt).toLocaleString()}</p><Stats distanceM={run.distanceM} durationS={run.durationS} units={units}/><InlineNotice>{run.mockGps?'This run contains mock GPS. ':''}{run.status==='PENDING_VALIDATION'?'Pending validation.':run.status==='ACTIVE'?'This run is still active. Open Run on its recording phone.':`Status: ${statusLabel(run.status).toLowerCase()}`}</InlineNotice>{!['ACTIVE','PENDING_VALIDATION'].includes(run.status)&&<ClaimResult runId={run.id}/>}{run.restricted&&<p>Part of this run was in an area where claiming is not allowed.</p>}<RouteTrace paths={routePaths(run.routeSegments)}/>{run.informationalReviews?.some(row=>row.code==='LONG_RUN')&&<p className="small">This long run has an informational review. It has not been rejected.</p>}{run.status!=='ACTIVE'&&<Button variant="destructive" onClick={()=>setConfirm(true)}>Discard this run…</Button>}</>}{error&&<InlineNotice error>{error}</InlineNotice>}{confirm&&<Dialog title="Discard this run?" onClose={()=>setConfirm(false)}><p>This removes the run from your history. It cannot be undone. Runs that already claimed territory cannot be discarded here.</p><Button variant="destructive" loading={busy} onClick={discard}>Yes, discard run</Button><Button variant="secondary" onClick={()=>setConfirm(false)}>Keep run</Button></Dialog>}</section>;
}
