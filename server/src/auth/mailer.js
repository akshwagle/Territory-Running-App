'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const nodemailer = require('nodemailer');

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
  return { send: async (message) => {
    await fs.mkdir(outboxDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(outboxDir, `${Date.now()}-${randomUUID()}.json`),
      JSON.stringify({ ...message, createdAt: new Date().toISOString() }, null, 2), { flag: 'wx', mode: 0o600 });
  } };
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
