'use strict';
// Owner-run, loopback-only development tool; never installed in web/mobile.
const express = require('express');
const helmet = require('helmet');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const path = require('node:path');

function testPage(clientId, nonce) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google sign-in check | Territory Run</title>
<style nonce="${nonce}">@font-face{font-family:Barlow;src:url('/fonts/barlow.woff2')}@font-face{font-family:BarlowCondensed;src:url('/fonts/heading.woff2');font-weight:800}*{box-sizing:border-box}body{margin:0;padding:24px;background:#F3EEE4;color:#1F2421;font:1.1rem/1.5 Barlow,sans-serif}main{max-width:580px;margin:32px auto;border-top:2px solid #1F5A46;padding-top:24px}h1{font:800 clamp(2rem,8vw,3rem)/1.1 BarlowCondensed,sans-serif}button{min-height:48px;padding:10px 20px;border:1px solid #1F5A46;border-radius:2px;color:#F3EEE4;background:#1F5A46;font:inherit}button:focus-visible{outline:2px solid #1F5A46;outline-offset:3px}button:disabled{opacity:.5}#google{min-height:56px;max-width:100%;overflow:hidden}#status{min-height:96px;overflow-wrap:anywhere}small{display:block;color:#5A5F58}a{color:#1F5A46}</style></head>
<body><main><small>TERRITORY RUN / LOCAL DEVELOPMENT</small><h1>GOOGLE SIGN-IN CHECK</h1><p>This signs in to your local API and creates or links a development account under the documented linking rules. Use a test Google account.</p><div id="google">Loading Google sign-in…</div><p id="status" role="status" aria-live="polite">Not signed in. The API must be running.</p><button id="logout" disabled>End this test session</button><p>No client ID, email or tokens are displayed or written to browser storage. This is a development check, not the app’s sign-in screen.</p></main>
<script nonce="${nonce}">
let session=null;const status=document.getElementById('status'),logout=document.getElementById('logout');
async function post(route,body){const response=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json','X-Test-Nonce':${JSON.stringify(nonce)}},body:JSON.stringify(body)});const data=response.status===204?null:await response.json();if(!response.ok)throw Error(data?.error?.message||'The local API request failed.');return data;}
async function signedIn(result){status.textContent='Checking Google identity with the local API…';try{session=await post('/signin',{idToken:result.credential});await post('/me',{accessToken:session.accessToken});logout.disabled=false;status.textContent='Google sign-in passed. The local API issued a session and /api/me accepted it. No tokens are displayed.';}catch(error){session=null;logout.disabled=true;status.textContent=error.message;}}
logout.addEventListener('click',async()=>{if(!session)return;logout.disabled=true;try{await post('/logout',{refreshToken:session.refreshToken});session=null;status.textContent='Test session ended. Its access and refresh tokens are now rejected.';}catch{logout.disabled=false;status.textContent='Could not reach the local API. Reconnect and try ending the session again.';}});
const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=()=>{google.accounts.id.initialize({client_id:${JSON.stringify(clientId)},callback:signedIn,auto_select:false});document.getElementById('google').textContent='';google.accounts.id.renderButton(document.getElementById('google'),{theme:'outline',size:'large',shape:'rectangular',width:Math.min(360,window.innerWidth-48)});status.textContent='Choose a Google account. If Google reports an origin error, authorize this localhost origin in your Web OAuth client.';};script.onerror=()=>{document.getElementById('google').textContent='Google sign-in is unavailable.';status.textContent='Google could not load. Check your network or browser settings and reload.';};document.head.appendChild(script);
</script></body></html>`;
}

function createGoogleTestApp({ clientId, apiOrigin, port, upstream = fetch }) {
  const app = express(), nonce = randomBytes(24).toString('base64url');
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  app.disable('x-powered-by');
  app.use((req,res,next)=>hosts.has(req.get('host'))?next():res.status(403).end());
  app.use(helmet({ crossOriginOpenerPolicy:{policy:'same-origin-allow-popups'},contentSecurityPolicy:{directives:{
    defaultSrc:["'self'"],scriptSrc:["'self'",`'nonce-${nonce}'`,'https://accounts.google.com/gsi/client'],
    styleSrc:["'self'",`'nonce-${nonce}'`,'https://accounts.google.com/gsi/style'],
    frameSrc:['https://accounts.google.com'],connectSrc:["'self'",'https://accounts.google.com'],upgradeInsecureRequests:null,
  }} }));
  app.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.get('/',(_req,res)=>res.type('html').send(testPage(clientId,nonce)));
  app.get('/fonts/barlow.woff2',(_req,res)=>res.sendFile(path.resolve(__dirname,'../../web/node_modules/@fontsource/barlow/files/barlow-latin-400-normal.woff2')));
  app.get('/fonts/heading.woff2',(_req,res)=>res.sendFile(path.resolve(__dirname,'../../web/node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2')));
  app.use(express.json({limit:'16kb',strict:true}));
  app.post(['/', '/signin','/me','/logout'],async(req,res)=>{
    const origin=req.get('origin'),provided=req.get('x-test-nonce')||'';
    if(![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(origin)||Buffer.byteLength(provided)!==Buffer.byteLength(nonce)||!timingSafeEqual(Buffer.from(provided),Buffer.from(nonce)))return res.status(403).json({error:{code:'FORBIDDEN',message:'Reload the local test page.'}});
    const routes={'/signin':['/api/auth/google','idToken'],'/me':['/api/me','accessToken'],'/logout':['/api/auth/logout','refreshToken']};
    const selected=routes[req.path];
    if(!selected||!req.body||Object.keys(req.body).join(',')!==selected[1]||typeof req.body[selected[1]]!=='string'||req.body[selected[1]].length>8192)return res.status(400).json({error:{code:'INVALID_INPUT',message:'Reload the local test page.'}});
    try{
      const response=await upstream(apiOrigin+selected[0],{method:req.path==='/me'?'GET':'POST',
        headers:req.path==='/me'?{Authorization:'Bearer '+req.body.accessToken}:{'Content-Type':'application/json'},
        body:req.path==='/me'?undefined:JSON.stringify(req.body),signal:AbortSignal.timeout(15000)});
      if(response.status===204)return res.status(204).end();
      return res.status(response.status).json(await response.json());
    }catch{return res.status(503).json({error:{code:'API_UNAVAILABLE',message:'The local API is unreachable. Start it in Terminal and try again.'}});}
  });
  app.use((_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'The test resource was not found.'}}));
  app.use((_error,_req,res,_next)=>res.status(400).json({error:{code:'INVALID_INPUT',message:'Invalid test request.'}}));
  return app;
}
function main() {
  require('dotenv').config({path:path.resolve(__dirname,'../.env')});
  if(process.env.NODE_ENV==='production')throw Error('This helper is development-only.');
  const clientId=process.env.GOOGLE_WEB_CLIENT_ID;
  if(!clientId||!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId))throw Error('Set GOOGLE_WEB_CLIENT_ID before running this helper.');
  const port=Number(process.env.GOOGLE_TEST_PORT||5174),url=new URL(process.env.GOOGLE_TEST_API_URL||'http://127.0.0.1:4000');
  if(!Number.isInteger(port)||port<1024||port>65535||!['http:','https:'].includes(url.protocol)||!['localhost','127.0.0.1'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Use a loopback API origin and a valid GOOGLE_TEST_PORT.');
  const server=createGoogleTestApp({clientId,apiOrigin:url.origin,port}).listen(port,'127.0.0.1',()=>console.log(`Open the Google sign-in check: http://localhost:${port}`));
  server.on('error',()=>{console.error('Google check could not listen. Choose a free GOOGLE_TEST_PORT.');process.exitCode=1;});
}
if(require.main===module){try{main();}catch{console.error('Google check configuration is invalid. Check the documented environment names; values are omitted.');process.exitCode=1;}}
module.exports={createGoogleTestApp,testPage};
