#!/usr/bin/env node
'use strict';

// Open a recent development outbox link without printing its recipient/token,
// putting it in shell history, or exposing it in adb's process arguments.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const adb = path.join(process.env.ANDROID_HOME || path.join(process.env.HOME, 'Library/Android/sdk'), 'platform-tools/adb');
function main() {
  const [action, ...args] = process.argv.slice(2);
  if (!['verify', 'reset'].includes(action) || args.some(arg => arg !== '--dry-run')) throw Error('Usage: node scripts/open-auth-mail.js verify|reset [--dry-run]');
  const folder = path.join(root, '.local/mail-outbox');
  const candidates = fs.readdirSync(folder).filter(name => /^\d+-[0-9a-f-]{36}\.json$/.test(name)).map(name => ({ file: path.join(folder, name), stat: fs.lstatSync(path.join(folder, name)) }))
    .filter(item => item.stat.isFile() && Date.now() - item.stat.mtimeMs < 15 * 60 * 1000).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  let token;
  for (const item of candidates) {
    const message = JSON.parse(fs.readFileSync(item.file, 'utf8'));
    const raw = message.text?.match(/https?:\/\/\S+/)?.[0];
    if (!raw) continue;
    const url = new URL(raw);
    if (url.pathname !== `/${action}`) continue;
    const value = url.searchParams.get('token');
    if (/^[\w-]{42}[AEIMQUYcgkosw048]$/.test(value || '')) { token = value; break; }
  }
  if (!token) throw Error('No recent matching message. Request a new email in the app, then retry.');
  if (args.includes('--dry-run')) { console.log(`Would open the latest recent ${action} link. No token/recipient displayed and no device action taken.`); return; }
  const devices = execFileSync(adb, ['devices'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n').map(line => line.match(/^(\S+)\s+device$/)?.[1]).filter(Boolean);
  if (devices.length !== 1) throw Error('Connect exactly one authorised Android phone by USB, then retry.');
  const uri = `territoryrun://${action}?token=${token}`;
  const result = spawnSync(adb, ['-s', devices[0], 'shell', '-T'], {
    input: `am start -a android.intent.action.VIEW -d '${uri}'\n`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0 || /Error|Exception/.test(`${result.stdout}${result.stderr}`)) throw Error('The app link could not open. Check that the current debug APK is installed.');
  console.log(`Opened the latest recent ${action} link on the connected phone. Token and recipient were not printed.`);
}
try { main(); } catch (error) {
  // Only our own fixed instructions are printable; OS/parser failures may carry
  // private outbox contents or command output and must never be echoed.
  const allowed = /^(Usage:|No recent matching|Connect exactly|The app link could)/;
  console.error(allowed.test(error.message) ? error.message : 'Could not read a recent outbox link. Request a new email and check the local setup.');
  process.exitCode = 1;
}
