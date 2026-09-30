/**
 * Chrona REST API —— Vite dev/preview server 插件（包装 api-core.mjs）。
 * 数据以明文 JSON 存于 app/data/db.json；文档见 app/API.md。
 */
import type { Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
// @ts-expect-error 纯 JS 共享模块（桌面版与 Vite 共用，无类型声明）
import { createApiHandler } from './api-core.mjs';

const DATA_FILE = fileURLToPath(new URL('../data/db.json', import.meta.url));

export function chronaApiPlugin(): Plugin {
  const handler = createApiHandler(DATA_FILE) as import('vite').Connect.NextHandleFunction;
  return {
    name: 'chrona-api',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
