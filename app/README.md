# Mitchell's Working Tool

当前版本 **v0.13.0**：默认打开工作台，从卡片进入日程或中英翻译；LaTeX 预留入口。四套统一配色替代自由选色；采用用户提供的 M 图标与圆形光影悬浮球。已有任务详情、子任务和 API/CLI 保持兼容。

本地优先的个人工具箱：事件日历、任务/待办、重复日程、双向翻译。日程支持命令行 / LLM 外部读写；翻译通过独立服务端适配器调用 Google。

## 启动软件

1. **便携版**：运行 `releases/Mitchells-Working-Tool-0.13.0-win32-x64/Mitchells Working Tool.exe`，无需 Node.js；
2. 命令行：`cd app && npm run desktop`（会重新构建；`npm run desktop:only` 跳过构建秒开）。

> 启动后：独立主窗口 + 右下角可拖悬浮球 + 系统托盘（仅托盘「退出」真正关闭）；内置 API `http://127.0.0.1:5175`。
> 代码更新后：`npm run desktop` 重新构建一次即可（快捷方式直接运行已构建版本；若 dist 被删，用命令行方式启动一次即可重建）。
> 重建快捷方式：`node scripts/make-icon-ico.mjs` 生成 ico 后，用 PowerShell `WScript.Shell` 创建 `.lnk`（目标 `app\node_modules\electron\dist\electron.exe`，参数 `desktop\main.mjs`，起始位置 `app`，图标 app/assets/icon.ico）。

## 数据

- 存储：`app/data/db.json`（明文 JSON，可直读/备份/手改，界面 ≤5 秒自动同步）
- 首次打开自动迁移旧版浏览器 IndexedDB 数据
- 翻译文本仅在当前会话内存保留；点击翻译后才发送到所选 Google 服务，不写入日程数据库。

## 翻译

默认使用 Google 网页兼容通道（免密钥、非官方，可能限流或变更）。中英自动方向、手动切换、最多 30,000 字符、分段进度、取消、复制与 TXT 导出均可使用。需要能访问 Google 的网络；桌面版使用系统代理。

LLM 翻译可在「翻译设置」选择 MiniMax、GLM、DeepSeek 或自定义 OpenAI 兼容接口。三种官方接口使用各自的 Bearer API 密钥和可编辑模型名称；桌面版通过 Electron safeStorage 在本机加密保存。Web 开发版可在服务端设置 `MINIMAX_API_KEY`、`GLM_API_KEY`、`DEEPSEEK_API_KEY` 或 `CUSTOM_LLM_API_KEY`，绝不使用 `VITE_` 前缀。

LLM 请求会携带内置专业翻译 Prompt、选择的翻译上下文和原文片段。上下文预设包括通用准确、商务沟通、学术写作、自然口语，也可以直接编辑。自定义接口需要填写 Base URL 和模型名称；系统会补全 `/chat/completions`，兼容常见 OpenAI 格式服务。

开发版 Node 默认不自动使用 Windows 系统代理；如有需要，可使用支持环境代理的 Node 24，设置 `NODE_USE_ENV_PROXY=1` 与自己的 `HTTPS_PROXY` 后启动 Vite。产品中不包含固定代理地址。

## 核心概念（v0.6+）

**任务 > 待办 > 日程** 三层模型：

| 层级 | 说明 | 界面位置 |
|---|---|---|
| 任务 | 跨天的大块工作（startDate~dueDate） | 「任务」带（最高层，连体长条） |
| 待办 | 单日 DDL，可附属到任务（parentId） | 「待办」带（第二层） |
| 日程 | 定时事件 | 时间网格 |

待办/任务四态：**未完成 / 完成 / 延期完成 / 延期**——侧栏状态菜单切换，或点击条目智能切换（未完成→完成、延期→延期完成）；CLI：`task-set <id> --status done-late`。

## 核心交互速览

| 操作 | 说明 |
|---|---|
| 单击/划选空白格 | 快速创建事件（划选起点自动对齐 15 分钟） |
| 「详细编辑」 | 进入抽屉草稿模式，**未填标题保存/关闭都不会创建事件** |
| 顶栏「新建」或 `Shift+C` | 新建待办（可设截止日/跨天/附属任务） |
| **跨日拖选**（周视图跨列 / 月视图跨格） | 创建**任务**（跨天连体长条，最高层级） |
| 普通滚轮（周/日视图） | 上下滚动；顶栏 08:00–18:00 按钮恢复十小时视野 |
| `Ctrl + 滚轮`（周/日视图） | 以鼠标处时间为锚缩放（24~176px/小时） |
| 拖拽事件/边缘 | 移动 / 调整时长（`Alt` 微调 1 分钟） |
| `?` | 全部快捷键 |

## 命令行操作日程

```bash
# Web 版运行中（默认 5173）；桌面版运行中：
export CHRONA_URL=http://127.0.0.1:5175
node cli.mjs list
node cli.mjs add "甲组训练" --calendar 运动 --at 18:00 --for 3h --repeat weekly --days mo,we --until 2027-01-01
node cli.mjs task-add "【温氏】完成初版重构" --due 2026-09-30
node cli.mjs update <id> --move 1d
node cli.mjs delete <id>
```

## LLM / 脚本接口

REST API 文档（含重复规则 rrule 与每日排程工作流）：[API.md](./API.md)

## 文档

- 设计方案：[../设计方案.md](../设计方案.md)
- 调研报告：[../调研报告/](../调研报告/)
- v0.11 调研与翻译扩展方案：[../工具百宝箱演进方案.md](../工具百宝箱演进方案.md)
- v0.12 工作台、翻译与后续 LaTeX 接口：[../工作台与翻译设计.md](../工作台与翻译设计.md)

## 开发

```bash
npm run build      # 产物 dist/
npm test           # 任务详情、兼容、校验、并发保存的回归检查
npm run package:desktop # Windows 便携版输出到 releases/，双击 exe 运行
npm run icon       # 由 assets/avatar.png 生成全套 PNG/ICO
npm run desktop    # 构建 + 启动桌面版
```

