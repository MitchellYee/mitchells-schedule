# Mitchell's Schedule

本地优先、键盘优先的个人日程软件：事件日历 + 任务/待办（DDL 置顶、五态状态机）+ 重复日程，支持命令行 / LLM 外部读写。

## 启动软件（三种方式）

1. **桌面快捷方式（推荐）**：双击桌面上的 **Mitchell's Schedule** 图标——直指 `electron.exe`，零脚本、零黑窗、秒开；
2. 命令行：`cd app && npm run desktop`（会重新构建；`npm run desktop:only` 跳过构建秒开）。

> 启动后：独立主窗口 + 右下角可拖悬浮球 + 系统托盘（仅托盘「退出」真正关闭）；内置 API `http://127.0.0.1:5175`。
> 代码更新后：`npm run desktop` 重新构建一次即可（快捷方式直接运行已构建版本；若 dist 被删，用命令行方式启动一次即可重建）。
> 重建快捷方式：`node scripts/make-icon-ico.mjs` 生成 ico 后，用 PowerShell `WScript.Shell` 创建 `.lnk`（目标 `app\node_modules\electron\dist\electron.exe`，参数 `desktop\main.mjs`，起始位置 `app`，图标 app/assets/icon.ico）。

## 数据

- 存储：`app/data/db.json`（明文 JSON，可直读/备份/手改，界面 ≤5 秒自动同步）
- 首次打开自动迁移旧版浏览器 IndexedDB 数据

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
| `Ctrl + 滚轮`（周/日视图） | 缩放时间粒度（24~176px/小时；最小档全天一屏可见） |
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

## 开发

```bash
npm run build      # 产物 dist/
npm run icon       # 由 assets/icon.svg 重新生成各尺寸 PNG
npm run desktop    # 构建 + 启动桌面版
```
