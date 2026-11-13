import {useCallback,useRef,useState} from 'react';
import {useAuth} from '../auth/context.jsx';
import {friendlyMessage} from '../auth/errors.js';
import {normalizeDisplayName} from '../auth/validation.js';
import {Notice} from '../components/forms.jsx';
import {useResource} from './settings-pages.jsx';
import {createConsentControls,discardSaved} from '../profile/consent-controls.js';
import {DISCARD_CONFIRMATION} from '../auth/pending-work.js';
import {Avatar,Button,Chip,Dialog,ErrorState,InlineNotice,ListRow,Section,Sheet,Skeleton,Switch,TextField} from '../ui/index.jsx';

export function SettingsFrame({title,children}) {
  return <section><p className="eyebrow">Account settings</p><h1>{title}</h1>{children}</section>;
}
export function ResourceState({data,label}) {
  return data.phase==='loading'?<Skeleton label={`Loading ${label}…`}/>:data.phase==='error'?<ErrorState label="Try again" onRetry={data.reload}>{data.error}</ErrorState>:null;
}
export const HexAvatar = Avatar;
const profileValues = profile => ({displayName:profile.displayName,avatarId:profile.avatarId,avatarColor:profile.avatarColor,
  preferredUnits:profile.preferredUnits,bio:profile.bio||'',homeRegionId:profile.homeRegionId||null});
const COLORS={'#1F5A46':'Pine','#B8452A':'Clay','#14392C':'Deep pine','#5A5F58':'Stone','#1F2421':'Ink'};
function ProfileForm({initial,options,regions,onSave}) {
  const [draft,setDraft]=useState(()=>profileValues(initial)),[baseline,setBaseline]=useState(()=>profileValues(initial));
  const [editor,setEditor]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[fieldError,setFieldError]=useState('');
  const editorForm=useRef(null),saving=useRef(false);
  const dirty=JSON.stringify(draft)!==JSON.stringify(baseline);
  const region=regions.find(row=>row.id===draft.homeRegionId);
  function open(field){setFieldError('');setEditor(field);}
  function readEditor(){
    const form=editorForm.current;if(!form)return {};
    const data=new FormData(form);
    if(editor==='displayName')return {displayName:String(data.get('displayName')||'')};
    if(editor==='bio')return {bio:String(data.get('bio')||'')};
    if(editor==='preferredUnits')return {preferredUnits:data.get('preferredUnits')};
    if(editor==='homeRegionId')return {homeRegionId:data.get('homeRegionId')||null};
    return {};
  }
  // Back/Close keeps edits in this page's in-memory draft. Only Save writes.
  function close(){const values=readEditor();setDraft(old=>({...old,...values}));setEditor(null);setFieldError('');}
  function done(event){
    event.preventDefault();const values=readEditor();
    if(editor==='displayName'&&!normalizeDisplayName(values.displayName)){setFieldError('Use a display name of 3–24 characters.');return;}
    if(editor==='bio'&&[...values.bio].length>140){setFieldError('Keep your bio to 140 characters.');return;}
    setDraft(old=>({...old,...values}));setEditor(null);setFieldError('');
  }
  async function save(){
    if(saving.current)return;
    const displayName=normalizeDisplayName(draft.displayName),bio=draft.bio.normalize('NFKC').trim();setError('');setMessage('');
    if(!displayName){setEditor('displayName');setFieldError('Use a display name of 3–24 characters.');return;}
    if([...bio].length>140){setEditor('bio');setFieldError('Keep your bio to 140 characters.');return;}
    const body={...draft,displayName,bio};saving.current=true;setBusy(true);
    try{await onSave(body);setDraft(body);setBaseline(body);setMessage('Profile saved.');}
    catch(failure){if(failure.code==='DISPLAY_NAME_UNAVAILABLE'){setEditor('displayName');setFieldError(friendlyMessage(failure));}else setError(friendlyMessage(failure));}
    finally{saving.current=false;setBusy(false);}
  }
  const titles={displayName:'Edit display name',bio:'Your bio',preferredUnits:'Distance units',homeRegionId:'Home region',avatar:'Choose your hex'};
  return <div className="profile-overview resource-content" aria-busy={busy}>
    <div className="profile-identity"><button type="button" className="profile-avatar" aria-label="Change hex avatar" disabled={busy} onClick={()=>open('avatar')}><Avatar id={draft.avatarId} color={draft.avatarColor} size={72}/><span>Change</span></button>
      <div><p className="eyebrow">Your profile</p><h1><bdi>{draft.displayName}</bdi></h1></div></div>
    <Section title="About you"><ListRow label="Display name" value={draft.displayName} onClick={()=>open('displayName')} disabled={busy}/>
      <ListRow label="Bio" value={draft.bio?'Edit':'Add'} onClick={()=>open('bio')} disabled={busy}>{draft.bio&&<small className="row-support" dir="auto">{draft.bio}</small>}</ListRow>
      <ListRow label="Home region" value={region?region.name:'Not set'} onClick={()=>open('homeRegionId')} disabled={busy}/></Section>
    <Section title="Preferences"><ListRow id="preferredUnits" label="Distance units" value={draft.preferredUnits==='mi'?'Miles':'Kilometres'} onClick={()=>open('preferredUnits')} disabled={busy}/>
      <ListRow to="/you/privacy" label="Privacy" value="Visibility & consent"/></Section>
    {dirty&&<div className="save-actions"><span className="small" role="status">Unsaved changes</span><Button loading={busy} onClick={save}>{busy?'Saving…':'Save profile'}</Button></div>}
    <Notice error>{error}</Notice><Notice>{message}</Notice>
    {editor&&<Sheet title={titles[editor]} onClose={close}>
      {editor==='avatar'?<><fieldset className="field" disabled={busy}><legend>Hex avatar</legend><div className="avatar-grid">{options.avatarIds.map(id=><button type="button" key={id} aria-label={`Avatar ${id+1}`} aria-pressed={id===draft.avatarId} onClick={()=>setDraft(old=>({...old,avatarId:id}))}><Avatar id={id} color={draft.avatarColor}/></button>)}</div></fieldset>
        <fieldset className="field"><legend>Avatar colour</legend><div className="colour-grid">{options.avatarColors.map(color=><Chip key={color} aria-label={COLORS[color]} selected={color===draft.avatarColor} onClick={()=>setDraft(old=>({...old,avatarColor:color}))}><span style={{backgroundColor:color}}/>{COLORS[color]}</Chip>)}</div></fieldset>
        <div className="editor-actions"><Button onClick={close}>Done</Button></div></>:<form ref={editorForm} onSubmit={done} noValidate>
        {editor==='displayName'&&<TextField id="displayName" name="displayName" label="Display name" dir="auto" defaultValue={draft.displayName} autoComplete="nickname" required error={fieldError} help="3–24 characters. Your previous name stays reserved for 30 days."/>}
        {editor==='bio'&&<div className="ui-field"><label htmlFor="bio">Bio</label><textarea id="bio" name="bio" dir="auto" defaultValue={draft.bio} rows={3} aria-invalid={Boolean(fieldError)} aria-describedby="bio-note"/><p id="bio-note" role={fieldError?'alert':undefined} className={fieldError?'field-help error-text':'field-help'}>{fieldError||'Optional. Up to 140 characters; keep contact details private.'}</p></div>}
        {editor==='preferredUnits'&&<fieldset className="choice-list"><legend className="sr-only">Distance units</legend>{[['km','Kilometres'],['mi','Miles']].map(([value,label])=><label key={value}><span>{label}</span><input type="radio" name="preferredUnits" value={value} defaultChecked={value===draft.preferredUnits}/></label>)}</fieldset>}
        {editor==='homeRegionId'&&<fieldset className="choice-list"><legend className="sr-only">Home region</legend>{[{id:'',name:'No home region'},...regions].map(row=><label key={row.id}><span>{row.name}{row.city&&<small className="row-support">{row.city}</small>}</span><input type="radio" name="homeRegionId" value={row.id} defaultChecked={row.id===(draft.homeRegionId||'')}/></label>)}{!regions.length&&<p className="small">No regions are available yet.</p>}</fieldset>}
        <div className="editor-actions"><Button type="submit">Done</Button></div>
      </form>}
    </Sheet>}
  </div>;
}
export function ProfilePage() {
  const {auth}=useAuth(),load=useCallback(()=>auth.api.request('/api/me/profile'),[auth]),data=useResource(load);
  const save=async body=>{await auth.api.request('/api/me/profile',{method:'PATCH',body});await auth.loadMe();};
  return <section><ResourceState data={data} label="your profile"/>{data.phase==='ready'&&<ProfileForm initial={data.value.profile} options={data.value.options} regions={data.value.regions} onSave={save}/>}</section>;
}
const VISIBILITY=[['PRIVATE','Only me','Your name and profile stay private.'],['FOLLOWERS','My followers','Only people who follow you can view your profile.'],['PUBLIC','Everyone','Anyone can view your profile.']];
function PrivacyForm({initial,save}) {
  const [visibility,setVisibility]=useState(initial.profileVisibility),[picker,setPicker]=useState(false),[dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const selection=useRef(null),saving=useRef(false);
  function closePicker(){const value=selection.current?new FormData(selection.current).get('profileVisibility'):visibility;if(value!==visibility){setVisibility(value);setDirty(true);}setPicker(false);}
  async function submit(event) {
    event.preventDefault();if(saving.current)return;const data=new FormData(event.currentTarget);saving.current=true;setBusy(true);setError('');setMessage('');
    try {await save({profileVisibility:visibility,appearOnLeaderboards:data.has('appearOnLeaderboards'),shareRouteShapes:data.has('shareRouteShapes')});setDirty(false);setMessage('Privacy choices saved.');}
    catch(failure){setError(friendlyMessage(failure));}finally{saving.current=false;setBusy(false);}
  }
  return <><form onSubmit={submit} className="resource-content privacy-choices"><fieldset disabled={busy}><legend className="sr-only">Privacy choices</legend>
    <ListRow id="profileVisibility" label="Who can view your profile?" value={VISIBILITY.find(row=>row[0]===visibility)?.[1]} onClick={()=>setPicker(true)}/>
    <p className="field-help">Private profiles appear as Runner to other people. Territory ownership stays with your account.</p>
    <Switch label="Appear on leaderboards" name="appearOnLeaderboards" defaultChecked={initial.appearOnLeaderboards} onChange={()=>setDirty(true)}/>
    <Switch label="Share route shapes" name="shareRouteShapes" defaultChecked={initial.shareRouteShapes} onChange={()=>setDirty(true)}/>
    <p className="small">These preferences will apply when maps and leaderboards arrive.</p>
    {dirty&&<div className="save-actions"><span className="small" role="status">Unsaved changes</span><Button type="submit" loading={busy}>{busy?'Saving…':'Save privacy choices'}</Button></div>}
  </fieldset><Notice error>{error}</Notice><Notice>{message}</Notice></form>
    {picker&&<Sheet title="Who can view your profile?" onClose={closePicker}><form ref={selection} onSubmit={event=>{event.preventDefault();closePicker();}}><fieldset className="choice-list"><legend className="sr-only">Profile visibility</legend>{VISIBILITY.map(([value,label,description])=><label key={value}><span>{label}<small className="row-support">{description}</small></span><input type="radio" name="profileVisibility" value={value} defaultChecked={value===visibility}/></label>)}</fieldset><div className="editor-actions"><Button type="submit">Done</Button></div></form></Sheet>}
  </>;
}
export function PrivacyPage() {
  const {auth}=useAuth(),load=useCallback(async()=>{const [privacy,consents]=await Promise.all([auth.api.request('/api/me/privacy'),auth.api.request('/api/me/consents')]);return {...privacy,...consents};},[auth]);
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
    <Section title="Location consent"><p>Withdrawing stops recording on this phone immediately. Other devices must check the server before sending new points.</p>
    <Button variant="secondary" disabled={busy} onClick={withdraw}>{busy?'Working…':'Withdraw location consent'}</Button>
    <ListRow to="/you/consent" label="Consent & history"/></Section>
  </>}{withdrawn&&<InlineNotice>Recording is stopped. {remaining?'Choose whether to upload the earlier points or discard them.':'There is no unsent data on this phone.'}</InlineNotice>}
    {withdrawn&&remaining>0&&<div className="stack"><Button variant="secondary" disabled={busy} onClick={()=>saved('upload')}>Upload earlier points</Button><Button variant="destructive" disabled={busy} onClick={()=>setConfirmDiscard(true)}>Discard saved points…</Button>
      {confirmDiscard&&<Dialog title="Discard saved points?" onClose={()=>setConfirmDiscard(false)}><p>This permanently erases the saved points. They cannot be recovered.</p><Button variant="destructive" disabled={busy} onClick={()=>saved('discard')}>Yes, discard saved points</Button><Button variant="secondary" onClick={()=>setConfirmDiscard(false)}>Keep encrypted points</Button></Dialog>}</div>}
    <Notice error>{error}</Notice></SettingsFrame>;
}
