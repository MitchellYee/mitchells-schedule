---
name: schedule-skill
description: "[仅手动调用] 只在用户 @schedule-skill、输入 /schedule-skill 或明确点名要求使用本 skill 时才加载：通过 REST API 操作 xxx's Schedule 日程软件（日程/重复事件、任务与待办五态、附属关系、日历、每日排程）。专为指导定时任务与按需调用而设计——日常对话即使涉及日程/日历/待办/DDL 话题，也不要自动触发本 skill。"
---

# Schedule's Skill —— xxx's Schedule 操作

> 本 skill 仅手动调用（@ / /schedule-skill / 定时任务中点名加载），不会随日程话题自动触发。

通过 HTTP 操作用户本机的日程软件（xxx's Schedule——软件名是用户自定义的，出厂默认 Mitchell's Schedule，接口与名字无关）。所有写操作立即落盘，并在 ≤5 秒内自动同步到打开的界面——写完无需用户手动刷新。

## 1. 连接

先探测服务端口（桌面软件优先）：

```bash
curl -s --max-time 2 http://127.0.0.1:5175/api/data > /dev/null && BASE=http://127.0.0.1:5175 || BASE=http://localhost:5173
```

两个端口都不通说明软件未运行。告知用户启动方式（桌面版：双击桌面快捷方式，或在仓库 `app` 目录运行 `npm run desktop`；Web 版：`cd app && npm run dev`），等用户启动后再继续，不要自行代替用户启动软件。

## 2. 核心层级模型

**任务 > 待办 > 日程**，三者都在 `/api/tasks` 与 `/api/events` 中：

| 层级 | 判定 | 界面位置 |
|---|---|---|
| **任务**（跨天） | `tasks` 且有 `startDate` | 「任务」带（最高层，连体长条横贯多天） |
| **待办**（单日 DDL） | `tasks` 且无 `startDate` | 「待办」带（第二层）；可经 `parentId` 附属到某任务 |
| **日程**（定时事件） | `events` | 时间网格 |

**待办/任务五态** `status`：`upcoming`（未开始，今天<开始日）/ `ongoing`（进行中，覆盖今天）/ `deferred`（延期，今天>截止日，**每日自动刷新**）/ `done`（完成）/ `done-late`（延期完成）。**未完成三态由日期自动推导**（创建缺省即推导；改期自动重算；界面每天翻日刷新），手动只需设完成类；点界面方框在超期时会自动记 `done-late`。旧布尔 `done` 与旧值 `todo` 仍兼容（自动映射/推导）。

## 3. 约定

- 全部接口为 JSON；时间入参接受本地 ISO 字符串（`2026-09-30T15:00:00`）或 epoch 毫秒，返回统一 epoch ms。
- `calendar` 字段用**名字**引用（如 `"工作"`），日历不存在会自动创建。
- 事件只给 `start` 时默认时长 1 小时；`durationMinutes`（分钟）覆盖。
- 旧布尔 `done:true/false` 仍兼容（映射为完成/推导态），但推荐直接传 `status`。
- 每次写操作后 GET 验证结果，再向用户汇报。

## 4. 日程（事件）

| 操作 | 请求 |
|---|---|
| 查询（含端点当天） | `GET /api/events?from=2026-09-30&to=2026-09-30` |
| 创建 / 修改 / 删除 | `POST /api/events` / `PATCH /api/events/:id` / `DELETE /api/events/:id` |

```bash
curl -X POST $BASE/api/events -H "Content-Type: application/json" -d '{
  "title": "组会", "calendar": "科研",
  "start": "2026-10-06T16:00:00", "durationMinutes": 60,
  "location": "实验室"
}'
```

重复事件 `rrule`（RFC5545 子集）：`FREQ=DAILY|WEEKLY|MONTHLY;INTERVAL=n;BYDAY=MO,...;UNTIL=YYYYMMDD`；BYDAY 仅 WEEKLY 有效（省略=跟随 start 的星期几）；UNTIL 含当日；修改/删除作用于**整个系列**（动手前先确认）。例：每周一、三 18:00–21:00 至 2027-01-01 → `"rrule": "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20270101"`。

全天事件：`"isAllDay": true` + `start` 传当日日期。

## 5. 任务与待办

| 操作 | 请求 |
|---|---|
| 查询 | `GET /api/tasks` |
| 创建 | `POST /api/tasks` |
| 改状态 / 改期 / 附属 / 改名 / 改色 | `PATCH /api/tasks/:id` |
| 删除 | `DELETE /api/tasks/:id` |

```bash
# 任务（跨天，最高层级）：startDate + dueDate
curl -X POST $BASE/api/tasks -H "Content-Type: application/json" \
  -d '{"title": "项目重构", "startDate": "2026-10-01", "dueDate": "2026-10-10"}'

# 待办（单日 DDL）
curl -X POST $BASE/api/tasks -H "Content-Type: application/json" \
  -d '{"title": "【项目】完成初版重构", "dueDate": "2026-09-30"}'

# 待办附属到任务（parent 传任务 id 或任务名）
curl -X POST $BASE/api/tasks -H "Content-Type: application/json" \
  -d '{"title": "梳理接口清单", "dueDate": "2026-10-03", "parent": "项目重构"}'

# 五态调整（upcoming/ongoing/deferred 由日期自动推导，手动设 done/done-late）；延期常配合改期（改期后状态自动重算）
curl -X PATCH $BASE/api/tasks/<id> -H "Content-Type: application/json" \
  -d '{"status": "deferred", "dueDate": "2026-10-08"}'
# 解除附属：{"parent": ""}   改颜色：{"color": "basil"}
```

CLI 等价（在仓库 `app` 目录下）：`node cli.mjs task-add "标题" --due 2026-10-03 [--from 2026-10-01（有=任务）] [--parent 任务名] [--color basil]`；`node cli.mjs task-set <id> --status done-late [--due 新日期] [--parent ...|none]`。

## 6. 排程工作流（"帮我把任务排一下 / 规划今天"）

1. `GET /api/tasks` 找进行中项（未完成三态 `upcoming`/`ongoing`/`deferred`）；附属待办（有 `parentId`）归并到对应任务下统一考虑；
2. `GET /api/events?from=<今天>&to=<今天>` 看已占用时段——返回的重复事件只有规则本身，需按 `rrule` 推算当天是否发生；
3. 为定时段落 `POST /api/events`；偏好（早晚、时长）拿不准先问一次再批量排；
4. 纯待办用 `POST /api/tasks` 定 DDL；跨天的大块工作建成**任务**（startDate+dueDate），其下细项建成附属待办（parent）；
5. 用户说"这事推迟"→ `PATCH {"status":"deferred"}`（可同时改 dueDate）；完成后补 `{"status":"done"}`，拖了才完成用 `"done-late"`。

## 7. 纪律

- **破坏性操作先确认**：删除事件/任务、`PUT /api/data`（全量替换）必须先征得用户同意；
- **简报**：创建/修改成功后汇报「标题 + 时间/状态 + id」一行即可，不要粘贴整个 JSON；
- **不留垃圾**：任何测试性写入必须立即删除并验证；
- **时区**：软件内置中国时区（UTC+8），"下午3点" 即 `15:00`，与运行设备的系统时区无关。
