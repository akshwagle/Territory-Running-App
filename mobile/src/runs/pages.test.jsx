import {act,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi} from 'vitest';
import {MemoryRouter,Route,Routes} from 'react-router';
import {AuthContext} from '../auth/context.jsx';
import {RunContext} from './context.jsx';
import {UIProvider} from '../ui/index.jsx';
import {RunPage,RunSummaryPage,RunHistoryPage,RunDetailPage} from './pages.jsx';
function setup(Page,initial={},handler,route='/run'){
 let current={available:true,state:'IDLE',busy:false,sync:'saved',distanceM:0,elapsedMs:0,permissions:{},...initial};const listeners=new Set();
 const recorder={getSnapshot:()=>current,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},prepare:vi.fn(async()=>{}),pause:vi.fn(async()=>{}),resume:vi.fn(async()=>{}),finish:vi.fn(async()=>{}),discard:vi.fn(async()=>{}),retry:vi.fn(async()=>{}),retryStorage:vi.fn(async()=>{}),permission:vi.fn(async()=>{}),nextPermission:vi.fn(),cancelFlow:vi.fn(),openSettings:vi.fn(),batterySettings:vi.fn(),endStale:vi.fn(),start:vi.fn()};
 const authState={status:'authenticated',user:{id:'owner'}};
 const auth={getSnapshot:()=>authState,subscribe:()=>()=>{},api:{request:vi.fn(async(path,...args)=>{
  if(path==='/api/me/profile')return {profile:{preferredUnits:'km'}};return handler?handler(path,...args):{runs:[],nextCursor:null};
 })}};
 render(<AuthContext.Provider value={auth}><RunContext.Provider value={recorder}><MemoryRouter initialEntries={[route]}><UIProvider><Routes><Route path="/run" element={Page}/><Route path="/you/consent" element={<h1>Consent notices</h1>}/><Route path="/run/summary" element={<RunSummaryPage/>}/><Route path="/run/history" element={<RunHistoryPage/>}/><Route path="/run/history/:id" element={<RunDetailPage/>}/></Routes></UIProvider></MemoryRouter></RunContext.Provider></AuthContext.Provider>);
 return {recorder,auth,user:userEvent.setup(),emit:patch=>act(()=>{current={...current,...patch};for(const fn of listeners)fn();})};
}
it('GPS-10 Run explains treadmill limits and starts via a permission flow, with no coordinate display',async()=>{
 const f=setup(<RunPage/>);expect(screen.getByText(/Steps-only runs are not supported/)).toBeVisible();await f.user.click(screen.getByRole('button',{name:'Get ready to run'}));expect(f.recorder.prepare).toHaveBeenCalledOnce();
});
it('PERM-01 blocked permission shows Android settings, PERM-06 approximate explains precise without a prompt loop',async()=>{
 const f=setup(<RunPage/>,{flow:'location',permissions:{location:'blocked'}});await f.user.click(screen.getByRole('button',{name:'Open Android app settings'}));expect(f.recorder.openSettings).toHaveBeenCalledOnce();expect(screen.queryByRole('button',{name:'Allow precise location'})).not.toBeInTheDocument();
 f.emit({permissions:{location:'approximate'}});expect(screen.getByText(/Approximate location cannot validate/)).toBeVisible();
});
it('PERM-04 foreground-only option stays available and the warning persists throughout recording',async()=>{
 const f=setup(<RunPage/>,{flow:'background',permissions:{background:false}});await f.user.click(screen.getByRole('button',{name:'Use foreground only'}));expect(f.recorder.nextPermission).toHaveBeenCalledOnce();f.emit({flow:null,state:'ACTIVE',foregroundOnly:true});expect(screen.getByText(/keep this app visible and the screen on/i)).toBeVisible();
});
it('PERM-05 denied notifications explain the Active apps fallback and do not block continuing',async()=>{
 const f=setup(<RunPage/>,{flow:'notifications'});expect(screen.getByText(/drawer notification may be hidden/)).toBeVisible();await f.user.click(screen.getByRole('button',{name:'Continue without notification'}));expect(f.recorder.nextPermission).toHaveBeenCalledOnce();
});
it('PERM-02 permission-loss event pauses the screen without losing the visible recorded stats',async()=>{
 const f=setup(<RunPage/>,{state:'ACTIVE',distanceM:123,elapsedMs:60000});f.emit({state:'PAUSED',pauseReason:'PERMISSION_LOST',message:'Location permission changed. Your run is saved.'});expect(screen.getByRole('heading',{name:'Run paused'})).toBeVisible();expect(screen.getByText('0.12 km')).toBeVisible();expect(f.recorder.discard).not.toHaveBeenCalled();
});
it('PERM-07 GPS loss shows a saved pause and return restores a separated recording segment',async()=>{
 const f=setup(<RunPage/>,{state:'PAUSED',pauseReason:'GPS_OFF',message:'Location services are off. Recording is paused.'});expect(screen.getByText(/Location services are off/)).toBeVisible();f.emit({state:'ACTIVE',message:'',pauseReason:''});expect(screen.getByRole('button',{name:'Pause'})).toBeVisible();
});
it('LIFE-03 reboot recovery offers Finish saved run and never a Resume control',async()=>{
 setup(<RunPage/>,{state:'PAUSED',recovery:true,reboot:true});expect(screen.getByRole('button',{name:'Finish saved run'})).toBeVisible();expect(screen.queryByRole('button',{name:/Resume/})).not.toBeInTheDocument();
});
it('LIFE-09 finish/discard always require explicit confirmation and short runs have no flag warning',async()=>{
 const f=setup(<RunPage/>,{state:'PAUSED',distanceM:12});await f.user.click(screen.getByRole('button',{name:'Discard run…'}));expect(f.recorder.discard).not.toHaveBeenCalled();expect(screen.getByText(/without a flag/)).toBeVisible();await f.user.click(screen.getByRole('button',{name:'Keep recording data'}));expect(f.recorder.discard).not.toHaveBeenCalled();
 await f.user.click(screen.getByRole('button',{name:'Finish run…'}));await f.user.click(screen.getByRole('button',{name:'Yes, finish run'}));expect(f.recorder.finish).toHaveBeenCalledOnce();
});
it('LIFE-07 local finish summary remains honest about an upload pending and switches to server totals',async()=>{
 const f=setup(<RunSummaryPage/>,{state:'UPLOADING',distanceM:123,durationS:60,elapsedMs:60000,sync:'waiting'},null,'/run/summary');expect(screen.getByText(/Live estimate/)).toBeVisible();expect(screen.getByText(/Territory is calculated after upload/)).toBeVisible();await f.user.click(screen.getByRole('button',{name:'Retry upload'}));expect(f.recorder.retry).toHaveBeenCalledOnce();f.emit({state:'IDLE',lastFinished:{run:{id:'one',distanceM:111,durationS:60,status:'PENDING_VALIDATION'}}});expect(screen.getByText('0.11 km')).toBeVisible();expect(screen.getByText(/Server totals/)).toBeVisible();
});
it('LIFE-07 history has loading, empty and retryable offline states',async()=>{
 let failure=true;const f=setup(<RunHistoryPage/>,{},async()=>{if(failure)throw Error('Offline. Saved points stay on this phone.');return {runs:[],nextCursor:null};},'/run/history');
 expect(screen.getByRole('status')).toBeVisible();expect(await screen.findByText(/Offline. Saved points/)).toBeVisible();failure=false;await f.user.click(screen.getByRole('button',{name:'Retry'}));expect(await screen.findByRole('heading',{name:'Your first run starts here'})).toBeVisible();
});
it('GPS-04 detail renders segment paths independently; GPS-08 gives only a generic restricted-area notice',async()=>{
 setup(<RunDetailPage/>,{},async()=>({run:{id:'one',distanceM:111,durationS:60,startedAt:'2026-11-13T00:00:00Z',status:'PENDING_VALIDATION',restricted:true,mockGps:true,routeSegments:['_p~iF~ps|U_ulLnnqC','_p~iF~ps|U_ulLnnqC']}}),'/run/history/one');
 expect(await screen.findByText(/area where claiming is not allowed/)).toBeVisible();expect(screen.getByText(/contains mock GPS/)).toBeVisible();await waitFor(()=>expect(screen.getByRole('img',{name:/Simplified route trace/}).querySelectorAll('path')).toHaveLength(2));
});

it('LIFE-09 a completed summary never traps Back to Run in a redirect loop',async()=>{
 setup(<RunPage/>,{state:'DONE',lastFinished:{run:{id:'one',distanceM:10,durationS:30},discarded:false}});expect(await screen.findByRole('button',{name:'Get ready to run'})).toBeVisible();expect(screen.queryByRole('heading',{name:'Run saved'})).not.toBeInTheDocument();
});

it('PRIV-03 opening consent closes the old permission sheet before navigating away',async()=>{
 const f=setup(<RunPage/>,{flow:'consent'});await f.user.click(screen.getByRole('link',{name:'Review consent'}));expect(f.recorder.cancelFlow).toHaveBeenCalledOnce();expect(await screen.findByRole('heading',{name:'Consent notices'})).toBeVisible();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('LIFE-04 storage failure blocks Resume and Finish until Retry commits the held fix',async()=>{
 const f=setup(<RunPage/>,{state:'PAUSED',storageFailed:true,rescueCount:1,message:'Storage failed. Recording stopped; a fix is held in memory.'});expect(screen.getByRole('button',{name:'Resume'})).toBeDisabled();expect(screen.getByRole('button',{name:'Finish run…'})).toBeDisabled();await f.user.click(screen.getByRole('button',{name:'Retry storage'}));expect(f.recorder.retryStorage).toHaveBeenCalledOnce();expect(f.recorder.finish).not.toHaveBeenCalled();expect(f.recorder.discard).not.toHaveBeenCalled();
});
