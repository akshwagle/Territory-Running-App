'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const request=require('supertest');
const {createApp}=require('../src/app');
const {awardBadges}=require('../src/notifications/badges');

module.exports=({prisma,config})=>{
 const password='Notify!MountainTrail2026';
 async function fixture(t){
  await prisma.badge.createMany({skipDuplicates:true,data:[
   {code:'TOTAL_DISTANCE_10KM',name:'First 10 km',criteria:'TOTAL_DISTANCE',threshold:10000,description:'Run a cumulative 10,000 metres.'},
   {code:'HEX_COUNT_100',name:'Century of hexes',criteria:'HEX_COUNT',threshold:100,description:'Hold 100 territory hexes.'},
   {code:'STREAK_DAYS_7',name:'One week strong',criteria:'STREAK_DAYS',threshold:7,description:'Run on seven consecutive days.'},
   {code:'RUN_COUNT_10',name:'Ten runs',criteria:'RUN_COUNT',threshold:10,description:'Complete ten valid runs.'}]});
  const accounts=[],dir=await fs.mkdtemp(path.resolve(__dirname,'../../.local/notify-test-'));
  const settings={...config,rateLimitMax:100000,authRateLimitMax:10000,authIpRateLimitMax:10000,profileWriteLimit:10000};
  const app=createApp({prisma,config:settings,exportDir:dir,verifyGoogle:async()=>{throw Error('Mock only.');},logger:()=>{}});
  t.after(async()=>{await app.locals.profileJobs.drain();await prisma.team.deleteMany({where:{name:{startsWith:'NT '}}});await prisma.user.deleteMany({where:{id:{in:accounts.map(a=>a.user.id)}}});await fs.rm(dir,{recursive:true,force:true});});
  async function signup(visibility='PUBLIC'){
   const res=await request(app).post('/api/auth/register').send({email:`${randomUUID()}@example.test`,displayName:`Note ${randomUUID().slice(0,12)}`,password});
   assert.equal(res.status,201);const a={...res.body,installId:randomUUID()};accounts.push(a);
   await prisma.userPrivacySetting.upsert({where:{userId:a.user.id},create:{userId:a.user.id,profileVisibility:visibility},update:{profileVisibility:visibility}});return a;
  }
  const call=(a,verb,url,body)=>{let r=request(app)[verb](url).set('x-app-version-code','6');if(a)r=r.set('x-install-id',a.installId).set('Authorization',`Bearer ${a.accessToken}`);return body===undefined?r:r.send(body);};
  return {app,call,signup};
 }
 const give=(userId,n,extra={})=>prisma.notification.createMany({data:Array.from({length:n},(_,i)=>({userId,type:'SYSTEM',title:`T${i}`,body:null,createdAt:new Date(Date.now()-i*1000),...extra}))});
 test('STEP10 notification centre lists, paginates, counts and marks read for the owner only',async t=>{
  const f=await fixture(t),a=await f.signup(),b=await f.signup();
  assert.equal((await f.call(null,'get','/api/me/notifications')).status,401);
  assert.equal((await f.call(null,'post','/api/me/notifications/read-all',{})).status,401);
  await give(a.user.id,5);await give(b.user.id,2);
  const page1=await f.call(a,'get','/api/me/notifications?limit=3');
  assert.equal(page1.status,200);assert.equal(page1.body.notifications.length,3);assert.equal(page1.body.unreadCount,5);assert.ok(page1.body.nextCursor);
  const page2=await f.call(a,'get',`/api/me/notifications?limit=3&cursor=${encodeURIComponent(page1.body.nextCursor)}`);
  assert.equal(page2.body.notifications.length,2);assert.equal(page2.body.nextCursor,null);
  assert.equal(new Set([...page1.body.notifications,...page2.body.notifications].map(n=>n.id)).size,5);
  assert.equal((await f.call(a,'get','/api/me/notifications?limit=0')).status,400);
  assert.equal((await f.call(a,'get','/api/me/notifications?cursor=bad')).status,400);
  const foreign=(await prisma.notification.findFirst({where:{userId:b.user.id}})).id;
  assert.equal((await f.call(a,'post',`/api/me/notifications/${foreign}/read`,{})).status,404);
  assert.equal((await prisma.notification.findUnique({where:{id:foreign}})).readAt,null);
  const mine=page1.body.notifications[0].id,read=await f.call(a,'post',`/api/me/notifications/${mine}/read`,{});
  assert.equal(read.status,200);assert.equal(read.body.unreadCount,4);
  assert.equal((await f.call(a,'post',`/api/me/notifications/${mine}/read`,{})).body.unreadCount,4);
  assert.equal((await f.call(a,'post','/api/me/notifications/not-a-uuid/read',{})).status,400);
  assert.equal((await f.call(a,'get','/api/me/notifications?unread=true')).body.notifications.length,4);
  assert.equal((await f.call(a,'get','/api/me/notifications/unread-count')).body.unreadCount,4);
  assert.equal((await f.call(a,'post','/api/me/notifications/read-all',{})).body.unreadCount,0);
  assert.equal((await f.call(b,'get','/api/me/notifications/unread-count')).body.unreadCount,2);
 });
 test('STEP10 badge awarding is idempotent, needs the threshold and notifies once',async t=>{
  const f=await fixture(t),a=await f.signup();
  const seq=()=>prisma.$transaction(tx=>awardBadges(tx,a.user.id));
  assert.deepEqual(await seq(),[]);
  const mk=(i)=>prisma.run.create({data:{userId:a.user.id,clientRunId:randomUUID(),startedAt:new Date(Date.now()-(i+1)*86400000),endedAt:new Date(Date.now()-(i+1)*86400000+1800000),distanceM:1000,durationS:1800,status:'VALID',appVersion:'0.4.0'}});
  for(let i=0;i<9;i++)await mk(i);
  assert.deepEqual(await seq(),[]);
  await mk(9);
  const first=await seq();assert.deepEqual(first.map(b=>b.code).sort(),['RUN_COUNT_10','TOTAL_DISTANCE_10KM']);
  assert.deepEqual(await seq(),[]);
  const [x,y]=await Promise.all([seq(),seq()]);assert.equal(x.length+y.length,0);
  assert.equal(await prisma.userBadge.count({where:{userId:a.user.id}}),2);
  assert.equal(await prisma.notification.count({where:{userId:a.user.id,type:'BADGE_EARNED'}}),2);
  const ach=await f.call(a,'get','/api/me/stats/achievements');assert.equal(ach.body.badges.filter(b=>b.earned).length,2);
  const dist=ach.body.badges.find(b=>b.code==='TOTAL_DISTANCE_10KM');assert.equal(dist.threshold,10);assert.equal(dist.progress,10);
 });
 test('STEP10 concurrent awarding from two runs creates a badge row and notification only once',async t=>{
  const f=await fixture(t),a=await f.signup();
  await prisma.userStat.upsert({where:{userId:a.user.id},create:{userId:a.user.id,totalRuns:0,totalDistM:0n,streakDays:7,bestStreak:7},update:{streakDays:7,bestStreak:7}});
  const results=await Promise.all([1,2,3].map(()=>prisma.$transaction(tx=>awardBadges(tx,a.user.id))));
  assert.equal(results.flat().length,1);assert.equal(await prisma.notification.count({where:{userId:a.user.id,type:'BADGE_EARNED'}}),1);
 });
 test('STEP10 follow and team events notify the right runner without leaking private identities',async t=>{
  const f=await fixture(t),target=await f.signup(),pub=await f.signup('PUBLIC'),priv=await f.signup('PRIVATE');
  assert.equal((await f.call(pub,'put',`/api/users/${target.user.id}/follow`)).status,200);
  assert.equal((await f.call(pub,'put',`/api/users/${target.user.id}/follow`)).status,200);
  assert.equal((await f.call(priv,'put',`/api/users/${target.user.id}/follow`)).status,200);
  const notes=await prisma.notification.findMany({where:{userId:target.user.id,title:'New follower'},orderBy:{createdAt:'asc'}});
  assert.equal(notes.length,2);assert.ok(notes[0].body.includes(pub.user.displayName));assert.equal(notes[1].body,'A runner started following you.');
  assert.ok(!JSON.stringify(notes).includes(priv.user.displayName));
  const cap=await f.signup(),mem=await f.signup(),name=`NT ${randomUUID().slice(0,8)}`;
  const team=await f.call(cap,'post','/api/teams',{name,colorHex:'#1f5a46'});assert.equal(team.status,201,JSON.stringify(team.body));
  assert.equal((await f.call(mem,'post','/api/teams/join',{inviteCode:team.body.team.inviteCode})).status,200);
  assert.ok((await prisma.notification.findFirst({where:{userId:cap.user.id,title:'New team member'}})).body.includes(mem.user.displayName));
  assert.equal(await prisma.notification.count({where:{userId:mem.user.id}}),0);
  assert.equal((await f.call(cap,'delete',`/api/teams/me/members/${mem.user.id}`)).status,200);
  assert.ok(await prisma.notification.findFirst({where:{userId:mem.user.id,title:'Removed from team'}}));
 });
};
