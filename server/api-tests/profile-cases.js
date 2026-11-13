'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const request=require('supertest');
const {createApp}=require('../src/app');
const {canView,mapIdentity,leaderboardIdentity}=require('../src/profile/privacy');
const {consentSummary,locationAcceptedAt}=require('../src/profile/consents');
const {createMailer,messageFor}=require('../src/auth/mailer');
const {createActionService}=require('../src/auth/actions');

module.exports=function profileCases({prisma,pool,config}) {
  const password='Profile!MountainTrail2026';
  const auth=(req,account)=>req.set('Authorization',`Bearer ${account.accessToken}`);
  const error=(res,status,code)=>{assert.equal(res.status,status,JSON.stringify(res.body));assert.equal(res.body.error?.code,code);assert.deepEqual(Object.keys(res.body),['error']);};
  async function fixture(t,overrides={},extra={}) {
    const exportDir=await fs.mkdtemp(path.resolve(__dirname,'../../.local/profile-export-test-'));
    const payloads=new Map(),logs=[],accounts=[];
    const app=createApp({prisma,config:{...config,rateLimitMax:10000,authRateLimitMax:1000,authIpRateLimitMax:1000,
      profileWriteLimit:1000,exportRequestLimit:1000,...overrides},exportDir,logger:line=>logs.push(line),
      verifyGoogle:async raw=>{if(!payloads.has(raw))throw Error('Mock rejected.');return payloads.get(raw);},...extra});
    t.after(async()=>{await app.locals.profileJobs.drain();await prisma.user.deleteMany({where:{id:{in:accounts.map(a=>a.user.id)}}});await fs.rm(exportDir,{recursive:true,force:true});});
    async function signup() {
      const res=await request(app).post('/api/auth/register').send({email:`${randomUUID()}@example.test`,password,displayName:`P ${randomUUID().slice(0,12)}`});
      assert.equal(res.status,201);accounts.push(res.body);return res.body;
    }
    function googleToken(claims={}) {
      const raw=`mock-profile-${randomUUID()}`;
      payloads.set(raw,{sub:`g_${randomUUID().replaceAll('-','')}`,email:`${randomUUID()}@gmail.com`,email_verified:true,
        aud:config.googleWebClientId,iss:'https://accounts.google.com',exp:Math.floor(Date.now()/1000)+3600,
        iat:Math.floor(Date.now()/1000),name:`G ${randomUUID().slice(0,12)}`,...claims});return raw;
    }
    return {app,signup,payloads,googleToken,accounts,logs,exportDir};
  }
  const get=(f,a,url)=>auth(request(f.app).get(url),a);
  const patch=(f,a,url,body)=>auth(request(f.app).patch(url),a).send(body);
  const post=(f,a,url,body={})=>auth(request(f.app).post(url),a).send(body);
  const remove=(f,a,body={confirmation:'DELETE',password})=>auth(request(f.app).delete('/api/me'),a).send(body);
  async function run(userId) {
    return prisma.run.create({data:{userId,clientRunId:randomUUID(),startedAt:new Date(Date.now()-10000),endedAt:new Date(),distanceM:30,durationS:10,appVersion:'test'}});
  }

  test('profile GET/PATCH returns generated-avatar options, catalog and only own editable fields',async t=>{
    const f=await fixture(t),a=await f.signup(),b=await f.signup();
    const region=await prisma.region.create({data:{name:`Test ${randomUUID()}`,city:'Test City'}});t.after(()=>prisma.region.delete({where:{id:region.id}}));
    const initial=await get(f,a,'/api/me/profile');assert.equal(initial.status,200);assert.equal(initial.body.options.avatarIds.length,12);
    assert.ok(initial.body.regions.some(row=>row.id===region.id));
    const update={displayName:`Edited ${randomUUID().slice(0,8)}`,avatarId:11,avatarColor:'#B8452A',preferredUnits:'mi',bio:'My trail.',homeRegionId:region.id};
    const res=await patch(f,a,'/api/me/profile',update);assert.equal(res.status,200);for(const [key,value] of Object.entries(update))assert.equal(res.body.profile[key],value);
    assert.equal((await get(f,b,'/api/me/profile')).body.profile.bio,'');
    assert.equal(res.body.profile.email,undefined);assert.equal(res.body.profile.passwordHash,undefined);
    error(await patch(f,a,'/api/me/profile',{homeRegionId:randomUUID()}),404,'REGION_NOT_FOUND');
    assert.equal((await patch(f,a,'/api/me/profile',{homeRegionId:null})).body.profile.homeRegionId,null);
  });
  test('profile validation rejects empty, unknown, unsafe and out-of-range edits without changing the account',async t=>{
    const f=await fixture(t),a=await f.signup();
    for(const body of [{},{userId:randomUUID()},{displayName:'Li'},{displayName:'Bad Shit'},{displayName:'a'.repeat(25)},
      {avatarId:12},{avatarColor:'#FFFFFF'},{preferredUnits:'miles'},{bio:'x'.repeat(141)},{bio:'bad\u0000'},{homeRegionId:'no'}])
      error(await patch(f,a,'/api/me/profile',body),400,'INVALID_INPUT');
    assert.equal((await get(f,a,'/api/me/profile')).body.profile.displayName,a.user.displayName);
  });
  test('PRIV-07 exact profile edits reject canonical conflicts and reserve released names for 30 days; history is admin-only',async t=>{
    const f=await fixture(t),a=await f.signup(),b=await f.signup(),original=a.user.displayName;
    error(await patch(f,b,'/api/me/profile',{displayName:original.toUpperCase()}),409,'DISPLAY_NAME_UNAVAILABLE');
    assert.equal((await patch(f,a,'/api/me/profile',{displayName:`New ${randomUUID().slice(0,8)}`})).status,200);
    error(await patch(f,b,'/api/me/profile',{displayName:original}),409,'DISPLAY_NAME_UNAVAILABLE');
    error(await get(f,b,`/api/admin/users/${a.user.id}/name-history`),403,'FORBIDDEN');
    await prisma.user.update({where:{id:b.user.id},data:{role:'ADMIN'}});
    const history=await get(f,b,`/api/admin/users/${a.user.id}/name-history`);assert.equal(history.status,200);assert.equal(history.body.history[0].displayName,original);
    assert.equal(new Date(history.body.history[0].reservedUntil)-new Date(history.body.history[0].changedAt),30*86400000);
    error(await get(f,b,`/api/admin/users/${randomUUID()}/name-history`),404,'NOT_FOUND');
    assert.equal((await patch(f,a,'/api/me/profile',{displayName:original})).status,200);
  });
  test('PRIV-07 two parallel exact edits to one canonical name have one winner',async t=>{
    const f=await fixture(t),a=await f.signup(),b=await f.signup(),name=`Race ${randomUUID().slice(0,8)}`;
    const responses=await Promise.all([patch(f,a,'/api/me/profile',{displayName:name}),patch(f,b,'/api/me/profile',{displayName:name.toUpperCase()})]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  });
  test('PRIV-01 visibility matrix covers owner follower following-only stranger anonymous and administrator',()=>{
    const target={id:'target',displayName:'Trail Runner',privacy:{appearOnLeaderboards:true}};
    for(const visibility of ['PUBLIC','FOLLOWERS','PRIVATE'])for(const relation of ['owner','follower','following-only','stranger','anonymous','admin']) {
      target.privacy.profileVisibility=visibility;
      const viewer=relation==='anonymous'?null:{id:relation==='owner'?'target':'viewer',role:relation==='admin'?'ADMIN':'RUNNER'};
      const expected=relation==='owner'||visibility==='PUBLIC'||visibility==='FOLLOWERS'&&relation==='follower';
      assert.equal(canView(viewer,target,{isFollower:relation==='follower'}),expected,`${visibility}/${relation}`);
      assert.equal(mapIdentity(viewer,target,{isFollower:relation==='follower'}).id,'target');
      assert.equal(leaderboardIdentity(viewer,target,{isFollower:relation==='follower'}).displayName,expected?'Trail Runner':'Runner');
    }
    target.privacy.appearOnLeaderboards=false;assert.equal(leaderboardIdentity({id:'target'},target),null);
    assert.equal(canView({id:'target'},{...target,deletionAt:new Date()}),false);
  });
  test('PRIV-01 privacy writes affect public profile reads immediately; followers have access only under FOLLOWERS',async t=>{
    const f=await fixture(t),a=await f.signup(),b=await f.signup(),url=`/api/users/${a.user.id}/profile`;
    assert.deepEqual((await get(f,a,'/api/me/privacy')).body.privacy,{profileVisibility:'PRIVATE',appearOnLeaderboards:false,shareRouteShapes:false});
    error(await get(f,b,url),404,'NOT_FOUND');
    assert.equal((await patch(f,a,'/api/me/privacy',{profileVisibility:'PUBLIC',shareRouteShapes:true,appearOnLeaderboards:true})).status,200);
    assert.equal((await get(f,b,url)).body.profile.id,a.user.id);
    await prisma.follow.create({data:{followerId:b.user.id,followeeId:a.user.id}});
    await patch(f,a,'/api/me/privacy',{profileVisibility:'FOLLOWERS'});assert.equal((await get(f,b,url)).status,200);
    await patch(f,a,'/api/me/privacy',{profileVisibility:'PRIVATE'});error(await get(f,b,url),404,'NOT_FOUND');
    assert.equal((await get(f,a,url)).status,200);
    assert.equal((await prisma.userPrivacySetting.findUnique({where:{userId:a.user.id}})).hideRoute,false);
    error(await patch(f,a,'/api/me/privacy',{shareRouteShapes:'yes'}),400,'INVALID_INPUT');
    error(await patch(f,a,'/api/me/privacy',{}),400,'INVALID_INPUT');
    error(await get(f,a,`/api/users/${randomUUID()}/profile`),404,'NOT_FOUND');
  });
  test('PRIV-02 consent history is ordered, retries are harmless, and stale acceptance cannot undo withdrawal',async t=>{
    const f=await fixture(t),a=await f.signup(),url='/api/me/consents',version=config.consentVersions.LOCATION;
    const accept={type:'LOCATION',version,accepted:true};
    const first=await post(f,a,url,accept);assert.equal(first.status,200);assert.equal(first.body.history.length,1);
    assert.equal((await post(f,a,url,accept)).body.history.length,1);
    const withdrawn=await post(f,a,url,{...accept,accepted:false});assert.equal(withdrawn.status,200);assert.equal(withdrawn.body.history.length,2);
    error(await post(f,a,url,accept),409,'CONSENT_CHANGED');
    const current=withdrawn.body.consents.find(c=>c.type==='LOCATION');
    const again=await auth(request(f.app).post(url),a).set('If-Match',current.etag).send(accept);assert.equal(again.status,200);assert.equal(again.body.history.length,3);
    const rows=await prisma.userConsent.findMany({where:{userId:a.user.id},orderBy:{id:'asc'}});
    assert.equal(locationAcceptedAt(rows,rows[0].createdAt,version),true);
    assert.equal(locationAcceptedAt(rows,rows[1].createdAt,version),false);
    assert.equal(locationAcceptedAt(rows,new Date(rows[0].createdAt-1),version),false);
    const other=await f.signup();assert.equal((await get(f,other,url)).body.history.length,0);
  });
  test('PRIV-03 policy version bumps require fresh acceptance without modifying old consent or runs',async t=>{
    const f=await fixture(t),a=await f.signup(),r=await run(a.user.id),old=config.consentVersions.LOCATION;
    await post(f,a,'/api/me/consents',{type:'LOCATION',version:old,accepted:true});
    const changed=createApp({prisma,config:{...config,consentVersions:{...config.consentVersions,LOCATION:'next-version'}},logger:()=>{}});
    const summary=await auth(request(changed).get('/api/me/consents'),a);assert.equal(summary.body.consents[0].requiresAcceptance,true);assert.equal(summary.body.history[0].version,old);
    error(await auth(request(changed).post('/api/me/consents'),a).send({type:'LOCATION',version:old,accepted:true}),409,'CONSENT_VERSION_CHANGED');
    assert.equal((await prisma.run.findUnique({where:{id:r.id}})).distanceM,30);
    assert.equal(consentSummary(await prisma.userConsent.findMany({where:{userId:a.user.id}}),{...config.consentVersions,LOCATION:'next-version'})[0].accepted,false);
  });
  test('new endpoints reject missing/bad auth, unknown query/body fields and malformed resource IDs',async t=>{
    const f=await fixture(t),a=await f.signup();
    for(const [method,url,body] of [['get','/api/me/profile'],['patch','/api/me/profile',{bio:'x'}],['get','/api/me/privacy'],
      ['patch','/api/me/privacy',{shareRouteShapes:true}],['get','/api/me/consents'],['post','/api/me/consents',{type:'LOCATION',version:'v1',accepted:true}],
      ['post','/api/me/export',{}],['get',`/api/me/export/${randomUUID()}`],['delete','/api/me',{confirmation:'DELETE',password}],
      ['get',`/api/users/${randomUUID()}/profile`],['get',`/api/admin/users/${randomUUID()}/name-history`]]) {
      for(const bearer of [null,'invalid']) {let req=request(f.app)[method](url);if(bearer)req=req.set('Authorization',`Bearer ${bearer}`);if(body)req=req.send(body);error(await req,401,'UNAUTHORIZED');}
    }
    for(const url of ['/api/me/profile','/api/me/privacy','/api/me/consents'])error(await get(f,a,url+'?userId=other'),400,'INVALID_INPUT');
    for(const url of ['/api/me/export/no','/api/users/no/profile','/api/admin/users/no/name-history'])error(await get(f,a,url),400,'INVALID_INPUT');
    for(const body of [{type:'OTHER',version:'v1',accepted:true},{type:'LOCATION',version:'',accepted:true},{type:'LOCATION',version:'v1',accepted:'yes'}])
      error(await post(f,a,'/api/me/consents',body),400,'INVALID_INPUT');
    error(await post(f,a,'/api/me/export',{userId:randomUUID()}),400,'INVALID_INPUT');
    for(const body of [{confirmation:'delete',password},{confirmation:'DELETE'},{confirmation:'DELETE',password,idToken:'fake-token-long'}])error(await remove(f,a,body),400,'INVALID_INPUT');
  });
  test('write limits are per account and CORS permits PATCH for configured origins',async t=>{
    const f=await fixture(t,{profileWriteLimit:1,exportRequestLimit:1}),a=await f.signup(),b=await f.signup();
    assert.equal((await patch(f,a,'/api/me/profile',{bio:'One'})).status,200);error(await patch(f,a,'/api/me/profile',{bio:'Two'}),429,'RATE_LIMITED');
    assert.equal((await patch(f,b,'/api/me/profile',{bio:'Other'})).status,200);
    await post(f,a,'/api/me/export');error(await post(f,a,'/api/me/export'),429,'RATE_LIMITED');
    const options=await request(f.app).options('/api/me/profile').set('Origin',config.origins[0]).set('Access-Control-Request-Method','PATCH');
    assert.match(options.headers['access-control-allow-methods'],/PATCH/);
  });

  test('PRIV-04 deletion is atomic, idempotent, releases hexes and removes identifiers, sessions and export keys',async t=>{
    const f=await fixture(t),a=await f.signup(),b=await f.signup(),own=await run(a.user.id),other=await run(b.user.id);
    await prisma.runPoint.create({data:{runId:own.id,seq:0,lat:1,lng:2,recordedAt:new Date(),accuracyM:5}});
    await prisma.hexOwnership.create({data:{h3Index:900000001n,ownerId:a.user.id,runId:own.id,cooldownUntil:new Date()}});
    await prisma.runHex.create({data:{runId:other.id,h3Index:900000001n,outcome:'CAPTURED',prevOwnerId:a.user.id}});
    await prisma.notification.create({data:{userId:b.user.id,type:'HEX_LOST',title:`Lost to ${a.user.displayName}`,body:a.user.id}});
    await prisma.runFlag.create({data:{runId:other.id,reason:'USER_REPORT',reporterId:a.user.id,details:a.user.email}});
    await prisma.loginAttempt.create({data:{email:a.user.email,ipAddress:'127.0.0.1',success:true}});
    await prisma.adminAction.create({data:{adminId:a.user.id,action:'TEST',targetType:'USER',targetId:a.user.id,note:a.user.email}});
    await post(f,a,'/api/me/consents',{type:'LOCATION',version:config.consentVersions.LOCATION,accepted:true});
    const exported=await post(f,a,'/api/me/export');await f.app.locals.profileJobs.drain();assert.equal(exported.status,202);
    let cancelled=false;f.app.locals.profileJobs.enqueue(a.user.id,signal=>new Promise(resolve=>signal.addEventListener('abort',()=>{cancelled=true;resolve();},{once:true})));
    assert.equal((await remove(f,a)).status,204);assert.equal(cancelled,true);assert.equal((await remove(f,a)).status,204);
    assert.equal(await prisma.user.findUnique({where:{id:a.user.id}}),null);
    for(const model of ['authToken','authIdentity','userConsent','dataExport','run','device','notification'])assert.equal(await prisma[model].count({where:{userId:a.user.id}}),0,model);
    assert.equal(await prisma.runPoint.count({where:{runId:own.id}}),0);assert.equal(await prisma.hexOwnership.count({where:{ownerId:a.user.id}}),0);
    assert.equal((await prisma.runHex.findUnique({where:{runId_h3Index:{runId:other.id,h3Index:900000001n}}})).prevOwnerId,null);
    assert.equal(await prisma.loginAttempt.count({where:{email:a.user.email}}),0);
    const flag=await prisma.runFlag.findFirst({where:{runId:other.id}});assert.equal(flag.reporterId,null);assert.equal(flag.details,null);
    const notification=await prisma.notification.findFirst({where:{userId:b.user.id}});assert.equal(notification.body,null);assert.equal(notification.title,'Account activity');
    const audit=await prisma.adminAction.findFirst({where:{action:'TEST',targetId:'00000000-0000-0000-0000-000000000000'}});assert.ok(audit);assert.equal(audit.adminId,'00000000-0000-0000-0000-000000000000');assert.equal(audit.note,null);
    assert.deepEqual(await fs.readdir(f.exportDir),[]);
    error(await get(f,b,`/api/me/export/${exported.body.export.id}`),404,'NOT_FOUND');
    assert.notEqual((await get(f,a,'/api/me')).status,200);
  });
  test('PRIV-04 failed deletion rolls back earlier redactions and does not cancel work or delete an account',async t=>{
    const broken=new Proxy(prisma,{get(target,key){if(key==='$transaction')return (task,opts)=>target.$transaction(tx=>task(new Proxy(tx,{get(inner,k){if(k==='user')return new Proxy(inner.user,{get(model,m){if(m==='delete')return ()=>{throw Error('Simulated failure');};return model[m];}});return inner[k];}})),opts);return target[key];}});
    const f=await fixture(t,{}, {prisma:broken}),a=await f.signup(),b=await f.signup(),r=await run(b.user.id);
    await prisma.runHex.create({data:{runId:r.id,h3Index:900000002n,outcome:'CAPTURED',prevOwnerId:a.user.id}});
    error(await remove(f,a),500,'INTERNAL_ERROR');assert.ok(await prisma.user.findUnique({where:{id:a.user.id}}));
    assert.equal((await prisma.runHex.findUnique({where:{runId_h3Index:{runId:r.id,h3Index:900000002n}}})).prevOwnerId,a.user.id);
    assert.equal((await get(f,a,'/api/me')).status,200);
  });
  test('account deletion needs the password or a fresh owned Google subject, never email matching alone',async t=>{
    const f=await fixture(t),a=await f.signup();error(await remove(f,a,{confirmation:'DELETE',password:'Wrong!MountainTrail2026'}),401,'REAUTHENTICATION_REQUIRED');
    const googleRaw=f.googleToken(),google=await request(f.app).post('/api/auth/google').send({idToken:googleRaw});assert.equal(google.status,200);f.accounts.push(google.body);
    const foreign=f.googleToken({email:google.body.user.email});
    error(await remove(f,google.body,{confirmation:'DELETE',idToken:foreign}),401,'REAUTHENTICATION_REQUIRED');
    const stale=f.googleToken({...f.payloads.get(googleRaw),iat:Math.floor(Date.now()/1000)-301});
    error(await remove(f,google.body,{confirmation:'DELETE',idToken:stale}),401,'REAUTHENTICATION_REQUIRED');
    assert.equal((await remove(f,google.body,{confirmation:'DELETE',idToken:googleRaw})).status,204);
    assert.equal(f.logs.some(line=>line.includes(googleRaw)||line.includes(password)||line.includes(a.user.email)),false);
  });
  test('PRIV-05 deleting a captain transfers to the longest-standing member without promoting system role',async t=>{
    const f=await fixture(t),captain=await f.signup(),newer=await f.signup(),oldest=await f.signup();
    await prisma.user.update({where:{id:captain.user.id},data:{role:'ADMIN'}});
    const team=await prisma.team.create({data:{name:`Team ${randomUUID()}`,colorHex:'#1F5A46',inviteCode:randomUUID().slice(0,12)}});t.after(()=>prisma.team.deleteMany({where:{id:team.id}}));
    for(const [account,role,joinedAt] of [[captain,'CAPTAIN',new Date(1)],[newer,'MEMBER',new Date(3)],[oldest,'MEMBER',new Date(2)]])
      await prisma.teamMember.create({data:{userId:account.user.id,teamId:team.id,role,joinedAt}});
    assert.equal((await remove(f,captain)).status,204);
    assert.equal((await prisma.teamMember.findUnique({where:{userId:oldest.user.id}})).role,'CAPTAIN');
    assert.equal((await prisma.user.findUnique({where:{id:oldest.user.id}})).role,'RUNNER');
  });
  test('PRIV-05 deleting a sole captain disbands the team; simultaneous member deletions do not deadlock',async t=>{
    const f=await fixture(t),a=await f.signup(),b=await f.signup();
    const team=await prisma.team.create({data:{name:`Team ${randomUUID()}`,colorHex:'#1F5A46',inviteCode:randomUUID().slice(0,12)}});
    await prisma.teamMember.create({data:{userId:a.user.id,teamId:team.id,role:'CAPTAIN'}});
    await prisma.teamMember.create({data:{userId:b.user.id,teamId:team.id}});
    const results=await Promise.all([remove(f,a),remove(f,b)]);assert.deepEqual(results.map(r=>r.status),[204,204]);assert.equal(await prisma.team.findUnique({where:{id:team.id}}),null);
  });
  test('PRIV-06 concurrent exports reuse one active job, encrypt files and exclude other users, secrets and rival names',async t=>{
    const f=await fixture(t),a=await f.signup(),b=await f.signup(),own=await run(a.user.id),other=await run(b.user.id);
    await prisma.runPoint.create({data:{runId:own.id,seq:0,lat:1,lng:2,accuracyM:4,recordedAt:new Date()}});
    await prisma.runPoint.create({data:{runId:other.id,seq:0,lat:88,lng:99,accuracyM:4,recordedAt:new Date()}});
    await prisma.runHex.create({data:{runId:own.id,h3Index:900000003n,outcome:'CAPTURED',prevOwnerId:b.user.id}});
    await prisma.runFlag.create({data:{runId:own.id,reason:'USER_REPORT',reporterId:b.user.id,details:b.user.email}});
    await prisma.notification.create({data:{userId:a.user.id,type:'HEX_LOST',title:b.user.displayName,body:b.user.email}});
    await prisma.notification.create({data:{userId:a.user.id,type:'SYSTEM',title:b.user.email,body:b.user.displayName}});
    const results=await Promise.all([post(f,a,'/api/me/export'),post(f,a,'/api/me/export')]);results.forEach(r=>assert.equal(r.status,202));
    assert.equal(results[0].body.export.id,results[1].body.export.id);await f.app.locals.profileJobs.drain();const id=results[0].body.export.id;
    const output=await get(f,a,`/api/me/export/${id}`);assert.equal(output.status,200);assert.match(output.headers['content-disposition'],/attachment/);
    assert.equal((await get(f,a,`/api/me/export/${id.toUpperCase()}`)).status,200);
    assert.equal(output.body.runs.length,1);assert.equal(output.body.runs[0].points[0].lat,1);assert.equal(output.body.runs[0].hexes[0].previousOwner,'Runner');
    const serialized=JSON.stringify(output.body);for(const secret of [b.user.id,b.user.email,b.user.displayName,a.accessToken,a.refreshToken,'passwordHash','encryptionKey'])assert.equal(serialized.includes(secret),false,secret==='passwordHash'?secret:'private value');
    const file=await fs.readFile(path.join(f.exportDir,`${id}.enc`));assert.equal(file.includes(Buffer.from(a.user.email)),false);assert.equal((await fs.stat(path.join(f.exportDir,`${id}.enc`))).mode&0o777,0o600);
    error(await get(f,b,`/api/me/export/${id}`),404,'NOT_FOUND');error(await get(f,a,`/api/me/export/${randomUUID()}`),404,'NOT_FOUND');
  });
  test('PRIV-06 expiry removes ciphertext and keys, missing artifacts fail safely, and export cannot outlive deletion',async t=>{
    let now=new Date();const f=await fixture(t,{}, {clock:()=>now}),a=await f.signup();
    const created=await post(f,a,'/api/me/export');await f.app.locals.profileJobs.drain();const id=created.body.export.id;
    // Keep JWT inside 15 minutes; the export clock alone advances for expiry.
    const {createExportService}=require('../src/profile/exports');
    const service=createExportService({prisma,jobs:f.app.locals.profileJobs,directory:f.exportDir,clock:()=>new Date(Date.now()+25*3600000)});
    await service.cleanup();assert.equal(await prisma.dataExport.findUnique({where:{id}}),null);assert.deepEqual(await fs.readdir(f.exportDir),[]);
    error(await get(f,a,`/api/me/export/${id}`),404,'NOT_FOUND');
    const second=await post(f,a,'/api/me/export');await f.app.locals.profileJobs.drain();await fs.rm(path.join(f.exportDir,`${second.body.export.id}.enc`));
    error(await get(f,a,`/api/me/export/${second.body.export.id}`),404,'NOT_FOUND');
    const [third,deleted]=await Promise.all([post(f,a,'/api/me/export'),remove(f,a)]);assert.ok([202,401,403].includes(third.status));assert.equal(deleted.status,204);await f.app.locals.profileJobs.drain();
    assert.equal(await prisma.dataExport.count({where:{userId:a.user.id}}),0);assert.deepEqual(await fs.readdir(f.exportDir),[]);
  });
  test('PRIV-06 pending downloads return 202; startup resumes jobs, removes orphan ciphertext and schedules hourly cleanup',async t=>{
    const f=await fixture(t),a=await f.signup(),createdAt=new Date();
    const row=await prisma.dataExport.create({data:{userId:a.user.id,encryptionKey:randomBytes(32),createdAt,expiresAt:new Date(createdAt.getTime()+86400000)}});
    const pending=await get(f,a,`/api/me/export/${row.id}`);assert.equal(pending.status,202);assert.equal(pending.body.export.status,'PENDING');
    const orphan=path.join(f.exportDir,`${randomUUID()}.enc`);await fs.writeFile(orphan,'orphan ciphertext fixture');
    const original=setInterval;let hourly=false;
    const mocked=t.mock.method(globalThis,'setInterval',(callback,delay,...args)=>{if(delay===3600000)hourly=true;return original(callback,delay,...args);});
    let stop;
    try {
      stop=await f.app.locals.profileJobs.start();await f.app.locals.profileJobs.drain();
      assert.equal(hourly,true);assert.equal((await get(f,a,`/api/me/export/${row.id}`)).status,200);
      await assert.rejects(fs.access(orphan));
    } finally {stop?.();mocked.mock.restore();}
  });
  test('PRIV-04 deletion removes owned and legacy development emails while preserving another account outbox',async t=>{
    const outboxDir=await fs.mkdtemp(path.resolve(__dirname,'../../.local/erasure-outbox-'));
    const mailer=createMailer({mailTransport:'outbox'},{outboxDir});
    const f=await fixture(t,{}, {mailer}),a=await f.signup(),b=await f.signup();
    t.after(()=>fs.rm(outboxDir,{recursive:true,force:true}));
    for(const account of [a,b]){assert.equal((await post(f,account,'/api/auth/verify-email/request')).status,202);await f.app.locals.authJobs.drain();}
    await mailer.send(messageFor('EMAIL_VERIFY','A'.repeat(43),a.user.email,'http://localhost:5173'));
    assert.equal((await fs.readdir(outboxDir)).length,3);
    assert.equal((await remove(f,a)).status,204);
    const remaining=await fs.readdir(outboxDir);assert.equal(remaining.length,1);
    assert.equal(JSON.parse(await fs.readFile(path.join(outboxDir,remaining[0]),'utf8')).ownerId,b.user.id);
    assert.equal((await remove(f,a)).status,204);assert.deepEqual(await fs.readdir(outboxDir),remaining);
  });
  test('PRIV-04 rolled-back deletion leaves outbox bytes intact and cancels its cleanup journal',async t=>{
    const outboxDir=await fs.mkdtemp(path.resolve(__dirname,'../../.local/rollback-outbox-'));
    const mailer=createMailer({mailTransport:'outbox'},{outboxDir});
    const broken=new Proxy(prisma,{get(target,key){if(key==='$transaction')return(task,opts)=>target.$transaction(tx=>task(new Proxy(tx,{get(inner,k){if(k==='user')return new Proxy(inner.user,{get(model,m){if(m==='delete')return()=>{throw Error('Simulated rollback');};return model[m];}});return inner[k];}})),opts);return target[key];}});
    const f=await fixture(t,{}, {mailer,prisma:broken}),a=await f.signup();t.after(()=>fs.rm(outboxDir,{recursive:true,force:true}));
    await mailer.send(messageFor('EMAIL_VERIFY','B'.repeat(43),a.user.email,'http://localhost:5173'),{userId:a.user.id});
    const [name]=await fs.readdir(outboxDir),original=await fs.readFile(path.join(outboxDir,name));
    error(await remove(f,a),500,'INTERNAL_ERROR');assert.ok((await fs.readdir(outboxDir)).some(file=>file.startsWith('.erase-')));
    await mailer.cleanupOrphans(prisma);assert.deepEqual(await fs.readdir(outboxDir),[name]);assert.deepEqual(await fs.readFile(path.join(outboxDir,name)),original);
  });
  test('PRIV-04 a queued verification delivery cannot publish after its account is deleted',async t=>{
    const delivered=[];const mailer={send:async(message)=>delivered.push(message)};
    const f=await fixture(t,{}, {mailer}),a=await f.signup();let transactions=0,ready,release;
    const waiting=new Promise(resolve=>{ready=resolve;}),continueDelivery=new Promise(resolve=>{release=resolve;});
    const paused=new Proxy(prisma,{get(target,key){if(key==='$transaction')return async(task,opts)=>{transactions++;if(transactions===2){ready();await continueDelivery;}return target.$transaction(task,opts);};return target[key];}});
    const actions=createActionService({prisma:paused,config,mailer});
    const job=actions.requestAction({userId:a.user.id,kind:'EMAIL_VERIFY',ip:'127.0.0.1'});
    try {await waiting;assert.equal((await remove(f,a)).status,204);}
    finally {release();await job;}
    assert.equal(delivered.length,0);
  });
  test('account deletion accepts the same 128-code-point Unicode password contract as registration and login',async t=>{
    const f=await fixture(t),unicode='🌲'.repeat(128);
    const registered=await request(f.app).post('/api/auth/register').send({email:`${randomUUID()}@example.test`,displayName:`Unicode ${randomUUID().slice(0,8)}`,password:unicode});
    assert.equal(registered.status,201);f.accounts.push(registered.body);
    error(await remove(f,registered.body,{confirmation:'DELETE',password:'🌲'.repeat(129)}),400,'INVALID_INPUT');
    assert.equal((await remove(f,registered.body,{confirmation:'DELETE',password:unicode})).status,204);
  });
};
