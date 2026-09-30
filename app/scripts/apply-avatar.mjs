/** 从头像源图生成全套图标（窗口/托盘/favicon/界面 Logo）：node scripts/apply-avatar.mjs [源图路径] */
import sharp from 'sharp';
import { writeFile, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2] || path.join(root, 'assets', 'avatar.png');

// 统一处理：中心方裁 + 512px，作为 canonical 头像
const base = await sharp(source).resize(512, 512, { fit: 'cover', position: 'centre' }).png().toBuffer();
await writeFile(path.join(root, 'assets', 'avatar.png'), base);
console.log('✓ assets/avatar.png (512px，中心方裁)');

for (const [file, size] of [
  ['icon-512.png', 512],
  ['icon-256.png', 256],
  ['icon-64.png', 64],
  ['icon-32.png', 32],
  ['icon-16.png', 16],
]) {
  await sharp(base).resize(size, size).png().toFile(path.join(root, 'assets', file));
  console.log(`✓ assets/${file} (${size}px)`);
}

// 界面 Logo 与 favicon
await mkdir(path.join(root, 'src', 'assets'), { recursive: true });
await copyFile(path.join(root, 'assets', 'avatar.png'), path.join(root, 'src', 'assets', 'avatar.png'));
await copyFile(path.join(root, 'assets', 'avatar.png'), path.join(root, 'public', 'icon.png'));
console.log('✓ src/assets/avatar.png + public/icon.png');

// Windows ICO（256px PNG-in-ICO）
const png256 = await sharp(base).resize(256, 256).png().toBuffer();
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0);
entry.writeUInt8(0, 1);
entry.writeUInt8(0, 2);
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png256.length, 8);
entry.writeUInt32LE(22, 12);
await writeFile(path.join(root, 'assets', 'icon.ico'), Buffer.concat([header, entry, png256]));
console.log('✓ assets/icon.ico (256px PNG-in-ICO)');
