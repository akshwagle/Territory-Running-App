import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const html = readFileSync('index.html', 'utf8');
test('document contains the exact noscript message and social metadata', () => {
  expect(html).toMatch(/<noscript>.*Territory Run's download page needs JavaScript\..*<\/noscript>/);
  for (const name of ['og:title', 'og:description', 'og:image', 'twitter:title', 'twitter:description', 'twitter:card']) expect(html).toContain(`="${name}"`);
  const png = readFileSync('public/social-card.png');
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
});
test('only the heading 800 and body 400 faces are preloaded', () => {
  const links = html.match(/<link rel="preload"[^>]+>/g);
  expect(links).toHaveLength(2);
  expect(links[0]).toContain('barlow-condensed-latin-800-normal.woff2');
  expect(links[1]).toContain('barlow-latin-400-normal.woff2');
});
