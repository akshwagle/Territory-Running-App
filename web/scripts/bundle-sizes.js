import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(dist, '.vite/manifest.json'), 'utf8'));
const entry = Object.keys(manifest).find((key) => manifest[key].isEntry);
if (!entry) throw new Error('No production entry in the Vite manifest. Run npm run build.');
const mobileFiles = new Set();
function visit(key) {
  const item = manifest[key];
  if (mobileFiles.has(item.file)) return;
  mobileFiles.add(item.file);
  for (const imported of item.imports || []) visit(imported);
}
visit(entry);
const assets = (await readdir(path.join(dist, 'assets'))).filter((name) => /\.(js|css)$/.test(name)).sort();
let mobileJs = 0, allJs = 0, css = 0;
console.log('\nGzip sizes (actual emitted bytes, all chunks counted):');
for (const name of assets) {
  const size = gzipSync(await readFile(path.join(dist, 'assets', name))).length;
  const file = `assets/${name}`;
  const mobile = mobileFiles.has(file);
  if (name.endsWith('.js')) { allJs += size; if (mobile) mobileJs += size; } else css += size;
  console.log(`  ${file}: ${size} bytes${name.endsWith('.js') ? mobile ? ' [mobile + desktop]' : ' [desktop effect chunk]' : ''}`);
}
console.log(`Mobile JavaScript: ${mobileJs} bytes (${(mobileJs / 1000).toFixed(2)} kB gzip); limit 90000.`);
console.log(`All JavaScript, including desktop effects: ${allJs} bytes (${(allJs / 1000).toFixed(2)} kB gzip).`);
console.log(`All CSS: ${css} bytes (${(css / 1000).toFixed(2)} kB gzip); limit 15000.`);
console.log('Phones and reduced-motion sessions skip the dynamic effect chunk; see usePresentationMotion.js and its tests.');
if (mobileJs > 90000 || css > 15000) throw new Error('Mobile transfer budget exceeded. Cut effects before adding more code.');
