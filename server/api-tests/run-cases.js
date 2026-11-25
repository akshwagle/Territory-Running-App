'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const request=require('supertest');
const h3=require('h3-js');
const {createApp}=require('../src/app');
const {createRunRetention}=require('../src/runs/retention');
module.exports=({prisma,config})=>{
 const password='Recording!MountainTrail2026';
 const error=(r,status,code)=>{assert.equal(r.status,status,JSON.stringify(r.body));assert.equal(r.body.error?.code,code);assert.deepEqual(Object.keys(r.body),['error']);assert.deepEqual(Object.keys(r.body.error).sort(),['code','message']);};
 async function fixture(t,overrides={},extra={}){
  const logs=[],accounts=[],dir=await fs.mkdtemp(path.resolve(__dirname,'../../.local/runs-test-'));
  const settings={...config,rateLimitMax:100000,authRateLimitMax:10000,authIpRateLimitMax:10000,profileWriteLimit:10000,runWriteLimit:10000,requireVerifiedEmailForRuns:false,...overrides};
  const app=createApp({prisma,config:settings,exportDir:dir,verifyGoogle:async()=>{throw Error('Mock only.');},logger:line=>logs.push(line),...extra});
  t.after(async()=>{await app.locals.profileJobs.drain();await prisma.user.deleteMany({where:{id:{in:accounts.map(a=>a.user.id)}}});await fs.rm(dir,{recursive:true,force:true});});
  async function signup({consent=true,verified=false}={}){const result=await request(app).post('/api/auth/register').send({email:`${randomUUID()}@example.test`,displayName:`Run ${randomUUID().slice(0,12)}`,password});assert.equal(result.status,201);const a={...result.body,installId:randomUUID()};accounts.push(a);
   if(consent)for(const type of ['LOCATION','TERMS','PRIVACY'])await prisma.userConsent.create({data:{userId:a.user.id,type,version:settings.consentVersions[type],accepted:true,createdAt:new Date(Date.now()-3600000)}});
   if(verified)await prisma.user.update({where:{id:a.user.id},data:{verifiedAt:new Date()}});return a;
  }
  const call=(a,method,url,body,version=6)=>{let req=request(app)[method](url).set('x-app-version-code',String(version));if(a)req=req.set('x-install-id',a.installId);if(a)req=req.set('Authorization',`Bearer ${a.accessToken}`);return body===undefined?req:req.send(body);};
  function body(a,overrides={}){return {clientRunId:randomUUID(),startedAt:new Date(Date.now()-240000).toISOString(),device:{installId:a.installId,androidIdHash:'a'.repeat(64),versionCode:6,appVersion:'0.4.0',signingCertificateSha256:'b'.repeat(64),model:'Public fixture',androidVersion:'16',timeZone:'Asia/Kolkata',mockAppSelected:null,emulator:false,debugger:true},...overrides};}
  async function start(a,input=body(a)){const res=await call(a,'post','/api/runs',input);assert.equal(res.status,201,JSON.stringify(res.body));return res.body.run;}
  const point=(r,seq,overrides={})=>({seq,lat:19.076+seq*.0001,lng:72.8777,recordedAt:new Date(+new Date(r.startedAt)+seq*1000).toISOString(),accuracyM:5,speedMps:null,altitudeM:10,bearingDeg:0,provider:'gps',isMock:false,elapsedMs:seq*1000,deviceTimestamp:new Date(+new Date(r.startedAt)+seq*1000).toISOString(),...overrides});
  const batch=(r,points,extra={})=>({batchKey:`${r.id}:${Math.min(...points.map(p=>p.seq))}`,points,batteryLevel:80,stepDelta:null,...extra});
  const upload=(a,r,points,extra={})=>call(a,'post',`/api/runs/${r.id}/points`,batch(r,points,extra));
  return {app,settings,signup,call,body,start,point,batch,upload,logs};
 }
 test('LIFE-06 online create is idempotent; one ACTIVE run is enforced across concurrent requests and installations',async t=>{
  const f=await fixture(t),a=await f.signup(),input=f.body(a);
  const same=await Promise.all([f.call(a,'post','/api/runs',input),f.call(a,'post','/api/runs',input)]);assert.deepEqual(same.map(r=>r.status).sort(),[200,201]);assert.equal(same[0].body.run.id,same[1].body.run.id);
  error(await f.call(a,'post','/api/runs',f.body({...a,installId:randomUUID()})),409,'RUN_ACTIVE_ELSEWHERE');
  error(await f.call(a,'post','/api/runs',{...input,device:{...input.device,installId:randomUUID()}}),409,'IDEMPOTENCY_CONFLICT');
  const active=await f.call(a,'get','/api/runs?active=true');assert.equal(active.body.runs.length,1);assert.equal(active.body.runs[0].status,'ACTIVE');assert.equal(active.body.runs[0].endedAt,null);
 });
 test('PRIV-02 create and resume require accepted current notices; historical valid points upload after withdrawal',async t=>{
  const f=await fixture(t),a=await f.signup({consent:false});error(await f.call(a,'post','/api/runs',f.body(a)),409,'CONSENT_REQUIRED');
  for(const type of ['LOCATION','TERMS','PRIVACY'])await prisma.userConsent.create({data:{userId:a.user.id,type,version:f.settings.consentVersions[type],accepted:true,createdAt:new Date(Date.now()-3600000)}});
  const r=await f.start(a);assert.equal((await f.call(a,'post','/api/me/consents',{type:'LOCATION',version:f.settings.consentVersions.LOCATION,accepted:false})).status,200);
  const earlier=await f.upload(a,r,[f.point(r,0)]);assert.equal(earlier.status,200);assert.equal(earlier.body.recordingAllowed,false);
  const after=f.point(r,1,{recordedAt:new Date().toISOString()});error(await f.upload(a,r,[after]),409,'CONSENT_REQUIRED');
  const paused=await f.call(a,'post',`/api/runs/${r.id}/pause`,{eventId:randomUUID(),recordedAt:new Date().toISOString(),elapsedMs:240000});assert.equal(paused.status,200);
  error(await f.call(a,'post',`/api/runs/${r.id}/resume`,{eventId:randomUUID(),recordedAt:new Date().toISOString(),elapsedMs:240000}),409,'CONSENT_REQUIRED');
  assert.equal((await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:new Date().toISOString(),lastSeq:0})).status,200);
 });
 test('PRIV-03 a location policy version bump blocks the next start and leaves old consent history unchanged',async t=>{
  const f=await fixture(t),a=await f.signup();const oldCount=await prisma.userConsent.count({where:{userId:a.user.id}});
  const changed=await fixture(t,{consentVersions:{...config.consentVersions,LOCATION:'next-run-policy'}});
  error(await changed.call(a,'post','/api/runs',changed.body(a)),409,'CONSENT_REQUIRED');assert.equal(await prisma.userConsent.count({where:{userId:a.user.id}}),oldCount);
 });
 test('CHEAT-14 minimum version and verified-email guard protect every recording write',async t=>{
  const f=await fixture(t,{requireVerifiedEmailForRuns:true}),a=await f.signup();error(await f.call(a,'post','/api/runs',f.body(a)),403,'EMAIL_VERIFICATION_REQUIRED');
  await prisma.user.update({where:{id:a.user.id},data:{verifiedAt:new Date()}});error(await f.call(a,'post','/api/runs',f.body(a),5),426,'UPDATE_REQUIRED');
  const r=await f.start(a);for(const [verb,suffix,body] of [['post','/points',f.batch(r,[f.point(r,0)])],['post','/pause',{eventId:randomUUID(),recordedAt:new Date().toISOString(),elapsedMs:1}],['post','/resume',{eventId:randomUUID(),recordedAt:new Date().toISOString(),elapsedMs:1}],['post','/finish',{endedAt:new Date().toISOString()}],['post','/end-stale',{}],['delete','',{}]])error(await f.call(a,verb,`/api/runs/${r.id}${suffix}`,body,5),426,'UPDATE_REQUIRED');
 });
 test('GPS-06 all run endpoints authenticate, validate, and hide another owner or missing run with 404',async t=>{
  const f=await fixture(t),a=await f.signup(),b=await f.signup(),r=await f.start(a),control={eventId:randomUUID(),recordedAt:new Date().toISOString(),elapsedMs:1};
  const actions=[['get','',undefined],['post','/points',f.batch(r,[f.point(r,0)])],['post','/pause',control],['post','/resume',control],['post','/finish',{endedAt:new Date().toISOString()}],['post','/end-stale',{}],['delete','',{}]];
  error(await f.call(null,'get','/api/runs'),401,'UNAUTHORIZED');error(await f.call(null,'post','/api/runs',f.body(a)),401,'UNAUTHORIZED');
  error(await f.call(a,'get','/api/runs?limit=0'),400,'INVALID_INPUT');error(await f.call(a,'post','/api/runs',{userId:b.user.id}),400,'INVALID_INPUT');
  for(const [verb,suffix,body] of actions){error(await f.call(null,verb,`/api/runs/${r.id}${suffix}`,body),401,'UNAUTHORIZED');error(await f.call({...a,accessToken:'bad'},verb,`/api/runs/${r.id}${suffix}`,body),401,'UNAUTHORIZED');error(await f.call(b,verb,`/api/runs/${r.id}${suffix}`,body),404,'NOT_FOUND');
   const missing=randomUUID(),missingBody=suffix==='/points'?{...body,batchKey:`${missing}:0`}:body;error(await f.call(a,verb,`/api/runs/${missing}${suffix}`,missingBody),404,'NOT_FOUND');
   error(await f.call(a,verb,`/api/runs/not-a-uuid${suffix}`,body),400,'INVALID_INPUT');}
  await prisma.userPrivacySetting.upsert({where:{userId:a.user.id},create:{userId:a.user.id,profileVisibility:'PUBLIC',hideRoute:false},update:{profileVisibility:'PUBLIC',hideRoute:false}});error(await f.call(b,'get',`/api/runs/${r.id}`),404,'NOT_FOUND');
  assert.equal(f.logs.some(line=>line.includes(a.user.email)||line.includes(a.accessToken)||line.includes('72.8777')),false);
 });
 test('GPS-04 duplicate and out-of-order batches record and heal sequence gaps; conflicting replays are atomic',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),later=[f.point(r,2),f.point(r,3)];
  const first=await f.upload(a,r,later);assert.equal(first.status,200);assert.equal(first.body.highestSeq,3);assert.deepEqual(first.body.sequenceGaps,[{from:0,to:1}]);
  const repeat=await f.upload(a,r,[...later].reverse());assert.equal(repeat.status,200);assert.equal(repeat.body.duplicate,true);
  const earlier=await f.upload(a,r,[f.point(r,0),f.point(r,1)]);assert.equal(earlier.status,200);assert.deepEqual(earlier.body.sequenceGaps,[]);assert.equal(earlier.body.highestSeq,3);
  error(await f.upload(a,r,[f.point(r,2,{lng:73}),f.point(r,3)]),409,'IDEMPOTENCY_CONFLICT');
  error(await f.upload(a,r,[f.point(r,1,{lng:73}),f.point(r,4)]),409,'POINT_CONFLICT');assert.equal(await prisma.runPoint.count({where:{runId:r.id}}),4);
  const overlap=await f.upload(a,r,[f.point(r,1),f.point(r,2)]);assert.equal(overlap.status,200);assert.equal(overlap.body.duplicate,true);
 });
 test('GPS-06 invalid, oversized, future and out-of-window point batches leave no partial rows',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),p=f.point(r,0);
  for(const bad of [{...p,lat:91},{...p,lng:-181},{...p,lat:0,lng:0},{...p,speedMps:-1},{...p,accuracyM:-1},{...p,bearingDeg:360},{...p,seq:-1},{...p,provider:'invented'}])error(await f.upload(a,r,[bad]),400,'INVALID_INPUT');
  error(await f.upload(a,r,Array.from({length:501},(_,i)=>f.point(r,i))),400,'INVALID_INPUT');
  error(await f.upload(a,r,[p,p]),400,'DUPLICATE_SEQUENCE');
  error(await f.upload(a,r,[p,f.point(r,1,{recordedAt:new Date(Date.now()+60000).toISOString()})]),400,'FUTURE_TIMESTAMP');
  error(await f.upload(a,r,[f.point(r,1,{recordedAt:new Date(+new Date(r.startedAt)-1).toISOString()})]),400,'OUTSIDE_RUN_WINDOW');assert.equal(await prisma.runPoint.count({where:{runId:r.id}}),0);
 });
 test('LIFE-07 parallel retry preserves one copy of each point and one battery/step receipt',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),points=Array.from({length:20},(_,i)=>f.point(r,i));
  const results=await Promise.all(Array.from({length:5},()=>f.upload(a,r,points,{stepDelta:25})));assert.ok(results.every(r=>r.status===200));assert.equal(await prisma.runPoint.count({where:{runId:r.id}}),20);
  const stored=await prisma.run.findUnique({where:{id:r.id}});assert.equal(Object.keys(stored.runSignals.batches).length,1);assert.equal(Object.values(stored.runSignals.batches)[0].stepDelta,25);
 });
 test('GPS-07 pause/resume is idempotent and never adds a path between distant positions',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),time=seconds=>new Date(+new Date(r.startedAt)+seconds*1000).toISOString();
  const pause={eventId:randomUUID(),recordedAt:time(10),elapsedMs:10000,position:{lat:19.076,lng:72.8777}},resume={eventId:randomUUID(),recordedAt:time(40),elapsedMs:40000,position:{lat:20,lng:73}};
  assert.equal((await f.upload(a,r,[f.point(r,0)])).status,200);
  const paused=await f.call(a,'post',`/api/runs/${r.id}/pause`,pause);assert.equal(paused.body.run.state,'PAUSED');assert.equal((await f.call(a,'post',`/api/runs/${r.id}/pause`,pause)).status,200);
  assert.equal((await f.call(a,'post',`/api/runs/${r.id}/resume`,resume)).status,200);
  error(await f.call(a,'post',`/api/runs/${r.id}/resume`,{...resume,elapsedMs:40001}),409,'IDEMPOTENCY_CONFLICT');
  assert.equal((await f.upload(a,r,[f.point(r,1,{lat:20,lng:73,recordedAt:time(50),deviceTimestamp:time(50),elapsedMs:50000,segmentId:resume.eventId})])).status,200);
  error(await f.upload(a,r,[f.point(r,2,{recordedAt:time(30)})]),400,'POINT_OUTSIDE_SEGMENT');
  const finished=await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:time(60)});assert.equal(finished.status,200);assert.equal(finished.body.run.distanceM,0);assert.equal(finished.body.run.durationS,30);assert.equal(finished.body.run.routeSegments.length,2);assert.ok(finished.body.run.informationalReviews.some(r=>r.code==='PAUSED_MOVEMENT'));
 });
 test('GPS-07 a missing resume position derives movement once from the earliest accurate point even with out-of-order batches',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),time=n=>new Date(+new Date(r.startedAt)+n*1000).toISOString();
  await f.upload(a,r,[f.point(r,0,{recordedAt:time(10),elapsedMs:10000})]);
  assert.equal((await f.call(a,'post',`/api/runs/${r.id}/pause`,{eventId:randomUUID(),recordedAt:time(20),elapsedMs:20000,reason:'USER',position:{lat:19.076,lng:72.8777,accuracyM:5}})).status,200);
  const resume={eventId:randomUUID(),recordedAt:time(40),elapsedMs:40000,reason:'PROCESS_RECOVERY',position:null};
  assert.equal((await f.call(a,'post',`/api/runs/${r.id}/resume`,resume)).status,200);
  for(const [seq,at,lat,accuracyM] of [[3,70,19.09,5],[2,60,19.08,80],[1,50,19.079,5]])assert.equal((await f.upload(a,r,[f.point(r,seq,{lat,accuracyM,recordedAt:time(at),deviceTimestamp:time(at),elapsedMs:at*1000,segmentId:resume.eventId})])).status,200);
  const replay=f.point(r,1,{lat:19.079,accuracyM:5,recordedAt:time(50),deviceTimestamp:time(50),elapsedMs:50000,segmentId:resume.eventId});assert.equal((await f.upload(a,r,[replay])).status,200);
  const row=await prisma.run.findUnique({where:{id:r.id}});assert.equal(row.runSignals.pausedMovement.length,1);assert.ok(row.runSignals.pausedMovement[0].distanceM>300&&row.runSignals.pausedMovement[0].distanceM<400);assert.equal(row.runSignals.segments[1].resumePointSeq,1);
  const end=await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:time(80)});assert.equal(end.status,200);assert.equal(end.body.run.informationalReviews.some(v=>v.code==='PAUSED_MOVEMENT'),false);
 });
 test('PERM-07 GPS-off movement is an interruption and never a paused-movement cheating review',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),time=n=>new Date(+new Date(r.startedAt)+n*1000).toISOString();
  await f.upload(a,r,[f.point(r,0,{recordedAt:time(10),elapsedMs:10000})]);
  assert.equal((await f.call(a,'post',`/api/runs/${r.id}/pause`,{eventId:randomUUID(),recordedAt:time(20),elapsedMs:20000,reason:'GPS_OFF',position:{lat:19.076,lng:72.8777}})).status,200);
  const resume={eventId:randomUUID(),recordedAt:time(40),elapsedMs:40000,reason:'GPS_ON',position:{lat:20,lng:73}};assert.equal((await f.call(a,'post',`/api/runs/${r.id}/resume`,resume)).status,200);
  await f.upload(a,r,[f.point(r,1,{lat:20,lng:73,recordedAt:time(50),deviceTimestamp:time(50),elapsedMs:50000,segmentId:resume.eventId})]);
  const end=await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:time(60)});assert.equal(end.status,200);assert.equal(end.body.run.routeSegments.length,2);assert.equal(end.body.run.distanceM,0);assert.equal(end.body.run.informationalReviews.some(v=>v.code==='PAUSED_MOVEMENT'),false);
 });
 test('LIFE-03 recovery ends at the last stored point even when a pause or empty resume happened later',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),time=n=>new Date(+new Date(r.startedAt)+n*1000).toISOString();
  await f.upload(a,r,[f.point(r,0,{recordedAt:time(10),elapsedMs:10000})]);
  assert.equal((await f.call(a,'post',`/api/runs/${r.id}/pause`,{eventId:randomUUID(),recordedAt:time(20),elapsedMs:20000})).status,200);
  assert.equal((await f.call(a,'post',`/api/runs/${r.id}/resume`,{eventId:randomUUID(),recordedAt:time(30),elapsedMs:30000})).status,200);
  error(await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:time(11),reason:'RECOVERY',lastSeq:0}),400,'INVALID_END_TIME');
  const result=await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:time(10),reason:'RECOVERY',lastSeq:0});assert.equal(result.status,200);assert.equal(result.body.run.endedAt,time(10));assert.equal(result.body.run.durationS,10);
  const row=await prisma.run.findUnique({where:{id:r.id}});assert.equal(row.runSignals.controls.length,2);assert.equal(row.runSignals.segments.length,1);assert.equal(await prisma.runPoint.count({where:{runId:r.id}}),1);
  const empty=await f.start(a),end=new Date(+new Date(empty.startedAt)+1).toISOString();assert.equal((await f.call(a,'post',`/api/runs/${empty.id}/finish`,{endedAt:end,reason:'RECOVERY',lastSeq:-1})).status,200);
 });
 test('LIFE-09 finish twice returns the same immutable result; an empty/tiny run can be discarded without claiming',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),endedAt=new Date().toISOString();
  const first=await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt});assert.equal(first.status,200);assert.equal(first.body.run.status,'PENDING_VALIDATION');assert.equal(first.body.run.distanceM,0);
  const second=await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:new Date().toISOString()});assert.deepEqual(second.body,first.body);assert.equal(await prisma.runHex.count({where:{runId:r.id}}),0);assert.equal(await prisma.runFlag.count({where:{runId:r.id}}),0);
  assert.equal((await f.call(a,'delete',`/api/runs/${r.id}`,{})).status,204);assert.equal((await f.call(a,'delete',`/api/runs/${r.id}`,{})).status,204);error(await f.call(a,'get',`/api/runs/${r.id}`),404,'NOT_FOUND');
 });
 test('GPS-02 finish calculates authoritative haversine distance from a known GPX-style fixture',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),time=seconds=>new Date(+new Date(r.startedAt)+seconds*1000).toISOString();
  const points=[0,1,2].map(i=>f.point(r,i,{lat:19.076+i*.0001,recordedAt:time(i*10),deviceTimestamp:time(i*10),elapsedMs:i*10000}));
  assert.equal((await f.upload(a,r,points)).status,200);const result=await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:time(30),lastSeq:2});assert.equal(result.status,200);assert.equal(result.body.run.distanceM,22);assert.equal(result.body.run.durationS,30);
  const changed=await f.upload(a,r,[f.point(r,3)]);error(changed,409,'RUN_FINISHED');
  const replay=await f.upload(a,r,points);assert.equal(replay.status,200);assert.equal(replay.body.duplicate,true);
 });
 test('LIFE-06 stale takeover is denied for ten minutes and a received point resets that interval',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a);error(await f.call(a,'post',`/api/runs/${r.id}/end-stale`,{}),409,'RUN_RECENTLY_ACTIVE');
  await prisma.run.update({where:{id:r.id},data:{createdAt:new Date(Date.now()-601000)}});
  assert.equal((await f.upload(a,r,[f.point(r,0)])).status,200);error(await f.call(a,'post',`/api/runs/${r.id}/end-stale`,{}),409,'RUN_RECENTLY_ACTIVE');
  const stored=await prisma.run.findUnique({where:{id:r.id}});await prisma.run.update({where:{id:r.id},data:{runSignals:{...stored.runSignals,lastPointReceivedAt:new Date(Date.now()-601000).toISOString()}}});
  const ended=await f.call(a,'post',`/api/runs/${r.id}/end-stale`,{});assert.equal(ended.status,200);assert.equal(ended.body.run.endedAt,new Date(+new Date(r.startedAt)+1).toISOString());assert.equal((await f.start(a)).status,'ACTIVE');
 });
 test('LIFE-11 point ceiling and run length are enforced; runs over eight hours get informational review only',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a);
  await prisma.$executeRaw`INSERT INTO run_points(run_id,seq,lat,lng,recorded_at,accuracy_m) SELECT ${r.id}::uuid,n,19,72,${new Date(r.startedAt)},5 FROM generate_series(0,99999) n`;
  error(await f.upload(a,r,[f.point(r,100000,{recordedAt:new Date().toISOString(),elapsedMs:240000})]),409,'RUN_POINT_LIMIT');
  await prisma.run.update({where:{id:r.id},data:{deletedAt:new Date()}});const ultra=await f.start(a),old=new Date(Date.now()-9*3600000),stored=await prisma.run.findUnique({where:{id:ultra.id}});
  await prisma.run.update({where:{id:ultra.id},data:{startedAt:old,runSignals:{...stored.runSignals,segments:[{id:ultra.clientRunId,startedAt:old.toISOString(),endedAt:null}]}}});
  const finished=await f.call(a,'post',`/api/runs/${ultra.id}/finish`,{endedAt:new Date().toISOString()});assert.equal(finished.status,200);assert.equal(finished.body.run.status,'PENDING_VALIDATION');assert.ok(finished.body.run.informationalReviews.some(x=>x.code==='LONG_RUN'&&x.severity==='INFO'));
  const tooLong=await f.start(a),before=new Date(Date.now()-86401000),row=await prisma.run.findUnique({where:{id:tooLong.id}});await prisma.run.update({where:{id:tooLong.id},data:{startedAt:before,runSignals:{...row.runSignals,segments:[{id:tooLong.clientRunId,startedAt:before.toISOString(),endedAt:null}]}}});error(await f.call(a,'post',`/api/runs/${tooLong.id}/finish`,{endedAt:new Date().toISOString()}),400,'RUN_TOO_LONG');
 });
 test('GPS-08 restricted cells are annotated without claims and the nearest region is attached',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),p=f.point(r,0),zone=await prisma.restrictedZone.create({data:{name:`Zone ${randomUUID()}`,reason:'Fixture'}}),region=await prisma.region.create({data:{name:`Region ${randomUUID()}`,city:'Fixture'}});
  t.after(async()=>{await prisma.restrictedZone.delete({where:{id:zone.id}});await prisma.region.delete({where:{id:region.id}});});
  await prisma.restrictedZoneHex.create({data:{zoneId:zone.id,h3Index:BigInt('0x'+h3.latLngToCell(p.lat,p.lng,11))}});
  await prisma.regionCell.create({data:{regionId:region.id,parentH3:BigInt('0x'+h3.latLngToCell(20,73,6))}});
  assert.equal((await f.upload(a,r,[p])).status,200);const result=await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:new Date().toISOString()});assert.equal(result.status,200);assert.equal(result.body.run.restricted,true);assert.equal(result.body.run.region.id,region.id);assert.equal(await prisma.hexOwnership.count({where:{runId:r.id}}),0);
 });
 test('GPS-09 a different city uses the nearest known region cell and an empty catalog never blocks recording',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),region=await prisma.region.create({data:{name:`Remote ${randomUUID()}`,city:'Remote fixture'}});t.after(()=>prisma.region.delete({where:{id:region.id}}));
  await prisma.regionCell.create({data:{regionId:region.id,parentH3:BigInt('0x'+h3.latLngToCell(-33.86,151.2,6))}});
  assert.equal((await f.upload(a,r,[f.point(r,0,{lat:-34,lng:150})])).status,200);const result=await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:new Date().toISOString()});assert.equal(result.status,200);assert.equal(result.body.run.region.id,region.id);
 });
 test('GPS-05 network-provider and mock flags survive ingestion; network points are excluded from restricted-cell claim annotations',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a);const point=f.point(r,0,{provider:'network',isMock:true});assert.equal((await f.upload(a,r,[point])).status,200);const detail=await f.call(a,'get',`/api/runs/${r.id}`);assert.equal(detail.body.points[0].provider,'network');assert.equal(detail.body.points[0].isMock,true);assert.equal((await prisma.run.findUnique({where:{id:r.id}})).mockGps,true);
 });
 test('PRIV-04 deletion aborts ACTIVE data atomically against concurrent ingest and cannot leave a publishing run',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),points=[f.point(r,0)];
  const [deleted,uploaded]=await Promise.all([f.call(a,'delete','/api/me',{confirmation:'DELETE',password}),f.upload(a,r,points)]);assert.equal(deleted.status,204);assert.ok([200,401,403].includes(uploaded.status));assert.equal(await prisma.run.count({where:{userId:a.user.id}}),0);assert.equal(await prisma.runPoint.count({where:{runId:r.id}}),0);
 });
 test('PRIV-06 export includes own new run signals and points, never another account recordings',async t=>{
  const f=await fixture(t),a=await f.signup(),b=await f.signup(),own=await f.start(a),other=await f.start(b);await f.upload(a,own,[f.point(own,0)]);await f.upload(b,other,[f.point(other,0,{lat:88,lng:99})]);
  const created=await f.call(a,'post','/api/me/export',{});assert.equal(created.status,202);await f.app.locals.profileJobs.drain();const output=await f.call(a,'get',`/api/me/export/${created.body.export.id}`);assert.equal(output.status,200);assert.equal(output.body.runs.length,1);assert.equal(output.body.runs[0].id,own.id);assert.equal(output.body.runs[0].points[0].provider,'gps');assert.equal(output.body.runs[0].runSignals.device.installId,a.installId);assert.equal(JSON.stringify(output.body).includes(other.id),false);
 });
 test('LIFE-11 raw-point retention purges auxiliary coordinates at expiry, keeps active runs and summaries, and is idempotent',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a);await f.upload(a,r,[f.point(r,0)]);await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:new Date().toISOString()});const active=await f.start(a);await f.upload(a,active,[f.point(active,0)]);
  const service=createRunRetention({prisma,config:f.settings,clock:()=>new Date(Date.now()+366*86400000)});await service.cleanup();await service.cleanup();assert.equal(await prisma.runPoint.count({where:{runId:r.id}}),0);assert.equal(await prisma.runPoint.count({where:{runId:active.id}}),1);const retained=await prisma.run.findUnique({where:{id:r.id}});assert.equal(retained.status,'PENDING_VALIDATION');assert.ok(retained.runSignals.rawPointsPurgedAt);assert.deepEqual(retained.runSignals.pointMeta,{});
 });
 test('LIFE-06 history and point pagination are stable, owner-only, and omit soft-deleted runs',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a);await f.upload(a,r,[f.point(r,0),f.point(r,1),f.point(r,2)]);await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:new Date().toISOString()});const second=await f.start(a);
  const first=await f.call(a,'get','/api/runs?limit=1');assert.equal(first.body.runs.length,1);assert.ok(first.body.nextCursor);const next=await f.call(a,'get',`/api/runs?limit=1&cursor=${first.body.nextCursor}`);assert.equal(next.body.runs.length,1);assert.notEqual(next.body.runs[0].id,first.body.runs[0].id);
  const chunk=await f.call(a,'get',`/api/runs/${r.id}?pointLimit=2`);assert.deepEqual(chunk.body.points.map(p=>p.seq),[0,1]);assert.equal(chunk.body.nextPointSeq,1);const last=await f.call(a,'get',`/api/runs/${r.id}?pointLimit=2&afterSeq=1`);assert.deepEqual(last.body.points.map(p=>p.seq),[2]);
  error(await f.call(a,'get','/api/runs?cursor=not-json'),400,'INVALID_CURSOR');await f.call(a,'delete',`/api/runs/${second.id}`,{});assert.equal((await f.call(a,'get','/api/runs')).body.runs.length,1);
 });
 test('LIFE-10 clock-jump and interruption signals plus battery/optional steps persist once; invalid ratios stay soft',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),event={id:randomUUID(),type:'CLOCK_JUMP',recordedAt:r.startedAt,elapsedMs:0,data:{clockDeltaMs:180000}},points=[f.point(r,0)];
  const data={events:[event],invalidDropped:25,stepDelta:null};assert.equal((await f.upload(a,r,points,data)).status,200);assert.equal((await f.upload(a,r,points,data)).status,200);
  const row=await prisma.run.findUnique({where:{id:r.id}});assert.equal(row.runSignals.events.length,1);assert.equal(row.runSignals.events[0].type,'CLOCK_JUMP');assert.equal(Object.values(row.runSignals.batches)[0].batteryLevel,80);
  const result=await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:new Date().toISOString()});assert.equal(result.status,200);assert.equal(result.body.run.status,'PENDING_VALIDATION');assert.ok(result.body.run.informationalReviews.some(x=>x.code==='INVALID_POINT_RATIO'&&x.severity==='SOFT'));assert.equal(await prisma.runFlag.count({where:{runId:r.id}}),0);
 });
 test('LIFE-11 a full 500-point batch is stored atomically with its auxiliary signals',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),points=Array.from({length:500},(_,seq)=>f.point(r,seq,{recordedAt:new Date(+new Date(r.startedAt)+seq*400).toISOString(),deviceTimestamp:new Date(+new Date(r.startedAt)+seq*400).toISOString(),elapsedMs:seq*400}));
  const result=await f.upload(a,r,points);assert.equal(result.status,200);assert.equal(result.body.highestSeq,499);assert.equal(await prisma.runPoint.count({where:{runId:r.id}}),500);assert.equal(Object.keys((await prisma.run.findUnique({where:{id:r.id}})).runSignals.pointMeta).length,500);
 });
 test('PRIV-04 an aborted deletion rolls back the ACTIVE-run abort marker and every point',async t=>{
  const broken=new Proxy(prisma,{get(target,key){if(key==='$transaction')return(task,opts)=>target.$transaction(tx=>task(new Proxy(tx,{get(inner,k){if(k==='user')return new Proxy(inner.user,{get(model,m){if(m==='delete')return()=>{throw Error('Rollback fixture');};return model[m];}});return inner[k];}})),opts);return target[key];}});
  const f=await fixture(t,{}, {prisma:broken}),a=await f.signup(),r=await f.start(a);await f.upload(a,r,[f.point(r,0)]);
  error(await f.call(a,'delete','/api/me',{confirmation:'DELETE',password}),500,'INTERNAL_ERROR');const row=await prisma.run.findUnique({where:{id:r.id}});assert.equal(row.deletedAt,null);assert.equal(row.status,'ACTIVE');assert.equal(await prisma.runPoint.count({where:{runId:r.id}}),1);
 });
 test('LIFE-08 stationary auto-finish keeps raw tail evidence and ends at the last movement time',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),at=sec=>new Date(+new Date(r.startedAt)+sec*1000).toISOString();
  assert.equal((await f.upload(a,r,[f.point(r,0),f.point(r,1,{lat:19.076001,recordedAt:at(30),deviceTimestamp:at(30),elapsedMs:30000})])).status,200);
  assert.equal((await f.call(a,'post',`/api/runs/${r.id}/pause`,{eventId:randomUUID(),recordedAt:at(60),elapsedMs:60000,reason:'NO_MOVEMENT'})).status,200);
  const result=await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:at(1),lastSeq:1,reason:'STATIONARY',invalidDroppedTotal:3});assert.equal(result.status,200);assert.equal(result.body.run.endedAt,at(1));assert.equal(await prisma.runPoint.count({where:{runId:r.id}}),2);const row=await prisma.run.findUnique({where:{id:r.id}});assert.deepEqual(row.runSignals.stationaryTailSeqs,[1]);assert.equal(row.runSignals.invalidDroppedTotal,3);
 });
 test('LIFE-08 stationary end clips later manual control windows while retaining the raw control evidence',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),at=sec=>new Date(+new Date(r.startedAt)+sec*1000).toISOString();
  await f.upload(a,r,[f.point(r,0),f.point(r,1,{lat:19.076001,recordedAt:at(30),deviceTimestamp:at(30),elapsedMs:30000})]);
  assert.equal((await f.call(a,'post',`/api/runs/${r.id}/pause`,{eventId:randomUUID(),recordedAt:at(40),elapsedMs:40000,reason:'USER'})).status,200);
  assert.equal((await f.call(a,'post',`/api/runs/${r.id}/resume`,{eventId:randomUUID(),recordedAt:at(50),elapsedMs:50000,reason:'USER'})).status,200);
  const result=await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:at(1),reason:'STATIONARY'});assert.equal(result.status,200);assert.equal(result.body.run.durationS,1);
  const row=await prisma.run.findUnique({where:{id:r.id}});assert.equal(row.runSignals.controls.length,2);assert.equal(row.runSignals.segments.length,1);assert.equal(await prisma.runPoint.count({where:{runId:r.id}}),2);
 });
 test('LIFE-08 moving tail evidence prevents an early stationary finish without changing any points',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),at=sec=>new Date(+new Date(r.startedAt)+sec*1000).toISOString();
  await f.upload(a,r,[f.point(r,0),f.point(r,1,{lat:19.08,recordedAt:at(30),deviceTimestamp:at(30),elapsedMs:30000})]);error(await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:at(1),reason:'STATIONARY'}),409,'RUN_STILL_MOVING');assert.equal((await prisma.run.findUnique({where:{id:r.id}})).status,'ACTIVE');
 });
 test('LIFE-10 signal-only event batches are idempotent, authenticated and owner scoped',async t=>{
  const f=await fixture(t),a=await f.signup(),b=await f.signup(),r=await f.start(a),body={eventId:randomUUID(),events:[{id:randomUUID(),type:'GPS_OFF',recordedAt:r.startedAt}]};
  assert.equal((await f.call(a,'post',`/api/runs/${r.id}/signals`,body)).status,200);assert.equal((await f.call(a,'post',`/api/runs/${r.id}/signals`,body)).status,200);assert.equal((await prisma.run.findUnique({where:{id:r.id}})).runSignals.events.length,1);
  error(await f.call(b,'post',`/api/runs/${r.id}/signals`,body),404,'NOT_FOUND');error(await f.call(null,'post',`/api/runs/${r.id}/signals`,body),401,'UNAUTHORIZED');error(await f.call(a,'post',`/api/runs/${randomUUID()}/signals`,body),404,'NOT_FOUND');error(await f.call(a,'post',`/api/runs/${r.id}/signals`,{...body,events:[]}),400,'INVALID_INPUT');error(await f.call(a,'post',`/api/runs/${r.id}/signals`,{...body,events:[{...body.events[0],type:'GPS_ON'}]}),409,'IDEMPOTENCY_CONFLICT');
 });
 test('LIFE-06 another installation can read its account history but cannot pause finish discard or upload the live run',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a),other={...a,installId:randomUUID()};
  assert.equal((await f.call(other,'get',`/api/runs/${r.id}`)).status,200);
  for(const [verb,suffix,body] of [['post','/pause',{eventId:randomUUID(),recordedAt:new Date().toISOString(),elapsedMs:1}],['post','/finish',{endedAt:new Date().toISOString()}],['post','/points',f.batch(r,[f.point(r,0)])],['delete','',{}]])error(await f.call(other,verb,`/api/runs/${r.id}${suffix}`,body),409,'RUN_ACTIVE_ELSEWHERE');
  error(await f.call(other,'post',`/api/runs/${r.id}/end-stale`,{}),409,'RUN_RECENTLY_ACTIVE');
 });
 test('GPS-06 reverse sequence timestamps and invalid batch keys are rejected atomically',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a);await f.upload(a,r,[f.point(r,2)]);
  error(await f.upload(a,r,[f.point(r,0,{recordedAt:new Date(+new Date(r.startedAt)+3000).toISOString()})]),400,'OUT_OF_ORDER_TIMESTAMPS');
  error(await f.call(a,'post',`/api/runs/${r.id}/points`,f.batch(r,[f.point(r,0)],{batchKey:`${randomUUID()}:0`})),400,'INVALID_BATCH_KEY');
  assert.equal(await prisma.runPoint.count({where:{runId:r.id}}),1);
 });
 test('LIFE-07 retryable rate limiting rejects excess writes without changing stored batches',async t=>{
  const f=await fixture(t,{runWriteLimit:1}),a=await f.signup(),r=await f.start(a);
  error(await f.upload(a,r,[f.point(r,0)]),429,'RATE_LIMITED');assert.equal(await prisma.runPoint.count({where:{runId:r.id}}),0);
 });
 test('LIFE-09 a run with captured territory cannot be soft-deleted',async t=>{
  const f=await fixture(t),a=await f.signup(),r=await f.start(a);await f.call(a,'post',`/api/runs/${r.id}/finish`,{endedAt:new Date().toISOString()});
  await prisma.runHex.create({data:{runId:r.id,h3Index:900000006n,outcome:'CAPTURED'}});error(await f.call(a,'delete',`/api/runs/${r.id}`,{}),409,'RUN_ALREADY_CLAIMED');assert.equal((await prisma.run.findUnique({where:{id:r.id}})).deletedAt,null);
 });
};
