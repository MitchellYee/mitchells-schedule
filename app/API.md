# Mitchell's Working Tool REST API —— LLM / 脚本接口说明

> 两种服务来源，接口完全一致：
> - **桌面软件版**：软件运行期间 `http://127.0.0.1:5175`（`CHRONA_PORT` 可改）
> - **Web 开发版**：`npm run dev` 后 `http://localhost:5173`
>
> 数据落盘于 `app/data/db.json`（明文 JSON，可直读、可备份、可手改——手改后界面 ≤5 秒自动同步）。
> 所有接口返回 JSON；时间字段统一为 **epoch 毫秒**（本地时区语义），也接受 ISO 字符串入参。

## 设计约定

- **日历可用名字引用**：`calendar: "工作"`，不存在时自动创建。无需先查日历 id。
- 创建事件若只给 `start`，默认时长 1 小时（`durationMinutes` 可覆盖）；全天事件给 `isAllDay: true` + 当日 `start` 即可。
- 全天事件的 `end` 是排他的次日零点；省略时恰好一天。日期范围查询的纯日期按 UTC+8 解释；重复日程返回系列主记录，由客户端按规则展开，结果可能包含范围内没有实例的系列。
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

## 任务与待办（v0.10.0：重要程度、描述和子任务）

- **任务**（跨天）：`startDate` + `dueDate`，最高层级，连体长条横贯多天；
- **待办**（单日 DDL）：仅 `dueDate`，第二层级，可经 `parentId`（或 `parent` 传任务 id/名）附属到任务；
- **五态** `status`：`upcoming`（未开始）/ `ongoing`（进行中）/ `deferred`（延期）由日期自动推导；`done`（完成）/ `done-late`（延期完成）手动标记。旧 `todo` 和布尔 `done` 兼容。
- **重要程度** `importance`：`important`（重要，红色）/ `normal`（一般，黄色）/ `unimportant`（不重要，绿色）。独立项默认一般；创建附属待办时省略此字段则继承任务重要程度。旧 `color` 不再控制任务显示。
- **任务描述** `description`：多行背景、目标、要求；缺省空文本。
- **步骤清单** `subtasks`：按顺序保存 `{id, title, done}`。创建时可省略 id（服务端生成）和 done（默认 false）；更新时保留 id。清单步骤与每日待办是不同实体，清单步骤不会自动创建待办。

```bash
curl http://localhost:5173/api/tasks
# 任务（跨天）
curl -X POST http://localhost:5173/api/tasks -H "Content-Type: application/json" \
  -d '{"title": "温氏项目重构", "startDate": "2026-10-01", "dueDate": "2026-10-10", "importance": "important", "description": "完成接口梳理并交付可验证的版本。", "subtasks": [{"title": "梳理接口", "done": false}, {"title": "联调验收", "done": false}]}'
# 待办 + 附属任务
curl -X POST http://localhost:5173/api/tasks -H "Content-Type: application/json" \
  -d '{"title": "梳理接口清单", "dueDate": "2026-10-03", "parent": "温氏项目重构"}'
# 完成标记 / 改期（未完成状态由日期重算）
curl -X PATCH http://localhost:5173/api/tasks/<id> -H "Content-Type: application/json" \
  -d '{"status": "deferred", "dueDate": "2026-10-08"}'
curl -X DELETE http://localhost:5173/api/tasks/<id>
```

**字段**：`id`、`title`、`status`、`importance`、`description`、`subtasks`、`dueDate?`、`startDate?`（有=任务）、`parentId?`、`createdAt`、`updatedAt`。事件目前没有直接关联任务的字段。

`PATCH` 只更新提供的字段。`description: ""` 清空描述；`subtasks: []` 清空清单；`parent: ""` 或 `parentId: null` 解除附属。子任务数组更新为整份替换，提交前先读取最新清单并保留未修改的项。非法字段返回 400 且不落盘。

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
node cli.mjs task-add "【科研】实验复现" --from 2026-10-10 --due 2026-10-15 --importance important --description "背景与验收要求" --subtasks-file steps.json
node cli.mjs task-list --json               # 完整详情，适合辅助排程
node cli.mjs task-get <taskId>
node cli.mjs task-set <taskId> --importance normal --description-file background.txt
node cli.mjs task-set <taskId> --subtasks-file steps.json
node cli.mjs task-done <taskId>
node cli.mjs cal-add "科研" --color lavender
```

## LLM 每日规划工作流建议

独立翻译接口见文末；它不修改日程或任务。

1. `GET /api/tasks` 拿覆盖当天的未完成任务（状态 upcoming/ongoing/deferred），结合 `importance`、DDL、`description`、`subtasks` 评估当天工作；忽略 `subtasks[].done=true` 的步骤；
2. `GET /api/events?from=<今天>&to=<今天>` 查看已占用时段（注意返回的是重复事件 master，界面才会展开，如需精确判断可按 `rrule` 推算）；
3. 用 `POST /api/events` 安排日程（可带 `rrule` 建立每周例会等）；
4. 选取当天可完成的步骤用 `POST /api/tasks` 创建附属待办（`parent`/`parentId` + 当天 `dueDate`），重要程度缺省继承所属任务；
5. 计划有变时 `PATCH`/`DELETE` 对应条目即可。

## 翻译（v0.13）

`GET /api/translation/config` 返回字符限制、上下文预设和提供方元数据，不返回密钥。例如：

```json
{
  "maxCharacters": 30000,
  "maxContextCharacters": 6000,
  "providers": {
    "google-web": { "configured": true },
    "minimax": { "configured": false, "endpoint": "https://api.minimaxi.com/v1/text/chatcompletion_v2", "model": "MiniMax-M3.1-Flash" },
    "glm": { "configured": false, "endpoint": "https://open.bigmodel.cn/api/paas/v4/chat/completions", "model": "glm-5.3" },
    "deepseek": { "configured": false, "endpoint": "https://api.deepseek.com/chat/completions", "model": "deepseek-flash" },
    "custom": { "configured": false }
  }
}
```

`POST /api/translation` 必须设置 `Content-Type: application/json`，请求示例：

```json
{ "text": "Hello world.\n\nA second paragraph.", "source": "en", "target": "zh", "provider": "google-web" }
```

`source` 支持 `auto / zh / en`，`target` 支持 `zh / en`，`provider` 支持 `google-web / minimax / glm / deepseek / custom`。明确指定的源/目标不能相同，原文最多 30,000 个 Unicode 字符。LLM 提供方需要先在桌面设置或服务端对应环境变量配置密钥。

LLM 请求可附加 `model`、`endpoint`（仅 custom 使用）、`context` 和当前会话 `apiKey`。服务端会把内置专业翻译 Prompt、上下文和原文片段组成 `system` / `user` 消息；`apiKey` 不写日志、不返回配置，桌面版建议使用 safeStorage 保存。环境变量为 `MINIMAX_API_KEY`、`GLM_API_KEY`、`DEEPSEEK_API_KEY`、`CUSTOM_LLM_API_KEY`。

成功返回 `application/x-ndjson`，每行独立 JSON：

```json
{"type":"progress","text":"","completed":0,"total":2,"detectedSource":"en"}
{"type":"progress","text":"你好世界。","completed":1,"total":2,"detectedSource":"en"}
{"type":"done","text":"你好世界。\n\n第二段。","completed":2,"total":2,"detectedSource":"en","provider":"google-web"}
```

客户端必须等到 `done` 才认定全文完成。流开始后的错误以 `{ "type": "error", "error": "可读错误说明", "code": "TIMEOUT" }` 返回；流开始前返回 HTTP 错误状态与 JSON。断开请求即可取消，客户端可保留已完成部分。每段最多 1,000 字符、25 秒超时，同一服务最多两个并发翻译。

此接口不开放跨域；浏览器使用同源请求，CLI 可直接访问回环地址。默认 Google 网页通道为非官方兼容服务；文本会发送到所选 Google 或 LLM 提供方，需要可访问该服务的网络。
