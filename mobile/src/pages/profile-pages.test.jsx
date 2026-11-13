import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi} from 'vitest';
import {MemoryRouter} from 'react-router';
import {AuthContext} from '../auth/context.jsx';
import {ApiError} from '../auth/errors.js';
import {ProfilePage,PrivacyPage} from './profile-pages.jsx';
import {ConsentPage,DeletePage,ExportPage} from './data-pages.jsx';

const profile={id:'me',displayName:'Trail Runner',avatarId:0,avatarColor:'#1F5A46',preferredUnits:'km',bio:'',homeRegionId:null};
const types=['LOCATION','TERMS','PRIVACY'];
const notices=()=>({consents:types.map((type,i)=>({type,title:['Location processing','Terms of use','Privacy notice'][i],text:'Plain consent text.',version:'v1',etag:`"${type}:none"`,accepted:false,requiresAcceptance:true})),history:[]});
function setup(Page,request,extra={}) {
  const state={status:'authenticated',user:{id:'me',emailVerified:false}};
  const auth={getSnapshot:()=>state,subscribe:()=>()=>{},loadMe:vi.fn(async()=>{}),api:{request:vi.fn(request)},
    pending:{stopRecording:vi.fn(async()=>{}),upload:vi.fn(async()=>{}),discard:vi.fn(async()=>{})},
    pendingCount:vi.fn(async()=>0),deleteAccount:vi.fn(async()=>{}),...extra};
  render(<AuthContext.Provider value={auth}><MemoryRouter><Page/></MemoryRouter></AuthContext.Provider>);
  return {auth,user:userEvent.setup()};
}
const own=()=>({profile,options:{avatarIds:Array.from({length:12},(_,i)=>i),avatarColors:['#1F5A46','#B8452A']},regions:[]});
it('profile loads generated avatars, validates names, and saves visible autofill values with no uploads',async()=>{
  const {auth,user}=setup(ProfilePage,async(_url,options)=>options?.method==='PATCH'?{profile}:own());
  expect(screen.getByRole('status')).toHaveTextContent('Loading');await screen.findByLabelText('Display name');
  screen.getByLabelText('Display name').value='Li';await user.click(screen.getByRole('button',{name:'Save profile'}));expect(screen.getByRole('alert')).toHaveTextContent('3–24');
  screen.getByLabelText('Display name').value='Fresh Runner';screen.getByLabelText('Bio').value='Trail notes';
  await user.click(screen.getByRole('button',{name:'Avatar 12',exact:true}));await user.click(screen.getByRole('button',{name:'Clay',exact:true}));
  await user.selectOptions(screen.getByLabelText('Distance units'),'mi');await user.click(screen.getByRole('button',{name:'Save profile'}));
  await screen.findByText('Profile saved.');expect(auth.api.request).toHaveBeenLastCalledWith('/api/me/profile',{method:'PATCH',body:{displayName:'Fresh Runner',avatarId:11,avatarColor:'#B8452A',preferredUnits:'mi',bio:'Trail notes',homeRegionId:null}});
  expect(auth.loadMe).toHaveBeenCalledOnce();expect(document.querySelector('input[type=file]')).toBeNull();
});
it('profile shows conflict without losing the edited name and handles an empty region catalog',async()=>{
  const {user}=setup(ProfilePage,async(_url,options)=>{if(options?.method==='PATCH')throw new ApiError('DISPLAY_NAME_UNAVAILABLE','That display name is unavailable.',409);return own();});
  await screen.findByLabelText('Display name');expect(screen.getByText('No regions are available yet.')).toBeVisible();
  screen.getByLabelText('Display name').value='Taken Name';await user.click(screen.getByRole('button',{name:'Save profile'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');expect(screen.getByLabelText('Display name')).toHaveValue('Taken Name');
});
it.each([ProfilePage,PrivacyPage,ConsentPage,DeletePage])('%s shows offline error and retry instead of blank content',async Page=>{
  const {auth,user}=setup(Page,async()=>{throw new ApiError('NETWORK_UNAVAILABLE','Cannot reach the server.');});
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach');const calls=auth.api.request.mock.calls.length;await user.click(screen.getByRole('button',{name:'Try again'}));
  await waitFor(()=>expect(auth.api.request.mock.calls.length).toBeGreaterThan(calls));
});
it('PRIV-01 privacy saves all choices including unchecked route sharing',async()=>{
  const {auth,user}=setup(PrivacyPage,async url=>url.includes('consents')?notices():{privacy:{profileVisibility:'PRIVATE',appearOnLeaderboards:false,shareRouteShapes:true}});
  await screen.findByLabelText('Who can view your profile?');await user.selectOptions(screen.getByLabelText('Who can view your profile?'),'FOLLOWERS');
  await user.click(screen.getByLabelText('Appear on leaderboards'));await user.click(screen.getByLabelText('Share route shapes'));
  await user.click(screen.getByRole('button',{name:'Save privacy choices'}));await screen.findByText('Privacy choices saved.');
  expect(auth.api.request).toHaveBeenCalledWith('/api/me/privacy',{method:'PATCH',body:{profileVisibility:'FOLLOWERS',appearOnLeaderboards:true,shareRouteShapes:false}});
});
it('PRIV-02 withdrawal keeps saved data and offers upload or a second explicit discard tap',async()=>{
  const {auth,user}=setup(PrivacyPage,async url=>url.includes('consents')?notices():{privacy:{profileVisibility:'PRIVATE',appearOnLeaderboards:false,shareRouteShapes:false}}, {pendingCount:vi.fn(async()=>2)});
  await user.click(await screen.findByRole('button',{name:'Withdraw location consent'}));
  expect(auth.pending.stopRecording).toHaveBeenCalledWith('me','consent-withdrawn');await screen.findByText(/Choose whether to upload/);
  expect(auth.pending.discard).not.toHaveBeenCalled();await user.click(screen.getByRole('button',{name:'Discard saved points…'}));expect(auth.pending.discard).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button',{name:'Yes, discard saved points'}));expect(auth.pending.discard).toHaveBeenCalledWith('me','DISCARD_UNSENT_DATA');
});
it('PRIV-03 consent shows versioned notices and empty history, sends each revision and reports success',async()=>{
  const {auth,user}=setup(ConsentPage,async()=>notices());
  await screen.findByRole('button',{name:'Accept current notices'});expect(screen.getByText(/Android edition/)).toBeVisible();expect(screen.getAllByText(/Version v1/)).toHaveLength(3);
  expect(screen.getByText('You have not recorded any consent choices.')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Accept current notices'}));
  await screen.findByText('Your consent choices are saved.');
  for(const type of types)expect(auth.api.request).toHaveBeenCalledWith('/api/me/consents',{method:'POST',ifMatch:`"${type}:none"`,body:{type,version:'v1',accepted:true}});
});
it('PRIV-04 delete flow requires typed DELETE and an extra unsent-data tap before invoking auth deletion',async()=>{
  const {auth,user}=setup(DeletePage,async()=>({identities:[{provider:'PASSWORD'}]}),{pendingCount:vi.fn(async()=>1)});
  await screen.findByLabelText('Type DELETE');await user.click(screen.getByRole('button',{name:'Delete my account'}));expect(screen.getByRole('alert')).toHaveTextContent('Type DELETE');
  await user.type(screen.getByLabelText('Type DELETE'),'DELETE');await user.type(screen.getByLabelText('Password'),'private');
  await user.click(screen.getByRole('button',{name:'Delete my account'}));await screen.findByRole('dialog');expect(auth.deleteAccount).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button',{name:'Yes, erase unsent data and delete account'}));expect(auth.deleteAccount).toHaveBeenCalledWith({confirmation:'DELETE',password:'private',method:'password',eraseUnsent:true});
});
it('Google-only deletion requests fresh Google reauthentication and shows server rejection without claiming success',async()=>{
  const {auth,user}=setup(DeletePage,async()=>({identities:[{provider:'GOOGLE'}]}),{deleteAccount:vi.fn(async()=>{throw new ApiError('REAUTHENTICATION_REQUIRED','Sign in to Google again.',401);})});
  await screen.findByLabelText('Type DELETE');expect(screen.queryByLabelText('Password')).toBeNull();await user.type(screen.getByLabelText('Type DELETE'),'DELETE');
  await user.click(screen.getByRole('button',{name:'Delete my account'}));expect(await screen.findByRole('alert')).toHaveTextContent('Google again');expect(auth.deleteAccount).toHaveBeenCalledWith({confirmation:'DELETE',method:'google'});
});
it('PRIV-06 export handles pending, ready and Android share states without displaying sensitive JSON',async()=>{
  const sharing={send:vi.fn(async()=>{})};let downloads=0;
  const {user}=setup(()=> <ExportPage sharing={sharing}/>,async(_url,options)=>options?.method==='POST'?{export:{id:'own-export',expiresAt:new Date(Date.now()+86400000).toISOString()}}:
    ++downloads===1?{export:{status:'PENDING'}}:{profile:{email:'never-render@example.test'},runs:[{points:[{lat:12}]}]});
  await user.click(screen.getByRole('button',{name:'Request export'}));await user.click(await screen.findByRole('button',{name:'Check export'}));expect(await screen.findByText(/still being prepared/)).toBeVisible();
  await user.click(screen.getByRole('button',{name:'Check export'}));await user.click(await screen.findByRole('button',{name:'Share JSON'}));
  expect(sharing.send).toHaveBeenCalledWith(expect.objectContaining({profile:{email:'never-render@example.test'}}));expect(screen.queryByText('never-render@example.test')).toBeNull();expect(await screen.findByText(/temporary file was removed/)).toBeVisible();
});
it('export reports offline and expiry errors and permits a new request',async()=>{
  const {auth,user}=setup(ExportPage,async()=>{throw new ApiError('NETWORK_UNAVAILABLE','Cannot reach the server.');});
  await user.click(screen.getByRole('button',{name:'Request export'}));expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach');
  auth.api.request.mockResolvedValueOnce({export:{id:'expired',expiresAt:new Date().toISOString()}}).mockRejectedValueOnce(new ApiError('NOT_FOUND','The export has expired.',404));
  await user.click(screen.getByRole('button',{name:'Request export'}));await user.click(await screen.findByRole('button',{name:'Check export'}));expect(await screen.findByRole('alert')).toHaveTextContent('expired');
});
