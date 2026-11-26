// Palette guard (T19). Fails on banned neon hues anywhere in mobile/ sources, and on colour
// literals outside the token files and the documented exceptions. Also scans built CSS if present.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const root = fileURLToPath(new URL('..', import.meta.url));
const EXT = /\.(css|jsx?|html|xml|svg|mjs)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'assets-src']);

// Colour literals are allowed only in these files (posix paths relative to mobile/).
const ALLOW = [
  [/^src\/styles\.css$/, 'token file (incl. Google button brand colours)'],
  [/^src\/map\/hexes\.js$/, 'map colour fallback matching tokens'],
  [/^src\/pages\/(community|profile)-pages\.jsx$/, 'stored avatar identity colours'],
  [/^src\/ui\/index\.jsx$/, 'avatar default colour and glyph stroke'],
  [/^src\/ui\/ui\.css$/, 'mask (#000 is alpha only, not painted)'],
  [/^android\/app\/src\/main\/res\//, 'android brand resources'],
  [/\.test\.jsx?$/, 'tests'],
  [/^scripts\//, 'tooling'],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out); else if (EXT.test(name)) out.push(full);
  }
  return out;
}

function toHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}

const COLOUR = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*\d[^)]*\)|hsla?\(\s*\d[^)]*\)/g;
function parse(text) {
  if (text[0] === '#') {
    let hex = text.slice(1);
    if (hex.length === 3) hex = [...hex].map(c => c + c).join('');
    const n = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    return toHsl(...n);
  }
  const nums = text.match(/[\d.]+%?/g).map(parseFloat);
  if (text.startsWith('hsl')) return { h: nums[0] % 360, s: nums[1], l: nums[2] };
  return toHsl(nums[0], nums[1], nums[2]);
}

const inRange = (v, a, b) => v >= a && v <= b;
function bannedReason({ h, s, l }) {
  if (inRange(h, 65, 120) && s > 60 && l > 45) return 'lime/chartreuse';
  if (inRange(h, 165, 200) && s > 80 && inRange(l, 40, 70)) return 'electric cyan';
  if (inRange(h, 285, 335) && s > 80 && l > 45) return 'hot magenta';
  return null;
}
const isPurple = ({ h, s }) => inRange(h, 255, 300) && s > 40;
const isBlue = ({ h, s }) => inRange(h, 200, 254) && s > 40;

export function scanText(text, allowLiterals) {
  const problems = [];
  text.split('\n').forEach((line, i) => {
    const found = [...line.matchAll(COLOUR)].map(m => ({ raw: m[0], hsl: parse(m[0]) }));
    for (const { raw, hsl } of found) {
      const why = bannedReason(hsl);
      if (why) problems.push(`line ${i + 1}: ${raw} is a banned ${why} colour`);
      else if (!allowLiterals) problems.push(`line ${i + 1}: colour literal ${raw} outside the token files (use a var(--token))`);
    }
    if (/gradient\(/.test(line) && found.some(c => isPurple(c.hsl)) && found.some(c => isBlue(c.hsl))) {
      problems.push(`line ${i + 1}: purple-to-blue gradient is banned`);
    }
  });
  return problems;
}

let failures = 0;
const report = (file, problems) => { for (const p of problems) { console.error(`${file}: ${p}`); failures++; } };

const scanRoots = ['src', 'index.html', 'android/app/src/main/res'];
for (const entry of scanRoots) {
  const path = join(root, entry);
  if (!existsSync(path)) continue;
  const files = statSync(path).isDirectory() ? walk(path) : [path];
  for (const file of files) {
    const rel = relative(root, file).split(sep).join('/');
    if (/\.md$/.test(rel)) continue;
    report(rel, scanText(readFileSync(file, 'utf8'), ALLOW.some(([re]) => re.test(rel))));
  }
}
// Built CSS only gets the banned-hue test: tokens legitimately compile to literals.
const built = join(root, 'dist/assets');
if (existsSync(built)) {
  for (const name of readdirSync(built).filter(n => n.endsWith('.css'))) {
    report(`dist/assets/${name}`, scanText(readFileSync(join(built, name), 'utf8'), true));
  }
}

if (failures) { console.error(`\nPalette guard failed: ${failures} problem(s). See docs/ai/05-ui-ux-design.md (Banned colours).`); process.exit(1); }
console.log('Palette guard passed: no banned hues, no stray colour literals.');
