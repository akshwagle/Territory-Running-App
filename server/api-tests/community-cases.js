'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const request=require('supertest');
const {createApp}=require('../src/app');

module.exports=({prisma,config})=>{
 const password='Community!MountainTrail2026';
 const error=(r,status,code)=>{assert.equal(r.status,status,JSON.stringify(r.body));assert.equal(r.body.error?.code,code);};
 async function fixture(t){
  const accounts=[],teams=[],dir=await fs.mkdtemp(path.resolve(__dirname,'../../.local/community-test-'));
  const settings={...config,rateLimitMax:100000,authRateLimitMax:10000,authIpRateLimitMax:10000,profileWriteLimit:10000};
  const app=createApp({prisma,config:settings,exportDir:dir,verifyGoogle:async()=>{throw Error('Mock only.');},logger:()=>{}});
  t.after(async()=>{await app.locals.profileJobs.drain();await prisma.team.deleteMany({where:{id:{in:teams}}});
    await prisma.user.deleteMany({where:{id:{in:accounts.map(a=>a.user.id)}}});await fs.rm(dir,{recursive:true,force:true});});
  async function signup({visibility='PUBLIC',board=true,name}={}){
   const res=await request(app).post('/api/auth/register').send({email:`${randomUUID()}@example.test`,displayName:name||`Com ${randomUUID().slice(0,12)}`,password});
   assert.equal(res.status,201);const a={...res.body,installId:randomUUID()};accounts.push(a);
   await prisma.userPrivacySetting.upsert({where:{userId:a.user.id},create:{userId:a.user.id,profileVisibility:visibility,appearOnLeaderboards:board},update:{profileVisibility:visibility,appearOnLeaderboards:board}});
   return a;
  }
  const call=(a,method,url,body)=>{let r=request(app)[method](url).set('x-app-version-code','6').set('x-install-id',a.installId).set('Authorization',`Bearer ${a.accessToken}`);return body===undefined?r:r.send(body);};
  async function run(a,{distanceM=5000,startedAt=new Date(Date.now()-3600000),status='VALID'}={}){
   return prisma.run.create({data:{userId:a.user.id,clientRunId:randomUUID(),startedAt,endedAt:new Date(+startedAt+1800000),distanceM,durationS:1800,status,appVersion:'0.4.0'}});
  }
  let cell=BigInt('0x8b2a1000000'+'0000'.slice(0,1))+BigInt(Math.floor(Math.random()*1e9))*4096n;
  async function hexes(a,n){
   const r=await run(a,{distanceM:1000});
   await prisma.hexOwnership.createMany({data:Array.from({length:n},()=>({h3Index:(cell+=4096n),ownerId:a.user.id,runId:r.id,cooldownUntil:new Date(Date.now()+3600000)}))});
   return r;
  }
  const newTeam=async(a,name=`Team ${randomUUID().slice(0,8)}`)=>{const r=await call(a,'post','/api/teams',{name,colorHex:'#1f5a46'});assert.equal(r.status,201,JSON.stringify(r.body));teams.push(r.body.team.id);return r.body.team;};
  return {app,call,signup,run,hexes,newTeam,settings};
 }

 test('COMM-01 leaderboards are derived at read time, respect opt-in, ranks tie and distance excludes non-VALID runs',async t=>{
  const f=await fixture(t),a=await f.signup(),b=await f.signup(),hidden=await f.signup({board:false}),priv=await f.signup({visibility:'PRIVATE'});
  await f.hexes(a,3);await f.hexes(b,3);await f.hexes(hidden,9);await f.hexes(priv,1);
  await f.run(a,{distanceM:7000});await f.run(a,{distanceM:99999,status:'FLAGGED'});await f.run(b,{distanceM:2000});
  await f.run(b,{distanceM:50000,startedAt:new Date(Date.now()-90*86400000)});
  const hex=await f.call(a,'get','/api/community/leaderboard?metric=hexes');assert.equal(hex.status,200);
  const mine=hex.body.entries.filter(e=>[a,b].some(x=>x.user.id===e.id));
  assert.deepEqual(mine.map(e=>e.rank),[mine[0].rank,mine[0].rank]);assert.equal(mine[0].value,3);
  assert.ok(!hex.body.entries.some(e=>e.id===hidden.user.id),'opted-out runner is absent');
  assert.equal(hex.body.me.value,3);assert.equal(hex.body.optedIn,true);
  const privEntry=hex.body.entries.find(e=>e.displayName==='Runner');assert.ok(privEntry,'private runner appears anonymised');assert.equal(privEntry.id,null);assert.equal(privEntry.canOpen,false);
  const dist=await f.call(a,'get','/api/community/leaderboard?metric=distance&period=month&limit=50');
  assert.equal(dist.body.entries.find(e=>e.id===a.user.id).value,8000,'1000 hex run + 7000 valid; flagged excluded');
  const old=await f.call(b,'get','/api/community/leaderboard?metric=distance&period=all&limit=50');assert.equal(old.body.entries.find(e=>e.id===b.user.id).value,53000);
  const out=await f.call(hidden,'get','/api/community/leaderboard?metric=hexes');assert.equal(out.body.optedIn,false);assert.equal(out.body.me,null);
  const none=await f.call(a,'get','/api/community/leaderboard?metric=runs&period=season');assert.equal(none.body.season,null);assert.deepEqual(none.body.entries,[]);
  for(const bad of ['metric=x','limit=0','limit=51','offset=-1','period=year','extra=1','scope=planet'])error(await f.call(a,'get',`/api/community/leaderboard?${bad}`),400,'INVALID_INPUT');
  error(await f.call(a,'get','/api/community/leaderboard?scope=team'),404,'NO_TEAM');
  assert.equal((await request(f.app).get('/api/community/leaderboard')).status,401);
 });

 test('COMM-02 season info is derived from the active season; season_scores is only read and never written',async t=>{
  const f=await fixture(t),a=await f.signup();
  const none=await f.call(a,'get','/api/community/season');assert.equal(none.status,200);
  const before=await prisma.seasonScore.count();
  const season=await prisma.season.create({data:{name:`S ${randomUUID().slice(0,8)}`,startsAt:new Date(Date.now()-86400000),endsAt:new Date(Date.now()+5*86400000),status:'ACTIVE'}});
  t.after(()=>prisma.season.delete({where:{id:season.id}}).catch(()=>{}));
  await f.run(a,{distanceM:4000});
  const res=await f.call(a,'get','/api/community/season');assert.equal(res.body.season.id,season.id);assert.ok(res.body.season.daysLeft>=5);
  const board=await f.call(a,'get','/api/community/leaderboard?metric=distance&period=season');assert.equal(board.body.season.id,season.id);assert.equal(board.body.me.value,4000);
  assert.equal(await prisma.seasonScore.count(),before,'no live season_scores writes');
 });

 test('COMM-03 follow rules: self, private, missing, idempotent, lists, search and privacy-filtered feed',async t=>{
  const f=await fixture(t),a=await f.signup(),pub=await f.signup({name:'Zed Findable'}),fol=await f.signup({visibility:'FOLLOWERS'}),priv=await f.signup({visibility:'PRIVATE'});
  error(await f.call(a,'put',`/api/users/${a.user.id}/follow`),400,'INVALID_TARGET');
  error(await f.call(a,'put',`/api/users/${priv.user.id}/follow`),404,'NOT_FOUND');
  error(await f.call(a,'put',`/api/users/${randomUUID()}/follow`),404,'NOT_FOUND');
  error(await f.call(a,'put','/api/users/not-a-uuid/follow'),400,'INVALID_INPUT');
  for(let i=0;i<2;i++)assert.deepEqual((await f.call(a,'put',`/api/users/${pub.user.id}/follow`)).body,{following:true});
  assert.equal((await f.call(a,'put',`/api/users/${fol.user.id}/follow`)).status,200);
  const following=await f.call(a,'get','/api/me/following');assert.equal(following.body.count,2);assert.ok(following.body.users.every(u=>u.following));
  const followers=await f.call(pub,'get','/api/me/followers');assert.equal(followers.body.count,1);assert.equal(followers.body.users[0].id,a.user.id);
  const page=await f.call(a,'get','/api/me/following?limit=1');assert.equal(page.body.users.length,1);assert.ok(page.body.nextCursor);
  assert.equal((await f.call(a,'get',`/api/me/following?limit=1&cursor=${page.body.nextCursor}`)).body.users.length,1);
  error(await f.call(a,'get','/api/me/following?cursor=garbage'),400,'INVALID_CURSOR');
  const found=await f.call(a,'get','/api/community/search?q=zed%20find');assert.equal(found.body.users.length,1);assert.equal(found.body.users[0].following,true);
  assert.equal((await f.call(a,'get',`/api/community/search?q=${encodeURIComponent(priv.user.displayName)}`)).body.users.length,0,'private accounts are not searchable');
  error(await f.call(a,'get','/api/community/search?q=z'),400,'INVALID_INPUT');
  const r1=await f.run(pub,{distanceM:3000});await f.run(fol,{distanceM:2000});await f.run(pub,{distanceM:111,status:'FLAGGED'});
  const feed=await f.call(a,'get','/api/community/feed');assert.equal(feed.status,200);assert.equal(feed.body.runs.length,2);
  assert.ok(feed.body.runs.some(r=>r.id===r1.id&&r.runner.displayName===pub.user.displayName));assert.ok(!feed.body.runs.some(r=>r.distanceM===111));
  assert.ok(feed.body.runs.every(r=>!('routePolyline' in r)),'no route data in the feed');
  await prisma.userPrivacySetting.update({where:{userId:pub.user.id},data:{profileVisibility:'PRIVATE'}});
  assert.equal((await f.call(a,'get','/api/community/feed')).body.runs.length,1,'going private removes runs from followers feeds');
  assert.equal((await f.call(priv,'get','/api/community/feed')).body.runs.length,0);
  assert.deepEqual((await f.call(a,'delete',`/api/users/${fol.user.id}/follow`)).body,{following:false});
  assert.equal((await f.call(a,'get','/api/community/feed')).body.runs.length,0);
 });

 test('COMM-04 teams: create, join by code, members, captain rules, leave with captain handover and team deletion',async t=>{
  const f=await fixture(t),cap=await f.signup(),m=await f.signup(),x=await f.signup();
  assert.deepEqual((await f.call(cap,'get','/api/teams/me')).body,{team:null});
  error(await f.call(cap,'post','/api/teams',{name:'x',colorHex:'#1F5A46'}),400,'INVALID_INPUT');
  error(await f.call(cap,'post','/api/teams',{name:'Valid Name',colorHex:'red'}),400,'INVALID_INPUT');
  const team=await f.newTeam(cap);assert.equal(team.role,'CAPTAIN');assert.equal(team.colorHex,'#1F5A46');assert.match(team.inviteCode,/^[A-Z2-9]{10}$/);
  error(await f.call(cap,'post','/api/teams',{name:'Another Team',colorHex:'#1F5A46'}),409,'ALREADY_IN_TEAM');
  error(await f.call(m,'post','/api/teams',{name:team.name,colorHex:'#1F5A46'}),409,'TEAM_NAME_TAKEN');
  error(await f.call(m,'post','/api/teams/join',{inviteCode:'ZZZZZZZZZZ'}),404,'INVALID_INVITE');
  error(await f.call(m,'post','/api/teams/join',{inviteCode:'bad'}),400,'INVALID_INPUT');
  const joined=await f.call(m,'post','/api/teams/join',{inviteCode:team.inviteCode.toLowerCase()});assert.equal(joined.status,200);assert.equal(joined.body.team.memberCount,2);
  error(await f.call(m,'post','/api/teams/join',{inviteCode:team.inviteCode}),409,'ALREADY_IN_TEAM');
  const list=await f.call(m,'get','/api/teams/me/members');assert.deepEqual(list.body.members.map(r=>r.role),['CAPTAIN','MEMBER']);
  error(await f.call(x,'get','/api/teams/me/members'),404,'NO_TEAM');
  error(await f.call(m,'delete',`/api/teams/me/members/${cap.user.id}`),403,'FORBIDDEN');
  await f.hexes(cap,2);await f.hexes(m,1);
  const tb=await f.call(x,'get','/api/community/team-leaderboard');const row=tb.body.teams.find(r=>r.id===team.id);assert.equal(row.hexes,3);assert.equal(row.isMine,false);
  const tl=await f.call(m,'get','/api/community/leaderboard?scope=team&metric=hexes');assert.equal(tl.body.entries.length,2);assert.equal(tl.body.entries[0].value,2);
  assert.equal((await f.call(cap,'delete',`/api/teams/me/members/${m.user.id}`)).status,200);
  assert.deepEqual((await f.call(m,'get','/api/teams/me')).body,{team:null});
  await f.call(m,'post','/api/teams/join',{inviteCode:team.inviteCode});
  assert.equal((await f.call(cap,'post','/api/teams/leave',{})).status,200);
  const after=await f.call(m,'get','/api/teams/me');assert.equal(after.body.team.role,'CAPTAIN');
  error(await f.call(cap,'post','/api/teams/leave',{}),404,'NO_TEAM');
  assert.equal((await f.call(m,'post','/api/teams/leave',{})).status,200);
  assert.equal(await prisma.team.count({where:{id:team.id}}),0,'empty teams are deleted');
 });

 test('COMM-05 concurrent joins never exceed the team cap and one runner ends in one team',async t=>{
  const f=await fixture(t),cap=await f.signup(),team=await f.newTeam(cap),people=[];
  const ids=Array.from({length:48},()=>randomUUID());
  await prisma.user.createMany({data:ids.map(id=>({id,username:'f'+id.replace(/-/g,'').slice(0,20),email:`${id}@example.test`,displayName:'Filler '+id.replace(/-/g,'').slice(0,12)}))});
  t.after(()=>prisma.user.deleteMany({where:{id:{in:ids}}}));
  await prisma.teamMember.createMany({data:ids.map(userId=>({userId,teamId:team.id}))});// captain + 48 = 49 of 50
  for(let i=0;i<6;i++)people.push(await f.signup());
  const results=await Promise.all(people.map(p=>f.call(p,'post','/api/teams/join',{inviteCode:team.inviteCode})));
  assert.equal(results.filter(r=>r.status===200).length,1,'exactly one runner gets the last seat');
  assert.ok(results.filter(r=>r.status!==200).every(r=>r.status===409&&r.body.error.code==='TEAM_FULL'));
  assert.equal(await prisma.teamMember.count({where:{teamId:team.id}}),50);
  const winner=people[results.findIndex(r=>r.status===200)];
  const again=await Promise.all([1,2,3].map(()=>f.call(winner,'post','/api/teams/join',{inviteCode:team.inviteCode})));
  assert.ok(again.every(r=>r.status===409));
  assert.equal(await prisma.teamMember.count({where:{teamId:team.id,role:'CAPTAIN'}}),1);
 });
};
