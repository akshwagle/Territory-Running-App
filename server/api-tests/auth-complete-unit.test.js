'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createMailer, messageFor, createMailJobs } = require('../src/auth/mailer');
const { verifyGoogleIdToken, googleClaims } = require('../src/auth/google');
const { readConfig } = require('../src/config');
const request = require('supertest');
const { createGoogleTestApp } = require('../scripts/google-sign-in');

test('Google library adapter forwards the audience and ID token to a mocked verifier; claim checks reject invalid input', async () => {
  const audience='test-client.apps.googleusercontent.com',raw='mock-only-id-token';let called=false;
  const payload={aud:audience,iss:'https://accounts.google.com',sub:'mock_sub',exp:Math.floor(Date.now()/1000)+60,email:'runner@gmail.com',email_verified:true,name:'Runner'};
  const result=await verifyGoogleIdToken(raw,{googleWebClientId:audience},{client:{verifyIdToken:async args=>{
    assert.deepEqual(args,{idToken:raw,audience});called=true;return {getPayload:()=>payload};
  }}});
  assert.equal(result,payload);assert.ok(called);
  assert.ok(googleClaims(payload,audience,new Date()).authoritative);
  assert.ok(googleClaims({...payload,email:'runner@college.test',hd:'college.test'},audience,new Date()).authoritative);
  assert.equal(googleClaims({...payload,email:'runner@example.test'},audience,new Date()).authoritative,false);
  for(const invalid of [{aud:'bad'},{iss:'bad'},{exp:1},{email_verified:false},{sub:''},{email:'invalid'}])
    assert.throws(()=>googleClaims({...payload,...invalid},audience,new Date()));
});

test('SMTP mailer uses pinned nodemailer behind an injected transport with TLS and no logging', async () => {
  let options,sent;
  const config={mailTransport:'smtp',smtp:{host:'smtp.example.test',port:587,secure:false,requireTLS:true,auth:{user:'test',pass:'test-only-password'},from:'test@example.test'}};
  const mailer=createMailer(config,{createTransport:opts=>{options=opts;return{sendMail:async message=>{sent=message;}};}});
  const message=messageFor('PASSWORD_RESET',randomBytes(32).toString('base64url'),'runner@example.test','http://localhost:5173');
  await mailer.send(message);assert.equal(options.requireTLS,true);assert.equal(options.logger,false);assert.equal(options.debug,false);
  assert.equal(sent.from,config.smtp.from);assert.equal(sent.to,'runner@example.test');assert.ok(sent.text.includes('/reset?token='));
  assert.ok(sent.html.includes('#F3EEE4'));assert.equal(/<img/i.test(sent.html),false);
});

test('development outbox writes private messages and failure logs contain only fixed reason tags', async () => {
  const directory=await fs.mkdtemp(path.resolve(__dirname,'../../.local/outbox-test-'));
  try{
    const raw=randomBytes(32).toString('base64url'),message=messageFor('EMAIL_VERIFY',raw,'runner@example.test','http://localhost:5173');
    await createMailer({mailTransport:'outbox'},{outboxDir:directory}).send(message);
    const [file]=await fs.readdir(directory),full=path.join(directory,file);
    assert.equal((await fs.stat(full)).mode&0o777,0o600);assert.equal((await fs.stat(directory)).mode&0o777,0o700);
    const saved=JSON.parse(await fs.readFile(full,'utf8'));assert.ok(saved.text.includes('/verify?token='+raw));assert.ok(saved.text.includes('24 hours'));
    const logs=[],jobs=createMailJobs(line=>logs.push(line));jobs.enqueue(async()=>{throw Error(raw+' runner@example.test');});await jobs.drain();
    assert.deepEqual(logs.map(JSON.parse),[{event:'mail_failure',reason:'delivery_failed'}]);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('verified-email run policy follows environment defaults and production SMTP/URL validation hides values', () => {
  const env={DATABASE_URL:'postgresql://test:placeholder@localhost/separate_test',CORS_ORIGINS:'http://localhost:5173',
    JWT_ACCESS_SECRET:'test-access-secret-only-01234567890123456789',REFRESH_TOKEN_DERIVATION_SECRET:'test-derivation-secret-only-98765432109876543210'};
  assert.equal(readConfig(env).requireVerifiedEmailForRuns,false);
  const production={...env,NODE_ENV:'production',WEB_BASE_URL:'https://example.test',MAIL_TRANSPORT:'smtp',
    SMTP_HOST:'smtp.example.test',SMTP_PORT:'587',SMTP_USER:'test-user',SMTP_PASSWORD:'test-only-password',SMTP_FROM:'mail@example.test'};
  assert.equal(readConfig(production).requireVerifiedEmailForRuns,true);
  assert.equal(readConfig({...production,REQUIRE_VERIFIED_EMAIL_FOR_RUNS:'false'}).requireVerifiedEmailForRuns,false);
  for(const changes of [{MAIL_TRANSPORT:'outbox'},{WEB_BASE_URL:'http://example.test'},{SMTP_FROM:'mail@example.test\r\nbcc: victim@example.test'},{REQUIRE_VERIFIED_EMAIL_FOR_RUNS:'yes'}])
    assert.throws(()=>readConfig({...production,...changes}));
});

test('real-Google development helper has local-only CSRF-protected proxying without live Google requests or stored tokens', async () => {
  const calls=[];
  const app=createGoogleTestApp({clientId:'mock-client.apps.googleusercontent.com',apiOrigin:'http://127.0.0.1:4000',port:5174,
    upstream:async(url,options)=>{calls.push({url,options});return{status:200,json:async()=>({accessToken:'mock-access',refreshToken:'mock-refresh',expiresIn:900,user:{id:'test'}})};}});
  assert.equal((await request(app).get('/').set('Host','untrusted.test')).status,403);
  const page=await request(app).get('/').set('Host','localhost:5174');assert.equal(page.status,200);
  assert.ok(page.text.includes('Google sign-in check'));assert.ok(page.text.includes('https://accounts.google.com/gsi/client'));
  assert.equal(page.text.includes('localStorage'),false);assert.equal(page.text.includes('console.log'),false);
  const nonce=/X-Test-Nonce':"([^"]+)"/.exec(page.text)[1];
  assert.equal((await request(app).post('/signin').set('Host','localhost:5174').send({idToken:'fake'})).status,403);
  const result=await request(app).post('/signin').set('Host','localhost:5174').set('Origin','http://localhost:5174').set('X-Test-Nonce',nonce).send({idToken:'mock-id-token'});
  assert.equal(result.status,200);assert.equal(calls.length,1);assert.equal(calls[0].url,'http://127.0.0.1:4000/api/auth/google');
  assert.deepEqual(JSON.parse(calls[0].options.body),{idToken:'mock-id-token'});
});
