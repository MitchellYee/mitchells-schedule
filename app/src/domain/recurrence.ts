/**
 * 轻量重复规则（RRULE 子集）：FREQ=DAILY|WEEKLY|MONTHLY + INTERVAL + BYDAY + UNTIL。
 * 存储为 RFC5545 风格字符串，渲染时在视口区间内展开，不物化实例。
 */

export interface RecurrenceSpec {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  /** 0=周日 … 6=周六（仅 WEEKLY） */
  byDay?: number[];
  /** 截止（含当日），epoch ms */
  until?: number;
}

const DAY_ABBR = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const ABBR_INDEX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const DAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

export function parseRrule(s?: string): RecurrenceSpec | null {
  if (!s) return null;
  const parts: Record<string, string> = {};
  for (const seg of s.split(';')) {
    const i = seg.indexOf('=');
    if (i > 0) parts[seg.slice(0, i).toUpperCase()] = seg.slice(i + 1);
  }
  const freq = parts.FREQ as RecurrenceSpec['freq'];
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') return null;
  const untilMs = parts.UNTIL ? parseUntil(parts.UNTIL) : undefined;
  return {
    freq,
    interval: parts.INTERVAL ? Math.max(1, parseInt(parts.INTERVAL, 10) || 1) : 1,
    byDay: parts.BYDAY
      ? parts.BYDAY.split(',')
          .map((a) => ABBR_INDEX[a.trim().toUpperCase()])
          .filter((x) => x !== undefined)
      : undefined,
    until: untilMs,
  };
}

/** UNTIL 接受 20270101 / 2027-01-01 / ISO，统一为当日 23:59:59.999（本地时区，含当日） */
function parseUntil(s: string): number | undefined {
  const m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999).getTime();
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : t;
}

export function buildRrule(spec: RecurrenceSpec): string {
  const segs = [`FREQ=${spec.freq}`];
  if (spec.interval > 1) segs.push(`INTERVAL=${spec.interval}`);
  if (spec.freq === 'WEEKLY' && spec.byDay?.length) {
    segs.push(`BYDAY=${[...spec.byDay].sort((a, b) => a - b).map((d) => DAY_ABBR[d]).join(',')}`);
  }
  if (spec.until !== undefined) {
    const d = new Date(spec.until);
    const p = (n: number) => String(n).padStart(2, '0');
    segs.push(`UNTIL=${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`);
  }
  return segs.join(';');
}

/** 人类可读描述：如「每周一、三 · 至 2027-01-01」 */
export function ruleToText(rrule?: string): string {
  const spec = parseRrule(rrule);
  if (!spec) return '';
  const every = spec.interval > 1 ? `每 ${spec.interval} ` : '每';
  let text: string;
  if (spec.freq === 'DAILY') text = `${every}天`;
  else if (spec.freq === 'MONTHLY') text = `${every}月`;
  else if (spec.byDay?.length) {
    const days = [...spec.byDay].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_ZH[d]).join('、');
    text = `${every}周${days}`;
  } else text = `${every}周`;
  if (spec.until !== undefined) {
    const d = new Date(spec.until);
    const p = (n: number) => String(n).padStart(2, '0');
    text += ` · 至 ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return text;
}

export interface Occurrence {
  start: number;
  end: number;
}

const DAY = 86_400_000;

/** 在 [rangeStart, rangeEnd) 内展开事件实例（无规则时按单次处理） */
export function expandOccurrences(
  ev: { start: number; end: number; rrule?: string },
  rangeStart: number,
  rangeEnd: number
): Occurrence[] {
  const spec = parseRrule(ev.rrule);
  const dur = ev.end - ev.start;
  if (!spec) {
    return ev.end > rangeStart && ev.start < rangeEnd ? [{ start: ev.start, end: ev.end }] : [];
  }

  const out: Occurrence[] = [];
  const anchor = new Date(ev.start);
  const anchorDayStart = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()).getTime();
  const timeOfDay = ev.start - anchorDayStart;
  const maxStart = Math.min(spec.until ?? Infinity, rangeEnd - 1);

  const pushIf = (dayStart: number) => {
    const start = dayStart + timeOfDay;
    if (start >= ev.start && start <= maxStart && start < rangeEnd && start + dur > rangeStart) {
      out.push({ start, end: start + dur });
    }
  };

  if (spec.freq === 'DAILY') {
    const step = spec.interval * DAY;
    // 快进到范围前一个周期，再逐日推进
    let dayStart = anchorDayStart + Math.max(0, Math.floor((rangeStart - DAY - anchorDayStart) / step)) * step;
    for (; dayStart <= rangeEnd; dayStart += step) pushIf(dayStart);
  } else if (spec.freq === 'WEEKLY') {
    const days = spec.byDay?.length ? spec.byDay : [anchor.getDay()];
    const anchorDow = new Date(anchorDayStart).getDay();
    const weekStart0 = anchorDayStart + (anchorDow === 0 ? -6 : 1 - anchorDow) * DAY; // 周一锚定
    const step = spec.interval * 7 * DAY;
    let week = weekStart0 + Math.max(0, Math.floor((rangeStart - 8 * DAY - weekStart0) / step)) * step;
    for (; week <= rangeEnd; week += step) {
      for (const dow of days) {
        pushIf(week + ((dow + 6) % 7) * DAY); // Monday=0 … Sunday=6
      }
    }
  } else {
    // MONTHLY：每月锚点日号；日号溢出（如 31 → 2月）自动跳过
    const date = anchor.getDate();
    let y = anchor.getFullYear();
    let m = anchor.getMonth();
    // 快进到范围起点前 2 个月
    const target = new Date(rangeStart - 62 * DAY);
    const totalMonths = (target.getFullYear() - y) * 12 + (target.getMonth() - m);
    if (totalMonths > 0) {
      const skip = Math.floor(totalMonths / spec.interval) * spec.interval;
      y += Math.floor((m + skip) / 12);
      m = (((m + skip) % 12) + 12) % 12;
    }
    while (new Date(y, m, 1).getTime() <= rangeEnd) {
      const cur = new Date(y, m, date);
      if (cur.getDate() === date) pushIf(new Date(y, m, 1).getTime());
      m += spec.interval;
      y += Math.floor(m / 12);
      m %= 12;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
