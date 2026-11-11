// Original cluster geometry, rasterized in code. No image or rendering dependency.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const width = 1200, height = 630, samples = 2;
const paper = [243, 238, 228], pine = [31, 90, 70], clay = [184, 69, 42];
const scale = 3;
const hexes = [[-26, 22.5, pine], [26, 22.5, pine], [0, -22.5, clay]].map(([cx, cy, color]) => ({
  color,
  vertices: Array.from({ length: 6 }, (_, i) => {
    const angle = (i * 60 - 90) * Math.PI / 180;
    return [width / 2 + (cx + 27 * Math.cos(angle)) * scale, height / 2 + (cy + 27 * Math.sin(angle)) * scale];
  }),
}));
function inside(x, y, vertices) {
  let result = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [xi, yi] = vertices[i], [xj, yj] = vertices[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) result = !result;
  }
  return result;
}
const pixels = Buffer.alloc((1 + width * 3) * height);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const rgb = [0, 0, 0];
  for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
    const color = hexes.find(hex => inside(x + (sx + .5) / samples, y + (sy + .5) / samples, hex.vertices))?.color || paper;
    for (let c = 0; c < 3; c++) rgb[c] += color[c];
  }
  for (let c = 0; c < 3; c++) pixels[y * (1 + width * 3) + 1 + x * 3 + c] = Math.round(rgb[c] / samples ** 2);
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function chunk(type, data) {
  const bytes = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const length = Buffer.alloc(4), sum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, bytes, sum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
const target = fileURLToPath(new URL('../public/social-card.png', import.meta.url));
writeFileSync(target, png);
console.log(`Rendered ${width}x${height} logo on paper: ${target}`);
