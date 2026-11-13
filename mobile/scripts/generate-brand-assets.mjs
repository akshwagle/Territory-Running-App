#!/usr/bin/env node
// Sharp is a build-only dependency. No app module imports this script.
import sharp from 'sharp';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = path.join(root, 'android/app/src/main/res');
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(arg => arg !== '--check')) throw Error('Usage: node scripts/generate-brand-assets.mjs [--check]');
const paper = '#F3EEE4', pine = '#1F5A46', clay = '#B8452A';
// Same three-hex geometry as web/src/components/Logo.jsx; never import /web
// into the native build. The cluster fits Android's adaptive-icon safe zone.
const points = [[0,-27],[23.383,-13.5],[23.383,13.5],[0,27],[-23.383,13.5],[-23.383,-13.5]];
const cells = [[-26,22.5,pine],[26,22.5,pine],[0,-22.5,clay]];
const svgPaths = cells.map(([x,y,color]) => `<path d="M${points.map(([a,b])=>`${a+x},${b+y}`).join('L')}Z" fill="${color}" stroke="${paper}" stroke-width="2"/>`).join('');
const svg = (background=true) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${background?`<path fill="${paper}" d="M0 0h108v108H0z"/>`:''}<g transform="translate(54 54) scale(.48)">${svgPaths}</g></svg>`);
let generated=0;
async function output(name, data) {
  const target=path.join(res,name), bytes=Buffer.isBuffer(data)?data:Buffer.from(data);
  if(check) { const current=await readFile(target).catch(()=>null); if(!current?.equals(bytes))throw Error(`Generated asset differs: ${name}`); }
  else { await mkdir(path.dirname(target),{recursive:true}); await writeFile(target,bytes); }
  generated++;
}
for(const [density,scale] of [['mdpi',1],['hdpi',1.5],['xhdpi',2],['xxhdpi',3],['xxxhdpi',4]]) {
  const icon = await sharp(svg()).resize(Math.round(48*scale)).png().toBuffer();
  await output(`mipmap-${density}/ic_launcher.png`,icon);
  await output(`mipmap-${density}/ic_launcher_round.png`,icon);
  await output(`mipmap-${density}/ic_launcher_foreground.png`,await sharp(svg(false)).resize(Math.round(108*scale)).png().toBuffer());
}
const vectorPaths = (monochrome=false) => cells.map(([x,y,color]) => `<path android:fillColor="${monochrome?'#FFFFFF':color}" android:pathData="M${points.map(([a,b])=>`${(54+(a+x)*.48).toFixed(4)},${(54+(b+y)*.48).toFixed(4)}`).join('L')}Z"/>`).join('\n    ');
const vector = monochrome => `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">\n    ${vectorPaths(monochrome)}\n</vector>\n`;
await output('drawable/brand_mark.xml',vector(false));
await output('drawable/ic_launcher_monochrome.xml',vector(true));
await output('drawable/ic_notification_hex.xml','<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFF" android:pathData="M12,2L21,7L21,17L12,22L3,17L3,7Z"/></vector>\n');
await output('drawable/splash.xml',`<?xml version="1.0" encoding="utf-8"?>\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="@color/ic_launcher_background"/><item android:drawable="@drawable/brand_mark" android:gravity="center"/></layer-list>\n`);
await output('values/ic_launcher_background.xml',`<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">${paper}</color></resources>\n`);
for(const name of ['ic_launcher','ic_launcher_round']) await output(`mipmap-anydpi-v26/${name}.xml`,'<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/><monochrome android:drawable="@drawable/ic_launcher_monochrome"/></adaptive-icon>\n');
// Remove only the known Capacitor template art, all replaced above.
const obsolete=['drawable/splash.png','drawable/ic_launcher_background.xml','drawable-v24/ic_launcher_foreground.xml',...['land','port'].flatMap(orientation=>['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi'].map(d=>`drawable-${orientation}-${d}/splash.png`))];
for(const name of obsolete) {
  const target=path.join(res,name), exists=await readFile(target).then(()=>true).catch(()=>false);
  if(exists&&check)throw Error(`Obsolete template asset remains: ${name}`);
  if(exists)await unlink(target);
}
console.log(`${check?'Verified':'Generated'} ${generated} brand resources; no default Capacitor artwork remains.`);
