'use strict';

const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash, randomUUID } = require('node:crypto');
const { parseArgs } = require('node:util');
const path = require('node:path');

function releaseInput(args) {
  const { values } = parseArgs({ args, options: {
    file: { type: 'string' }, 'version-name': { type: 'string' },
    'version-code': { type: 'string' }, changelog: { type: 'string' },
  }, allowPositionals: false });
  const versionName = values['version-name'];
  const code = values['version-code'];
  if (!values.file || !/\.apk$/i.test(values.file)) throw new Error('--file must point to an .apk file.');
  if (!versionName || versionName.length > 20 || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(versionName)) {
    throw new Error('--version-name must be a safe semantic version of at most 20 characters.');
  }
  if (!code || !/^\d+$/.test(code) || !Number.isSafeInteger(Number(code)) || Number(code) < 1 || Number(code) > 2100000000) {
    throw new Error('--version-code must be an integer from 1 to 2100000000.');
  }
  return { file: path.resolve(values.file), versionName, versionCode: Number(code), changelog: values.changelog ?? null };
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function registerRelease({ prisma, input, storageDir = path.resolve(__dirname, '../storage/apk') }) {
  const source = await fs.realpath(input.file);
  if (!(await fs.stat(source)).isFile()) throw new Error('APK source must be a regular file.');
  const handle = await fs.open(source, 'r');
  try {
    const signature = Buffer.alloc(4);
    const { bytesRead } = await handle.read(signature, 0, 4, 0);
    if (bytesRead !== 4 || signature.toString('hex') !== '504b0304') throw new Error('APK source must be a ZIP-format Android build.');
  } finally { await handle.close(); }
  await fs.mkdir(storageDir, { recursive: true });
  const filename = `territory-run-${input.versionName}.apk`;
  const destination = path.join(storageDir, filename);
  const temporary = path.join(storageDir, `.register-${randomUUID()}.tmp`);
  const backup = path.join(storageDir, `.register-${randomUUID()}.bak`);
  await fs.copyFile(source, temporary);
  const digest = await sha256(temporary);
  let replaced = false;
  let hadPrevious = false;
  try {
    const release = await prisma.$transaction(async (tx) => {
      // Serialize local registrations so filename checks and upserts agree.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(82364127)`;
      const apkUrl = `/downloads/${filename}`;
      const collision = await tx.appRelease.findFirst({ where: { apkUrl, NOT: { versionCode: input.versionCode } } });
      if (collision) throw new Error('A different version code already uses this version name. Bump both values.');
      try {
        await fs.copyFile(destination, backup);
        hadPrevious = true;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await fs.rename(temporary, destination);
      replaced = true;
      try {
        return await tx.appRelease.upsert({
          where: { versionCode: input.versionCode },
          create: { versionCode: input.versionCode, versionName: input.versionName, apkUrl, sha256: digest, changelog: input.changelog, isActive: true },
          update: { versionName: input.versionName, apkUrl, sha256: digest, changelog: input.changelog, isActive: true, publishedAt: new Date() },
        });
      } catch (error) {
        if (hadPrevious) await fs.rename(backup, destination);
        else await fs.rm(destination, { force: true });
        replaced = false;
        throw error;
      }
    }, { timeout: 30000 });
    replaced = false; // Database commit succeeded; cleanup must not roll it back.
    await fs.rm(backup, { force: true }).catch(() => {});
    return release;
  } catch (error) {
    if (replaced) {
      if (hadPrevious) await fs.rename(backup, destination);
      else await fs.rm(destination, { force: true });
    }
    throw error;
  } finally { await fs.rm(temporary, { force: true }); }
}

async function main() {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
  let input;
  try { input = releaseInput(process.argv.slice(2)); }
  catch (error) { console.error(`Invalid release arguments: ${error.message}`); process.exitCode = 1; return; }
  if (!process.env.DATABASE_URL) { console.error('Set DATABASE_URL before registering a release.'); process.exitCode = 1; return; }
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ log: [] });
  try {
    const release = await registerRelease({ prisma, input });
    console.log(JSON.stringify({ versionCode: release.versionCode, versionName: release.versionName, apkUrl: release.apkUrl, sha256: release.sha256 }));
  } catch {
    console.error('Release registration failed. Check the APK, version-name uniqueness, database connection and storage permissions.');
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}

if (require.main === module) main();
module.exports = { releaseInput, registerRelease, sha256 };
