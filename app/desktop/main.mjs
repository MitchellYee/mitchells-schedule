/**
 * Mitchell's Working Tool —— Electron 主进程。
 * - 内置 REST API + 静态文件服务（127.0.0.1:5175，外部 CLI/LLM 接口保留）
 * - 主窗口关闭 = 隐藏并显示悬浮窗；托盘/悬浮窗退出 = 结束进程
 */
import { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, dialog, safeStorage, net } from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from '../server/api-core.mjs';
import { createTranslationHandler, LLM_PROVIDERS } from '../server/translation.mjs';

// 中国时区：主进程 Node 侧的"今天"按上海计算（渲染进程与 API 已各自强制 UTC+8，此为兜底）
process.env.TZ = 'Asia/Shanghai';
// 品牌更名保留旧安装的 localStorage 和数据；QA 可显式指定独立配置目录。
const legacyProfile = path.join(app.getPath('appData'), 'mitchell-schedule');
if (process.env.CHRONA_USER_DATA) app.setPath('userData', process.env.CHRONA_USER_DATA);
else if (fs.existsSync(legacyProfile)) app.setPath('userData', legacyProfile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = parseInt(process.env.CHRONA_PORT || '5175', 10);
// 开发模式（npm run desktop）与 Web 版共享 app/data/db.json；打包版用 userData
// 项目内的便携构建复用原数据；移出项目的独立副本使用系统 userData。
const releaseWorkspace = path.resolve(path.dirname(app.getPath('exe')), '..', '..');
const workspaceRelease = app.isPackaged && fs.existsSync(path.join(releaseWorkspace, 'src', 'version.ts')) &&
  fs.existsSync(path.join(releaseWorkspace, 'desktop', 'main.mjs'));
const DB_FILE = process.env.CHRONA_DATA_FILE || (app.isPackaged && !workspaceRelease
  ? path.join(app.getPath('userData'), 'db.json')
  : path.join(workspaceRelease ? releaseWorkspace : ROOT, 'data', 'db.json'));

/* ---------------- 内置服务器：/api/* + dist 静态 ---------------- */

const apiHandler = createApiHandler(DB_FILE);
let savedTranslationKeys;
let translationKeysLoad;
const translationKeysFile = () => path.join(app.getPath('userData'), 'translation-provider-keys.bin');
async function getTranslationKeys() {
  if (savedTranslationKeys === undefined) {
    translationKeysLoad ??= (async () => {
      let values = {};
      try {
        const encrypted = await fs.promises.readFile(translationKeysFile());
        const raw = typeof safeStorage.decryptStringAsync === 'function'
          ? (await safeStorage.decryptStringAsync(encrypted)).result : safeStorage.decryptString(encrypted);
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') values = parsed;
      } catch { /* 首次运行或系统无法解密时保持未配置 */ }
      if (savedTranslationKeys === undefined) savedTranslationKeys = values;
    })();
    await translationKeysLoad;
  }
  return savedTranslationKeys || {};
}
async function getTranslationKey(provider) {
  const saved = (await getTranslationKeys())[provider];
  return saved || process.env[LLM_PROVIDERS[provider]?.env] || '';
}
const translationHandler = createTranslationHandler({getKey:getTranslationKey,fetchImpl:(...args)=>net.fetch(...args)});
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
  if (pathname.startsWith('/api/translation')) {
    void translationHandler(req,res,()=>{res.statusCode=404;res.end();});
    return;
  }
  if (pathname.startsWith('/api/')) {
    apiHandler(req, res, () => {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'unknown endpoint' }));
    });
    return;
  }
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) {
    res.statusCode = 403;
    res.end();
    return;
  }
  // SPA fallback
  if (!fs.existsSync(file)) {
    serveFile(res, path.join(DIST, 'index.html'));
    return;
  }
  serveFile(res, file);
});

/* ---------------- 窗口管理 ---------------- */

let mainWindow = null;
let floatWin = null;
let tray = null;
let isQuitting = false;

function iconFile(size) {
  return path.join(ROOT, 'assets', `icon-${size}.png`);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    icon: iconFile(256),
    title: "Mitchell's Working Tool",
    backgroundColor: '#131315',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.once('did-finish-load', () => {
    // 诊断：确认 preload 桥注入成功（悬浮窗点击依赖它）
    mainWindow.webContents
      .executeJavaScript('!!window.chronaDesktop')
      .then((ok) => console.log(`[Mitchell's Working Tool] preload 桥: ${ok ? 'OK' : '缺失!'}`))
      .catch(() => {});
  });
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
    showFloat();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/`);
}

function positionFloat() {
  if (!floatWin) return;
  const wa = screen.getPrimaryDisplay().workArea;
  floatWin.setBounds({
    x: wa.x + wa.width - 320 - 12,
    y: wa.y + wa.height - 400 - 12,
    width: 320,
    height: 400,
  });
}

function createFloatWindow() {
  floatWin = new BrowserWindow({
    width: 320,
    height: 400,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  positionFloat();
  restoreFloatPos();
  floatWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  floatWin.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      floatWin.hide();
    }
  });
  floatWin.on('closed', () => { floatWin = null; });
  floatWin.loadURL(`http://127.0.0.1:${PORT}/?mode=float`);
}

function showFloat() {
  if (floatWin) {
    floatWin.show();
    floatWin.setAlwaysOnTop(true);
  }
}

function showMain() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  if (floatWin) floatWin.hide();
}

function createTray() {
  const img = nativeImage.createFromPath(iconFile(32));
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip("Mitchell's Working Tool");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主界面', click: () => showMain() },
      { label: '显示悬浮窗', click: () => showFloat() },
      { type: 'separator' },
      {
        label: '退出（完全关闭）',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('double-click', () => showMain());
}

/* ---------------- IPC ---------------- */

ipcMain.handle('float:show-main', () => showMain());
ipcMain.handle('translation:save-key', async (event, payload) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || !event.senderFrame?.url.startsWith(`http://127.0.0.1:${PORT}/`)) throw new Error('不允许此窗口修改配置');
  const provider = payload?.provider;
  const key = payload?.key;
  if (!Object.prototype.hasOwnProperty.call(LLM_PROVIDERS, provider) || provider === 'custom' || typeof key !== 'string' || key.length > 512) throw new Error('密钥格式不正确');
  const clean = key.trim();
  const available = typeof safeStorage.isAsyncEncryptionAvailable==='function' ? await safeStorage.isAsyncEncryptionAvailable() : safeStorage.isEncryptionAvailable();
  if (!available || (process.platform==='linux' && safeStorage.getSelectedStorageBackend()==='basic_text')) throw new Error('系统安全存储不可用，请使用环境变量配置');
  const keys = {...await getTranslationKeys()};
  if (clean) {
    keys[provider] = clean;
    const bytes = typeof safeStorage.encryptStringAsync==='function' ? await safeStorage.encryptStringAsync(JSON.stringify(keys)) : safeStorage.encryptString(JSON.stringify(keys));
    await fs.promises.mkdir(path.dirname(translationKeysFile()),{recursive:true});
    await fs.promises.writeFile(translationKeysFile(),bytes);
  } else {
    delete keys[provider];
    if (Object.keys(keys).length) {
      const bytes = typeof safeStorage.encryptStringAsync==='function' ? await safeStorage.encryptStringAsync(JSON.stringify(keys)) : safeStorage.encryptString(JSON.stringify(keys));
      await fs.promises.mkdir(path.dirname(translationKeysFile()),{recursive:true});
      await fs.promises.writeFile(translationKeysFile(),bytes);
    } else await fs.promises.rm(translationKeysFile(),{force:true});
  }
  savedTranslationKeys = keys;
  return {configured:!!(await getTranslationKey(provider))};
});
ipcMain.handle('float:quit', () => {
  isQuitting = true;
  app.quit();
});
ipcMain.handle('float:set-ignore', (_e, ignore) => {
  if (floatWin) floatWin.setIgnoreMouseEvents(!!ignore, { forward: true });
});

/** 悬浮窗尺寸与球心偏移（右下角 12px 边距，直径 48px） */
const FLOAT_W = 320;
const FLOAT_H = 400;
const BALL_CX = FLOAT_W - 12 - 24;
const BALL_CY = FLOAT_H - 12 - 24;

/** 把球心约束在显示器工作区内（球可达全屏任意位置，窗口主体允许出屏） */
function clampBallToWorkArea(x, y) {
  const wa = screen.getDisplayMatching({ x: x + BALL_CX, y: y + BALL_CY, width: 1, height: 1 }).workArea;
  const cx = Math.min(Math.max(x + BALL_CX, wa.x + 24), wa.x + wa.width - 24);
  const cy = Math.min(Math.max(y + BALL_CY, wa.y + 24), wa.y + wa.height - 24);
  return [cx - BALL_CX, cy - BALL_CY];
}

/** 悬浮窗拖动：增量移动，以球为锚做全屏范围约束 */
ipcMain.handle('float:move', (_e, dx, dy) => {
  if (!floatWin) return;
  const [x, y] = floatWin.getPosition();
  const [nx, ny] = clampBallToWorkArea(x + (dx || 0), y + (dy || 0));
  floatWin.setPosition(nx, ny);
});

/** 位置持久化（与 db.json 同目录），下次启动恢复 */
const floatPosFile = () => path.join(path.dirname(DB_FILE), 'float-pos.json');
ipcMain.handle('float:save-pos', () => {
  if (!floatWin) return;
  const [x, y] = floatWin.getPosition();
  try {
    fs.mkdirSync(path.dirname(floatPosFile()), { recursive: true });
    fs.writeFileSync(floatPosFile(), JSON.stringify({ x, y }));
  } catch (e) {
    console.warn('[Mitchell\'s Working Tool] 悬浮窗位置保存失败:', e.message);
  }
});

/** 软件改名（顶栏双击 DIY）：同步主窗口/悬浮窗标题与托盘提示 */
const DEFAULT_APP_NAME = "Mitchell's Working Tool";
ipcMain.handle('app:rename', (_e, name) => {
  const n = String(name || '').trim().slice(0, 40) || DEFAULT_APP_NAME;
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(n);
    if (floatWin && !floatWin.isDestroyed()) floatWin.setTitle(n);
    if (tray) tray.setToolTip(n);
  } catch { /* 窗口销毁竞态忽略 */ }
  return n;
});

/** 软件图标 DIY（设置中心上传）：同步窗口图标与托盘 */
ipcMain.handle('app:set-icon', (_e, dataUrl) => {
  try {
    if (typeof dataUrl !== 'string' || (dataUrl && !dataUrl.startsWith('data:image/'))) return false;
    const img = dataUrl ? nativeImage.createFromDataURL(dataUrl) : nativeImage.createFromPath(iconFile(256));
    if (img.isEmpty()) return false;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setIcon(img);
    if (floatWin && !floatWin.isDestroyed()) floatWin.setIcon(img);
    if (tray) tray.setImage(img);
    return true;
  } catch { return false; }
});

function restoreFloatPos() {
  if (!floatWin) return;
  try {
    const p = JSON.parse(fs.readFileSync(floatPosFile(), 'utf-8'));
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
      const [x, y] = clampBallToWorkArea(p.x, p.y);
      floatWin.setPosition(x, y);
    }
  } catch {
    /* 首次运行无位置文件 */
  }
}

/* ---------------- 生命周期 ---------------- */

app.whenReady().then(() => {
  server.once('error', (error) => {
    dialog.showErrorBox('日程软件启动失败', error.code === 'EADDRINUSE'
      ? `端口 ${PORT} 已被占用。请从旧版软件的托盘菜单退出后，再打开新版。`
      : String(error.message));
    isQuitting = true;
    app.quit();
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Mitchell's Working Tool] API + 界面服务: http://127.0.0.1:${PORT}`);
    console.log(`[Mitchell's Working Tool] 数据文件: ${DB_FILE}`);
    createMainWindow();
    createFloatWindow();
    createTray();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // 主窗口关闭只是隐藏；托盘与悬浮窗仍在。不退出。
  if (process.platform !== 'darwin') {
    // Windows/Linux：保持后台（托盘常驻），由托盘菜单退出
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  else showMain();
});
