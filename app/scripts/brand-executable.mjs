/** 用 Electron 官方资源编辑器写入 Windows 文件图标与产品信息。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SHA256 = '3e7801db1a5edbec91b49a24a094aad776cb4515488ea5a4ca2289c400eade2a';
const URL = 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe';

export async function resourceEditor(root) {
  const file = path.join(root, 'node_modules', '.cache', 'rcedit', 'rcedit-2.0.0-x64.exe');
  let bytes;
  try { bytes = await fs.readFile(file); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.log('下载 Electron 官方 rcedit v2.0.0（仅首次打包，约 1.3 MB）…');
    const response = await fetch(URL, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`资源编辑器下载失败：${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== SHA256) throw new Error('资源编辑器 SHA-256 不匹配');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
  }
  if (createHash('sha256').update(bytes).digest('hex') !== SHA256) throw new Error('缓存的资源编辑器 SHA-256 不匹配');
  return file;
}

export function brandExecutable(editor, executable, icon, manifest) {
  execFileSync(editor, [executable,
    '--set-icon', icon,
    '--set-version-string', 'ProductName', manifest.productName,
    '--set-version-string', 'FileDescription', manifest.productName,
    '--set-version-string', 'InternalName', manifest.name,
    '--set-version-string', 'OriginalFilename', path.basename(executable),
    '--set-file-version', manifest.version,
    '--set-product-version', manifest.version,
  ], { windowsHide: true, stdio: 'inherit' });
}
