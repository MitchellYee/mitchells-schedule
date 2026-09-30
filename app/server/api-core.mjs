/**
 * Chrona REST API 核心（纯 Node，无 Vite 依赖）。
 * 由 Vite dev server（api-plugin.ts）与桌面版（desktop/main.mjs）共用。
 * 数据落明文 JSON 文件；文档见 app/API.md。
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** @returns {import('vite').Connect.NextHandleFunction} */
export function createApiHandler(dataFile) {
  const EMPTY = { calendars: [], events: [], tasks: [] };

  function readDb() {
    try {
      const raw = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
      return {
        calendars: Array.isArray(raw.calendars) ? raw.calendars : [],
        events: Array.isArray(raw.events) ? raw.events : [],
        tasks: Array.isArray(raw.tasks) ? raw.tasks.map(normalizeTask) : [],
      };
    } catch {
      return { calendars: [], events: [], tasks: [] };
    }
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
    } else if (t.status === 'upcoming' || t.status === 'ongoing') {
      // 未完成类以当前日期重算（跨天自动延期）
      t.status = deriveStatus(t);
    }
    delete t.done;
    return t;
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
          reject(e);
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
      const db = readDb();
      const now = Date.now();
      const m = p.match(/^\/api\/(events|tasks|calendars)(?:\/([^/]+))?$/);

      if (p === '/api/data' && req.method === 'GET') {
        json(res, 200, db);
        return;
      }
      if (p === '/api/data' && req.method === 'PUT') {
        const body = await readBody(req);
        writeDb({
          calendars: Array.isArray(body.calendars) ? body.calendars : [],
          events: Array.isArray(body.events) ? body.events : [],
          tasks: Array.isArray(body.tasks) ? body.tasks : [],
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
            const f = from ? Date.parse(from) : -Infinity;
            const t = to ? Date.parse(to) + 86_399_999 : Infinity;
            items = items.filter((e) => e.end > f && e.start <= t);
          }
        }
        json(res, 200, items);
        return;
      }

      if (req.method === 'POST' && !id) {
        const body = await readBody(req);
        if (table === 'events') {
          const patch = normalizeEvent(body);
          if (patch.start === undefined) return bad(res, '缺少 start（ISO 字符串或 epoch ms）');
          const isAllDay = patch.isAllDay === true;
          if (patch.end === undefined) {
            patch.end = isAllDay ? patch.start + 86_400_000 : patch.start + 3_600_000;
          }
          if (isAllDay) {
            const s = new Date(patch.start);
            patch.start = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
            const e = new Date(patch.end);
            patch.end = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime() + 86_400_000;
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
          if (!body.title) return bad(res, '缺少 title');
          // done 布尔兼容旧用法；status 五态优先；缺省按日期推导
          let status;
          if (TASK_STATUSES.includes(body.status)) status = body.status;
          else if (body.done === true) status = 'done';
          else if (body.done === false) status = undefined; // 由日期推导
          if (!status) {
            status = deriveStatus({ startDate: body.startDate, dueDate: body.dueDate });
          }
          let parentId;
          if (body.parent !== undefined) {
            const parent = db.tasks.find((t) => t.id === body.parent || t.title === body.parent);
            if (!parent) return bad(res, '所属任务不存在（可传 id 或任务名）');
            parentId = parent.id;
          }
          const task = {
            id: body.id || randomUUID(), title: body.title, status,
            createdAt: now, updatedAt: now,
            ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
            ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
            ...(parentId !== undefined ? { parentId } : {}),
          };
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
          const body = await readBody(req);
          const item = { ...body, id, createdAt: idx >= 0 ? list[idx].createdAt : now, updatedAt: now };
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
        const body = await readBody(req);
        let patch = table === 'events' ? normalizeEvent(body) : { ...body };
        delete patch.deletedAt;
        if (patch.calendarId === undefined && body.calendar !== undefined) {
          patch.calendarId = resolveCalendar(db, body.calendar).id;
        }
        if (table === 'tasks') {
          // done 布尔兼容；status 五态优先；'todo' 视为缺省（按日期推导）
          if (body.status === 'todo') delete patch.status;
          if (body.status !== undefined && body.status !== 'todo') {
            if (!TASK_STATUSES.includes(body.status)) return bad(res, 'status 仅支持 upcoming|ongoing|deferred|done|done-late');
          } else if (body.done !== undefined && body.status === undefined) {
            patch.status = body.done ? 'done' : undefined;
            if (!body.done) delete patch.status;
          }
          delete patch.done;
          // 待办附属：parent 必须是存在的任务（跨天项）
          if (body.parent !== undefined) {
            const parent = db.tasks.find((t) => t.id === body.parent || t.title === body.parent);
            if (!parent) return bad(res, '所属任务不存在（可传 id 或任务名）');
            patch.parentId = parent.id;
          }
          if (patch.parentId === null || patch.parentId === '') delete patch.parentId;
          // 任务日期区间约束：startDate 不得晚于 dueDate
          const start = patch.startDate !== undefined ? patch.startDate : list[idx].startDate;
          const due = patch.dueDate !== undefined ? patch.dueDate : list[idx].dueDate;
          if (start && due && start > due) patch.dueDate = start;
          // 未完成类改期后按新日期重算状态（延期任务拖回今天覆盖 → 进行中）
          const finalStatus = patch.status !== undefined ? patch.status : list[idx].status;
          if (finalStatus !== 'done' && finalStatus !== 'done-late' && (body.startDate !== undefined || body.dueDate !== undefined || patch.status === undefined)) {
            const merged = { startDate: patch.startDate !== undefined ? patch.startDate : list[idx].startDate, dueDate: patch.dueDate !== undefined ? patch.dueDate : list[idx].dueDate };
            patch.status = deriveStatus(merged);
          }
        }
        Object.assign(list[idx], patch, { updatedAt: now });
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
      json(res, 500, { error: String(e?.message ?? e) });
    }
  };
}
