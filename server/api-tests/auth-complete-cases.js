'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const request = require('supertest');
const { createApp } = require('../src/app');
const { tokenHash, issueAccessToken } = require('../src/auth/tokens');

module.exports = function completeCases({ prisma, pool, config }) {
  function make(overrides = {}, extra = {}) {
    const messages = [], payloads = new Map(), logs = [];
    const app = createApp({ prisma, config: { ...config, rateLimitMax: 10000, authRateLimitMax: 1000,
      authIpRateLimitMax: 1000, authActionRateLimitMax: 1000, forgotResponseMs: 5, ...overrides },
      mailer: { send: async message => { messages.push(message); } }, logger: line => logs.push(line),
      verifyGoogle: async raw => { if (!payloads.has(raw)) throw Error('Mock rejected.'); return payloads.get(raw); }, ...extra });
    const googleToken = (claims = {}) => {
      const raw = `mock-google-${randomUUID()}`;
      payloads.set(raw, { sub: `g_${randomUUID().replaceAll('-','')}`, email: `${randomUUID()}@gmail.com`,
        email_verified: true, aud: config.googleWebClientId, iss: 'https://accounts.google.com',
        exp: Math.floor(Date.now()/1000)+3600, name: 'Google Runner', ...claims });
      return raw;
    };
    return { app, messages, payloads, googleToken, logs };
  }
  const claims = raw => JSON.parse(Buffer.from(raw.split('.')[1],'base64url'));
  const bearer = (r, account) => r.set('Authorization',`Bearer ${account.accessToken}`);
  const error = (r,status,code) => { assert.equal(r.status,status); assert.equal(r.body.error?.code,code); assert.deepEqual(Object.keys(r.body),['error']); };
  async function signup(f, email = `${randomUUID()}@example.test`) {
    const input = { email, password:'Maple!MountainTrail2026', displayName:'Trail Runner' };
    const r = await request(f.app).post('/api/auth/register').send(input); assert.equal(r.status,201);
    return { ...r.body, input };
  }
  async function login(f,a,password=a.input.password) {
    const r=await request(f.app).post('/api/auth/login').send({email:a.user.email,password});assert.equal(r.status,200);return r.body;
  }
  async function mailToken(f,a,kind) {
    const r=kind==='EMAIL_VERIFY' ? await bearer(request(f.app).post('/api/auth/verify-email/request'),a).send({}) :
      await request(f.app).post('/api/auth/password/forgot').send({email:a.user.email});
    assert.equal(r.status,202);await f.app.locals.authJobs.drain();
    const message=f.messages.at(-1);assert.ok(message);
    return new URL(message.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
  }

  test('sid is signed, required, bound to its user and checked with user status in one indexed-family query', async () => {
    const f=make(),a=await signup(f),b=await signup(f);
    assert.deepEqual(Object.keys(claims(a.accessToken)).sort(),['exp','iat','sid','sub']);
    const parts=a.accessToken.split('.');parts[1]=Buffer.from(JSON.stringify({...claims(a.accessToken),sid:claims(b.accessToken).sid})).toString('base64url');
    error(await request(f.app).get('/api/me').set('Authorization',`Bearer ${parts.join('.')}`),401,'UNAUTHORIZED');
    const signedOther=await issueAccessToken(a.user.id,claims(b.accessToken).sid,config.jwtAccessSecret,new Date());
    error(await request(f.app).get('/api/me').set('Authorization',`Bearer ${signedOther}`),401,'UNAUTHORIZED');
    const {SignJWT}=await import('jose');
    const old=await new SignJWT({}).setProtectedHeader({alg:'HS256',typ:'JWT'}).setSubject(a.user.id).setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode(config.jwtAccessSecret));
    error(await request(f.app).get('/api/me').set('Authorization',`Bearer ${old}`),401,'UNAUTHORIZED');
    let calls=0;
    const proxy=new Proxy(prisma,{get(t,key){if(key==='$queryRaw')return (...args)=>{calls++;return t.$queryRaw(...args);};return Reflect.get(t,key);}});
    const proof=make({}, {prisma:proxy});assert.equal((await bearer(request(proof.app).get('/api/me'),a)).status,200);assert.equal(calls,1);
    await request(f.app).post('/api/auth/logout').send({refreshToken:a.refreshToken});
    error(await bearer(request(f.app).get('/api/me'),a),401,'UNAUTHORIZED');
  });

  test('verification uses EMAIL_VERIFY for 24 hours, resend invalidates only earlier unused verification tokens and confirmation never signs in', async () => {
    const f=make(),a=await signup(f);
    const reset=await mailToken(f,a,'PASSWORD_RESET'),first=await mailToken(f,a,'EMAIL_VERIFY'),second=await mailToken(f,a,'EMAIL_VERIFY');
    const rows=await prisma.authToken.findMany({where:{userId:a.user.id}});
    const one=rows.find(r=>r.tokenHash===tokenHash(first)),two=rows.find(r=>r.tokenHash===tokenHash(second));
    assert.ok(one.usedAt);assert.equal(two.usedAt,null);assert.equal(two.familyId,null);assert.equal(two.expiresAt-two.createdAt,86400000);
    assert.equal(rows.find(r=>r.tokenHash===tokenHash(reset)).usedAt,null);
    const done=await request(f.app).post('/api/auth/verify-email/confirm').send({token:second});assert.equal(done.status,200);
    assert.deepEqual(Object.keys(done.body),['message']);assert.ok((await prisma.user.findUnique({where:{id:a.user.id}})).verifiedAt);
    const count=f.messages.length;assert.equal((await bearer(request(f.app).post('/api/auth/verify-email/request'),a).send({})).status,202);
    await f.app.locals.authJobs.drain();assert.equal(f.messages.length,count);
  });

  test('forgot has the same 202 body and fixed response path for known/unknown email; reset expires in 30 minutes and resend invalidates earlier links', async () => {
    const f=make(),a=await signup(f);const events=[];
    const original=prisma.user.findUnique;
    prisma.user.findUnique=(...args)=>{events.push('lookup');return original.apply(prisma.user,args);};
    try {
      const instrumented=make({}, {logger:line=>{if(JSON.parse(line).status===202)events.push('response');},mailer:{send:async m=>f.messages.push(m)}});
      const known=await request(instrumented.app).post('/api/auth/password/forgot').send({email:a.user.email});
      await instrumented.app.locals.authJobs.drain();
      assert.ok(events.indexOf('response')<events.indexOf('lookup'));
      const unknown=await request(instrumented.app).post('/api/auth/password/forgot').send({email:`${randomUUID()}@example.test`});
      await instrumented.app.locals.authJobs.drain();assert.equal(known.status,202);assert.equal(unknown.status,202);assert.deepEqual(known.body,unknown.body);
    } finally {prisma.user.findUnique=original;}
    const first=await mailToken(f,a,'PASSWORD_RESET'),second=await mailToken(f,a,'PASSWORD_RESET');
    const rows=await prisma.authToken.findMany({where:{userId:a.user.id,kind:'PASSWORD_RESET'}});
    assert.ok(rows.find(r=>r.tokenHash===tokenHash(first)).usedAt);
    const current=rows.find(r=>r.tokenHash===tokenHash(second));assert.equal(current.expiresAt-current.createdAt,1800000);assert.equal(current.familyId,null);
  });

  test('AUTH-10 expired, replaced, used and wrong-purpose links give a next step; a different signed-in account cannot consume a link', async () => {
    const f=make(),a=await signup(f),b=await signup(f);
    const expired=await mailToken(f,a,'EMAIL_VERIFY');
    await pool.query("UPDATE auth_tokens SET expires_at=now()-interval '1 minute' WHERE token_hash=$1",[tokenHash(expired)]);
    error(await request(f.app).post('/api/auth/verify-email/confirm').send({token:expired}),410,'ACTION_TOKEN_EXPIRED');
    const verify=await mailToken(f,a,'EMAIL_VERIFY');
    error(await request(f.app).post('/api/auth/password/reset').send({token:verify,newPassword:'New!MountainPass2026'}),400,'ACTION_TOKEN_PURPOSE_MISMATCH');
    error(await bearer(request(f.app).post('/api/auth/verify-email/confirm'),b).send({token:verify}),403,'ACTION_ACCOUNT_MISMATCH');
    assert.equal((await prisma.authToken.findUnique({where:{tokenHash:tokenHash(verify)}})).usedAt,null);
    const results=await Promise.all([1,2].map(()=>request(f.app).post('/api/auth/verify-email/confirm').send({token:verify})));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    error(await request(f.app).post('/api/auth/verify-email/confirm').send({token:verify}),409,'ACTION_TOKEN_USED');
    const reset=await mailToken(f,a,'PASSWORD_RESET');
    error(await bearer(request(f.app).post('/api/auth/password/reset'),b).send({token:reset,newPassword:'New!MountainPass2026'}),403,'ACTION_ACCOUNT_MISMATCH');
    error(await request(f.app).post('/api/auth/verify-email/confirm').send({token:reset}),400,'ACTION_TOKEN_PURPOSE_MISMATCH');
    error(await request(f.app).post('/api/auth/password/reset').send({token:randomBytes(32).toString('base64url'),newPassword:'New!MountainPass2026'}),404,'ACTION_TOKEN_NOT_FOUND');
  });

  test('password reset verifies the mailbox, replaces credentials and immediately revokes every access/refresh family', async () => {
    const f=make(),a=await signup(f),other=await login(f,a),token=await mailToken(f,a,'PASSWORD_RESET');
    const newPassword='Reset!MountainTrail2026';
    const done=await request(f.app).post('/api/auth/password/reset').send({token,newPassword});assert.equal(done.status,200);assert.deepEqual(Object.keys(done.body),['message']);
    for(const session of [a,other])error(await bearer(request(f.app).get('/api/me'),session),401,'UNAUTHORIZED');
    assert.ok((await prisma.user.findUnique({where:{id:a.user.id}})).verifiedAt);
    await login(f,a,newPassword);
    error(await request(f.app).post('/api/auth/password/reset').send({token,newPassword}),409,'ACTION_TOKEN_USED');
  });

  test('password change retains the current sid family and kills all other sessions immediately', async () => {
    const f=make(),a=await signup(f),other=await login(f,a);
    error(await bearer(request(f.app).post('/api/auth/password/change'),a).send({currentPassword:'Wrong!Password123',newPassword:'Changed!MountainTrail2026'}),401,'AUTH_FAILED');
    const r=await bearer(request(f.app).post('/api/auth/password/change'),a).send({currentPassword:a.input.password,newPassword:'Changed!MountainTrail2026'});assert.equal(r.status,200);
    assert.equal((await bearer(request(f.app).get('/api/me'),a)).status,200);
    error(await bearer(request(f.app).get('/api/me'),other),401,'UNAUTHORIZED');
    assert.equal((await request(f.app).post('/api/auth/refresh').send({refreshToken:a.refreshToken})).status,200);
    await login(f,a,'Changed!MountainTrail2026');
  });

  test('Google sign-in validates mocked audience, issuer, expiry, verified email and stable sub without live verification', async () => {
    const f=make();
    for(const payload of [{aud:'wrong'}, {iss:'https://untrusted.test'}, {exp:1}, {email_verified:false}]) {
      const r=await request(f.app).post('/api/auth/google').send({idToken:f.googleToken(payload)});
      error(r,payload.email_verified===false?403:401,payload.email_verified===false?'GOOGLE_EMAIL_UNVERIFIED':'INVALID_GOOGLE_TOKEN');
    }
    const raw=f.googleToken(),first=await request(f.app).post('/api/auth/google').send({idToken:raw});assert.equal(first.status,200);
    assert.equal((await prisma.user.findUnique({where:{id:first.body.user.id}})).passwordHash,null);
    f.payloads.get(raw).email=`${randomUUID()}@gmail.com`;
    const later=await request(f.app).post('/api/auth/google').send({idToken:raw});assert.equal(later.body.user.id,first.body.user.id);
    assert.equal(later.body.user.email,first.body.user.email);
  });

  test('authoritative Gmail/Workspace Google identities link verified password accounts without changing their password', async () => {
    for(const workspace of [false,true]) {
      const f=make(),email=`${randomUUID()}@${workspace?'college.test':'gmail.com'}`,a=await signup(f,email);
      await prisma.user.update({where:{id:a.user.id},data:{verifiedAt:new Date()}});
      const before=(await prisma.user.findUnique({where:{id:a.user.id}})).passwordHash;
      const r=await request(f.app).post('/api/auth/google').send({idToken:f.googleToken({email,...(workspace?{hd:'college.test'}:{})})});assert.equal(r.status,200);assert.equal(r.body.user.id,a.user.id);
      assert.equal((await prisma.user.findUnique({where:{id:a.user.id}})).passwordHash,before);
      assert.equal((await bearer(request(f.app).get('/api/me'),a)).status,200);
    }
  });

  test('authoritative Google takeover removes an unverified password credential and revokes all pre-registered sessions', async () => {
    const f=make(),a=await signup(f,`${randomUUID()}@gmail.com`);
    const r=await request(f.app).post('/api/auth/google').send({idToken:f.googleToken({email:a.user.email})});assert.equal(r.status,200);assert.equal(r.body.user.id,a.user.id);
    const user=await prisma.user.findUnique({where:{id:a.user.id},include:{authIdentities:true}});assert.equal(user.passwordHash,null);assert.ok(user.verifiedAt);
    assert.deepEqual(user.authIdentities.map(i=>i.provider),['GOOGLE']);
    error(await bearer(request(f.app).get('/api/me'),a),401,'UNAUTHORIZED');
    error(await request(f.app).post('/api/auth/login').send({email:a.user.email,password:a.input.password}),401,'AUTH_FAILED');
  });

  test('non-authoritative Google collision returns ACCOUNT_LINK_REQUIRED with no state changes; password login then explicit link succeeds', async () => {
    const f=make(),a=await signup(f),raw=f.googleToken({email:a.user.email});
    const snapshot=async()=>({user:await prisma.user.findUnique({where:{id:a.user.id}}),identities:await prisma.authIdentity.findMany({where:{userId:a.user.id}}),tokens:await prisma.authToken.findMany({where:{userId:a.user.id}})});
    const before=await snapshot();
    error(await request(f.app).post('/api/auth/google').send({idToken:raw}),409,'ACCOUNT_LINK_REQUIRED');assert.deepEqual(await snapshot(),before);
    const signedIn=await login(f,a);
    const link=await bearer(request(f.app).post('/api/auth/google/link'),signedIn).send({idToken:raw});assert.equal(link.status,200);assert.deepEqual(link.body.identities.map(i=>i.provider).sort(),['GOOGLE','PASSWORD']);
    assert.equal((await bearer(request(f.app).post('/api/auth/google/link'),signedIn).send({idToken:raw})).status,200);
    const methods=await bearer(request(f.app).get('/api/auth/identities'),signedIn);assert.equal(methods.status,200);assert.equal(methods.body.identities.length,2);
  });

  test('Google subjects never move between users or merge by email; linking is authenticated and an unused differing email may be linked explicitly', async () => {
    const f=make(),a=await signup(f),b=await signup(f),raw=f.googleToken();
    error(await request(f.app).post('/api/auth/google/link').send({idToken:raw}),401,'UNAUTHORIZED');
    assert.equal((await bearer(request(f.app).post('/api/auth/google/link'),a).send({idToken:raw})).status,200);
    error(await bearer(request(f.app).post('/api/auth/google/link'),b).send({idToken:raw}),409,'GOOGLE_SIGN_IN_FAILED');
    const owner=await prisma.authIdentity.findUnique({where:{provider_providerSubject:{provider:'GOOGLE',providerSubject:f.payloads.get(raw).sub}}});assert.equal(owner.userId,a.user.id);
    const f2=make(),oneRaw=f2.googleToken(),one=await request(f2.app).post('/api/auth/google').send({idToken:oneRaw});
    const second=f2.googleToken({email:one.body.user.email});
    error(await request(f2.app).post('/api/auth/google').send({idToken:second}),409,'GOOGLE_SIGN_IN_FAILED');
    error(await bearer(request(f2.app).post('/api/auth/google/link'),one.body).send({idToken:second}),409,'GOOGLE_SIGN_IN_FAILED');
    assert.equal(await prisma.user.count({where:{email:one.body.user.email}}),1);
  });

  test('Google-only users set their first password using a mailbox reset link', async () => {
    const f=make(),r=await request(f.app).post('/api/auth/google').send({idToken:f.googleToken()}),a=r.body;
    error(await bearer(request(f.app).post('/api/auth/password/change'),a).send({currentPassword:'Some!Password123',newPassword:'First!Password2026'}),403,'PASSWORD_NOT_SET');
    const token=await mailToken(f,a,'PASSWORD_RESET');
    assert.equal((await request(f.app).post('/api/auth/password/reset').send({token,newPassword:'First!Password2026'})).status,200);
    const loggedIn=await request(f.app).post('/api/auth/login').send({email:a.user.email,password:'First!Password2026'});assert.equal(loggedIn.status,200);
    assert.equal(await prisma.authIdentity.count({where:{userId:a.user.id}}),2);
  });

  test('parallel first Google sign-ins create one identity/user; a subject cannot be linked concurrently to two users', async () => {
    const f=make(),raw=f.googleToken();
    const signed=await Promise.all([1,2].map(()=>request(f.app).post('/api/auth/google').send({idToken:raw})));
    assert.deepEqual(signed.map(r=>r.status),[200,200]);assert.equal(signed[0].body.user.id,signed[1].body.user.id);
    assert.equal(await prisma.authIdentity.count({where:{provider:'GOOGLE',providerSubject:f.payloads.get(raw).sub}}),1);
    const a=await signup(f),b=await signup(f),unused=f.googleToken();
    const linked=await Promise.all([a,b].map(account=>bearer(request(f.app).post('/api/auth/google/link'),account).send({idToken:unused})));
    assert.deepEqual(linked.map(r=>r.status).sort(),[200,409]);
    assert.equal(await prisma.authIdentity.count({where:{provider:'GOOGLE',providerSubject:f.payloads.get(unused).sub}}),1);
  });

  test('sessions list marks the current family, excludes other users and revocation is owned, idempotent and immediate', async () => {
    const f=make(),a=await signup(f),second=await login(f,a),b=await signup(f);
    const r=await bearer(request(f.app).get('/api/auth/sessions'),a);assert.equal(r.status,200);assert.equal(r.body.sessions.length,2);
    assert.equal(r.body.sessions.filter(s=>s.current).length,1);assert.equal(r.body.sessions.find(s=>s.current).id,claims(a.accessToken).sid);
    assert.ok(r.body.sessions.every(s=>s.createdAt&&s.lastUsedAt&&typeof s.deviceLabel==='string'));
    error(await bearer(request(f.app).delete(`/api/auth/sessions/${claims(b.accessToken).sid}`),a),404,'SESSION_NOT_FOUND');
    error(await bearer(request(f.app).delete(`/api/auth/sessions/${randomUUID()}`),a),404,'SESSION_NOT_FOUND');
    const own=claims(second.accessToken).sid;
    assert.equal((await bearer(request(f.app).delete(`/api/auth/sessions/${own}`),a)).status,204);
    assert.equal((await bearer(request(f.app).delete(`/api/auth/sessions/${own}`),a)).status,204);
    error(await bearer(request(f.app).get('/api/me'),second),401,'UNAUTHORIZED');
    assert.equal((await bearer(request(f.app).get('/api/me'),a)).status,200);
  });

  test('new protected endpoints reject missing/bad auth, invalid bodies/params and unknown query fields', async () => {
    const f=make(),a=await signup(f);
    for(const [method,url,body]of [['post','/api/auth/verify-email/request',{}],['post','/api/auth/password/change',{}],
      ['post','/api/auth/google/link',{}],['get','/api/auth/identities'],['get','/api/auth/sessions'],['delete',`/api/auth/sessions/${randomUUID()}`]]) {
      error(await request(f.app)[method](url).send(body),401,'UNAUTHORIZED');
      error(await request(f.app)[method](url).set('Authorization','Bearer invalid').send(body),401,'UNAUTHORIZED');
    }
    for(const [url,body]of [['/api/auth/verify-email/request',{extra:1}],['/api/auth/password/change',{currentPassword:'present',newPassword:'short'}],['/api/auth/google/link',{idToken:'x'}]])
      error(await bearer(request(f.app).post(url),a).send(body),400,'INVALID_INPUT');
    for(const url of ['/api/auth/verify-email/confirm','/api/auth/password/forgot','/api/auth/password/reset','/api/auth/google'])error(await request(f.app).post(url).send({}),400,'INVALID_INPUT');
    error(await bearer(request(f.app).delete('/api/auth/sessions/not-a-uuid'),a),400,'INVALID_INPUT');
    for(const url of ['/api/auth/identities','/api/auth/sessions'])error(await bearer(request(f.app).get(url+'?userId=another'),a),400,'INVALID_INPUT');
  });

  test('separate per-email action limits do not consume other endpoint budgets', async () => {
    const f=make({authActionRateLimitMax:1}),a=await signup(f);
    await request(f.app).post('/api/auth/password/forgot').send({email:a.user.email});await f.app.locals.authJobs.drain();
    error(await request(f.app).post('/api/auth/password/forgot').send({email:` ${a.user.email.toUpperCase()} `}),429,'RATE_LIMITED');
    assert.equal((await bearer(request(f.app).post('/api/auth/verify-email/request'),a).send({})).status,202);await f.app.locals.authJobs.drain();
    error(await bearer(request(f.app).post('/api/auth/verify-email/request'),a).send({}),429,'RATE_LIMITED');
    const id=f.googleToken();assert.equal((await bearer(request(f.app).post('/api/auth/google/link'),a).send({idToken:id})).status,200);
    error(await bearer(request(f.app).post('/api/auth/google/link'),a).send({idToken:id}),429,'RATE_LIMITED');
  });

  test('complete auth logs never include emails, Google ID/access/refresh/action tokens, passwords or hashes', async () => {
    const f=make(),a=await signup(f),raw=f.googleToken({email:a.user.email}),token=await mailToken(f,a,'PASSWORD_RESET');
    await request(f.app).post('/api/auth/google').send({idToken:raw});
    await bearer(request(f.app).post('/api/auth/google/link'),a).send({idToken:raw});
    await request(f.app).post('/api/auth/password/reset').send({token,newPassword:'NeverLog!Password2026'});
    await request(f.app).post('/api/auth/password/reset').send({token,newPassword:'NeverLog!Password2026'});
    const user=await prisma.user.findUnique({where:{id:a.user.id}}),tokens=await prisma.authToken.findMany({where:{userId:a.user.id}});
    for(const secret of [a.user.email,raw,token,a.accessToken,a.refreshToken,a.input.password,'NeverLog!Password2026',user.passwordHash,config.googleWebClientId,...tokens.map(t=>t.tokenHash)])assert.equal(f.logs.join('\n').includes(secret),false);
    await f.app.locals.authJobs.drain();
  });

  test('confirmation, reset, change and session deletion each enforce an independent per-account write limit', async () => {
    const f=make({authActionRateLimitMax:1}),a=await signup(f);
    const verify=await mailToken(f,a,'EMAIL_VERIFY');
    assert.equal((await request(f.app).post('/api/auth/verify-email/confirm').send({token:verify})).status,200);
    error(await request(f.app).post('/api/auth/verify-email/confirm').send({token:verify}),429,'RATE_LIMITED');
    assert.equal((await bearer(request(f.app).post('/api/auth/password/change'),a).send({currentPassword:a.input.password,newPassword:'Changed!LimitTrail2026'})).status,200);
    error(await bearer(request(f.app).post('/api/auth/password/change'),a).send({currentPassword:'Changed!LimitTrail2026',newPassword:'Changed!LimitTrail2027'}),429,'RATE_LIMITED');
    const other=await login(f,a,'Changed!LimitTrail2026'),id=claims(other.accessToken).sid;
    assert.equal((await bearer(request(f.app).delete(`/api/auth/sessions/${id}`),a)).status,204);
    error(await bearer(request(f.app).delete(`/api/auth/sessions/${id}`),a),429,'RATE_LIMITED');
    const reset=await mailToken(f,a,'PASSWORD_RESET');
    assert.equal((await request(f.app).post('/api/auth/password/reset').send({token:reset,newPassword:'Reset!LimitTrail2026'})).status,200);
    error(await request(f.app).post('/api/auth/password/reset').send({token:reset,newPassword:'Reset!LimitTrail2027'}),429,'RATE_LIMITED');
    await f.app.locals.authJobs.drain();
  });

  test('new account resources reject suspended sessions and identity lists never expose another user’s methods', async () => {
    const f=make(),a=await signup(f),b=await signup(f);
    await bearer(request(f.app).post('/api/auth/google/link'),a).send({idToken:f.googleToken()});
    const methods=await bearer(request(f.app).get('/api/auth/identities'),b);
    assert.deepEqual(methods.body.identities.map(i=>i.provider),['PASSWORD']);
    assert.ok(methods.body.identities.every(i=>i.emailAtSignup===b.user.email));
    await prisma.user.update({where:{id:a.user.id},data:{suspendedAt:new Date()}});
    for(const [method,url,body]of [['get','/api/auth/sessions'],['get','/api/auth/identities'],
      ['post','/api/auth/verify-email/request',{}],['post','/api/auth/password/change',{}],['post','/api/auth/google/link',{}],
      ['delete',`/api/auth/sessions/${randomUUID()}`]])error(await bearer(request(f.app)[method](url),a).send(body),403,'ACCOUNT_SUSPENDED');
  });
};
