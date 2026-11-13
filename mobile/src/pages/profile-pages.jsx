import {useCallback,useState} from 'react';
import {Link} from 'react-router';
import {useAuth} from '../auth/context.jsx';
import {friendlyMessage} from '../auth/errors.js';
import {normalizeDisplayName} from '../auth/validation.js';
import {Notice} from '../components/forms.jsx';
import {useResource} from './settings-pages.jsx';
import {createConsentControls,discardSaved} from '../profile/consent-controls.js';
import {DISCARD_CONFIRMATION} from '../auth/pending-work.js';
import {Avatar,Button,Chip,Dialog,ErrorState,InlineNotice,ListRow,Sheet,Skeleton,Switch,TextField} from '../ui/index.jsx';

export function SettingsFrame({title,children}) {
  return <section><p className="eyebrow">Account settings</p><h1>{title}</h1>{children}</section>;
}
export function ResourceState({data,label}) {
  return data.phase==='loading'?<Skeleton label={`Loading ${label}…`}/>:data.phase==='error'?<ErrorState label="Try again" onRetry={data.reload}>{data.error}</ErrorState>:null;
}
export const HexAvatar = Avatar;
function ProfileForm({initial,options,regions,onSave}) {
  const [avatarId,setId]=useState(initial.avatarId),[avatarColor,setColor]=useState(initial.avatarColor),[picker,setPicker]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function submit(event) {
    event.preventDefault();const data=new FormData(event.currentTarget),displayName=normalizeDisplayName(String(data.get('displayName')));
    const bio=String(data.get('bio')).normalize('NFKC').trim();setError('');setMessage('');
    if(!displayName||[...bio].length>140){setError('Use a display name of 3–24 characters and a bio of at most 140.');return;}
    setBusy(true);
    try {await onSave({displayName,avatarId,avatarColor,preferredUnits:data.get('preferredUnits'),bio,homeRegionId:data.get('homeRegionId')||null});setMessage('Profile saved.');}
    catch(failure){setError(friendlyMessage(failure));}finally{setBusy(false);}
  }
  const colors={'#1F5A46':'Pine','#B8452A':'Clay','#14392C':'Deep pine','#5A5F58':'Stone','#1F2421':'Ink'};
  return <form onSubmit={submit} className="resource-content" aria-busy={busy}><fieldset disabled={busy}>
    <legend className="sr-only">Edit profile</legend>
    <TextField id="displayName" name="displayName" label="Display name" defaultValue={initial.displayName} autoComplete="nickname" required help="3–24 characters. A released name stays reserved for you for 30 days."/>
    <button type="button" className="avatar-picker-row ui-row" onClick={()=>setPicker(true)}><Avatar id={avatarId} color={avatarColor}/><span className="ui-row-label">Hex avatar</span><span>Change</span></button>
    {picker&&<Sheet title="Choose your hex" onClose={()=>setPicker(false)}><fieldset className="field"><legend>Hex avatar</legend><div className="avatar-grid">{options.avatarIds.map(id=><button type="button" key={id} aria-label={`Avatar ${id+1}`} aria-pressed={id===avatarId} onClick={()=>setId(id)}><Avatar id={id} color={avatarColor}/></button>)}</div></fieldset>
      <fieldset className="field"><legend>Avatar colour</legend><div className="colour-grid">{options.avatarColors.map(color=><Chip key={color} aria-label={colors[color]} selected={color===avatarColor} onClick={()=>setColor(color)}><span style={{backgroundColor:color}}/>{colors[color]}</Chip>)}</div></fieldset>
      <Button onClick={()=>setPicker(false)}>Done</Button></Sheet>}
    <div className="field"><label htmlFor="preferredUnits">Distance units</label><select id="preferredUnits" name="preferredUnits" defaultValue={initial.preferredUnits}><option value="km">Kilometres</option><option value="mi">Miles</option></select></div>
    <div className="field"><label htmlFor="bio">Bio</label><textarea id="bio" name="bio" defaultValue={initial.bio} rows={3} aria-describedby="bio-note"/><p id="bio-note" className="field-help">Optional. At most 140 characters. Keep private contact details out.</p></div>
    <div className="field"><label htmlFor="homeRegionId">Home region</label><select id="homeRegionId" name="homeRegionId" defaultValue={initial.homeRegionId||''}><option value="">No home region</option>{regions.map(region=><option key={region.id} value={region.id}>{region.name} · {region.city}</option>)}</select>{!regions.length&&<p className="field-help">No regions are available yet.</p>}</div>
    <Button type="submit">{busy?'Saving…':'Save profile'}</Button>
  </fieldset><Notice error>{error}</Notice><Notice>{message}</Notice></form>;
}
export function ProfilePage() {
  const {auth}=useAuth(),load=useCallback(()=>auth.api.request('/api/me/profile'),[auth]),data=useResource(load);
  const save=async body=>{await auth.api.request('/api/me/profile',{method:'PATCH',body});await auth.loadMe();};
  return <SettingsFrame title="Your profile"><ListRow to="/you/privacy" label="Privacy" value="Visibility & consent"/><ResourceState data={data} label="your profile"/>{data.phase==='ready'&&<ProfileForm initial={data.value.profile} options={data.value.options} regions={data.value.regions} onSave={save}/>}</SettingsFrame>;
}
function PrivacyForm({initial,save}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function submit(event) {
    event.preventDefault();const data=new FormData(event.currentTarget);setBusy(true);setError('');setMessage('');
    try {await save({profileVisibility:data.get('profileVisibility'),appearOnLeaderboards:data.has('appearOnLeaderboards'),shareRouteShapes:data.has('shareRouteShapes')});setMessage('Privacy choices saved.');}
    catch(failure){setError(friendlyMessage(failure));}finally{setBusy(false);}
  }
  return <form onSubmit={submit} className="resource-content"><fieldset disabled={busy}><legend className="sr-only">Privacy choices</legend>
    <label htmlFor="profileVisibility">Who can view your profile?</label><select id="profileVisibility" name="profileVisibility" defaultValue={initial.profileVisibility}>
      <option value="PRIVATE">Only me</option><option value="FOLLOWERS">My followers</option><option value="PUBLIC">Everyone</option></select>
    <p className="field-help">Private profiles appear as Runner to other people. Territory ownership still belongs to your account.</p>
    <Switch label="Appear on leaderboards" name="appearOnLeaderboards" defaultChecked={initial.appearOnLeaderboards}/>
    <Switch label="Share route shapes" name="shareRouteShapes" defaultChecked={initial.shareRouteShapes}/>
    <p className="small">Map and leaderboard features arrive with run recording. These choices are saved now.</p>
    <Button type="submit">{busy?'Saving…':'Save privacy choices'}</Button>
  </fieldset><Notice error>{error}</Notice><Notice>{message}</Notice></form>;
}
export function PrivacyPage() {
  const {auth}=useAuth(),load=useCallback(async()=>({...(await auth.api.request('/api/me/privacy')),...(await auth.api.request('/api/me/consents'))}),[auth]);
  const data=useResource(load);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[withdrawn,setWithdrawn]=useState(false),[confirmDiscard,setConfirmDiscard]=useState(false),[remaining,setRemaining]=useState(0);
  const controls=createConsentControls(auth);
  async function withdraw() {
    setBusy(true);setError('');
    try {await controls.withdraw(data.value.consents.find(row=>row.type==='LOCATION'));setRemaining(await auth.pendingCount());setWithdrawn(true);await data.reload();}
    catch(failure){setWithdrawn(true);setError(`Recording is stopped on this phone. Withdrawal was not saved: ${friendlyMessage(failure)} Retry when connected.`);setRemaining(await auth.pendingCount());}
    finally{setBusy(false);}
  }
  async function saved(action) {
    setBusy(true);setError('');try{if(action==='upload')await controls.uploadEarlier();else await discardSaved(controls,DISCARD_CONFIRMATION);setRemaining(await auth.pendingCount());setConfirmDiscard(false);}
    catch(failure){setError(friendlyMessage(failure));}finally{setBusy(false);}
  }
  return <SettingsFrame title="Privacy"><ResourceState data={data} label="privacy choices"/>{data.phase==='ready'&&<>
    <PrivacyForm initial={data.value.privacy} save={body=>auth.api.request('/api/me/privacy',{method:'PATCH',body})}/>
    <h2 className="section-title">Location consent</h2><p>Withdrawing stops recording on this phone immediately. Other devices must check the server before sending new points.</p>
    <Button variant="secondary" disabled={busy} onClick={withdraw}>{busy?'Working…':'Withdraw location consent'}</Button>
    <Link className="text-link" to="/you/consent">Read consent and history</Link>
  </>}{withdrawn&&<InlineNotice>Recording is stopped. {remaining?'Choose whether to upload the earlier points or discard them.':'There is no unsent data on this phone.'}</InlineNotice>}
    {withdrawn&&remaining>0&&<div className="stack"><Button variant="secondary" disabled={busy} onClick={()=>saved('upload')}>Upload earlier points</Button><Button variant="destructive" disabled={busy} onClick={()=>setConfirmDiscard(true)}>Discard saved points…</Button>
      {confirmDiscard&&<Dialog title="Discard saved points?" onClose={()=>setConfirmDiscard(false)}><p>This permanently erases the saved points. They cannot be recovered.</p><Button variant="destructive" disabled={busy} onClick={()=>saved('discard')}>Yes, discard saved points</Button><Button variant="secondary" onClick={()=>setConfirmDiscard(false)}>Keep encrypted points</Button></Dialog>}</div>}
    <Notice error>{error}</Notice></SettingsFrame>;
}
