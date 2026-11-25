'use strict';
// Finite owner-run curl proof. Never points at the development database, sends
// real email, invokes Google, or prints credentials, raw points or route traces.
require('dotenv').config({path:require('node:path').resolve(__dirname,'../.env')});
const {randomUUID,randomBytes}=require('node:crypto');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {PrismaClient}=require('@prisma/client');
const {Pool}=require('pg');
const {testDatabaseConfig}=require('../db-tests/helpers');
const {readConfig}=require('../src/config');
const {createApp}=require('../src/app');
const assert=require('node:assert/strict');
async function main(){
  const isolated=testDatabaseConfig({...process.env,DATABASE_URL_TEST:process.env.DATABASE_URL_API_TEST});
  const pool=new Pool({connectionString:isolated.connectionString});let prisma,server,app;const accounts=[];
  try{
    const {rows:[identity]}=await pool.query("SELECT current_database() AS name,current_setting('server_version_num')::int AS version");
    assert.equal(identity.name,isolated.database);assert.equal(Math.floor(identity.version/10000),16);
    assert.equal((await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='runs' AND column_name='run_signals'")).rowCount,1);
    const config=readConfig({...process.env,NODE_ENV:'test',DATABASE_URL:isolated.connectionString,MAIL_TRANSPORT:'outbox',WEB_BASE_URL:'http://localhost:5173',
      CORS_ORIGINS:'http://localhost:5173',JWT_ACCESS_SECRET:randomBytes(48).toString('base64url'),REFRESH_TOKEN_DERIVATION_SECRET:randomBytes(48).toString('base64url'),MIN_APP_VERSION:'6',REQUIRE_VERIFIED_EMAIL_FOR_RUNS:'false'});
    config.rateLimitMax=10000;config.authRateLimitMax=1000;config.authIpRateLimitMax=1000;
    prisma=new PrismaClient({datasources:{db:{url:isolated.connectionString}},log:[]});
    app=createApp({prisma,config,logger:()=>{},mailer:{send:async()=>{}},verifyGoogle:async()=>{throw Error('Mock only.');}});
    server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
    console.log('Run recording curl proof: guarded API test database only; no real Google/email. '+origin);
    async function curl(method,path,body,account,expected){
      const lines=[`url = ${JSON.stringify(origin+path)}`,`request = ${JSON.stringify(method)}`,'silent','show-error','max-time = 10','write-out = "\\n%{http_code}"',`header = ${JSON.stringify('Content-Type: application/json')}`,`header = ${JSON.stringify('x-app-version-code: 6')}`];
      if(account){lines.push(`header = ${JSON.stringify('Authorization: Bearer '+account.accessToken)}`,`header = ${JSON.stringify('x-install-id: '+account.installId)}`);}
      if(body!==undefined)lines.push(`data = ${JSON.stringify(JSON.stringify(body))}`);
      const output=await new Promise((resolve,reject)=>{const child=spawn('curl',['--config','-'],{stdio:['pipe','pipe','pipe']});let text='';child.stdout.on('data',chunk=>{text+=chunk;if(text.length>2000000)child.kill();});child.stderr.resume();child.on('error',()=>reject(Error('curl could not start.')));child.on('close',code=>code?reject(Error('curl request failed; private output suppressed.')):resolve(text));child.stdin.end(lines.join('\n')+'\n');});
      const split=output.lastIndexOf('\n'),status=Number(output.slice(split+1)),payload=output.slice(0,split)?JSON.parse(output.slice(0,split)):null;
      console.log(`curl ${method} ${path.includes('/api/runs/')?path.replace(/\/api\/runs\/[0-9a-f-]{36}/,'/api/runs/[fixture-run]'):path} -> HTTP ${status}`);
      if(payload?.error)console.log(JSON.stringify(payload));
      else if(payload?.run)console.log(JSON.stringify({run:{status:payload.run.status,state:payload.run.state,distanceM:payload.run.distanceM,durationS:payload.run.durationS}}));
      else if(payload?.points)console.log(JSON.stringify({pointCount:payload.points.length,nextPointSeq:payload.nextPointSeq}));
      else if(payload?.runs)console.log(JSON.stringify({runCount:payload.runs.length}));
      else if(payload?.highestSeq!==undefined)console.log(JSON.stringify({highestSeq:payload.highestSeq,duplicate:payload.duplicate,recordingAllowed:payload.recordingAllowed}));
      else if(payload?.accessToken)console.log('{"accessToken":"[REDACTED]","refreshToken":"[REDACTED]","user":"[fixture account]"}');
      else console.log(payload?'[response fields omitted]':'(empty body)');
      assert.equal(status,expected,'Unexpected HTTP status.');return payload;
    }
    async function signup(){const account=await curl('POST','/api/auth/register',{email:`${randomUUID()}@example.test`,displayName:`Proof ${randomUUID().slice(0,10)}`,password:randomBytes(24).toString('base64url')},null,201);account.installId=randomUUID();accounts.push(account);
      for(const type of ['LOCATION','TERMS','PRIVACY'])await prisma.userConsent.create({data:{userId:account.user.id,type,version:config.consentVersions[type],accepted:true,createdAt:new Date(Date.now()-3600000)}});return account;}
    const account=await signup(),other=await signup(),startedAt=new Date(Date.now()-60000),device={installId:account.installId,androidIdHash:'a'.repeat(64),versionCode:6,appVersion:'0.4.0',signingCertificateSha256:'b'.repeat(64),model:'Public proof fixture',androidVersion:'16',timeZone:'Asia/Kolkata',mockAppSelected:null,emulator:false,debugger:true};
    const input={clientRunId:randomUUID(),startedAt:startedAt.toISOString(),device},created=await curl('POST','/api/runs',input,account,201),run=created.run;
    await curl('POST','/api/runs',input,account,200);await curl('POST','/api/runs',{...input,clientRunId:randomUUID()},account,409);
    const point=(seq)=>({seq,lat:19.076+seq*.0001,lng:72.8777,recordedAt:new Date(+startedAt+seq*10000).toISOString(),accuracyM:5,speedMps:1,altitudeM:null,bearingDeg:null,provider:'gps',isMock:false,segmentId:run.clientRunId,elapsedMs:seq*10000,deviceTimestamp:new Date(+startedAt+seq*10000).toISOString()});
    const batch={batchKey:`${run.id}:0`,points:[point(0),point(1)],batteryLevel:80,stepDelta:null};
    await curl('POST',`/api/runs/${run.id}/points`,batch,account,200);await curl('POST',`/api/runs/${run.id}/points`,batch,account,200);
    await curl('GET',`/api/runs/${run.id}`,undefined,other,404);await curl('GET',`/api/runs/${run.id}`,undefined,account,200);
    await curl('POST',`/api/runs/${run.id}/pause`,{eventId:randomUUID(),recordedAt:new Date(+startedAt+20000).toISOString(),elapsedMs:20000},account,200);
    await curl('POST',`/api/runs/${run.id}/resume`,{eventId:randomUUID(),recordedAt:new Date(+startedAt+30000).toISOString(),elapsedMs:30000},account,200);
    const finish={endedAt:new Date(+startedAt+40000).toISOString(),lastSeq:1},first=await curl('POST',`/api/runs/${run.id}/finish`,finish,account,200),second=await curl('POST',`/api/runs/${run.id}/finish`,finish,account,200);assert.deepEqual(second,first);
    await curl('GET','/api/runs?limit=1',undefined,account,200);await curl('DELETE',`/api/runs/${run.id}`,{},account,204);await curl('GET',`/api/runs/${run.id}`,undefined,account,404);
    console.log('RUN RECORDING CURL PROOF PASSED. Coordinates, routes and credentials were not printed.');
  }finally{
    await app?.locals.profileJobs.drain();
    if(prisma){await prisma.user.deleteMany({where:{id:{in:accounts.map(a=>a.user.id)}}});await prisma.$disconnect();}
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await pool.end();console.log('Proof accounts removed; temporary proof listener closed.');
  }
}
main().catch(()=>{console.error('Run recording proof failed; sensitive diagnostics suppressed.');process.exitCode=1;});
