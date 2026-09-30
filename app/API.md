# Mitchell's Schedule REST API —— LLM / 脚本接口说明

> 两种服务来源，接口完全一致：
> - **桌面软件版**：软件运行期间 `http://127.0.0.1:5175`（`CHRONA_PORT` 可改）
> - **Web 开发版**：`npm run dev` 后 `http://localhost:5173`
>
> 数据落盘于 `app/data/db.json`（明文 JSON，可直读、可备份、可手改——手改后界面 ≤5 秒自动同步）。
> 所有接口返回 JSON；时间字段统一为 **epoch 毫秒**（本地时区语义），也接受 ISO 字符串入参。

## 设计约定

- **日历可用名字引用**：`calendar: "工作"`，不存在时自动创建。无需先查日历 id。
- 创建事件若只给 `start`，默认时长 1 小时（`durationMinutes` 可覆盖）；全天事件给 `isAllDay: true` + 当日 `start` 即可。
- **重复事件**：传 `rrule` 字符串（RFC5545 子集）：`FREQ=DAILY|WEEKLY|MONTHLY;INTERVAL=n;BYDAY=MO,WE;UNTIL=20270101`。只存规则，界面在视口内展开。BYDAY 取值 SU,MO,TU,WE,TH,FR,SA；UNTIL 含当日。修改/删除作用于整个系列。
- 修改用 `PATCH`（只传要改的字段），删除为硬删除。
- 所有写操作立即落盘 `db.json`，打开着的浏览器界面 ≤5 秒自动刷新显示。

## 事件

```bash
# 查询（可按日期范围，含端点当天；缺省返回全部）
curl http://localhost:5173/api/events
curl "http://localhost:5173/api/events?from=2026-09-27&to=2026-09-27"

# 创建 —— LLM 最常用
curl -X POST http://localhost:5173/api/events -H "Content-Type: application/json" -d '{
  "title": "写周报",
  "calendar": "工作",
  "start": "2026-09-27T15:00:00",
  "durationMinutes": 45,
  "location": "工位",
  "description": "汇总本周进展"
}'

# 重复事件示例：每周一、三 18:00-21:00，至 2027-01-01
curl -X POST http://localhost:5173/api/events -H "Content-Type: application/json" -d '{
  "title": "甲组训练", "calendar": "运动",
  "start": "2026-09-28T18:00:00", "end": "2026-09-28T21:00:00",
  "rrule": "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20270101"
}'

# 全天事件
curl -X POST http://localhost:5173/api/events -H "Content-Type: application/json" -d '{
  "title": "国庆假期", "calendar": "个人", "isAllDay": true, "start": "2026-10-01"
}'

# 修改（部分字段）
curl -X PATCH http://localhost:5173/api/events/<id> -H "Content-Type: application/json" \
  -d '{"title": "写周报（终稿）", "start": "2026-09-27T16:00:00", "durationMinutes": 30}'

# 删除
curl -X DELETE http://localhost:5173/api/events/<id>
```

**事件字段**：`id`、`title`、`calendarId`、`start`、`end`（epoch ms）、`isAllDay`、`rrule?`（重复规则，见上）、`location?`、`description?`、`createdAt/updatedAt`。

## 任务与待办（v0.6+：任务 > 待办 > 日程）

- **任务**（跨天）：`startDate` + `dueDate`，最高层级，连体长条横贯多天；
- **待办**（单日 DDL）：仅 `dueDate`，第二层级，可经 `parentId`（或 `parent` 传任务 id/名）附属到任务；
- **四态** `status`：`todo`（未完成，默认）/ `done`（完成）/ `done-late`（延期完成）/ `deferred`（延期）；旧布尔 `done` 兼容。

```bash
curl http://localhost:5173/api/tasks
# 任务（跨天）
curl -X POST http://localhost:5173/api/tasks -H "Content-Type: application/json" \
  -d '{"title": "温氏项目重构", "startDate": "2026-10-01", "dueDate": "2026-10-10"}'
# 待办 + 附属任务
curl -X POST http://localhost:5173/api/tasks -H "Content-Type: application/json" \
  -d '{"title": "梳理接口清单", "dueDate": "2026-10-03", "parent": "温氏项目重构"}'
# 四态调整（延期常配合改期）
curl -X PATCH http://localhost:5173/api/tasks/<id> -H "Content-Type: application/json" \
  -d '{"status": "deferred", "dueDate": "2026-10-08"}'
curl -X DELETE http://localhost:5173/api/tasks/<id>
```

**字段**：`id`、`title`、`status`、`dueDate?`、`startDate?`（有=任务）、`parentId?`。

**任务字段**：`id`、`title`、`done`、`dueDate?`（YYYY-MM-DD）、`scheduledEventId?`（已排期为时间块）。

## 日历 / 全量

```bash
curl http://localhost:5173/api/calendars
curl http://localhost:5173/api/data            # 全量（calendars + events + tasks）
curl -X PUT http://localhost:5173/api/data -d @new.json   # 全量替换（备份恢复用）
```

## 命令行等价操作

```bash
cd app
node cli.mjs list --from 2026-09-27 --to 2026-09-27
node cli.mjs add "写周报" --at 15:00 --for 45m --calendar 工作
node cli.mjs add "甲组训练" --calendar 运动 --at 18:00 --for 3h --repeat weekly --days mo,we --until 2027-01-01
node cli.mjs update <id> --move 1d            # 顺延一天
node cli.mjs delete <id>
node cli.mjs task-add "【温氏】完成初版重构" --due 2026-09-30
node cli.mjs task-done <taskId>
node cli.mjs cal-add "科研" --color lavender
```

## LLM 每日规划工作流建议

1. `GET /api/tasks` 拿未完成任务（`done=false`）；
2. `GET /api/events?from=<今天>&to=<今天>` 查看已占用时段（注意返回的是重复事件 master，界面才会展开，如需精确判断可按 `rrule` 推算）；
3. 用 `POST /api/events` 安排日程（可带 `rrule` 建立每周例会等）；
4. 待办类工作用 `POST /api/tasks` 定 DDL，当天自动置顶显示；
5. 计划有变时 `PATCH`/`DELETE` 对应条目即可。
