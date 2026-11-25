'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const request=require('supertest');
const {createApp}=require('../src/app');
const {computeSplits}=require('../src/stats/splits');

module.exports=({prisma,config})=>{
 const password='Stats!MountainTrail2026';
 async function fixture(t){
  const accounts=[],dir=await fs.mkdtemp(path.resolve(__dirname,'../../.local/stats-test-'));
  const settings={...config,rateLimitMax:100000,authRateLimitMax:10000,authIpRateLimitMax:10000,profileWriteLimit:10000};
  const app=createApp({prisma,config:settings,exportDir:dir,verifyGoogle:async()=>{throw Error('Mock only.');},logger:()=>{}});
  t.after(async()=>{await app.locals.profileJobs.drain();await prisma.user.deleteMany({where:{id:{in:accounts.map(a=>a.user.id)}}});await fs.rm(dir,{recursive:true,force:true});});
  async function signup(){
   const res=await request(app).post('/api/auth/register').send({email:`${randomUUID()}@example.test`,displayName:`Stat ${randomUUID().slice(0,12)}`,password});
   assert.equal(res.status,201);const a={...res.body,installId:randomUUID()};accounts.push(a);return a;
  }
  const call=(a,url)=>request(app).get(url).set('x-app-version-code','6').set('x-install-id',a.installId).set('Authorization',`Bearer ${a.accessToken}`);
  const run=(a,{distanceM=5000,durationS=1800,daysAgo=0,status='VALID'}={})=>{const startedAt=new Date(Date.now()-daysAgo*86400000-3600000);
   return prisma.run.create({data:{userId:a.user.id,clientRunId:randomUUID(),startedAt,endedAt:new Date(+startedAt+durationS*1000),distanceM,durationS,status,appVersion:'0.4.0'}});};
  return {app,call,signup,run};
 }

 test('STAT-01 computeSplits cuts km splits by moving time, skips gaps and keeps a partial remainder',()=>{
  const pts=[];let t=Date.UTC(2026,0,1);
  for(let i=0;i<=250;i++){pts.push({lat:51+i*0.00009,lng:0,accuracyM:5,recordedAt:new Date(t+i*10000)});} // ~10 m per 10 s => 1 m/s
  const r=computeSplits(pts,1000);
  assert.equal(r.splits[0].distanceM,1000);assert.ok(Math.abs(r.splits[0].durationS-1000)<30);assert.equal(r.splits.length,3);assert.equal(r.splits[2].partial,true);
  const gap=[...pts.slice(0,50),...pts.slice(50).map(p=>({...p,recordedAt:new Date(+p.recordedAt+600000)}))];
  const g=computeSplits(gap,1000);assert.ok(g.movingDurationS<2600,'pause not counted');
  assert.deepEqual(computeSplits([],1000).splits,[]);
 });

 test('STAT-02 overview buckets, zero-fills, excludes non-VALID and other users; validates input and needs auth',async t=>{
  const f=await fixture(t),a=await f.signup(),b=await f.signup();
  await f.run(a,{distanceM:5000,durationS:1500,daysAgo:0});await f.run(a,{distanceM:3000,durationS:900,daysAgo:2});
  await f.run(a,{distanceM:99999,daysAgo:1,status:'FLAGGED'});await f.run(a,{distanceM:4000,daysAgo:20});await f.run(b,{distanceM:7777});
  const week=await f.call(a,'/api/me/stats/overview?range=week');assert.equal(week.status,200,JSON.stringify(week.body));
  assert.equal(week.body.series.length,7);assert.equal(week.body.totals.runs,2);assert.equal(week.body.totals.distanceM,8000);
  assert.equal(week.body.totals.paceSecondsPerKm,300);assert.equal(week.body.lifetime.runs,3);
  const month=await f.call(a,'/api/me/stats/overview?range=month');assert.equal(month.body.series.length,30);assert.equal(month.body.totals.distanceM,12000);
  const year=await f.call(a,'/api/me/stats/overview?range=year');assert.equal(year.body.series.length,12);assert.equal(year.body.bucket,'month');assert.equal(year.body.totals.distanceM,12000);
  const empty=await f.call(await f.signup(),'/api/me/stats/overview');assert.equal(empty.body.totals.runs,0);assert.equal(empty.body.totals.paceSecondsPerKm,null);
  assert.equal((await f.call(a,'/api/me/stats/overview?range=decade')).status,400);assert.equal((await f.call(a,'/api/me/stats/overview?x=1')).status,400);
  assert.equal((await request(f.app).get('/api/me/stats/overview')).status,401);
 });

 test('STAT-03 personal records are derived from VALID runs only',async t=>{
  const f=await fixture(t),a=await f.signup(),none=await f.call(a,'/api/me/stats/records');
  assert.equal(none.status,200);assert.equal(none.body.longestDistance,null);assert.equal(none.body.fastest['5k'],null);
  const slow=await f.run(a,{distanceM:10500,durationS:4200}),fast=await f.run(a,{distanceM:5200,durationS:1300});await f.run(a,{distanceM:50000,durationS:600,status:'FLAGGED'});
  const r=(await f.call(a,'/api/me/stats/records')).body;
  assert.equal(r.longestDistance.runId,slow.id);assert.equal(r.fastest['5k'].runId,fast.id);assert.equal(r.fastest['10k'].runId,slow.id);assert.equal(r.fastest.half,null);
  assert.equal(r.bestWeek.distanceM>=5200,true);assert.equal(r.longestDuration.runId,slow.id);
 });

 test('STAT-04 achievements show derived progress against seeded badges',async t=>{
  const f=await fixture(t),a=await f.signup();await f.run(a,{distanceM:6000});
  const badge=await prisma.badge.create({data:{code:`t${randomUUID().slice(0,8)}`,name:'Test',criteria:'RUN_COUNT',threshold:1}});
  const hard=await prisma.badge.create({data:{code:`t${randomUUID().slice(0,8)}`,name:'Hard',criteria:'TOTAL_DISTANCE',threshold:1000000}});
  t.after(()=>prisma.badge.deleteMany({where:{id:{in:[badge.id,hard.id]}}}));
  const res=await f.call(a,'/api/me/stats/achievements');assert.equal(res.status,200);
  const easy=res.body.badges.find(x=>x.id===badge.id),big=res.body.badges.find(x=>x.id===hard.id);
  assert.equal(easy.earned,true);assert.equal(big.earned,false);assert.equal(big.progress,6);
 });

 test('STAT-05 history filters, run splits ownership and validation',async t=>{
  const f=await fixture(t),a=await f.signup(),b=await f.signup();
  const r1=await f.run(a,{distanceM:2000,daysAgo:10}),r2=await f.run(a,{distanceM:8000,daysAgo:1}),r3=await f.run(a,{distanceM:3000,daysAgo:2,status:'FLAGGED'});
  const ids=async q=>(await f.call(a,`/api/runs?active=false${q}`)).body.runs.map(r=>r.id);
  assert.deepEqual(await ids('&minDistanceM=5000'),[r2.id]);assert.deepEqual(await ids('&maxDistanceM=2500'),[r1.id]);
  assert.deepEqual(await ids('&status=FLAGGED'),[r3.id]);assert.deepEqual(await ids(`&from=${encodeURIComponent(new Date(Date.now()-5*86400000).toISOString())}`),[r2.id,r3.id]);
  assert.deepEqual(await ids('&to='+encodeURIComponent(new Date(Date.now()-5*86400000).toISOString())),[r1.id]);
  assert.equal((await f.call(a,'/api/runs?minDistanceM=9&maxDistanceM=2')).status,400);assert.equal((await f.call(a,'/api/runs?status=BOGUS')).status,400);
  const page=await f.call(a,'/api/runs?active=false&limit=1&minDistanceM=1');assert.ok(page.body.nextCursor);
  const next=await f.call(a,`/api/runs?active=false&limit=5&minDistanceM=1&cursor=${page.body.nextCursor}`);assert.equal(next.body.runs.length,2);
  const base=Date.now();await prisma.runPoint.createMany({data:Array.from({length:30},(_,i)=>({runId:r2.id,seq:i,lat:51+i*0.0001,lng:0,recordedAt:new Date(base+i*10000),accuracyM:5}))});
  const s=await f.call(a,`/api/me/run-splits/${r2.id}?unit=km`);assert.equal(s.status,200,JSON.stringify(s.body));assert.equal(s.body.splits.length,1);assert.equal(s.body.splits[0].partial,true);
  assert.equal((await f.call(b,`/api/me/run-splits/${r2.id}`)).status,404);assert.equal((await f.call(a,'/api/me/run-splits/not-a-uuid')).status,400);
  assert.equal((await f.call(a,`/api/me/run-splits/${r2.id}?unit=yd`)).status,400);
 });
};
