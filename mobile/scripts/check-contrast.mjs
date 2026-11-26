// Verifies WCAG contrast of the Clay & Pine tokens in src/styles.css, both themes.
// Text pairs need 4.5:1, UI/graphic pairs 3:1. Exits 1 on any failure.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
const lightBlock = css.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\n\s*\}/)[1];
const parse = block => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(m => [m[1], m[2]]));
const dark = parse(rootBlock);
const themes = { dark, light: { ...dark, ...parse(lightBlock) } };

const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const grounds = ['--bg', '--surface-raised-2', '--surface-raised'];
const text = ['--text', '--text-2', '--text-3', '--accent', '--warn', '--danger-text'];
const checks = [
  ...grounds.flatMap(g => text.map(t => [t, g, 4.5])),
  ['--on-accent', '--accent', 4.5],
  ['--on-accent', '--accent-bright', 4.5],
  ['--map-other', '--map-bg', 3],
  ['--map-mine', '--map-bg', 3],
  ['--map-cooldown', '--map-bg', 3],
  ['--map-restricted', '--map-bg', 3],
];

let failed = 0;
for (const [name, t] of Object.entries(themes)) {
  for (const [fg, bg, min] of checks) {
    const resolve = k => t[k] ?? t[css.match(new RegExp(`${k}:\\s*var\\((--[\\w-]+)\\)`))?.[1]];
    const [f, b] = [resolve(fg), resolve(bg)];
    if (!f || !b) { console.log(`SKIP ${name} ${fg} on ${bg}`); continue; }
    const r = ratio(f, b);
    if (r < min) { failed++; console.log(`FAIL ${name}: ${fg} ${f} on ${bg} ${b} = ${r.toFixed(2)} (< ${min})`); }
  }
}
console.log(failed ? `${failed} contrast failure(s)` : 'contrast OK (dark + light)');
process.exit(failed ? 1 : 0);
