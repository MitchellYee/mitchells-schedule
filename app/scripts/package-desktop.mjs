/** 用已安装的 Electron 运行时生成 Windows 便携目录；首次下载小型官方资源编辑器。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resourceEditor, brandExecutable } from './brand-executable.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (process.platform !== 'win32') throw new Error('此脚本生成 Windows 便携版，请在 Windows 上执行');
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) throw new Error('请先运行 npm run build');
const name = `Mitchells-Working-Tool-${manifest.version}-win32-${process.arch}`;
const releases = path.join(root, 'releases');
const destination = path.join(releases, name);
// 不覆盖正在运行或已存放个人数据的旧构建。
if (fs.existsSync(destination)) throw new Error(`构建目录已存在，请保留或另行归档：${destination}`);
const editor = await resourceEditor(root);
fs.mkdirSync(destination, { recursive: true });
const runtime = path.join(root, 'node_modules', 'electron', 'dist');
fs.cpSync(runtime, destination, { recursive: true, filter: (source) => path.basename(source) !== 'default_app.asar' });
const resources = path.join(destination, 'resources', 'app');
fs.mkdirSync(resources, { recursive: true });
for (const directory of ['dist', 'desktop', 'server', 'assets']) {
  fs.cpSync(path.join(root, directory), path.join(resources, directory), { recursive: true });
}
fs.writeFileSync(path.join(resources, 'package.json'), JSON.stringify({
  name: manifest.name, productName: manifest.productName, version: manifest.version,
  type: 'module', main: 'desktop/main.mjs',
}, null, 2));
fs.renameSync(path.join(destination, 'electron.exe'), path.join(destination, 'Mitchells Working Tool.exe'));
brandExecutable(editor, path.join(destination, 'Mitchells Working Tool.exe'), path.join(root, 'assets', 'icon.ico'), manifest);
fs.copyFileSync(path.join(root, 'API.md'), path.join(destination, 'API.md'));
fs.copyFileSync(path.join(root, 'cli.mjs'), path.join(destination, 'cli.mjs'));
fs.copyFileSync(path.join(root, '..', 'LICENSE'), path.join(destination, 'LICENSE.app'));
fs.writeFileSync(path.join(destination, '使用说明.txt'),
  `Mitchell's Working Tool v${manifest.version}\r\n\r\n` +
  '双击 Mitchells Working Tool.exe 即可运行，无需安装 Node.js。\r\n' +
  '若旧版正在运行，请先从系统托盘菜单选择“退出（完全关闭）”。\r\n' +
  '在原项目 app/releases 下运行时，自动沿用 app/data/db.json。\r\n' +
  '移出项目的独立副本使用系统应用数据目录；便携包不包含个人日程数据。\r\n' +
  'API 地址：http://127.0.0.1:5175；CHRONA_PORT、CHRONA_DATA_FILE 可覆盖端口、数据文件。\r\n\r\n' +
  'v0.13：全新工作台、中英长文翻译、Google 网页通道、MiniMax/GLM/DeepSeek 与自定义 LLM 接口、四套统一配色、M 图标和圆形光影悬浮球。\r\n' +
  '翻译需要可访问 Google 或所选 LLM 服务的网络。Google 网页兼容通道免密钥但非官方；LLM 支持 MiniMax、GLM、DeepSeek 官方接口和自定义 OpenAI 兼容接口。\r\n' +
  '翻译文本仅在当前会话保留，LLM 请求会携带内置翻译 Prompt 与自定义上下文；LaTeX 写作目前为预留接口。\r\n', 'utf8');
fs.writeFileSync(path.join(releases, 'latest.json'), JSON.stringify({ version: manifest.version, directory: name, executable: 'Mitchells Working Tool.exe' }, null, 2));
console.log(destination);
