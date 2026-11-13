import {useCallback,useState} from 'react';
import {useNavigate} from 'react-router';
import {useAuth} from '../auth/context.jsx';
import {friendlyMessage} from '../auth/errors.js';
import {Notice} from '../components/forms.jsx';
import {useResource} from './settings-pages.jsx';
import {SettingsFrame,ResourceState} from './profile-pages.jsx';
import {exportShare} from '../profile/export-share.js';
import {recordingDecision} from '../profile/consent-controls.js';
import {Button,Dialog,EmptyState,TextField} from '../ui/index.jsx';

export function ConsentPage() {
  const {auth}=useAuth(),load=useCallback(()=>auth.api.request('/api/me/consents'),[auth]),data=useResource(load);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function accept() {
    setBusy(true);setError('');setMessage('');
    try {
      for(const consent of data.value.consents)if(!consent.accepted)await auth.api.request('/api/me/consents',{
        method:'POST',ifMatch:consent.etag,body:{type:consent.type,version:consent.version,accepted:true}});
      setMessage('Your consent choices are saved.');await data.reload();
    } catch(failure){setError(friendlyMessage(failure));await data.reload();}finally{setBusy(false);}
  }
  return <SettingsFrame title="Consent"><p className="small">Android edition {__APP_VERSION__}</p>
    <p>Read these notices before your first run. No location is collected in this build. You can use account settings without accepting.</p>
    <ResourceState data={data} label="consent notices"/>{data.phase==='ready'&&<>
      {data.value.consents.map(row=><article className="consent-card" key={row.type}><h2>{row.title}</h2><p>{row.text}</p><p className="small">Version {row.version} · {row.accepted?'Accepted':'Acceptance needed'}</p></article>)}
      <Button disabled={busy||data.value.consents.every(c=>c.accepted)} onClick={accept}>{busy?'Saving…':data.value.consents.every(c=>c.accepted)?'Current notices accepted':'Accept current notices'}</Button>
      <p className="small">Withdraw location consent at any time in Privacy. It stops recording; you choose what happens to unsent points.</p>
      <h2 className="section-title">Precise location</h2><p>{recordingDecision(data.value.consents,'approximate').reason==='PRECISE_LOCATION_REQUIRED'?recordingDecision(data.value.consents,'approximate').message:'When recording arrives, it will need precise location to validate your route. Approximate location cannot be used for a run.'} Android will ask only when recording is available.</p>
      <details><summary>Consent history ({data.value.history.length})</summary>{data.value.history.length?<ul className="resource-list">{data.value.history.map(row=><li key={row.id}><strong>{row.type} · {row.accepted?'Accepted':'Withdrawn'}</strong><span>Version {row.version}</span><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time></li>)}</ul>:<p>You have not recorded any consent choices.</p>}</details>
    </>}<Notice error>{error}</Notice><Notice>{message}</Notice></SettingsFrame>;
}

export function ExportPage({sharing=exportShare}) {
  const {auth}=useAuth();
  const [job,setJob]=useState(null),[payload,setPayload]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function requestExport() {
    setBusy(true);setError('');setMessage('');setPayload(null);
    try {const result=await auth.api.request('/api/me/export',{method:'POST',body:{}});setJob(result.export);setMessage('Export requested. Check when it is ready.');}
    catch(failure){setError(friendlyMessage(failure));}finally{setBusy(false);}
  }
  async function check() {
    setBusy(true);setError('');
    try {
      const result=await auth.api.request(`/api/me/export/${job.id}`);
      if(result.export){setJob(result.export);setMessage('Your export is still being prepared. Check again shortly.');}
      else {setPayload(result);setMessage('Your JSON export is ready to share.');}
    } catch(failure){setError(friendlyMessage(failure));}finally{setBusy(false);}
  }
  async function share() {
    setBusy(true);setError('');setMessage('');
    try {await sharing.send(payload);setPayload(null);setMessage('Share flow finished. The temporary file was removed from this app. A copy you shared belongs to the receiving app.');}
    catch(failure){setError(friendlyMessage(failure));}finally{setBusy(false);}
  }
  return <SettingsFrame title="Export my data"><p>Your JSON file includes your profile, consent history, runs and points, flags, team and notifications. Other runners are labelled Runner.</p>
    <p>It is available for 24 hours, one export at a time. Sharing uses a temporary app-cache file, removed when you return from sharing. Keep the copy private; it may contain your routes.</p>
    {!job&&<EmptyState title="A copy for you">No export requested on this screen yet. Requesting again will reuse your active export.</EmptyState>}
    <div className="stack"><Button disabled={busy} onClick={requestExport}>{busy?'Working…':'Request export'}</Button>
      {job&&<><p className="small">Available until {new Date(job.expiresAt).toLocaleString()}</p><Button variant="secondary" disabled={busy} onClick={check}>Check export</Button></>}
      {payload&&<Button disabled={busy} onClick={share}>Share JSON</Button>}
    </div><Notice error>{error}</Notice><Notice>{message}</Notice></SettingsFrame>;
}

export function DeletePage() {
  const {auth}=useAuth(),navigate=useNavigate(),load=useCallback(()=>auth.api.request('/api/auth/identities'),[auth]),methods=useResource(load);
  const [method,setMethod]=useState('password'),[stage,setStage]=useState('form'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [request,setRequest]=useState(null),[fieldErrors,setFieldErrors]=useState({});
  async function finish(body) {
    setBusy(true);setError('');
    try {await auth.deleteAccount(body);navigate('/login',{replace:true});}
    catch(failure){setError(friendlyMessage(failure));}finally{setBusy(false);}
  }
  async function submit(event) {
    event.preventDefault();setError('');setFieldErrors({});
    const data=new FormData(event.currentTarget),confirmation=data.get('confirmation');
    if(confirmation!=='DELETE'){setFieldErrors({confirmation:'Type DELETE exactly to confirm.'});event.currentTarget.elements.namedItem('confirmation')?.focus();return;}
    const providers=methods.value.identities.map(row=>row.provider),chosen=providers.includes('PASSWORD')?method:'google';
    const body={confirmation,method:chosen,...(chosen==='password'?{password:data.get('password')}: {})};
    if(chosen==='password'&&!body.password){setFieldErrors({password:'Enter your password to confirm deletion.'});event.currentTarget.elements.namedItem('password')?.focus();return;}
    setBusy(true);
    try {if(await auth.pendingCount()){setRequest(body);setStage('unsent');}else await finish(body);}
    catch(failure){setError(friendlyMessage(failure));}finally{setBusy(false);}
  }
  return <SettingsFrame title="Delete account"><p>This permanently deletes your live account, runs, points, sessions, notifications and owned territory. Your consent and name history are erased. Audit actions keep their type and time with your identity redacted.</p>
    <p>Your team passes to its longest-standing member, or is disbanded if you are alone. Copies already exported or shared cannot be recalled.</p>
    <ResourceState data={methods} label="sign-in methods"/>{methods.phase==='ready'&&stage==='form'&&<form onSubmit={submit}><fieldset disabled={busy}><legend className="sr-only">Confirm account deletion</legend>
      {methods.value.identities.length===0?<Notice error>No sign-in method is available. Refresh or contact support before deleting.</Notice>:<>
        {methods.value.identities.some(r=>r.provider==='PASSWORD')&&methods.value.identities.some(r=>r.provider==='GOOGLE')&&<><label htmlFor="deleteMethod">Confirm with</label><select id="deleteMethod" value={method} onChange={e=>setMethod(e.target.value)}><option value="password">Password</option><option value="google">Fresh Google sign-in</option></select></>}
        {methods.value.identities.some(r=>r.provider==='PASSWORD')&&method==='password'?<TextField id="deletePassword" label="Password" error={fieldErrors.password} name="password" type="password" autoComplete="current-password"/>:<p>A fresh native Google account picker opens after you confirm. Choose the Google account linked to this account.</p>}
        <TextField id="confirmation" label="Type DELETE" error={fieldErrors.confirmation} name="confirmation" autoComplete="off" autoCapitalize="characters" spellCheck={false}/>
        <Button variant="destructive" type="submit">{busy?'Deleting…':'Delete my account'}</Button>
      </>}
    </fieldset></form>}{stage==='unsent'&&<Dialog title="Erase unsent data too?" onClose={()=>{setRequest(null);setStage('form');}}><p>There is encrypted unsent data on this phone. Deleting this account also permanently erases that data. It cannot be recovered.</p>
      <Button variant="destructive" disabled={busy} onClick={()=>finish({...request,eraseUnsent:true})}>{busy?'Deleting…':'Yes, erase unsent data and delete account'}</Button>
      <Button variant="secondary" disabled={busy} onClick={()=>{setRequest(null);setStage('form');}}>Keep account and data</Button>
    </Dialog>}<Notice error>{error}</Notice></SettingsFrame>;
}
