'use strict';
// Finite curl proof. Never uses the development database or real Google/SMTP.
require('dotenv').config({path:require('node:path').resolve(__dirname,'../.env')});
const {randomUUID}=require('node:crypto');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {PrismaClient}=require('@prisma/client');
const {testDatabaseConfig}=require('../db-tests/helpers');
const {readConfig}=require('../src/config');
const {createApp}=require('../src/app');
async function main() {
  const isolated=testDatabaseConfig({...process.env,DATABASE_URL_TEST:process.env.DATABASE_URL_API_TEST});
  const prisma=new PrismaClient({datasources:{db:{url:isolated.connectionString}},log:[]});
  const exportDir=await fs.mkdtemp(path.resolve(__dirname,'../../.local/profile-curl-'));
  const config=readConfig({DATABASE_URL:isolated.connectionString,CORS_ORIGINS:'http://localhost:5173',NODE_ENV:'test',
    JWT_ACCESS_SECRET:'profile-proof-access-only-01234567890123456789',REFRESH_TOKEN_DERIVATION_SECRET:'profile-proof-derivation-only-98765432109876543210',
    MAIL_TRANSPORT:'outbox',WEB_BASE_URL:'http://localhost:5173'});
  const app=createApp({prisma,config,exportDir,logger:()=>{},verifyGoogle:async()=>{throw Error('Mock rejects unused verifier.');},mailer:{send:async()=>{}}});
  const server=app.listen(0,'127.0.0.1');await new Promise((yes,no)=>{server.once('listening',yes);server.once('error',no);});
  const base=`http://127.0.0.1:${server.address().port}`,email=`profile-proof-${randomUUID()}@example.test`;
  function curl(method,route,expected,body,access) {
    let input=`url = ${JSON.stringify(base+route)}\nrequest = ${JSON.stringify(method)}\n`;
    if(body!==undefined)input+=`header = "Content-Type: application/json"\ndata = ${JSON.stringify(JSON.stringify(body))}\n`;
    if(access)input+=`header = ${JSON.stringify('Authorization: Bearer '+access)}\n`;
    return new Promise((resolve,reject)=>{
      const child=spawn('curl',['--silent','--show-error','--max-time','30','--config','-','--write-out','\n%{http_code}'],{stdio:['pipe','pipe','pipe']});
      let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.resume();child.on('error',reject);
      child.on('close',code=>{if(code)return reject(Error('curl failed.'));
        const parts=output.trimEnd().split('\n'),status=Number(parts.pop()),raw=parts.join('\n'),data=raw?JSON.parse(raw):null;
        console.log(`curl ${method} ${route} -> HTTP ${status}`);
        console.log(data?JSON.stringify(data,(key,value)=>/^(accessToken|refreshToken|idToken|token|email|emailAtSignup)$/.test(key)?'[REDACTED]':value):'(empty body)');
        if(status!==expected)return reject(Error('Unexpected HTTP status.'));resolve(data);
      });child.stdin.end(input);
    });
  }
  try {
    const [{name}]=await prisma.$queryRaw`SELECT current_database() AS name`;if(name!==isolated.database)throw Error('Wrong test database.');
    console.log('Profile/privacy curl proof: guarded API test database only; Google/SMTP mocked.');
    const [{count}]=await prisma.$queryRaw`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name<>'_prisma_migrations'`;
    console.log(`Application table count: ${count}`);if(count!==30)throw Error('Wrong schema.');
    const account=await curl('POST','/api/auth/register',201,{email,password:'ProfileProof!Mountain2026',displayName:`Proof ${randomUUID().slice(0,8)}`});
    const access=account.accessToken;
    await curl('GET','/api/me/profile',200,undefined,access);
    await curl('PATCH','/api/me/profile',200,{avatarId:7,avatarColor:'#B8452A',preferredUnits:'mi',bio:'Curl proof'},access);
    await curl('GET','/api/me/privacy',200,undefined,access);
    await curl('PATCH','/api/me/privacy',200,{profileVisibility:'FOLLOWERS',appearOnLeaderboards:true,shareRouteShapes:false},access);
    await curl('POST','/api/me/consents',200,{type:'LOCATION',version:config.consentVersions.LOCATION,accepted:true},access);
    await curl('POST','/api/me/consents',200,{type:'LOCATION',version:config.consentVersions.LOCATION,accepted:false},access);
    const exported=await curl('POST','/api/me/export',202,{},access);await app.locals.profileJobs.drain();
    await curl('GET',`/api/me/export/${exported.export.id}`,200,undefined,access);
    await curl('DELETE','/api/me',204,{confirmation:'DELETE',password:'ProfileProof!Mountain2026'},access);
    await curl('DELETE','/api/me',204,{confirmation:'DELETE',password:'ProfileProof!Mountain2026'},access);
    await curl('GET',`/api/me/export/${exported.export.id}`,404,undefined,access);
    console.log('PROFILE PRIVACY CURL PROOF PASSED.');
  } finally {
    await app.locals.profileJobs.drain();await app.locals.authJobs.drain();
    await prisma.user.deleteMany({where:{email}});await new Promise(resolve=>server.close(resolve));
    await prisma.$disconnect();await fs.rm(exportDir,{recursive:true,force:true});
    console.log('Proof account removed; temporary listener closed; temporary export files removed.');
  }
}
main().catch(()=>{console.error('Profile curl proof failed. Check the guarded test database and migrations.');process.exitCode=1;});
