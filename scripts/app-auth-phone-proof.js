#!/usr/bin/env node
'use strict';

// Read-only checks after the owner completes native sign-in. Private XML and
// logcat are examined in memory: their contents are never printed or saved.
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const adb = path.join(process.env.ANDROID_HOME || path.join(process.env.HOME, 'Library/Android/sdk'), 'platform-tools/adb');
const pkg = 'com.territoryrunning.app';
const version = require('../mobile/app-version.json');
function main() {
  const devices = execFileSync(adb, ['devices'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n').map(line => line.match(/^(\S+)\s+device$/)?.[1]).filter(Boolean);
  if (devices.length !== 1) throw Error('Connect exactly one authorised Android phone.');
  const run = args => execFileSync(adb, ['-s', devices[0], ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const details = run(['shell', 'dumpsys', 'package', pkg]);
  if (!new RegExp(`versionCode=${version.versionCode}\\b`).test(details)) throw Error(`Install the current ${version.versionName} / code ${version.versionCode} debug APK first.`);
  console.log(`PASS installed app: version ${version.versionName} / code ${version.versionCode}.`);
  const files = run(['shell', 'run-as', pkg, 'ls', 'shared_prefs']).trim().split(/\r?\n/).filter(name => /^[\w.-]+\.xml$/.test(name));
  const jwt = /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/;
  let encryptedSession = false;
  for (const file of files) {
    const xml = run(['shell', 'run-as', pkg, 'cat', `shared_prefs/${file}`]);
    if (jwt.test(xml) || /&quot;(?:accessToken|refreshToken|idToken)&quot;\s*:/.test(xml)) throw Error('FAIL: a plaintext token pattern was detected in app preferences. Values are suppressed.');
    if (file === 'WSSecureStorageSharedPreferences.xml') {
      const value = xml.match(/<string name="territoryrun_auth-session-v2">([\s\S]*?)<\/string>/)?.[1];
      encryptedSession = Boolean(value && !value.includes('{') && (value.includes('&#16;') || value.includes('\u0010')));
    }
  }
  if (!encryptedSession) throw Error('A saved encrypted session was not found. Complete Google sign-in and leave the app open, then retry.');
  console.log('PASS secure session: encrypted AES-GCM plugin record present; no raw JWT or plaintext token fields in app preferences.');
  const pid = run(['shell', 'pidof', pkg]).trim();
  if (!/^\d+$/.test(pid)) throw Error('Leave the signed-in app open before checking its logs.');
  const logs = run(['logcat', '-d', `--pid=${pid}`, '-v', 'brief']);
  if (jwt.test(logs) || /\b(?:accessToken|refreshToken|idToken)["']?\s*[:=]\s*["']?[\w.-]{20,}/.test(logs)) throw Error('FAIL: a token pattern was detected in app logcat. Values are suppressed.');
  console.log('PASS current app logcat: no ID/access/refresh token patterns. Raw logcat and private preferences were not printed or saved.');
  console.log('This read-only probe supports the owner-reported phone flow; it does not itself perform Google sign-in or prove SMTP delivery.');
}
try { main(); } catch (error) {
  const allowed = /^(Connect exactly|Install the current|FAIL:|A saved encrypted|Leave the signed-in)/;
  console.error(allowed.test(error.message) ? error.message : 'Phone proof could not finish. Check USB authorisation and the current debug app; private output was suppressed.');
  process.exitCode = 1;
}
