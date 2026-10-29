/**
 * Chrona REST API 核心（纯 Node，无 Vite 依赖）。
 * 由 Vite dev server（api-plugin.ts）与桌面版（desktop/main.mjs）共用。
 * 数据落明文 JSON 文件；文档见 app/API.md。
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DAY_MS = 86_400_000;
const cnDayStart = (ms) => Math.floor((ms + 8 * 3_600_000) / DAY_MS) * DAY_MS - 8 * 3_600_000;
const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const rangeTime = (value) => Date.parse(isDateOnly(value) ? value + 'T00:00:00+08:00' : value);

/** @returns {import('vite').Connect.NextHandleFunction} */
export function createApiHandler(dataFile) {
  function readDb() {
    const raw = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    return {
      calendars: Array.isArray(raw.calendars) ? raw.calendars : [],
      events: Array.isArray(raw.events) ? raw.events : [],
      tasks: Array.isArray(raw.tasks) ? raw.tasks.map(normalizeTask) : [],
    };
  }

  // 首次运行种子：全新安装（数据文件不存在）时预置四个日历；已有数据文件则原样保留
  if (!fs.existsSync(dataFile)) {
    const now = Date.now();
    const seed = {
      calendars: [
        { name: '工作', color: 'peacock' },
        { name: '科研', color: 'lavender' },
        { name: '运动', color: 'sage' },
        { name: '个人', color: 'banana' },
      ].map((c, i) => ({ id: randomUUID(), ...c, isVisible: true, sortOrder: i, createdAt: now, updatedAt: now })),
      events: [],
      tasks: [],
    };
    writeDb(seed);
  }

  function writeDb(db) {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const tmp = dataFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmp, dataFile);
  }

  const PALETTE = ['peacock', 'banana', 'sage', 'tomato', 'basil', 'lavender', 'grape', 'tangerine', 'flamingo', 'blueberry'];

  const TASK_STATUSES = ['upcoming', 'ongoing', 'deferred', 'done', 'done-late'];
  const IMPORTANCES = ['important', 'normal', 'unimportant'];

  class InputError extends Error {}

  // 中国时区（UTC+8）：状态机一律按上海日期推导，与运行设备系统时区无关
  const CN_TODAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
  const cnToday = () => CN_TODAY_FMT.format(new Date());

  /** 未完成态由日期推导 */
  function deriveStatus(t) {
    const today = cnToday();
    if (!t.dueDate) return 'ongoing';
    if (today > t.dueDate) return 'deferred';
    const from = t.startDate || t.dueDate;
    if (today < from) return 'upcoming';
    return 'ongoing';
  }

  /** 旧数据兼容：done 布尔 / 旧 todo → 五态；非法值按日期推导 */
  function normalizeTask(t) {
    if (t.status === 'done' || t.status === 'done-late') {
      // 完成类保留
    } else if (t.status === undefined) {
      t.status = t.done ? 'done' : deriveStatus(t);
    } else if (!TASK_STATUSES.includes(t.status)) {
      t.status = deriveStatus(t);
    } else if (t.status === 'upcoming' || t.status === 'ongoing' || t.status === 'deferred') {
      // 未完成类以当前日期重算（跨天自动延期）
      t.status = deriveStatus(t);
    }
    delete t.done;
    t.importance = IMPORTANCES.includes(t.importance) ? t.importance : 'normal';
    t.description = typeof t.description === 'string' ? t.description : '';
    t.subtasks = Array.isArray(t.subtasks) ? t.subtasks : [];
    return t;
  }

  /** POST/PATCH/PUT 共用任务校验；旧 PUT 客户端省略新增字段时保留已有详情。 */
  function taskFromInput(body, db, id, previous, replace = false) {
    const next = replace ? { ...body } : { ...previous };
    for (const key of ['title', 'startDate', 'dueDate', 'importance', 'description', 'subtasks', 'color']) {
      if (body[key] !== undefined) next[key] = body[key];
    }
    if (typeof next.title !== 'string' || !next.title.trim()) throw new InputError('缺少 title');
    next.title = next.title.trim();
    for (const key of ['startDate', 'dueDate']) {
      if (next[key] === null || next[key] === '') delete next[key];
      if (next[key] !== undefined) {
        const date = next[key];
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
          throw new InputError(`${key} 必须是有效的 YYYY-MM-DD 日期`);
        }
      }
    }
    if (next.startDate && !next.dueDate) throw new InputError('任务需要 dueDate');
    if (next.startDate && next.dueDate && next.startDate > next.dueDate) throw new InputError('startDate 不得晚于 dueDate');
    if (body.parent !== undefined) next.parentId = body.parent;
    else if (body.parentId !== undefined) next.parentId = body.parentId;
    if (next.parentId === '' || next.parentId === null) delete next.parentId;
    let parent;
    if (next.parentId) {
      parent = db.tasks.find((t) => !t.deletedAt && (t.id === next.parentId || t.title === next.parentId));
      if (!parent || !parent.startDate || parent.id === id || next.startDate) {
        throw new InputError('待办只能附属于已存在的任务（可传 id 或任务名）');
      }
      next.parentId = parent.id;
    }
    next.importance = body.importance !== undefined ? body.importance : previous?.importance ?? parent?.importance ?? 'normal';
    if (!IMPORTANCES.includes(next.importance)) throw new InputError('importance 仅支持 important|normal|unimportant');
    next.description = body.description !== undefined ? body.description : previous?.description ?? '';
    if (next.description === null) next.description = '';
    if (typeof next.description !== 'string') throw new InputError('description 必须是文本');
    const steps = body.subtasks !== undefined ? body.subtasks : previous?.subtasks ?? [];
    if (!Array.isArray(steps)) throw new InputError('subtasks 必须是数组');
    const stepIds = new Set();
    next.subtasks = steps.map((step) => {
      if (!step || typeof step !== 'object' || typeof step.title !== 'string' || !step.title.trim()) {
        throw new InputError('每个子任务必须有非空 title');
      }
      if (step.id !== undefined && (typeof step.id !== 'string' || !step.id.trim())) throw new InputError('子任务 id 必须是非空文本');
      if (step.done !== undefined && typeof step.done !== 'boolean') throw new InputError('子任务 done 必须是布尔值');
      const stepId = step.id ?? randomUUID();
      if (stepIds.has(stepId)) throw new InputError('子任务 id 不能重复');
      stepIds.add(stepId);
      return { id: stepId, title: step.title.trim(), done: step.done ?? false };
    });
    let status = body.status ?? (body.done !== undefined ? (body.done ? 'done' : 'todo') : previous?.status);
    if (status !== undefined && status !== 'todo' && !TASK_STATUSES.includes(status)) throw new InputError('status 仅支持 upcoming|ongoing|deferred|done|done-late');
    next.status = status === 'done' || status === 'done-late' ? status : deriveStatus(next);
    next.id = id;
    next.createdAt = previous?.createdAt ?? body.createdAt ?? Date.now();
    next.updatedAt = Date.now();
    delete next.done; delete next.parent; delete next.deletedAt;
    return next;
  }

  function resolveCalendar(db, ref) {
    if (ref) {
      const found = db.calendars.find((c) => c.id === ref || c.name === ref);
      if (found) return found;
      const created = {
        id: randomUUID(),
        name: ref,
        color: PALETTE[db.calendars.length % PALETTE.length],
        isVisible: true,
        sortOrder: db.calendars.length,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      db.calendars.push(created);
      return created;
    }
    return db.calendars[0];
  }

  function json(res, code, body) {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end(JSON.stringify(body));
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {});
        } catch (e) {
          reject(new InputError('请求体必须是有效 JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  function bad(res, msg) {
    json(res, 400, { error: msg });
  }

  function normalizeEvent(input) {
    const out = {};
    for (const k of ['title', 'description', 'location', 'calendarId', 'isAllDay', 'rrule']) {
      if (input[k] !== undefined) out[k] = input[k];
    }
    const ts = (v) => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const n = Date.parse(v);
        return Number.isNaN(n) ? undefined : n;
      }
      return undefined;
    };
    const start = ts(input.start);
    const end = ts(input.end);
    if (start !== undefined) out.start = start;
    if (end !== undefined) out.end = end;
    if (input.durationMinutes !== undefined && start !== undefined && end === undefined) {
      out.end = start + Number(input.durationMinutes) * 60_000;
    }
    return out;
  }

  return async function handler(req, res, next) {
    const url = new URL(req.url ?? '/', 'http://local');
    const p = url.pathname;
    if (!p.startsWith('/api/')) return next();
    if (req.method === 'OPTIONS') {
      json(res, 204, {});
      return;
    }
    try {
      // 先完整接收请求体再读最新快照。后续读改写同步完成，避免同进程并发请求互相覆盖。
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : undefined;
      if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body))) return bad(res, '请求体必须是 JSON 对象');
      const db = readDb();
      const now = Date.now();
      const m = p.match(/^\/api\/(events|tasks|calendars)(?:\/([^/]+))?$/);

      if (p === '/api/data' && req.method === 'GET') {
        json(res, 200, db);
        return;
      }
      if (p === '/api/data' && req.method === 'PUT') {
        writeDb({
          calendars: Array.isArray(body.calendars) ? body.calendars : [],
          events: Array.isArray(body.events) ? body.events : [],
          tasks: Array.isArray(body.tasks) ? body.tasks.map((task) => taskFromInput(task, { tasks: body.tasks }, task.id || randomUUID())) : [],
        });
        json(res, 200, { ok: true });
        return;
      }

      if (!m) {
        json(res, 404, { error: 'unknown endpoint' });
        return;
      }
      const [, table, id] = m;
      const list = db[table];

      if (req.method === 'GET' && !id) {
        let items = list.filter((x) => !x.deletedAt);
        if (table === 'events') {
          const from = url.searchParams.get('from');
          const to = url.searchParams.get('to');
          if (from || to) {
            const f = from ? rangeTime(from) : -Infinity;
            const t = to ? rangeTime(to) + (isDateOnly(to) ? DAY_MS - 1 : 0) : Infinity;
            if (Number.isNaN(f) || Number.isNaN(t)) return bad(res, '无效日期范围');
            // 返回系列主记录，由客户端按 RRULE 展开；不可用首次实例的 end 排除后续重复。
            items = items.filter((e) => (e.rrule || e.end > f) && e.start <= t);
          }
        }
        json(res, 200, items);
        return;
      }

      if (req.method === 'POST' && !id) {
        if (table === 'events') {
          const patch = normalizeEvent(body);
          if (patch.start === undefined) return bad(res, '缺少 start（ISO 字符串或 epoch ms）');
          const isAllDay = patch.isAllDay === true;
          if (isAllDay) {
            patch.start = cnDayStart(patch.start);
            // end 为排他的次日零点，与前端时间区间一致；省略时恰好一天。
            patch.end = patch.end === undefined ? patch.start + DAY_MS : cnDayStart(patch.end);
            if (patch.end <= patch.start) patch.end = patch.start + 86_400_000;
          } else if (patch.end === undefined) {
            patch.end = patch.start + 3_600_000;
          }
          if (!patch.calendarId && (body.calendar !== undefined || db.calendars.length)) {
            patch.calendarId = resolveCalendar(db, body.calendar).id;
          }
          const ev = { id: body.id || randomUUID(), isAllDay: false, createdAt: now, updatedAt: now, ...patch };
          db.events.push(ev);
          writeDb(db);
          json(res, 201, ev);
          return;
        }
        if (table === 'tasks') {
          const task = taskFromInput(body, db, body.id || randomUUID());
          if (db.tasks.some((t) => t.id === task.id)) return bad(res, '任务 id 已存在');
          db.tasks.push(task);
          writeDb(db);
          json(res, 201, task);
          return;
        }
        if (table === 'calendars') {
          if (!body.name) return bad(res, '缺少 name');
          const cal = resolveCalendar(db, body.name);
          if (body.color !== undefined) cal.color = body.color;
          cal.updatedAt = now;
          writeDb(db);
          json(res, 201, cal);
          return;
        }
      }

      if (id && (req.method === 'PUT' || req.method === 'PATCH')) {
        const idx = list.findIndex((x) => x.id === id);
        if (req.method === 'PUT') {
          const item = table === 'tasks' ? taskFromInput(body, db, id, list[idx], true) :
            { ...body, id, createdAt: idx >= 0 ? list[idx].createdAt : now, updatedAt: now };
          delete item.deletedAt;
          if (idx >= 0) list[idx] = item;
          else list.push(item);
          writeDb(db);
          json(res, 200, item);
          return;
        }
        if (idx < 0) {
          json(res, 404, { error: 'not found' });
          return;
        }
        let patch = table === 'events' ? normalizeEvent(body) : { ...body };
        delete patch.deletedAt;
        if (table === 'events' && patch.calendarId === undefined && body.calendar !== undefined) {
          patch.calendarId = resolveCalendar(db, body.calendar).id;
        }
        if (table === 'tasks') {
          list[idx] = taskFromInput(body, db, id, list[idx]);
        } else {
          Object.assign(list[idx], patch, { updatedAt: now });
        }
        writeDb(db);
        json(res, 200, list[idx]);
        return;
      }

      if (id && req.method === 'DELETE') {
        const idx = list.findIndex((x) => x.id === id);
        if (idx < 0) {
          json(res, 404, { error: 'not found' });
          return;
        }
        list.splice(idx, 1);
        writeDb(db);
        json(res, 200, { ok: true });
        return;
      }

      json(res, 405, { error: 'method not allowed' });
    } catch (e) {
      json(res, e instanceof InputError ? 400 : 500, { error: String(e?.message ?? e) });
    }
  };
}
