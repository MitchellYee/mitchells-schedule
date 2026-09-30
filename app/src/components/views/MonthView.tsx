import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { todayCN } from '../../time';
import { useStore } from '../../store/useStore';
import { calColorVars } from '../../types';
import { expandOccurrences, ruleToText } from '../../domain/recurrence';
import { fmtTime, weekDays, WEEKDAY_SHORT } from '../../domain/time';
import BandBar, { TaskBarRow, renderBandBars } from './BandBar';

const MAX_CHIPS = 3;

/** 任务 = 连体长条（跨周分段，断口平边+箭头，真实首尾圆角）；待办 = DDL 当天一条 */
function barsForWeek(
  tasks: { id: string; title: string; status?: string; startDate?: string; dueDate?: string }[],
  week: Dayjs[]
): { taskBars: TaskBarRow[]; todoBars: TaskBarRow[] } {
  const ws = week[0].format('YYYY-MM-DD');
  const taskBars: TaskBarRow[] = [];
  const todoBars: TaskBarRow[] = [];
  for (const t of tasks) {
    if (t.status === 'done' || t.status === 'done-late') continue;
    const from = t.startDate || t.dueDate;
    if (!from || !t.dueDate) continue;
    if (!t.startDate && (t.dueDate < ws || t.dueDate > week[6].format('YYYY-MM-DD'))) continue; // 待办仅本周
    // 任务渲染全部（BandBar 按区间∩本周自算分段），拖拽跨周/翻页组件保持挂载
    taskBars.push({ task: t as TaskBarRow['task'], colStart: 0, span: 1, cutStart: false, cutEnd: false, range: '' });
  }
  taskBars.sort((a, b) => (a.task.startDate! < b.task.startDate! ? -1 : 1));
  todoBars.sort((a, b) => ((a.task.dueDate || '') < (b.task.dueDate || '') ? -1 : 1));
  return { taskBars, todoBars };
}

/** 周首（周一） */
function weekStartOf(d: Dayjs): Dayjs {
  const dow = d.day();
  return d.subtract(dow === 0 ? 6 : dow - 1, 'day').startOf('day');
}

/**
 * 流式月视图（v0.9.2）：上下滚动逐行加载周行，向下滚动衔接下个月、向上衔接上个月，
 * 而非整月翻页。周行结构：任务条带 + 待办条带 + 7 日格。
 */
export default function MonthView() {
  const anchor = useStore((s) => s.anchor);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const use24h = useStore((s) => s.settings.use24h);
  const events = useStore((s) => s.events);
  const calendars = useStore((s) => s.calendars);
  const tasks = useStore((s) => s.tasks);
  const openQuickCreate = useStore((s) => s.openQuickCreate);
  const openDrawer = useStore((s) => s.openDrawer);
  const toggleTask = useStore((s) => s.toggleTask);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<{ dayKey: string } | null>(null);
  /** 跨格拖选（elementFromPoint 持续追踪） */
  const pendingKeyRef = useRef<string | null>(null);
  const rangeRef = useRef<{ from: string; to: string } | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  /** 行首日期数组（周一起始）；anchor 变化时重建 */
  const [weekStarts, setWeekStarts] = useState<Dayjs[]>(() => initialWeeks(anchor));
  const anchorRef = useRef(anchor);
  const jumpRowRef = useRef<HTMLDivElement | null>(null);
  const todayKey = todayCN();

  function initialWeeks(anchorStr: string): Dayjs[] {
    const base = weekStartOf(dayjs(anchorStr));
    return Array.from({ length: 16 }, (_, i) => base.add(i - 3, 'week'));
  }

  // anchor 变化（P/N 翻月、今天按钮、迷你月历）→ 重建行集合并滚到目标周
  useEffect(() => {
    if (anchor === anchorRef.current) return;
    anchorRef.current = anchor;
    setWeekStarts(initialWeeks(anchor));
    requestAnimationFrame(() => {
      jumpRowRef.current?.scrollIntoView({ block: 'start' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  // 流式加载：接近顶部 prepend（保视口），接近底部 append（原生 scroll 监听）；
  // 同时把视口中间行所在月份同步到顶栏标题（静默，不触发行集重建）
  useEffect(() => {
    const el0 = scrollRef.current;
    if (!el0) return;
    const el: HTMLDivElement = el0;
    function handleScroll() {
      // 月份跟随：视口中间的周行
      const rows = el.querySelectorAll<HTMLElement>('[data-weekstart]');
      const mid = el.getBoundingClientRect().top + el.clientHeight / 2;
      for (const row of rows) {
        const r = row.getBoundingClientRect();
        if (mid >= r.top && mid < r.bottom) {
          const ws = dayjs(Number(row.dataset.weekstart));
          const newAnchor = ws.add(3, 'day').format('YYYY-MM-DD'); // 该周中点日
          if (newAnchor.slice(0, 7) !== anchorRef.current.slice(0, 7)) {
            anchorRef.current = newAnchor;
            useStore.getState().setAnchor(newAnchor); // 顶栏标题跟随，effect 因 anchorRef 已同步而跳过重建
          }
          break;
        }
      }
      const nearTop = el.scrollTop < 400;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 600;
      if (!nearTop && !nearBottom) return;
      setWeekStarts((cur) => {
        if (!cur.length) return cur;
        if (nearTop) {
          const first = cur[0];
          const prevKey = first.valueOf();
          const next = [first.add(-4, 'week'), first.add(-3, 'week'), first.add(-2, 'week'), first.add(-1, 'week'), ...cur];
          requestAnimationFrame(() => {
            const row = scrollRef.current?.querySelector(`[data-weekstart="${prevKey}"]`);
            row?.scrollIntoView({ block: 'start' });
          });
          return next;
        }
        const last = cur[cur.length - 1];
        return [...cur, last.add(1, 'week'), last.add(2, 'week'), last.add(3, 'week'), last.add(4, 'week')];
      });
    }
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const calById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const visible = useMemo(
    () => events.filter((e) => calById.get(e.calendarId)?.isVisible),
    [events, calById]
  );

  const weeks = useMemo(
    () => weekStarts.map((ws) => weekDays(ws, 7, weekStartsOn)),
    [weekStarts, weekStartsOn]
  );
  const allDays = useMemo(() => weeks.flat(), [weeks]);
  const rangeStart = allDays[0].valueOf() - 86_400_000;
  const rangeEnd = allDays[allDays.length - 1].valueOf() + 2 * 86_400_000;

  const layout = useMemo(() => {
    const eventsMap = new Map<string, { key: string; ev: typeof visible[number]; start: number }[]>();
    for (const ev of visible) {
      for (const o of expandOccurrences(ev, rangeStart, rangeEnd)) {
        const key = dayjs(o.start).format('YYYY-MM-DD');
        if (!eventsMap.has(key)) eventsMap.set(key, []);
        eventsMap.get(key)!.push({ key: `${ev.id}|${o.start}`, ev, start: o.start });
      }
    }
    const weekBars = weeks.map((w) => barsForWeek(tasks, w));
    return { eventsMap, weekBars };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tasks, rangeStart, rangeEnd]);

  // 拖选（elementFromPoint 持续追踪格子）
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const from = pendingKeyRef.current;
      if (!from || e.buttons !== 1) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el && (el as HTMLElement).closest('[data-daykey]');
      const key = cell ? (cell as HTMLElement).dataset.daykey : null;
      if (!key) return;
      if (key === from) {
        if (rangeRef.current) {
          rangeRef.current = null;
          setRange(null);
        }
        return;
      }
      const cur = { from, to: key };
      rangeRef.current = cur;
      setRange(cur);
    }
    function onUp(e: PointerEvent) {
      const from = pendingKeyRef.current;
      const range = rangeRef.current;
      pendingKeyRef.current = null;
      rangeRef.current = null;
      setRange(null);
      if (!from) return;
      if (range) {
        const startDate = range.from < range.to ? range.from : range.to;
        const dueDate = range.from < range.to ? range.to : range.from;
        useStore.getState().openTaskQuick({ mode: 'task', startDate, dueDate, x: e.clientX, y: e.clientY });
      } else {
        openQuickCreate({ dateKey: from, startMin: 9 * 60, endMin: 10 * 60, x: e.clientX, y: e.clientY });
      }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lo = range ? (range.from < range.to ? range.from : range.to) : '';
  const hi = range ? (range.from < range.to ? range.to : range.from) : '';
  const anchorMonth = dayjs(anchor).month();

  return (
    <div className="flex h-full select-none flex-col overflow-hidden">
      {/* 星期表头（sticky） */}
      <div className="z-20 grid shrink-0 grid-cols-7 border-b border-line bg-base">
        {weeks[0].map((d) => (
          <div key={d.day()} className="py-1.5 text-center text-[11px] font-medium text-ts">
            {WEEKDAY_SHORT[d.day()]}
          </div>
        ))}
      </div>

      {/* 流式周行 */}
      <div ref={scrollRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {weeks.map((week, wi) => {
          const { taskBars, todoBars } = layout.weekBars[wi];
          const wsKey = weekStarts[wi].valueOf();
          const isAnchorWeek = week.some((d) => d.format('YYYY-MM-DD') === anchorRef.current);
          return (
            <div
              key={wsKey}
              data-weekstart={wsKey}
              ref={isAnchorWeek ? jumpRowRef : undefined}
              className="flex flex-col border-b border-line"
              style={{ minHeight: 118 }}
            >
              {/* 任务条带 */}
              <div
                className="grid shrink-0 content-start gap-x-0.5 gap-y-0.5 px-0.5 pt-0.5"
                style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridAutoRows: 'minmax(18px, auto)' }}
              >
                {taskBars.map((b) => (
                  <BandBar
                    key={b.task.id}
                    bar={b}
                    compact
                    viewStartKey={week[0].format('YYYY-MM-DD')}
                    colCount={7}
                    onToggle={() => void toggleTask(b.task.id)}
                    onEdit={() => useStore.getState().openEditTask(b.task.id)}
                  />
                ))}
              </div>
              {/* 待办条带 */}
              <div
                className="grid shrink-0 content-start gap-x-0.5 gap-y-0.5 px-0.5 pt-0.5"
                style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridAutoRows: 'minmax(18px, auto)' }}
              >
                {renderBandBars(todoBars, {
                  onToggle: (t) => void toggleTask(t.id),
                  onEdit: (t) => useStore.getState().openEditTask(t.id),
                }, week[0].format('YYYY-MM-DD'), 7)}
              </div>

              {/* 7 个日格 */}
              <div className="grid grid-cols-7">
                {week.map((d) => {
                  const key = d.format('YYYY-MM-DD');
                  const list = (layout.eventsMap.get(key) ?? []).sort((a, b) => a.start - b.start);
                  const isToday = key === todayKey;
                  const dim = d.month() !== anchorMonth;
                  const inRange = range && key >= lo && key <= hi;
                  return (
                    <div
                      key={key}
                      data-daykey={key}
                      className={`relative flex min-h-[96px] cursor-pointer flex-col overflow-hidden border-r border-line px-1 pb-1 pt-1 hover:bg-[var(--hover-overlay)] ${isToday ? 'bg-[var(--today-tint)]' : ''} ${
                        inRange ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]' : ''
                      }`}
                      style={isToday ? { boxShadow: 'inset 0 0 0 1.5px var(--accent)' } : undefined}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        pendingKeyRef.current = key;
                      }}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-semibold ${
                            isToday ? 'bg-accent text-[var(--accent-contrast)]' : dim ? 'text-tt' : 'text-tp'
                          }`}
                        >
                          {d.date() === 1 ? `${d.month() + 1}月` : d.date()}
                        </span>
                      </div>

                      <div className="min-h-0 flex-1 space-y-0.5 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        {list.slice(0, MAX_CHIPS).map(({ key: k, ev, start }) => {
                          const c = calColorVars(calById.get(ev.calendarId)?.color ?? 'graphite');
                          return (
                            <button
                              key={k}
                              className="flex w-full items-center gap-1 truncate rounded px-1 py-[1px] text-left text-[11px]"
                              style={{ background: c.bg, color: c.fg }}
                              title={`${ev.title}${ev.rrule ? ` · ${ruleToText(ev.rrule)}` : ''}`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={() => openDrawer(ev.id)}
                            >
                              {ev.isAllDay ? (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.bar }} />
                              ) : (
                                <span className="shrink-0 font-semibold opacity-80">
                                  {ev.rrule ? '♻ ' : ''}{fmtTime(dayjs(start).hour() * 60 + dayjs(start).minute(), use24h)}
                                </span>
                              )}
                              <span className="truncate font-medium">{ev.title}</span>
                            </button>
                          );
                        })}
                        {list.length > MAX_CHIPS && (
                          <button
                            className="w-full rounded px-1 text-left text-[11px] font-medium text-accent hover:bg-[var(--hover-overlay)]"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setPopover({ dayKey: key }); }}
                          >
                            +{list.length - MAX_CHIPS} 事件
                          </button>
                        )}
                      </div>

                      {/* 当日全部事件浮层 */}
                      {popover?.dayKey === key && (
                        <div
                          className="absolute inset-x-1 top-8 z-30 max-h-56 overflow-auto rounded-lg border border-line bg-raised p-1.5 shadow-pop"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="mb-1 px-1 text-[11px] font-semibold text-ts">{d.format('M月D日 dddd')}</div>
                          {list.map(({ key: k, ev, start }) => {
                            const c = calColorVars(calById.get(ev.calendarId)?.color ?? 'graphite');
                            const time = ev.isAllDay ? '全天' : fmtTime(dayjs(start).hour() * 60 + dayjs(start).minute(), use24h);
                            return (
                              <button
                                key={k}
                                className="flex w-full items-center gap-2 truncate rounded px-1.5 py-1 text-left text-[12px] text-tp hover:bg-[var(--hover-overlay)]"
                                onClick={() => { setPopover(null); openDrawer(ev.id); }}
                              >
                                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: c.bar }} />
                                <span className="w-11 shrink-0 text-ts">{time}</span>
                                <span className="truncate font-medium">{ev.title}</span>
                                {ev.rrule && <span className="shrink-0 text-[10px] text-tt">♻ {ruleToText(ev.rrule)}</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {popover && <div className="fixed inset-0 z-20" onClick={() => setPopover(null)} />}
    </div>
  );
}
