/**
 * CommonJS preload（Electron 沙箱模式不支持 ESM preload，必须 .cjs）。
 * 暴露 chronaDesktop 桥：显示主窗 / 退出 / 鼠标穿透 / 拖动悬浮窗。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chronaDesktop', {
  isDesktop: true,
  showMain: () => ipcRenderer.invoke('float:show-main'),
  quit: () => ipcRenderer.invoke('float:quit'),
  setIgnoreMouse: (ignore) => ipcRenderer.invoke('float:set-ignore', ignore),
  moveFloat: (dx, dy) => ipcRenderer.invoke('float:move', dx, dy),
  saveFloatPos: () => ipcRenderer.invoke('float:save-pos'),
  renameApp: (name) => ipcRenderer.invoke('app:rename', name),
  setIcon: (dataUrl) => ipcRenderer.invoke('app:set-icon', dataUrl),
});
