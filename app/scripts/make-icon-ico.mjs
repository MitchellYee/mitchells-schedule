/** 生成 Windows ICO（PNG-in-ICO，Vista+ 支持）：node scripts/make-icon-ico.mjs */
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const png = await sharp(path.join(root, 'assets', 'icon.svg'), { density: 300 }).resize(256, 256).png().toBuffer();

// ICONDIR(6) + ICONDIRENTRY(16) + PNG
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count
const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0);   // width 0 = 256
entry.writeUInt8(0, 1);   // height 0 = 256
entry.writeUInt8(0, 2);   // palette
entry.writeUInt8(0, 3);   // reserved
entry.writeUInt16LE(1, 4);   // planes
entry.writeUInt16LE(32, 6);  // bpp
entry.writeUInt32LE(png.length, 8); // bytes
entry.writeUInt32LE(22, 12);        // offset
await writeFile(path.join(root, 'assets', 'icon.ico'), Buffer.concat([header, entry, png]));
console.log('✓ assets/icon.ico (256px PNG-in-ICO)');
