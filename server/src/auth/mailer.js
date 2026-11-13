'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const nodemailer = require('nodemailer');
const { lockAccountWork } = require('../profile/common');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mailFile=/^\d+-[0-9a-f-]{36}\.json$/;

function messageFor(kind, token, email, baseUrl) {
  const verify = kind === 'EMAIL_VERIFY';
  const url = new URL(verify ? '/verify' : '/reset', baseUrl);
  url.searchParams.set('token', token);
  const title = verify ? 'Verify your email' : 'Reset your password';
  const duration = verify ? '24 hours' : '30 minutes';
  const text = `${title}\n\n${url.href}\n\nThis link expires in ${duration}. Opening it never signs you in. If you did not request this, ignore this message.`;
  const safeUrl = url.href.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  return { to: email, subject: `Territory Run: ${title.toLowerCase()}`, text,
    html: `<main style="background:#F3EEE4;color:#1F2421;padding:24px;font-family:Arial,sans-serif"><h1>${title}</h1><p><a style="color:#1F5A46" href="${safeUrl}">${title}</a></p><p>This link expires in ${duration}. Opening it never signs you in.</p><p>If you did not request this, ignore this message.</p></main>` };
}
function createMailer(config, { outboxDir = path.resolve(__dirname, '../../../.local/mail-outbox'), createTransport = nodemailer.createTransport } = {}) {
  if (config.mailTransport === 'smtp') {
    const { from, ...options } = config.smtp;
    const transport = createTransport({ ...options, logger: false, debug: false,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    return { send: async (message) => { await transport.sendMail({ ...message, from }); } };
  }
  const prepare=()=>fs.mkdir(outboxDir,{recursive:true,mode:0o700});
  async function files(){await prepare();return fs.readdir(outboxDir);}
  async function read(name){try{return JSON.parse(await fs.readFile(path.join(outboxDir,name),'utf8'));}catch{return null;}}
  const journal=userId=>`.erase-${userId}.json`;
  async function eraseAccount(userId) {
    if(!uuid.test(userId))throw Error('Invalid outbox owner.');
    const record=await read(journal(userId));if(!record)return;
    if(record.userId!==userId||!Array.isArray(record.files)||record.files.some(name=>!mailFile.test(name)))throw Error('Invalid outbox cleanup record.');
    for(const name of record.files)await fs.rm(path.join(outboxDir,name),{force:true});
    await fs.rm(path.join(outboxDir,journal(userId)),{force:true});
  }
  return {
    send: async (message,{userId=null}={}) => {
      await prepare();
      const name=`${Date.now()}-${randomUUID()}`,temporary=path.join(outboxDir,`${name}.tmp`);
      try {
        await fs.writeFile(temporary,JSON.stringify({ownerId:userId,...message,createdAt:new Date().toISOString()},null,2),{flag:'wx',mode:0o600});
        await fs.rename(temporary,path.join(outboxDir,`${name}.json`));
      } finally {await fs.rm(temporary,{force:true});}
    },
    async prepareErasure({userId,email}) {
      const names=[];
      for(const name of await files())if(mailFile.test(name)) {
        const message=await read(name);
        if(message?.ownerId===userId||message?.ownerId==null&&typeof message?.to==='string'&&message.to.toLowerCase()===email.toLowerCase())names.push(name);
      }
      if(!names.length)return;
      // No message is changed here. Cleanup waits for the same account lock,
      // then checks whether the root DELETE committed or rolled back.
      const temporary=path.join(outboxDir,`.erase-${userId}.tmp`);
      await fs.writeFile(temporary,JSON.stringify({userId,files:names}),{mode:0o600});
      await fs.rename(temporary,path.join(outboxDir,journal(userId)));
    },
    eraseAccount,
    async cleanupOrphans(prisma) {
      for(const name of await files()) {
        if(/^(?:\d+-[0-9a-f-]{36}|\.erase-[0-9a-f-]{36})\.tmp$/.test(name)) {
          const stat=await fs.stat(path.join(outboxDir,name)).catch(()=>null);
          if(stat&&stat.mtimeMs<Date.now()-3600000)await fs.rm(path.join(outboxDir,name),{force:true});
          continue;
        }
        const match=/^\.erase-([0-9a-f-]{36})\.json$/.exec(name);
        const message=mailFile.test(name)?await read(name):null;
        const ownerId=match?.[1]||message?.ownerId;
        if(!uuid.test(ownerId||''))continue;
        await prisma.$transaction(async tx=>{
          await lockAccountWork(tx,ownerId);
          const exists=await tx.user.findUnique({where:{id:ownerId},select:{id:true}});
          if(match) {
            if(!exists)await eraseAccount(ownerId);
            else await fs.rm(path.join(outboxDir,name),{force:true});
          } else if(!exists)await fs.rm(path.join(outboxDir,name),{force:true});
        });
      }
    },
  };
}
function createMailJobs(logger) {
  const queue = [];
  let running = false;
  let waiters = [];
  async function work() {
    if (running) return;
    running = true;
    while (queue.length) {
      try { await queue.shift()(); }
      catch { logger(JSON.stringify({ event: 'mail_failure', reason: 'delivery_failed' })); }
    }
    running = false;
    const complete = waiters; waiters = []; complete.forEach(resolve => resolve());
  }
  return {
    enqueue(job) {
      if (queue.length >= 256) { logger(JSON.stringify({ event: 'mail_failure', reason: 'queue_full' })); return; }
      queue.push(job); queueMicrotask(work);
    },
    drain() { return running || queue.length ? new Promise(resolve => waiters.push(resolve)) : Promise.resolve(); },
  };
}
module.exports = { messageFor, createMailer, createMailJobs };
