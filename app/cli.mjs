#!/usr/bin/env node
/**
 * 时叙 Chrona 命令行工具 —— 通过 REST API 操作日程（需 dev server 运行中：npm run dev）
 *
 * 事件：
 *   node cli.mjs list [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *   node cli.mjs add "标题" [--date YYYY-MM-DD] [--at HH:mm] [--for 90m|1.5h] [--allday]
 *                     [--calendar 名字] [--loc 地点] [--note 备注]
 *   node cli.mjs update <id> [--title ...] [--date ...] [--at ...] [--for ...] [--move Nd|Nw]
 *   node cli.mjs delete <id>
 * 任务：
 *   node cli.mjs task-list
 *   node cli.mjs task-add "标题" [--due YYYY-MM-DD]
 *   node cli.mjs task-done <id>
 * 日历：
 *   node cli.mjs cal-list
 *
 * 环境变量 CHRONA_URL 可覆盖服务地址（默认 http://localhost:5173）
 */

const BASE = process.env.CHRONA_URL || 'http://localhost:5173';

async function api(path, init) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`✗ API ${res.status}: ${body.error || res.statusText}`);
    process.exit(1);
  }
  return body;
}

function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        opt[key] = next;
        i++;
      } else {
        opt[key] = true;
      }
    } else {
      pos.push(a);
    }
  }
  return { pos, opt };
}

/** "2026-09-27" + "15:30" | "15" | "15:30:00" → epoch ms（本地时区） */
function toMs(dateStr, timeStr) {
  const d = dateStr || todayStr();
  if (!timeStr) return new Date(`${d}T00:00:00`).getTime();
  const m = String(timeStr).match(/^(\d{1,2})(?::(\d{1,2}))?/);
  if (!m) throw new Error(`无法解析时间: ${timeStr}`);
  const hh = String(m[1]).padStart(2, '0');
  const mm = String(m[2] || '0').padStart(2, '0');
  return new Date(`${d}T${hh}:${mm}:00`).getTime();
}

// 中国时区（UTC+8）：与软件界面一致，"今天/当前时刻"按上海计算，与系统时区无关
const CN_DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
const CN_TIME_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false });
function todayStr() {
  return CN_DATE_FMT.format(new Date());
}
function cnHour() {
  return Number(CN_TIME_FMT.format(new Date()).slice(0, 2));
}

/** "90m" "1.5h" "2h30m" → 分钟 */
function durToMin(s) {
  let min = 0;
  for (const m of String(s).matchAll(/(\d+(?:\.\d+)?)\s*([mh])/g)) {
    min += parseFloat(m[1]) * (m[2] === 'h' ? 60 : 1);
  }
  return Math.round(min);
}

const WD = ['日', '一', '二', '三', '四', '五', '六'];
function fmtDateTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}(周${WD[d.getDay()]}) ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtMs(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function buildTimeFields(opt, base) {
  const out = {};
  if (opt.date !== undefined || opt.at !== undefined) {
    const dateStr = opt.date !== undefined ? opt.date : new Date(base.start).toISOString().slice(0, 10);
    if (opt.at !== undefined) out.start = toMs(dateStr, opt.at);
  } else if (opt.at !== undefined) {
    out.start = toMs(todayStr(), opt.at);
  }
  if (opt.for !== undefined) {
    const s = out.start ?? base.start;
    out.end = s + durToMin(opt.for) * 60000;
  }
  return out;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, opt } = parseArgs(rest);

  switch (cmd) {
    case 'list': {
      const q = new URLSearchParams();
      if (opt.from) q.set('from', opt.from);
      if (opt.to) q.set('to', opt.to);
      const events = await api(`/api/events${q.size ? '?' + q : ''}`);
      const cals = await api('/api/calendars');
      const calName = Object.fromEntries(cals.map((c) => [c.id, c.name]));
      if (!events.length) {
        console.log('（范围内没有事件）');
        return;
      }
      console.log('时间                     日历   标题                ID');
      for (const e of events.sort((a, b) => a.start - b.start)) {
        const when = e.isAllDay
          ? `${new Date(e.start).toISOString().slice(0, 10)} 全天     `
          : `${fmtDateTime(e.start)}–${fmtMs(e.end)}`;
        console.log(
          `${when}  ${(calName[e.calendarId] || '?').padEnd(4)}  ${String(e.title).padEnd(16).slice(0, 16)}  ${e.id}`
        );
      }
      return;
    }

    case 'add': {
      const title = pos[0];
      if (!title) usage('add 缺少标题');
      const body = { title };
      if (opt.allday) {
        body.isAllDay = true;
        body.start = toMs(opt.date || todayStr());
        body.end = body.start + 86400000;
      } else {
        body.start = toMs(opt.date || todayStr(), opt.at || `${(cnHour() + 1) % 24}:00`);
        body.end = body.start + (opt.for ? durToMin(opt.for) : 60) * 60000;
      }
      if (opt.calendar) body.calendar = opt.calendar;
      if (opt.loc) body.location = opt.loc;
      if (opt.note) body.description = opt.note;
      if (opt.repeat) {
        const freq = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' }[opt.repeat];
        if (!freq) usage('--repeat 仅支持 daily | weekly | monthly');
        const segs = [`FREQ=${freq}`];
        const every = opt.every ? parseInt(opt.every, 10) : 1;
        if (every > 1) segs.push(`INTERVAL=${every}`);
        if (freq === 'WEEKLY' && opt.days) {
          segs.push('BYDAY=' + String(opt.days).split(',').map((s) => s.trim().slice(0, 2).toUpperCase()).join(','));
        }
        if (opt.until) segs.push('UNTIL=' + String(opt.until).replace(/-/g, ''));
        body.rrule = segs.join(';');
      }
      const ev = await api('/api/events', { method: 'POST', body: JSON.stringify(body) });
      const repeatText = ev.rrule ? ` · 重复(${ev.rrule})` : '';
      console.log(`✓ 已创建 [${ev.id}] ${ev.title} ${ev.isAllDay ? '全天' : fmtDateTime(ev.start) + '–' + fmtMs(ev.end)}${repeatText}`);
      return;
    }

    case 'update': {
      const id = pos[0];
      if (!id) usage('update 缺少 id');
      const list = await api('/api/events');
      const cur = list.find((e) => e.id === id);
      if (!cur) {
        console.error('✗ 未找到该事件（用 list 查看 id）');
        process.exit(1);
      }
      const patch = buildTimeFields(opt, cur);
      if (opt.title !== undefined) patch.title = opt.title;
      if (opt.loc !== undefined) patch.location = opt.loc;
      if (opt.note !== undefined) patch.description = opt.note;
      if (opt.calendar !== undefined) patch.calendar = opt.calendar;
      if (opt.move !== undefined) {
        const m = String(opt.move).match(/^([+-]?\d+)([dw])$/);
        if (!m) usage('--move 格式应为如 1d / -2d / 1w');
        const shift = parseInt(m[1], 10) * (m[2] === 'w' ? 7 : 1) * 86400000;
        patch.start = cur.start + shift;
        patch.end = cur.end + shift;
      }
      const ev = await api(`/api/events/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      console.log(`✓ 已更新 [${ev.id}] ${ev.title} ${ev.isAllDay ? '全天' : fmtDateTime(ev.start) + '–' + fmtMs(ev.end)}`);
      return;
    }

    case 'delete': {
      const id = pos[0];
      if (!id) usage('delete 缺少 id');
      await api(`/api/events/${id}`, { method: 'DELETE' });
      console.log('✓ 已删除');
      return;
    }

    case 'task-list': {
      const tasks = await api('/api/tasks');
      const STATUS = { upcoming: '◌未', ongoing: '◈执', deferred: '⏱延', done: '✓', 'done-late': '✗迟' };
      for (const t of tasks) {
        const flag = STATUS[t.status] || '□';
        const range = t.startDate && t.startDate !== t.dueDate ? ` [任务 ${t.startDate}~${t.dueDate}]` : t.dueDate ? ` [截止 ${t.dueDate}]` : '';
        const parent = t.parentId ? ` ↳${(tasks.find((x) => x.id === t.parentId) || {}).title || t.parentId.slice(0, 6)}` : '';
        console.log(`${flag} [${t.id}] ${t.title}${range}${parent}`);
      }
      if (!tasks.length) console.log('（没有任务/待办）');
      return;
    }

    case 'task-add': {
      const title = pos[0];
      if (!title) usage('task-add 缺少标题');
      const body = { title };
      if (opt.due) body.dueDate = opt.due;
      if (opt.from) {
        body.startDate = opt.from;
        body.dueDate = body.dueDate || opt.from;
      }
      if (opt.parent) body.parent = opt.parent; // id 或任务名，附属为子待办
      if (opt.status) body.status = opt.status;
      if (opt.color) body.color = opt.color;
      const t = await api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
      const range = t.startDate && t.startDate !== t.dueDate ? `（${t.startDate}~${t.dueDate} 任务）` : '（待办）';
      console.log(`✓ 已创建 [${t.id}] ${t.title} ${range}${t.parentId ? ' · 已附属' : ''}`);
      return;
    }

    case 'task-set': {
      const id = pos[0];
      if (!id) usage('task-set 缺少 id');
      const body = {};
      if (opt.status) {
        if (!['todo', 'upcoming', 'ongoing', 'done', 'done-late', 'deferred'].includes(opt.status)) usage('--status 仅支持 upcoming|ongoing|deferred|done|done-late（未完成三态由日期自动推导，通常只设 done/done-late）');
        if (opt.status === 'todo') delete opt.status;
        body.status = opt.status;
      }
      if (opt.due) body.dueDate = opt.due;
      if (opt.from) body.startDate = opt.from;
      if (opt.parent !== undefined) body.parent = opt.parent === 'none' ? '' : opt.parent;
      if (opt.title) body.title = opt.title;
      if (opt.color !== undefined) body.color = opt.color === 'none' ? undefined : opt.color;
      if (!Object.keys(body).length) usage('task-set 需要 --status/--due/--from/--parent/--title 之一');
      const t = await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      console.log(`✓ [${t.id}] ${t.title} → ${t.status}${t.startDate ? ` ${t.startDate}~${t.dueDate}` : t.dueDate ? ` 截止 ${t.dueDate}` : ''}`);
      return;
    }

    case 'task-done': {
      const id = pos[0];
      if (!id) usage('task-done 缺少 id');
      const t = await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ done: true }) });
      console.log(`✓ 已完成 [${t.id}] ${t.title}`);
      return;
    }

    case 'cal-add': {
      const name = pos[0];
      if (!name) usage('cal-add 缺少日历名');
      const cal = await api('/api/calendars', {
        method: 'POST',
        body: JSON.stringify(opt.color ? { name, color: opt.color } : { name }),
      });
      console.log(`✓ 日历 [${cal.id}] ${cal.name}（${cal.color}）`);
      return;
    }

    case 'cal-list': {
      const cals = await api('/api/calendars');
      for (const c of cals) console.log(`[${c.id}] ${c.name}（${c.color}${c.isVisible ? '' : '，已隐藏'}）`);
      return;
    }

    default:
      usage(cmd ? `未知命令: ${cmd}` : undefined);
  }
}

function usage(err) {
  if (err) console.error('✗ ' + err + '\n');
  console.log(`用法（服务地址可用环境变量 CHRONA_URL 覆盖，默认 ${BASE}）：
  node cli.mjs list [--from YYYY-MM-DD] [--to YYYY-MM-DD]
  node cli.mjs add "标题" [--date YYYY-MM-DD] [--at HH:mm] [--for 90m|1.5h] [--allday] [--calendar 名] [--loc 地点] [--note 备注]
                     [--repeat daily|weekly|monthly] [--every N] [--days mo,we,su] [--until YYYY-MM-DD]
  node cli.mjs update <id> [--title ...] [--date ...] [--at ...] [--for ...] [--move 1d|-2d|1w] [--calendar ...]
  node cli.mjs delete <id>
  node cli.mjs task-list | task-add "标题" [--due YYYY-MM-DD] [--from YYYY-MM-DD（有=跨天任务）] [--parent 任务id或名]
  node cli.mjs task-set <id> --status done|done-late [--due ...] [--from ...] [--parent ...|none] [--title ...] | task-done <id>
  node cli.mjs cal-add "名" [--color peacock|banana|sage|tomato|basil|lavender|grape|...] | cal-list
示例：
  node cli.mjs add "写周报" --at 15:00 --for 45m --calendar 工作
  node cli.mjs add "甲组训练" --calendar 运动 --at 18:00 --for 3h --repeat weekly --days mo,we --until 2027-01-01
  node cli.mjs task-add "【温氏】完成初版重构" --due 2026-09-30`);
  process.exit(1);
}

main().catch((e) => {
  console.error('✗ ' + (e.cause?.code === 'ECONNREFUSED' ? `无法连接 ${BASE}，请先运行 npm run dev` : e.message));
  process.exit(1);
});
