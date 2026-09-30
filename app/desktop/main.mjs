/**
 * Mitchell's Schedule —— Electron 主进程。
 * - 内置 REST API + 静态文件服务（127.0.0.1:5175，外部 CLI/LLM 接口保留）
 * - 主窗口关闭 = 隐藏并显示悬浮窗；托盘/悬浮窗退出 = 结束进程
 */
import { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from '../server/api-core.mjs';

// 中国时区：主进程 Node 侧的"今天"按上海计算（渲染进程与 API 已各自强制 UTC+8，此为兜底）
process.env.TZ = 'Asia/Shanghai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = parseInt(process.env.CHRONA_PORT || '5175', 10);
// 开发模式（npm run desktop）与 Web 版共享 app/data/db.json；打包版用 userData
const DB_FILE = app.isPackaged
  ? path.join(app.getPath('userData'), 'db.json')
  : path.join(ROOT, 'data', 'db.json');

/* ---------------- 内置服务器：/api/* + dist 静态 ---------------- */

const apiHandler = createApiHandler(DB_FILE);
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
    title: "Mitchell's Schedule",
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
      .then((ok) => console.log(`[Mitchell's Schedule] preload 桥: ${ok ? 'OK' : '缺失!'}`))
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
    x: wa.x + wa.width - 380 - 12,
    y: wa.y + wa.height - 520 - 12,
    width: 380,
    height: 520,
  });
}

function createFloatWindow() {
  floatWin = new BrowserWindow({
    width: 380,
    height: 520,
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
    positionFloat();
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
  tray.setToolTip("Mitchell's Schedule");
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
ipcMain.handle('float:quit', () => {
  isQuitting = true;
  app.quit();
});
ipcMain.handle('float:set-ignore', (_e, ignore) => {
  if (floatWin) floatWin.setIgnoreMouseEvents(!!ignore, { forward: true });
});

/** 悬浮窗尺寸与球心相对窗口的偏移（球固定在窗口右下角 16px 边距，直径 64） */
const FLOAT_W = 380;
const FLOAT_H = 520;
const BALL_CX = FLOAT_W - 16 - 32;
const BALL_CY = FLOAT_H - 16 - 32;

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
    console.warn('[Mitchell\'s Schedule] 悬浮窗位置保存失败:', e.message);
  }
});

/** 软件改名（顶栏双击 DIY）：同步主窗口/悬浮窗标题与托盘提示 */
const DEFAULT_APP_NAME = "Mitchell's Schedule";
ipcMain.handle('app:rename', (_e, name) => {
  const n = String(name || '').trim().slice(0, 30) || DEFAULT_APP_NAME;
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
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return false;
    const img = nativeImage.createFromDataURL(dataUrl);
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
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Mitchell's Schedule] API + 界面服务: http://127.0.0.1:${PORT}`);
    console.log(`[Mitchell's Schedule] 数据文件: ${DB_FILE}`);
  });
  createMainWindow();
  createFloatWindow();
  createTray();
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
