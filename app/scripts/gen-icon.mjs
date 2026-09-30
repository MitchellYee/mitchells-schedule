/** 生成 PNG 图标（窗口/托盘/打包用）：node scripts/gen-icon.mjs */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(path.join(root, 'assets', 'icon.svg'));

const targets = [
  ['assets/icon-512.png', 512],
  ['assets/icon-256.png', 256],
  ['assets/icon-64.png', 64],
  ['assets/icon-32.png', 32],
  ['assets/icon-16.png', 16],
];

for (const [file, size] of targets) {
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(path.join(root, file));
  console.log(`✓ ${file} (${size}px)`);
}
