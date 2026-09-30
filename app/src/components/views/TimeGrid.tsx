import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { nowCN, todayCN } from '../../time';
import { useStore } from '../../store/useStore';
import type { Calendar, EventItem, TaskItem } from '../../types';
import { calColorVars, isDone } from '../../types';
import { layoutDayEvents } from '../../domain/layout';
import { expandOccurrences, ruleToText } from '../../domain/recurrence';
import { DAY_MINUTES, clamp, fmtTime, occurrenceOn, snapMinutes, startOfDayMs } from '../../domain/time';
import BandBar, { TaskBarRow, renderBandBars } from './BandBar';

/* ---------------- 拖拽状态机 ---------------- */

type Pending =
  | { kind: 'maybe-select'; dayIndex: number; startMin: number; x: number; y: number }
  | { kind: 'maybe-move'; eventId: string; grabOffset: number; x: number; y: number }
  | { kind: 'maybe-resize'; eventId: string; edge: 'top' | 'bottom'; dayIndex: number; origStartMin: number; origEndMin: number; x: number; y: number };

type Drag =
  | { kind: 'select'; dayIndex: number; anchorMin: number; startMin: number; endMin: number }
  | { kind: 'move'; eventId: string; grabOffset: number; duration: number; dayIndex: number; startMin: number }
  | { kind: 'resize'; eventId: string; edge: 'top' | 'bottom'; dayIndex: number; origStartMin: number; origEndMin: number; startMin: number; endMin: number }
  /** 跨日拖选（日期键锚定，翻周后拖选自然延续）：松手创建跨天任务 */
  | { kind: 'multi'; fromDate: string; toDate: string };

const DRAG_THRESHOLD = 4;

/** 视口内的事件实例（重复事件展开后的每一次出现） */
interface Instance {
  ev: EventItem;
  start: number;
  end: number;
  key: string;
}

/* ---------------- 主组件 ---------------- */

export default function TimeGrid({ days }: { days: Dayjs[] }) {
  const events = useStore((s) => s.events);
  const calendars = useStore((s) => s.calendars);
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const openQuickCreate = useStore((s) => s.openQuickCreate);
  const openDrawer = useStore((s) => s.openDrawer);
  const selectEvent = useStore((s) => s.selectEvent);
  const moveEvent = useStore((s) => s.moveEvent);
  const toggleTask = useStore((s) => s.toggleTask);

  const hourH = settings.hourHeight;
  const use24h = settings.use24h;
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // 常驻 window 监听需要同步读取的最新状态（避免 effect 重挂的竞态）
  const pendingRef = useRef<Pending | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setPendingBoth = (p: Pending | null) => { pendingRef.current = p; setPending(p); };
  const setDragBoth = (d: Drag | null) => { dragRef.current = d; setDrag(d); };
  const [nowMin, setNowMin] = useState(() => nowCN().hour() * 60 + nowCN().minute());
  const rootRef = useRef<HTMLDivElement>(null);
  const zoomToastAt = useRef(0);

  const calById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const visible = useMemo(
    () => events.filter((e) => calById.get(e.calendarId)?.isVisible),
    [events, calById]
  );
  const todayKey = todayCN();

  // 当前时间线每 30 秒刷新
  useEffect(() => {
    const t = setInterval(() => setNowMin(nowCN().hour() * 60 + nowCN().minute()), 30_000);
    return () => clearInterval(t);
  }, []);

  // 初始滚动：当前时间 -1 小时；凌晨回退到 6:00
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) return;
    const target = nowMin < 6 * 60 ? 6 * 60 : Math.max(0, nowMin - 60);
    el.scrollTop = (target / 60) * hourH;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hourH]);

  /* -------- Ctrl + 滚轮：缩放时间粒度（24~176px/小时） -------- */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const s = useStore.getState().settings;
      const step = e.deltaY < 0 ? 8 : -8;
      const next = clamp(s.hourHeight + step, 24, 176);
      if (next === s.hourHeight) {
        const now = Date.now();
        if (now - zoomToastAt.current > 2000) {
          zoomToastAt.current = now;
          useStore.getState().pushToast(step > 0 ? '已到最大粒度（176px/小时）' : '已到最小粒度（24px/小时，全天一屏可见）');
        }
        return;
      }
      useStore.getState().updateSettings({ hourHeight: next });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------- 事件实例展开 -------- */
  const rangeStart = days[0].valueOf() - 86_400_000;
  const rangeEnd = days[days.length - 1].valueOf() + 2 * 86_400_000;
  const instances = useMemo<Instance[]>(() => {
    const list: Instance[] = [];
    for (const ev of visible) {
      for (const o of expandOccurrences(ev, rangeStart, rangeEnd)) {
        list.push({ ev, start: o.start, end: o.end, key: `${ev.id}|${o.start}` });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, rangeStart, rangeEnd]);

  /* -------- 任务带（连体长条）+ 待办带（逐日，折叠）-------- */
  const { taskBars, todoBars } = useMemo<{ taskBars: TaskBarRow[]; todoBars: TaskBarRow[] }>(() => {
    const n = days.length;
    const viewStart = days[0].format('YYYY-MM-DD');
    const viewEnd = days[n - 1].format('YYYY-MM-DD');
    const taskBars: TaskBarRow[] = [];
    const todoBars: TaskBarRow[] = [];
    for (const t of tasks) {
      if (isDone(t.status)) continue;
      const from = t.startDate || t.dueDate;
      if (!from || !t.dueDate) continue;
      if (t.startDate) {
        // 任务：渲染全部（BandBar 内部按「区间∩视口」自算分段）——拖出视口/翻周后组件保持挂载，拖拽状态不丢
        taskBars.push({ task: t, colStart: 0, span: 1, cutStart: false, cutEnd: false, range: '' });
      } else {
        // 待办：DDL 当天一条（仅视口内，无跨周拖拽需求）
        if (t.dueDate < viewStart || t.dueDate > viewEnd) continue;
        const col = days.findIndex((d) => d.format('YYYY-MM-DD') === t.dueDate);
        if (col >= 0) todoBars.push({ task: t, colStart: col, span: 1, cutStart: false, cutEnd: false, range: '' });
      }
    }
    taskBars.sort((a, b) => (a.task.startDate! < b.task.startDate! ? -1 : 1));
    todoBars.sort((a, b) => a.colStart - b.colStart);
    return { taskBars, todoBars };
  }, [tasks, days]);

  /* -------- 坐标换算 -------- */
  function minFromClientY(clientY: number, fine: boolean): number {
    const rect = columnsRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return snapMinutes(((clientY - rect.top) / hourH) * 60, 15, fine);
  }
  function dayIndexFromClientX(clientX: number): number {
    const rect = columnsRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const w = rect.width / days.length;
    return clamp(Math.floor((clientX - rect.left) / w), 0, days.length - 1);
  }

  /* -------- 全局拖拽监听（常驻挂载，从 ref 读取最新状态） -------- */
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const pending = pendingRef.current;
      const drag = dragRef.current;
      const evList = useStore.getState().events;
      const fine = e.altKey;
      if (pending) {
        if (Math.abs(e.clientX - pending.x) + Math.abs(e.clientY - pending.y) < DRAG_THRESHOLD) return;
        if (pending.kind === 'maybe-select') {
          const cur = minFromClientY(e.clientY, false);
          const anchor = snapMinutes(pending.startMin);
          setDragBoth({
            kind: 'select', dayIndex: pending.dayIndex, anchorMin: anchor,
            startMin: Math.min(anchor, cur), endMin: Math.max(anchor, cur),
          });
          setPendingBoth(null);
          return;
        }
        if (pending.kind === 'maybe-move') {
          const ev = evList.find((x) => x.id === pending.eventId);
          if (!ev) return;
          setDragBoth({
            kind: 'move', eventId: ev.id, grabOffset: pending.grabOffset,
            duration: (ev.end - ev.start) / 60_000, dayIndex: dayIndexFromClientX(e.clientX),
            startMin: clamp(minFromClientY(e.clientY, fine) - pending.grabOffset, 0, DAY_MINUTES - 15),
          });
          setPendingBoth(null);
          return;
        }
        setDragBoth({
          kind: 'resize', eventId: pending.eventId, edge: pending.edge, dayIndex: pending.dayIndex,
          origStartMin: pending.origStartMin, origEndMin: pending.origEndMin,
          startMin: pending.origStartMin, endMin: pending.origEndMin,
        });
        setPendingBoth(null);
        return;
      }
      if (!drag) return;
      if (drag.kind === 'select') {
        const curDay = dayIndexFromClientX(e.clientX);
        if (curDay !== drag.dayIndex) {
          setDragBoth({ kind: 'multi', fromDate: days[drag.dayIndex].format('YYYY-MM-DD'), toDate: days[curDay].format('YYYY-MM-DD') });
          return;
        }
        const cur = minFromClientY(e.clientY, false);
        setDragBoth({ ...drag, startMin: Math.min(drag.anchorMin, cur), endMin: Math.max(drag.anchorMin, cur) });
      } else if (drag.kind === 'multi') {
        edgeWatch(e.clientX); // 贴边停留自动翻周（跨周拖选）
        const curDay = dayIndexFromClientX(e.clientX);
        setDragBoth({ ...drag, toDate: days[curDay].format('YYYY-MM-DD') });
      } else if (drag.kind === 'move') {
        autoScroll(e.clientY);
        setDragBoth({
          ...drag, dayIndex: dayIndexFromClientX(e.clientX),
          startMin: clamp(minFromClientY(e.clientY, fine) - drag.grabOffset, 0, DAY_MINUTES - drag.duration / 60_000),
        });
      } else {
        autoScroll(e.clientY);
        const cur = minFromClientY(e.clientY, fine);
        if (drag.edge === 'top') {
          setDragBoth({ ...drag, dayIndex: dayIndexFromClientX(e.clientX), startMin: clamp(Math.min(cur, drag.origEndMin - 15), 0, DAY_MINUTES) });
        } else {
          setDragBoth({ ...drag, dayIndex: dayIndexFromClientX(e.clientX), endMin: clamp(Math.max(cur, drag.origStartMin + 15), 0, DAY_MINUTES) });
        }
      }
    }

    function autoScroll(clientY: number) {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (clientY < rect.top + 48) el.scrollTop -= 14;
      else if (clientY > rect.bottom - 48) el.scrollTop += 14;
    }

    function onUp(e: PointerEvent) {
      const pending = pendingRef.current;
      const drag = dragRef.current;
      if (pending) {
        if (pending.kind === 'maybe-select') {
          const start = snapMinutes(pending.startMin, 15, false);
          openQuickCreate({
            dateKey: days[pending.dayIndex].format('YYYY-MM-DD'),
            startMin: start, endMin: Math.min(start + 60, DAY_MINUTES),
            x: e.clientX, y: e.clientY,
          });
        } else {
          selectEvent(pending.eventId);
          openDrawer(pending.eventId);
        }
        setPendingBoth(null);
        setDragBoth(null);
        return;
      }
      if (drag) commitDrag(drag, e.clientX, e.clientY);
      setPendingBoth(null);
      setDragBoth(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, hourH]);

  function commitDrag(d: Drag, clientX: number, clientY: number) {
    if (d.kind === 'select') {
      if (d.endMin - d.startMin < 5) return;
      openQuickCreate({
        dateKey: days[d.dayIndex].format('YYYY-MM-DD'),
        startMin: snapMinutes(d.startMin), endMin: snapMinutes(d.endMin), x: clientX, y: clientY,
      });
    } else if (d.kind === 'multi') {
      const startDate = d.fromDate < d.toDate ? d.fromDate : d.toDate;
      const dueDate = d.fromDate < d.toDate ? d.toDate : d.fromDate;
      const rect = columnsRef.current?.getBoundingClientRect();
      const x = rect ? rect.left + rect.width / 2 : clientX;
      useStore.getState().openTaskQuick({ mode: 'task', startDate, dueDate, x, y: Math.max(clientY, 120) });
    } else if (d.kind === 'move') {
      const dayStart = startOfDayMs(days[d.dayIndex]);
      const start = dayStart + d.startMin * 60_000;
      moveEvent(d.eventId, start, start + d.duration * 60_000,
        `已移至 ${days[d.dayIndex].format('M月D日')} ${fmtTime(d.startMin, use24h)}`);
    } else {
      const dayStart = startOfDayMs(days[d.dayIndex]);
      const start = dayStart + d.startMin * 60_000;
      const end = dayStart + d.endMin * 60_000;
      moveEvent(d.eventId, start, end, `已调整为 ${fmtTime(d.startMin, use24h)} – ${fmtTime(d.endMin, use24h)}`);
    }
  }

  /* -------- 事件排布 -------- */
  const dayPlans = useMemo(() => {
    return days.map((d) => {
      const dayStart = d.valueOf();
      const timed = instances
        .filter((it) => !it.ev.isAllDay)
        .map((it) => ({ it, occ: occurrenceOn(it, dayStart) }))
        .filter((x) => x.occ !== null) as { it: Instance; occ: NonNullable<ReturnType<typeof occurrenceOn>> }[];
      const layout = layoutDayEvents(
        timed.map(({ it, occ }) => ({ id: it.key, startMin: occ.startMin, endMin: occ.endMin }))
      );
      const allDay = instances.filter((it) => it.ev.isAllDay && occurrenceOn(it, dayStart));
      return { dayStart, timed, layout, allDay };
    });
  }, [days, instances]);

  const ticks = `repeating-linear-gradient(to bottom, var(--border-strong) 0 1px, transparent 1px ${hourH}px), repeating-linear-gradient(to bottom, var(--border-subtle) 0 1px, transparent 1px ${hourH / 2}px)`;

  /* -------- 双带交互：双击 = 当天任务/待办；按住跨列滑动 = 跨天任务（日期键锚定，支持边缘翻周） -------- */
  const bandPendingRef = useRef<{ band: 'task' | 'todo'; key: string } | null>(null);
  const bandRangeRef = useRef<{ fromKey: string; toKey: string } | null>(null);
  const [bandRange, setBandRange] = useState<{ fromKey: string; toKey: string } | null>(null);
  const lastTapRef = useRef<{ band: 'task' | 'todo'; key: string; t: number } | null>(null);

  /* -------- 边缘翻周：拖选/改期期间指针贴左右边缘停留 ~650ms 自动切换上/下一周 -------- */
  const edgeTimerRef = useRef<{ dir: 1 | -1; timer: number } | null>(null);
  function edgeWatch(clientX: number | null) {
    const cur = edgeTimerRef.current;
    if (clientX == null) {
      if (cur) { clearTimeout(cur.timer); edgeTimerRef.current = null; }
      return;
    }
    const rect = columnsRef.current?.getBoundingClientRect();
    if (!rect) return;
    let dir: 1 | -1 | null = null;
    if (clientX <= rect.left + 14) dir = -1;
    else if (clientX >= rect.right - 14) dir = 1;
    if (!dir) {
      if (cur) { clearTimeout(cur.timer); edgeTimerRef.current = null; }
      return;
    }
    if (cur?.dir === dir) return;
    if (cur) clearTimeout(cur.timer);
    const timer = window.setTimeout(() => {
      edgeTimerRef.current = null;
      useStore.getState().shiftPeriod(dir);
    }, 650);
    edgeTimerRef.current = { dir, timer };
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const p = bandPendingRef.current;
      if (!p || e.buttons !== 1) return;
      edgeWatch(e.clientX);
      const key = days[dayIndexFromClientX(e.clientX)].format('YYYY-MM-DD');
      const cur = bandRangeRef.current;
      if (!cur && key !== p.key) {
        bandRangeRef.current = { fromKey: p.key, toKey: key };
        setBandRange(bandRangeRef.current);
      } else if (cur) {
        cur.toKey = key;
        setBandRange({ ...cur });
      }
    }
    function onUp(e: PointerEvent) {
      edgeWatch(null);
      const p = bandPendingRef.current;
      const range = bandRangeRef.current;
      bandPendingRef.current = null;
      bandRangeRef.current = null;
      setBandRange(null);
      if (!p) return;
      if (range && range.fromKey !== range.toKey) {
        const startDate = range.fromKey < range.toKey ? range.fromKey : range.toKey;
        const dueDate = range.fromKey < range.toKey ? range.toKey : range.fromKey;
        useStore.getState().openTaskQuick({
          mode: 'task',
          startDate, dueDate,
          x: e.clientX, y: e.clientY,
        });
        return;
      }
      const now = Date.now();
      const last = lastTapRef.current;
      if (last && last.band === p.band && last.key === p.key && now - last.t < 500) {
        lastTapRef.current = null;
        useStore.getState().openTaskQuick({
          mode: p.band === 'task' ? 'task' : 'todo',
          startDate: p.key, dueDate: p.key,
          x: e.clientX, y: e.clientY,
        });
      } else {
        lastTapRef.current = { band: p.band, key: p.key, t: now };
      }
    }
    // BandBar 边缘改期拖拽 → 贴边也翻周
    function onBarResize(e: Event) {
      const d = (e as CustomEvent).detail as { active: boolean; clientX?: number };
      edgeWatch(d.active ? (d.clientX ?? null) : null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('chrona-band-resize', onBarResize as EventListener);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('chrona-band-resize', onBarResize as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  function bandHandlers(band: 'task' | 'todo') {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        bandPendingRef.current = { band, key: days[dayIndexFromClientX(e.clientX)].format('YYYY-MM-DD') };
      },
    };
  }

  function bandHighlight() {
    if (!bandRange) return null;
    const lo = bandRange.fromKey < bandRange.toKey ? bandRange.fromKey : bandRange.toKey;
    const hi = bandRange.fromKey < bandRange.toKey ? bandRange.toKey : bandRange.fromKey;
    // 与当前周求交（翻周后跨出视口的部分不显示）
    const firstIdx = days.findIndex((d) => d.format('YYYY-MM-DD') >= lo && d.format('YYYY-MM-DD') <= hi);
    const lastIdx = days.reduce((acc, d, i) => {
      const k = d.format('YYYY-MM-DD');
      return k >= lo && k <= hi ? i : acc;
    }, -1);
    if (firstIdx < 0 || lastIdx < 0) return null;
    return (
      <div
        className="pointer-events-none absolute inset-y-0 z-10 rounded-md border-2 border-dashed border-accent bg-accent-soft"
        style={{ left: `${(firstIdx / days.length) * 100}%`, width: `${((lastIdx - firstIdx + 1) / days.length) * 100}%` }}
      />
    );
  }

  const bandActions = {
    onToggle: (t: TaskItem) => void toggleTask(t.id),
    onEdit: (t: TaskItem) => useStore.getState().openEditTask(t.id),
  };

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col select-none">
      {/* 表头 */}
      <div className="flex border-b border-line bg-base">
        <div className="w-14 shrink-0" />
        {days.map((d) => {
          const isToday = d.format('YYYY-MM-DD') === todayKey;
          return (
            <div key={d.valueOf()} className="flex-1 py-2 text-center">
              <div className={`text-[11px] font-medium ${isToday ? 'text-accent' : 'text-ts'}`}>
                {['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.day()]}
              </div>
              <div className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[15px] font-semibold ${isToday ? 'bg-accent text-[var(--accent-contrast)]' : 'text-tp'}`}>
                {d.date()}
              </div>
            </div>
          );
        })}
      </div>

      {/* 任务带（最高层）：跨天任务连体长条 */}
      <div className="flex min-h-[26px] items-stretch border-b border-line bg-subtle" title="双击新建任务 · 按住滑动跨多天 · 点标题编辑 · 边缘拖拽改期">
        <div className="w-14 shrink-0 pt-1.5 pl-2 text-[11px] text-ts">任务</div>
        <div
          className="relative grid flex-1 content-start gap-x-0.5 gap-y-0.5 px-0.5 py-0.5"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gridAutoRows: 'minmax(20px, auto)' }}
          {...bandHandlers('task')}
        >
          {bandHighlight()}
          {taskBars.map((b) => (
            <BandBar
              key={b.task.id}
              bar={b}
              viewStartKey={days[0].format('YYYY-MM-DD')}
              colCount={days.length}
              onToggle={() => bandActions.onToggle(b.task)}
              onEdit={() => bandActions.onEdit(b.task)}
            />
          ))}
        </div>
      </div>

      {/* 待办带（第二层）：单日 DDL；>3 折叠 */}
      <div className="flex min-h-[26px] items-stretch border-b border-line bg-subtle" title="双击新建待办 · 点标题编辑">
        <div className="w-14 shrink-0 pt-1.5 pl-2 text-[11px] text-ts">待办</div>
        <div
          className="relative grid flex-1 content-start gap-x-0.5 gap-y-0.5 px-0.5 py-0.5"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gridAutoRows: 'minmax(20px, auto)' }}
          {...bandHandlers('todo')}
        >
          {renderBandBars(todoBars, bandActions, days[0].format('YYYY-MM-DD'), days.length)}
        </div>
      </div>

      {/* 全天区 */}
      <div className="flex border-b border-line bg-subtle">
        <div className="w-14 shrink-0 pt-1.5 pl-2 text-[11px] text-ts">全天</div>
        {dayPlans.map(({ dayStart, allDay }) => (
          <div key={dayStart} className="min-h-[24px] flex-1 space-y-0.5 border-l border-line p-0.5">
            {allDay.slice(0, 2).map((it) => (
              <AllDayChip key={it.key} ev={it.ev} cal={calById.get(it.ev.calendarId)} />
            ))}
            {allDay.length > 2 && (
              <button
                className="w-full truncate rounded px-1 text-left text-[11px] text-accent hover:bg-[var(--hover-overlay)]"
                onClick={() => useStore.getState().openDrawer(allDay[2].ev.id)}
              >
                还有 {allDay.length - 2} 项
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 滚动主体 */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex" style={{ height: DAY_MINUTES / 60 * hourH }}>
          <div className="relative w-14 shrink-0">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-ts" style={{ top: h * hourH }}>
                {fmtTime(h * 60, use24h)}
              </div>
            ))}
          </div>
          <div ref={columnsRef} className="relative flex flex-1">
            {days.map((d, i) => {
              const isToday = d.format('YYYY-MM-DD') === todayKey;
              const plan = dayPlans[i];
              return (
                <div
                  key={d.valueOf()}
                  className="relative flex-1 border-l border-line"
                  style={{ touchAction: 'none', background: isToday ? 'var(--today-tint)' : undefined }}
                  data-dayindex={i}
                  data-daykey={d.format('YYYY-MM-DD')}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    const rect = columnsRef.current!.getBoundingClientRect();
                    const min = ((e.clientY - rect.top) / hourH) * 60;
                    setPendingBoth({ kind: 'maybe-select', dayIndex: i, startMin: min, x: e.clientX, y: e.clientY });
                  }}
                >
                  <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: ticks }} />

                  {drag?.kind === 'multi' && (() => {
                    const lo = drag.fromDate < drag.toDate ? drag.fromDate : drag.toDate;
                    const hi = drag.fromDate < drag.toDate ? drag.toDate : drag.fromDate;
                    const key = d.format('YYYY-MM-DD');
                    return key >= lo && key <= hi ? (
                      <div className="pointer-events-none absolute inset-0 z-20 border-2 border-dashed border-accent bg-accent-soft" />
                    ) : null;
                  })()}

                  {plan.timed.map(({ it, occ }) => (
                    <EventBlock
                      key={it.key}
                      ev={it.ev}
                      occ={occ}
                      pos={plan.layout.get(it.key) ?? { leftPct: 0, widthPct: 100 }}
                      hourH={hourH}
                      use24h={use24h}
                      cal={calById.get(it.ev.calendarId)}
                      isGhosted={drag != null && 'eventId' in drag && drag.eventId === it.ev.id}
                      isSelected={selectedEventId === it.ev.id}
                      onPointerDown={(e, edge) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (it.ev.rrule) {
                          selectEvent(it.ev.id);
                          openDrawer(it.ev.id);
                          return;
                        }
                        const rect = columnsRef.current!.getBoundingClientRect();
                        const min = ((e.clientY - rect.top) / hourH) * 60;
                        if (edge) {
                          setPendingBoth({
                            kind: 'maybe-resize', eventId: it.ev.id, edge, dayIndex: i,
                            origStartMin: occ.startMin, origEndMin: occ.endMin,
                            x: e.clientX, y: e.clientY,
                          });
                        } else {
                          setPendingBoth({
                            kind: 'maybe-move', eventId: it.ev.id,
                            grabOffset: clamp(min - occ.startMin, 0, (occ.endMin - occ.startMin) - 15),
                            x: e.clientX, y: e.clientY,
                          });
                        }
                      }}
                    />
                  ))}

                  {isToday && (
                    <div className="pointer-events-none absolute inset-x-0 z-10 overflow-hidden" style={{ top: (nowMin / 60) * hourH }}>
                      <div className="relative border-t-2" style={{ borderColor: 'var(--now-line)' }}>
                        <div className="absolute -top-[5px] left-0 h-2.5 w-2.5 rounded-r-full" style={{ background: 'var(--now-line)' }} />
                      </div>
                    </div>
                  )}

                  {drag && 'dayIndex' in drag && drag.dayIndex === i && (
                    <DragGhost drag={drag} hourH={hourH} use24h={use24h} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 子组件 ---------------- */

function AllDayChip({ ev, cal }: { ev: EventItem; cal?: Calendar }) {
  const c = calColorVars(cal?.color ?? 'graphite');
  return (
    <button
      className="flex w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-left text-[11px] font-medium"
      style={{ background: c.bg, color: c.fg }}
      title={`${ev.title}${ev.rrule ? ` · ${ruleToText(ev.rrule)}` : ''}`}
      onClick={(e) => { e.stopPropagation(); useStore.getState().openDrawer(ev.id); }}
    >
      {ev.rrule && <span className="shrink-0 text-[10px] opacity-70">♻</span>}
      <span className="truncate">{ev.title}</span>
    </button>
  );
}

interface EventBlockProps {
  ev: EventItem;
  occ: { startMin: number; endMin: number; continuesBefore: boolean; continuesAfter: boolean };
  pos: { leftPct: number; widthPct: number };
  hourH: number;
  use24h: boolean;
  cal?: Calendar;
  isGhosted: boolean;
  isSelected: boolean;
  onPointerDown: (e: React.PointerEvent, edge: 'top' | 'bottom' | null) => void;
}

function EventBlock({ ev, occ, pos, hourH, use24h, cal, isGhosted, isSelected, onPointerDown }: EventBlockProps) {
  const c = calColorVars(cal?.color ?? 'graphite');
  const height = Math.max(((occ.endMin - occ.startMin) / 60) * hourH, 20);
  const recurring = !!ev.rrule;
  return (
    <div
      title={`${ev.title}${ev.location ? ` · ${ev.location}` : ''}${recurring ? ` · ${ruleToText(ev.rrule)}` : ''}`}
      className={`group absolute z-[5] overflow-hidden rounded-md px-1.5 py-0.5 text-left transition-opacity ${isGhosted ? 'opacity-30' : ''}`}
      style={{
        top: (occ.startMin / 60) * hourH,
        height,
        left: `calc(${pos.leftPct}% + 2px)`,
        width: `calc(${pos.widthPct}% - 4px)`,
        background: c.bg,
        color: c.fg,
        borderLeft: `3px solid ${c.bar}`,
        boxShadow: isSelected ? '0 0 0 2px var(--accent)' : undefined,
        cursor: recurring ? 'pointer' : 'grab',
      }}
      onPointerDown={(e) => {
        if (recurring) {
          onPointerDown(e, null);
          return;
        }
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const edge = e.clientY < rect.top + 6 ? 'top' : e.clientY > rect.bottom - 6 ? 'bottom' : null;
        onPointerDown(e, edge);
      }}
    >
      {!recurring && (
        <>
          <div className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize" />
          <div className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize" />
        </>
      )}

      <div className={`flex items-start gap-1 ${height < 30 ? 'flex-row items-center' : 'flex-col'}`}>
        {height >= 30 && (
          <div className="flex w-full items-center gap-1 text-[11px] font-medium opacity-80">
            {recurring && <span className="text-[10px]">♻</span>}
            <span className="tabular-nums">{occ.continuesBefore ? '↑ ' : ''}{fmtTime(occ.startMin, use24h)}</span>
          </div>
        )}
        {height < 30 && (
          <span className="shrink-0 text-[11px] font-medium opacity-80 tabular-nums">
            {recurring ? '♻ ' : ''}{occ.continuesBefore ? '↑ ' : fmtTime(occ.startMin, use24h)}
          </span>
        )}
        <div className="min-w-0 flex-1 truncate text-[12px] font-semibold leading-4">{ev.title}</div>
        {height >= 48 && ev.location && <div className="truncate text-[11px] opacity-75">📍 {ev.location}</div>}
      </div>
    </div>
  );
}

function DragGhost({ drag, hourH, use24h }: { drag: Drag; hourH: number; use24h: boolean }) {
  if (drag.kind === 'multi') return null;
  if (drag.kind === 'select') {
    const top = (drag.startMin / 60) * hourH;
    const h = Math.max(((drag.endMin - drag.startMin) / 60) * hourH, 8);
    return (
      <div
        className="pointer-events-none absolute inset-x-1 z-20 rounded-md border-2 border-dashed border-accent bg-accent-soft px-1.5 py-0.5"
        style={{ top, height: h }}
      >
        <span className="text-[11px] font-semibold text-accent">
          {fmtTime(drag.startMin, use24h)} – {fmtTime(drag.endMin, use24h)}
        </span>
      </div>
    );
  }
  if (drag.kind === 'move') {
    const top = (drag.startMin / 60) * hourH;
    const h = (drag.duration / 60) * hourH;
    return (
      <div className="pointer-events-none absolute inset-x-1 z-20">
        <div className="rounded-md border-2 border-accent bg-accent-soft px-1.5 py-0.5 opacity-90 shadow-pop" style={{ top, height: Math.max(h, 20) }}>
          <div className="text-[11px] font-semibold text-accent">
            {fmtTime(drag.startMin, use24h)} – {fmtTime(drag.startMin + drag.duration, use24h)}
          </div>
        </div>
      </div>
    );
  }
  const top = (drag.startMin / 60) * hourH;
  const h = ((drag.endMin - drag.startMin) / 60) * hourH;
  return (
    <div className="pointer-events-none absolute inset-x-1 z-20 rounded-md border-2 border-accent bg-accent-soft px-1.5" style={{ top, height: Math.max(h, 20) }}>
      <span className="text-[11px] font-semibold text-accent">
        {fmtTime(drag.startMin, use24h)} – {fmtTime(drag.endMin, use24h)}
      </span>
    </div>
  );
}
