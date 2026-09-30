# Build a Schedule by Yourself: Your Schedule

**你的日程表，就该叫你的名字。** 软件名是一张模板：**xxx's Schedule** —— 它出厂叫 *Mitchell's Schedule*，双击软件左上角的名字，立刻变成 *David's Schedule*、*小林's Schedule*……你的那一份。

**本地优先、键盘优先的个人日程软件**：事件日历 + 三层任务体系（任务 > 待办 > 日程）+ 重复日程 + LLM 排程接口，内置中国时区（UTC+8）。

[English](./README.en.md)

> 核心理念：数据完全存在你自己的电脑上（一个明文 JSON 文件），不依赖任何云服务；同时提供 REST API 和命令行，让 LLM / 脚本可以替你排程。

## 功能特性

### 视图与导航
- **四种视图**：日 / 周 / 月 / 议程，「今天」整列高亮，红色时间线实时跟随当前时刻
- **流式月视图**：像信息流一样上下滚动逐周加载，平滑衔接前后月份，无滚动条
- **顶部栏自动跟随**：月视图滚动时，顶栏动态显示当前视口大部分区域所在的「xxxx年xx月」
- **键盘优先**：`Ctrl+K` 命令面板、`T` 回到今天、`1/2/3/4` 切视图、`P/N` 前后翻页、`Shift+C` 新建待办、`?` 全部快捷键

### 三层任务模型（任务 > 待办 > 日程）
- **任务**：跨天工作包，在周/月视图最上方显示为连体长条，高于一切日历事件
- **待办**：单日 DDL（当天截止），可附属到某个任务，右栏按任务/待办分组
- **日程**：普通日历事件，支持四种日历（工作/科研/运动/个人，可自定义颜色）与 RRULE 重复规则（每天/每 x 天/每周几/每月，支持截止日）

### 五态自动状态机
`未开始 → 进行中 → 延期`（按日期自动推导）+ `完成 / 延期完成`（手动标记）。每天自动刷新：超 DDL 自动转「延期」，拖回覆盖今天自动恢复「进行中」。

### 拖拽交互
- 划选创建日程（15 分钟吸附，Alt 微调到 1 分钟）；双击带区直接创建任务/待办
- **长条边缘拖拽改期**：抓住任务条左右边缘即可调整起止日期
- **跨周/跨月拖拽**：拖到视口边缘停留约 0.6 秒自动翻页，跨周任务全程不脱手
- 月视图跨周拖选批量创建跨天任务

### 桌面体验（Electron）
- 独立桌面窗口；关闭窗口收缩为**悬浮球**（悬停展开当天行程，单击唤回主界面），球可全屏拖动、脱手即停
- 系统托盘常驻；`Ctrl+滚轮` 缩放时间格；明暗主题
- **软件名 DIY（xxx's Schedule）**：双击左上角软件名即可改名——用你自己的名字，同步顶栏/状态栏/窗口标题/托盘提示

### 为 LLM 排程而生
- 内置 REST API（桌面版 `http://127.0.0.1:5175`），完整文档见 [app/API.md](./app/API.md)
- 零依赖命令行 `app/cli.mjs`：增删改查日程/任务、设状态/附属/颜色
- 所有「今天/现在」一律按**中国时区 UTC+8** 计算，与运行设备的系统时区无关（海外机器也能正确排程中国时区的日程）

## 快速开始

要求：Node.js ≥ 18。

```bash
# Web 版（开发模式）
cd app
npm install
npm run dev          # 打开 http://localhost:5173

# 桌面版（Electron，自动构建）
npm run desktop      # 首次会先 build；之后可用 desktop:only 跳过构建秒开
```

首次启动会自动在 `app/data/db.json` 创建数据文件并预置「工作 / 科研 / 运动 / 个人」四个日历。

### 桌面快捷方式（Windows）

快捷方式目标指向 `app\node_modules\electron\dist\electron.exe`（参数 `desktop/main.mjs`，起始位置 `app` 目录），双击即开、无黑窗。用 PowerShell 创建：

```powershell
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut("$([Environment]::GetFolderPath('Desktop'))\Mitchell's Schedule.lnk")
$lnk.TargetPath = "D:\path\to\app\node_modules\electron\dist\electron.exe"
$lnk.Arguments  = "desktop\main.mjs"
$lnk.WorkingDirectory = "D:\path\to\app"
$lnk.IconLocation = "D:\path\to\app\assets\icon.ico"
$lnk.Save()
```

## 数据与隐私

- 所有数据存储在 **`app/data/db.json`**（明文 JSON），可直接备份/手改，界面 ≤5 秒自动同步外部修改
- **`app/data/` 已被 `.gitignore` 排除，任何日程数据都不会进入 git 仓库**
- 无云、无账号、无遥测

## 外部接口示例

```bash
# 列出任务
node app/cli.mjs task-list

# 新建事件（今天 15:00 开始，1 小时）
node app/cli.mjs event-add "团队例会" --at 15:00 --for 1h --calendar 工作

# 新建任务：标题 @截止日，可附属/设色
node app/cli.mjs task-set "完成重构" --due 2026-10-08 --from 2026-10-01 --color basil

# 或直接调 REST API
curl http://127.0.0.1:5175/api/tasks -d '{"title":"写周报","dueDate":"2026-10-09"}' -H "Content-Type: application/json"
```

完整字段说明、状态机语义、重复规则格式见 **[app/API.md](./app/API.md)**。

## Skill 与定时任务：让 LLM 每天自动排程

仓库自带 **schedule-skill**（[`skill/`](./skill/SKILL.md) 目录）——一份写给 LLM Agent 的操作手册：连接探测、三层模型、五态语义、RRULE 格式、排程工作流与安全纪律（**仅手动调用**，不会在日常聊日程时被误触发）。

### 安装（ZCode）

把 `skill/` 文件夹复制到 ZCode 的 skills 目录：

```bash
cp -r skill/ ~/.zcode/skills/schedule-skill      # 全局（所有项目可用）
# 或项目级：cp -r skill/ .agents/skills/schedule-skill
```

之后在对话中 `@schedule-skill` 唤起，Agent 即可按手册直接操作软件。

### 定时任务样例：每天早上 9:00 自动生成当天日程

在 ZCode 的「自动化 / 定时任务」中新建，配置如下（这是一套在生产环境每天运行的真实规则）：

- **名称**：当天日程的生成
- **触发**：cron `0 9 * * *`（每天 9:00）
- **提示词**：

```text
@schedule-skill
这是一个定时任务，每天早上九点执行。若超过 14 点执行，默认生成第二天的日程安排。
使用 skill，检查已有的日程和存在的任务情况，为当天生成一个完整的日程：
1、若是法定工作日：
   1.1 工作时间为 10:00–22:00，其中 12:00–14:00 和 18:00–20:00 是休息时间，直接空出即可，不需要新增日程；
   1.2 若已有存在的日程，需要跳过该时段来生成；
   1.3 若存在跨天的长期任务，根据任务情况、难度、截止日期，生成合理的当天日程与当天小 DDL 分段——临近截止的任务占大部分时间，其余任务生成小节点；
   1.4 生成日程和小任务节点时评估难度，保持合理；
   1.5 前一天存在未完成的小任务节点：当日重新评估并生成新的，并把昨日未完成的节点设为「延期」状态。
2、若是周末：工作时间为 10:00–20:00，休息时间（12:00–14:00、18:00–20:00）建成【个人】日历的「休息时间」日程，任务安排参考第 1 点；
3、若是法定节假日：不生成任何日程。
```

> 前提：软件在运行（桌面版内置 API `127.0.0.1:5175`）。节假日判断可让 Agent 联网核实国务院当年通知。

## 目录结构

```
├── app/                  # 应用主体
│   ├── src/              # React + TypeScript 前端（视图/拖拽引擎/状态机/时区模块）
│   ├── server/           # REST API（纯 Node，dev 与桌面版共用）
│   ├── desktop/          # Electron 主进程 + preload
│   ├── scripts/          # 辅助脚本（图标生成等）
│   ├── cli.mjs           # 零依赖命令行工具
│   ├── API.md            # REST API 完整文档
│   └── data/             # 本地数据（gitignore，不入库）
├── skill/                # schedule-skill：LLM Agent 操作手册（定时任务/按需调用）
├── 设计方案.md            # 完整设计文档（含迭代记录）
├── 调研报告/              # 前期调研（商业产品/开源项目/UIUX 模式）
├── README.md / README.en.md
└── LICENSE
```

## 技术栈

React 18 · TypeScript · Vite · Tailwind CSS · Zustand · dayjs · Electron · 纯 Node REST API（无框架）

## 路线图

- [ ] 重复事件编辑三分支（仅此条/本系列/全部）
- [ ] 系统通知提醒
- [ ] 自然语言创建（「明天下午3点开会30分钟」）
- [ ] .ics 导入导出 / 订阅
- [ ] 农历 / 节假日调休

## License

[MIT](./LICENSE) © 2026 MitchellYee
