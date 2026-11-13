import { readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
const directory = new URL('../dist/assets/', import.meta.url);
const files = await readdir(directory);
const main = files.filter(name => /^index-.*\.js$/.test(name));
if (main.length !== 1) throw Error('Build first; expected exactly one main JavaScript entry.');
const bytes = gzipSync(await readFile(new URL(main[0], directory))).length;
let css = 0;
for (const name of files.filter(name => name.endsWith('.css'))) css += gzipSync(await readFile(new URL(name, directory))).length;
console.log(`Main JavaScript gzip: ${bytes} bytes (limit: 350000).`);
console.log(`CSS gzip: ${css} bytes.`);
if (bytes >= 350000) { console.error('Main JavaScript exceeds the transfer budget.'); process.exitCode = 1; }
if (files.some(name => /sharp|libvips/i.test(name))) { console.error('Build-only image tooling must not enter the application.'); process.exitCode = 1; }
