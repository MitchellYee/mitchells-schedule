/// <reference types="vite/client" />

/** Electron 桌面版 preload 桥（见 desktop/preload.cjs；Web 版下不存在） */
interface ChronaDesktop {
  isDesktop: boolean;
  showMain: () => Promise<void>;
  quit: () => Promise<void>;
  setIgnoreMouse: (ignore: boolean) => Promise<void>;
  /** 悬浮窗拖动：增量移动窗口（主进程做屏幕边界约束） */
  moveFloat: (dx: number, dy: number) => Promise<void>;
  /** 持久化当前悬浮窗位置 */
  saveFloatPos: () => Promise<void>;
  /** 修改软件名：同步主窗口/悬浮窗标题与托盘提示（返回主进程采用的最终名字） */
  renameApp: (name: string) => Promise<string>;
  /** 修改软件图标：dataURL 同步到窗口图标与托盘（Web 版无此桥） */
  setIcon: (dataUrl: string) => Promise<boolean>;
}

declare global {
  interface Window {
    chronaDesktop?: ChronaDesktop;
  }
}

export {};
