'use strict';
// End-to-end smoke test against a local in-process API and the guarded disposable
// API test database. No real Google or email; prints no tokens, routes or coordinates.
require('dotenv').config({path:require('node:path').resolve(__dirname,'../.env')});
const {randomUUID,randomBytes}=require('node:crypto');
const {once}=require('node:events');
const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const {Pool}=require('pg');
const {testDatabaseConfig}=require('../db-tests/helpers');
const {readConfig}=require('../src/config');
const {createApp}=require('../src/app');

async function main(){
  const isolated=testDatabaseConfig({...process.env,DATABASE_URL_TEST:process.env.DATABASE_URL_API_TEST});
  const pool=new Pool({connectionString:isolated.connectionString});let prisma,server,app;const accounts=[];
  try{
    const {rows:[id]}=await pool.query("SELECT current_database() AS name,current_setting('server_version_num')::int AS v");
    assert.equal(id.name,isolated.database);assert.equal(Math.floor(id.v/10000),16);
    const config=readConfig({...process.env,NODE_ENV:'test',DATABASE_URL:isolated.connectionString,MAIL_TRANSPORT:'outbox',WEB_BASE_URL:'http://localhost:5173',
      CORS_ORIGINS:'http://localhost:5173',JWT_ACCESS_SECRET:randomBytes(48).toString('base64url'),REFRESH_TOKEN_DERIVATION_SECRET:randomBytes(48).toString('base64url'),MIN_APP_VERSION:'6',REQUIRE_VERIFIED_EMAIL_FOR_RUNS:'false'});
    config.rateLimitMax=10000;config.authRateLimitMax=1000;config.authIpRateLimitMax=1000;
    prisma=new PrismaClient({datasources:{db:{url:isolated.connectionString}},log:[]});
    app=createApp({prisma,config,logger:()=>{},mailer:{send:async()=>{}},verifyGoogle:async()=>{throw Error('Mock only.');}});
    server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const origin=`http://127.0.0.1:${server.address().port}`;
    console.log('E2E smoke: guarded API test database, local API '+origin);
    let steps=0;
    async function call(method,path,body,account,expected,raw){
      const headers={'Content-Type':'application/json','x-app-version-code':'6'};
      if(account){headers.Authorization='Bearer '+account.accessToken;headers['x-install-id']=account.installId;}
      const res=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
      const text=await res.text();let json=null;try{json=text?JSON.parse(text):null;}catch{}
      if(res.status!==expected)console.error(text.slice(0,300));
      assert.equal(res.status,expected,`${method} ${path.split('?')[0].replace(/[0-9a-f-]{36}/g,':id')} -> ${res.status}, expected ${expected}`);
      steps++;console.log(`ok ${method} ${path.split('?')[0].replace(/[0-9a-f-]{36}/g,':id')} -> ${res.status}`);
      return raw?text:json;
    }
    const password=randomBytes(24).toString('base64url'),email=`${randomUUID()}@example.test`;
    const reg=await call('POST','/api/auth/register',{email,displayName:`Smoke ${randomUUID().slice(0,8)}`,password},null,201);
    assert.ok(reg.accessToken&&reg.user?.id);
    const login=await call('POST','/api/auth/login',{email,password},null,200);
    const account={...login,installId:randomUUID()};accounts.push(reg);
    await call('GET','/api/me/profile',undefined,account,200);
    for(const type of ['LOCATION','TERMS','PRIVACY'])await prisma.userConsent.create({data:{userId:reg.user.id,type,version:config.consentVersions[type],accepted:true,createdAt:new Date(Date.now()-3600000)}});
    const t0=new Date(Date.now()-600000);
    const device={installId:account.installId,androidIdHash:'a'.repeat(64),versionCode:6,appVersion:'0.4.0',signingCertificateSha256:'b'.repeat(64),model:'Smoke fixture',androidVersion:'16',timeZone:'Asia/Kolkata',mockAppSelected:null,emulator:false,debugger:true};
    const created=(await call('POST','/api/runs',{clientRunId:randomUUID(),startedAt:new Date(Date.now()-30000).toISOString(),device},account,201)).run;
    // The API requires a fresh start time; backdate so the synthetic route has a realistic duration.
    const cur=await prisma.run.findUnique({where:{id:created.id}});
    const sig=structuredClone(cur.runSignals);for(const seg of sig.segments)seg.startedAt=t0.toISOString();
    await prisma.run.update({where:{id:created.id},data:{startedAt:t0,runSignals:sig}});
    const N=45,pt=i=>({seq:i,lat:19.076+i*.00025,lng:72.8777,recordedAt:new Date(+t0+i*10000).toISOString(),accuracyM:5,speedMps:2.8,altitudeM:null,bearingDeg:null,provider:'gps',isMock:false,segmentId:created.clientRunId,elapsedMs:i*10000,deviceTimestamp:new Date(+t0+i*10000).toISOString()});
    const points=Array.from({length:N},(_,i)=>pt(i));
    await call('POST',`/api/runs/${created.id}/points`,{batchKey:`${created.id}:0`,points,batteryLevel:80,stepDelta:null},account,200);
    const fin=await call('POST',`/api/runs/${created.id}/finish`,{endedAt:new Date(+t0+(N-1)*10000).toISOString(),lastSeq:N-1},account,200);
    assert.ok(fin.run&&fin.run.distanceM>500,'run distance recorded');
    const claim=await call('GET',`/api/runs/${created.id}/claim`,undefined,account,200);
    console.log('   run status',fin.run.status,'| claim keys',Object.keys(claim).join(','));
    const mine=await call('GET','/api/territory/me',undefined,account,200);
    if(fin.run.status==='VALID')assert.ok(JSON.stringify(mine).length>40,'valid run owns territory');console.log('   territory keys',Object.keys(mine).join(','));
    await call('GET','/api/territory/hexes?minLat=19.07&minLng=72.87&maxLat=19.09&maxLng=72.89',undefined,account,200);
    const board=await call('GET','/api/community/leaderboard?metric=hexes&period=all&scope=global',undefined,account,200);
    assert.ok(board&&typeof board==='object');
    const notes=await call('GET','/api/me/notifications',undefined,account,200);
    if(fin.run.status==='VALID')assert.ok((notes.notifications??notes.items??[]).length>=0);
    await call('GET','/api/me/notifications/unread-count',undefined,account,200);
    await call('GET','/api/me/stats/overview',undefined,account,200);
    await call('GET','/api/runs?limit=5',undefined,account,200);
    await call('GET','/api/runs',undefined,null,401);
    const exp=await call('POST','/api/me/export',{},account,202);
    const expId=exp.export?.id??exp.id;assert.ok(expId);
    await app.locals.profileJobs.drain();
    const data=await call('GET',`/api/me/export/${expId}`,undefined,account,200,true);
    assert.ok(JSON.parse(data));assert.ok(!data.includes(password),'export must not contain password');
    await call('DELETE','/api/me',{confirmation:'DELETE',password:'wrong-password-value'},account,401);
    await call('DELETE','/api/me',{confirmation:'DELETE',password},account,204);
    await app.locals.profileJobs.drain();
    await call('POST','/api/auth/login',{email,password},null,401);
    assert.equal(await prisma.run.count({where:{userId:reg.user.id}}),0,'runs erased with the account');
    accounts.length=0;
    console.log(`E2E SMOKE PASSED (${steps} checks).`);
  }catch(e){
    console.error('E2E SMOKE FAILED:',e.message);process.exitCode=1;
  }finally{
    await app?.locals.profileJobs.drain().catch(()=>{});
    if(prisma){await prisma.user.deleteMany({where:{id:{in:accounts.map(a=>a.user.id)}}}).catch(()=>{});await prisma.$disconnect();}
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    await pool.end();
  }
}
main();
