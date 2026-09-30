import dayjs from 'dayjs';

export const DAY_MINUTES = 24 * 60;
/** 默认吸附粒度 15 分钟（设计方案 §5.1） */
export const SNAP = 15;

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 分钟数吸附；fine=true 时 1 分钟微调（按住 Alt） */
export function snapMinutes(min: number, snap = SNAP, fine = false): number {
  if (fine) return clamp(Math.round(min), 0, DAY_MINUTES);
  const s = snap <= 0 ? SNAP : snap;
  return clamp(Math.round(min / s) * s, 0, DAY_MINUTES);
}

export function fmtTime(min: number, use24h: boolean): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (use24h) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ap = h < 12 ? '上午' : '下午';
  return `${ap}${h12}:${String(m).padStart(2, '0')}`;
}

export function fmtRange(a: number, b: number, use24h: boolean): string {
  return `${fmtTime(a, use24h)} – ${fmtTime(b, use24h)}`;
}

/** 分钟数转可读时长 */
export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} 分钟`;
  if (m === 0) return h === 1 ? '1 小时' : `${h} 小时`;
  return `${h} 小时 ${m} 分`;
}

export function minutesOfDay(ms: number): number {
  const d = dayjs(ms);
  return d.hour() * 60 + d.minute();
}

export function startOfDayMs(ms: number | string | dayjs.Dayjs): number {
  return dayjs(ms).startOf('day').valueOf();
}

export function dateKey(ms: number | string | dayjs.Dayjs): string {
  return dayjs(ms).format('YYYY-MM-DD');
}

/** 相对今天的天数偏移 */
export function dayOffset(base: dayjs.Dayjs, n: number): dayjs.Dayjs {
  return base.add(n, 'day');
}

/** 视图周期的人类可读标题 */
export function periodTitle(view: string, anchor: dayjs.Dayjs, weekStartsOn: 0 | 1): string {
  if (view === 'day') return anchor.format('YYYY年M月D日 dddd');
  if (view === 'week') {
    const days = weekDays(anchor, 7, weekStartsOn);
    const start = days[0];
    const end = days[6];
    if (start.month() === end.month()) return `${start.format('YYYY年M月D日')} – ${end.format('D日')}`;
    return `${start.format('YYYY年M月D日')} – ${end.format('M月D日')}`;
  }
  if (view === 'month') return anchor.format('YYYY年M月');
  return `自 ${anchor.format('YYYY年M月D日')} 起的 30 天`;
}

/** 周/日视图的天列表 */
export function weekDays(anchor: dayjs.Dayjs, count: number, weekStartsOn: 0 | 1): dayjs.Dayjs[] {
  if (count === 7) {
    const dow = anchor.day(); // 0=周日
    const diff = weekStartsOn === 1 ? (dow === 0 ? -6 : 1 - dow) : -dow;
    const start = anchor.add(diff, 'day');
    return Array.from({ length: 7 }, (_, i) => start.add(i, 'day'));
  }
  return Array.from({ length: count }, (_, i) => anchor.add(i, 'day'));
}

export const WEEKDAY_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

/** 事件在某天的出现（跨午夜事件按天切分） */
export interface Occurrence {
  startMin: number;
  endMin: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export function occurrenceOn(ev: { start: number; end: number }, dayStart: number): Occurrence | null {
  const dayEnd = dayStart + DAY_MINUTES * 60_000;
  if (ev.end <= dayStart || ev.start >= dayEnd) return null;
  const startMin = clamp((ev.start - dayStart) / 60_000, 0, DAY_MINUTES);
  const endMin = clamp((ev.end - dayStart) / 60_000, 0, DAY_MINUTES);
  return {
    startMin,
    endMin,
    continuesBefore: ev.start < dayStart,
    continuesAfter: ev.end > dayEnd,
  };
}

/** 全天/跨日事件是否覆盖某天 */
export function coversDay(ev: { start: number; end: number }, dayStart: number): boolean {
  const dayEnd = dayStart + DAY_MINUTES * 60_000;
  return ev.start < dayEnd && ev.end > dayStart;
}
