'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const { createApp } = require('../src/app');

module.exports = function profileNameCases({ prisma, pool, config }) {
  function fixture() {
    const payloads = new Map();
    const app = createApp({ prisma, config: { ...config, rateLimitMax:10000, authRateLimitMax:1000, authIpRateLimitMax:1000 },
      logger:()=>{}, verifyGoogle:async token=>{if(!payloads.has(token))throw Error('Mock only');return payloads.get(token);} });
    function token(name, email = `${randomUUID()}@gmail.com`) {
      const idToken = `mock-profile-google-${randomUUID()}`;
      payloads.set(idToken,{sub:`profile_${randomUUID().replaceAll('-','')}`,email,email_verified:true,
        aud:config.googleWebClientId,iss:'https://accounts.google.com',exp:Math.floor(Date.now()/1000)+3600,name});
      return idToken;
    }
    const signup = (displayName,email=`${randomUUID()}@example.test`) => request(app).post('/api/auth/register')
      .send({email,displayName,password:'Profile!MountainTrail2026'});
    const google = idToken => request(app).post('/api/auth/google').send({idToken});
    return {app,signup,google,token,payloads};
  }
  async function assertNames(accounts) {
    for(const account of accounts) {
      assert.ok([...account.user.displayName].length>=3&&[...account.user.displayName].length<=24);
      assert.equal(account.user.displayName,account.user.displayName.normalize('NFKC').trim().replace(/ +/g,' '));
    }
    const rows=(await pool.query('SELECT profile_name_key(display_name) AS key FROM users WHERE id=ANY($1::uuid[])',[accounts.map(a=>a.user.id)])).rows;
    assert.equal(new Set(rows.map(row=>row.key)).size,accounts.length);
  }

  test('PRIV-07 registration normalizes NFKC names to 3-24 characters and suffixes canonical conflicts',async t=>{
    const f=fixture(),suffix=randomUUID().slice(0,8),raw=`  Ｔｒａｉｌ   ${suffix} ABCDEFGHIJKLMNOPQRSTUVWXYZ  `;
    const expected=`Trail ${suffix} ABCDEFGHIJKLMNOPQRSTUVWXYZ`.slice(0,24);
    const first=await f.signup(raw),second=await f.signup(raw.toLowerCase()),third=await f.signup(raw);
    for(const result of [first,second,third])assert.equal(result.status,201);
    assert.equal(first.body.user.displayName,expected);
    assert.match(second.body.user.displayName,/ 2$/);assert.match(third.body.user.displayName,/ 3$/);
    await assertNames([first.body,second.body,third.body]);
    t.diagnostic('Registration: NFKC/trim/truncation=true; canonical conflicts receive suffixes; all names <=24.');
  });

  test('PRIV-07 registration rejects short unsafe reserved and profane names and counts Unicode code points',async()=>{
    const f=fixture();
    for(const name of ['Li','A','Admin','ＡＤＭＩＮ','Bad Shit','Trail\u200bRunner','Trail 🏃']) {
      const response=await f.signup(name);assert.equal(response.status,400);assert.equal(response.body.error.code,'INVALID_INPUT');
    }
    const unicode=await f.signup('𐐀'.repeat(30));assert.equal(unicode.status,201);assert.equal([...unicode.body.user.displayName].length,24);
  });

  test('PRIV-07 Google names normalize and suffix against password users; short or unsafe provider names use a valid fallback',async t=>{
    const f=fixture(),base=`G${randomUUID().replaceAll('-','').slice(0,23)}`;
    const password=await f.signup(base);assert.equal(password.status,201);
    const idToken=f.token(base.toUpperCase()+' Extra Name');
    const google=await f.google(idToken);assert.equal(google.status,200);assert.match(google.body.user.displayName,/ 2$/);
    assert.equal((await f.google(idToken)).body.user.displayName,google.body.user.displayName);
    const fallbacks=[];
    for(const raw of ['Li','Admin','Bad Shit','Trail 🏃']) {
      const result=await f.google(f.token(raw));assert.equal(result.status,200);assert.ok(result.body.user.displayName.startsWith('Runner'));fallbacks.push(result.body);
    }
    await assertNames([password.body,google.body,...fallbacks]);
    t.diagnostic('Google: normalized length <=24; password-name collision suffixed; invalid provider names safely allocated.');
  });

  test('PRIV-07 parallel registration and Google name claims are unique without deadlocks or errors',async t=>{
    const f=fixture(),base=`Group ${randomUUID().slice(0,8)}`;
    const results=await Promise.all(Array.from({length:8},(_,i)=>i%2?f.google(f.token(base.toUpperCase())):f.signup(base)));
    results.forEach((result,i)=>assert.equal(result.status,i%2?200:201));await assertNames(results.map(result=>result.body));
    t.diagnostic('8 parallel password/Google claims: 8 successes, 8 canonical names, zero errors/deadlocks.');
  });

  test('PRIV-07 an in-flight advisory lock forces a suffix even before the competing row exists',async t=>{
    const f=fixture(),base=`Busy ${randomUUID().slice(0,8)}`,db=await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('display-name:' || profile_name_key($1),0))",[base]);
      const result=await f.signup(base).timeout({response:3000,deadline:5000});
      assert.equal(result.status,201);assert.equal(result.body.user.displayName,base+' 2');
      t.diagnostic('Held canonical-name advisory lock respected; signup completed with suffix rather than waiting/deadlocking.');
    } finally {await db.query('ROLLBACK');db.release();}
  });

  test('PRIV-07 registration and Google respect 30-day released-name reservations and allow expired reservations',async()=>{
    const f=fixture(),owner=await f.signup(`Owner ${randomUUID().slice(0,8)}`);assert.equal(owner.status,201);
    const reserved=`Reserved ${randomUUID().slice(0,8)}`,expired=`Expired ${randomUUID().slice(0,8)}`;
    await pool.query(`INSERT INTO display_name_history(user_id,display_name,name_key) VALUES($1::uuid,$2::text,profile_name_key($2::text))`,[owner.body.user.id,reserved]);
    await pool.query(`WITH stamp AS(SELECT clock_timestamp()-interval '31 days' AS changed)
      INSERT INTO display_name_history(user_id,display_name,name_key,changed_at,reserved_until)
      SELECT $1::uuid,$2::text,profile_name_key($2::text),changed,changed+interval '720 hours' FROM stamp`,[owner.body.user.id,expired]);
    const first=await f.signup(reserved),second=await f.google(f.token(reserved));
    assert.equal(first.status,201);assert.equal(second.status,200);assert.match(first.body.user.displayName,/ 2$/);assert.match(second.body.user.displayName,/ 3$/);
    const released=await f.signup(expired);assert.equal(released.status,201);assert.equal(released.body.user.displayName,expired);
  });

  test('PRIV-07 Google unverified-account takeover suffixes a colliding name and reserves the released name',async()=>{
    const f=fixture(),former=`Former ${randomUUID().slice(0,8)}`,taken=`Taken ${randomUUID().slice(0,8)}`;
    const owner=await f.signup(former,`${randomUUID()}@gmail.com`),other=await f.signup(taken);
    assert.equal(owner.status,201);assert.equal(other.status,201);
    const idToken=f.token(taken,owner.body.user.email),result=await f.google(idToken);
    assert.equal(result.status,200);assert.equal(result.body.user.id,owner.body.user.id);assert.equal(result.body.user.displayName,taken+' 2');
    const history=(await pool.query('SELECT display_name,extract(epoch FROM reserved_until-changed_at)::int AS duration_s FROM display_name_history WHERE user_id=$1',[owner.body.user.id])).rows;
    assert.equal(history.length,1);assert.equal(history[0].display_name,former);assert.equal(history[0].duration_s,2592000);
    const attempted=await f.signup(former);assert.equal(attempted.status,201);assert.equal(attempted.body.user.displayName,former+' 2');
  });
};
