'use strict';
// Run in the owner's Terminal. All writes stay in the guarded API test DB.
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { testDatabaseConfig } = require('../db-tests/helpers');
const { readConfig } = require('../src/config');
const { createApp } = require('../src/app');
async function main() {
  const isolated = testDatabaseConfig({ ...process.env, DATABASE_URL_TEST: process.env.DATABASE_URL_API_TEST });
  const prisma = new PrismaClient({ datasources: { db: { url: isolated.connectionString } }, log: [] });
  const config = readConfig({ DATABASE_URL: isolated.connectionString, CORS_ORIGINS: 'http://localhost:5173', NODE_ENV: 'test',
    JWT_ACCESS_SECRET: 'proof-access-secret-only-01234567890123456789',
    REFRESH_TOKEN_DERIVATION_SECRET: 'proof-derivation-secret-only-98765432109876543210',
    GOOGLE_WEB_CLIENT_ID: 'proof-client.apps.googleusercontent.com', MAIL_TRANSPORT: 'outbox', WEB_BASE_URL: 'http://localhost:5173' });
  const email = `proof-${randomUUID()}@example.test`, messages = [];
  const app = createApp({ prisma, config: { ...config, authActionRateLimitMax: 100 }, logger: () => {},
    mailer: { send: async message => messages.push(message) },
    verifyGoogle: async () => ({ sub: `proof_${email.split('@')[0].replaceAll('-','')}`, email, email_verified: true,
      aud: config.googleWebClientId, iss: 'https://accounts.google.com', exp: Math.floor(Date.now()/1000)+60, name: 'Proof Runner' }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const transcript = [];
  function report(line) { transcript.push(line); console.log(line); }
  function curl(method, route, body, access, expected) {
    let input = `url = ${JSON.stringify(base+route)}\nrequest = ${JSON.stringify(method)}\n`;
    if (body !== undefined) input += `header = "Content-Type: application/json"\ndata = ${JSON.stringify(JSON.stringify(body))}\n`;
    if (access) input += `header = ${JSON.stringify('Authorization: Bearer '+access)}\n`;
    // Async spawn keeps the in-process HTTP server responsive; values use stdin.
    return new Promise((resolve, reject) => {
      const child = require('node:child_process').spawn('curl', ['--silent','--show-error','--max-time','15','--config','-','--write-out','\n%{http_code}'], { stdio: ['pipe','pipe','pipe'] });
      let output = ''; child.stdout.on('data', d => output += d); child.stderr.resume(); child.stdin.end(input);
      child.once('error', reject);
      child.once('exit', code => {
        if (code) return reject(new Error('Curl failed.'));
        const at = output.lastIndexOf('\n'), status = Number(output.slice(at+1));
        let data; try { data = output.slice(0,at) ? JSON.parse(output.slice(0,at)) : null; } catch { return reject(new Error('Invalid API response.')); }
        report(`curl ${method} ${route} -> HTTP ${status}`);
        report(data ? JSON.stringify(data, (key,value) => /^(?:accessToken|refreshToken|idToken|token|email|emailAtSignup)$/.test(key) ? '[REDACTED]' : value) : '(empty body)');
        if (status !== expected) return reject(new Error('Unexpected status.'));
        resolve(data);
      });
    });
  }
  const mailToken = () => new URL(messages.at(-1).text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
  try {
    const identity = (await prisma.$queryRaw`SELECT current_database() AS name`)[0].name;
    if (identity !== isolated.database) throw new Error('Wrong test database.');
    report(`Curl proof: API test database only; Google verifier and email delivery are mocked. ${base}`);
    let account = await curl('POST','/api/auth/register',{email,password:'Proof!MountainTrail2026',displayName:'Proof Runner'},null,201);
    await curl('POST','/api/auth/verify-email/request',{},account.accessToken,202); await app.locals.authJobs.drain();
    await curl('POST','/api/auth/verify-email/confirm',{token:mailToken()},null,200);
    await curl('POST','/api/auth/password/forgot',{email},null,202); await app.locals.authJobs.drain();
    await curl('POST','/api/auth/password/reset',{token:mailToken(),newPassword:'Reset!MountainTrail2026'},null,200);
    await curl('GET','/api/me',undefined,account.accessToken,401);
    account = await curl('POST','/api/auth/login',{email,password:'Reset!MountainTrail2026'},null,200);
    await curl('POST','/api/auth/google/link',{idToken:'proof-mocked-google-id-token'},account.accessToken,200);
    await curl('GET','/api/auth/identities',undefined,account.accessToken,200);
    await curl('POST','/api/auth/password/change',{currentPassword:'Reset!MountainTrail2026',newPassword:'Changed!MountainTrail2026'},account.accessToken,200);
    await curl('GET','/api/me',undefined,account.accessToken,200);
    const sessions = await curl('GET','/api/auth/sessions',undefined,account.accessToken,200);
    await curl('DELETE',`/api/auth/sessions/${sessions.sessions.find(s=>s.current).id}`,undefined,account.accessToken,204);
    await curl('GET','/api/me',undefined,account.accessToken,401);
    account = await curl('POST','/api/auth/google',{idToken:'proof-mocked-google-id-token'},null,200);
    await curl('POST','/api/auth/logout',{refreshToken:account.refreshToken},null,204);
    report('AUTH COMPLETE CURL PROOF PASSED. No real Google flow or SMTP delivery was exercised.');
  } finally {
    try { await app.locals.authJobs.drain(); await prisma.user.deleteMany({where:{email}}); }
    finally { await prisma.$disconnect(); await new Promise(resolve=>server.close(resolve)); }
    report('Proof account removed; temporary proof listener closed.');
    const log = path.resolve(__dirname,'../../.local/auth-complete/curl-proof.log');
    await fs.mkdir(path.dirname(log),{recursive:true,mode:0o700});
    await fs.writeFile(log,transcript.join('\n')+'\n',{mode:0o600});
    console.log('Redacted transcript saved to .local/auth-complete/curl-proof.log');
  }
}
main().catch(()=>{ console.error('Auth curl proof failed; sensitive details omitted. Ensure the API test migrations exist.'); process.exitCode=1; });
