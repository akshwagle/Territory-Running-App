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
    t.after(async()=>{await app.locals.profileJobs?.drain?.();await prisma.user.deleteMany({where:{id:{in:accounts.map(a=>a.user.id)}}});await fs.rm(exportDir,{recursive:true,force:true});});
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
  });};
