import { useMemo } from 'react';
import dayjs from 'dayjs';
import { todayCN } from '../../time';
import { useStore } from '../../store/useStore';
import { calColorVars, isDone } from '../../types';
import { expandOccurrences, ruleToText } from '../../domain/recurrence';

/** 议程视图：按日期分组的时序列表（设计方案 §5.5），任务在当日置顶 */
export default function AgendaView() {
  const anchor = useStore((s) => s.anchor);
  const use24h = useStore((s) => s.settings.use24h);
  const events = useStore((s) => s.events);
  const calendars = useStore((s) => s.calendars);
  const tasks = useStore((s) => s.tasks);
  const openDrawer = useStore((s) => s.openDrawer);
  const setAnchor = useStore((s) => s.setAnchor);
  const setView = useStore((s) => s.setView);
  const toggleTask = useStore((s) => s.toggleTask);

  const calById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const visible = useMemo(
    () => events.filter((e) => calById.get(e.calendarId)?.isVisible),
    [events, calById]
  );

  const groups = useMemo(() => {
    const start = dayjs(anchor).startOf('day');
    const rangeStart = start.valueOf();
    const rangeEnd = start.add(30, 'day').valueOf();

    type Row =
      | { kind: 'task'; task: (typeof tasks)[number] }
      | { kind: 'event'; key: string; ev: (typeof visible)[number]; start: number };
    const byDay = new Map<string, Row[]>();

    for (const ev of visible) {
      for (const o of expandOccurrences(ev, rangeStart, rangeEnd)) {
        const key = dayjs(o.start).format('YYYY-MM-DD');
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key)!.push({ kind: 'event', key: `${ev.id}|${o.start}`, ev, start: o.start });
      }
    }
    for (const t of tasks) {
      if (isDone(t.status)) continue;
      const from = t.startDate || t.dueDate;
      if (!from || !t.dueDate || from < start.format('YYYY-MM-DD')) continue;
      // 跨天任务显示在起始日，并标注区间
      if (!byDay.has(from)) byDay.set(from, []);
      byDay.get(from)!.push({ kind: 'task', task: t });
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, rows]) => [
        key,
        rows.filter((r): r is Extract<Row, { kind: 'task' }> => r.kind === 'task'),
        rows.filter((r): r is Extract<Row, { kind: 'event' }> => r.kind === 'event').sort((a, b) => a.start - b.start),
      ] as const);
  }, [anchor, visible, tasks]);

  const todayKey = todayCN();

  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      {groups.length === 0 && (
        <div className="py-20 text-center text-[14px] text-tt">未来 30 天没有安排 · 按 C 键新建事件</div>
      )}
      {groups.map(([key, dayTasks, dayEvents]) => {
        const d = dayjs(key);
        const isToday = key === todayKey;
        return (
          <div key={key} className="mb-4">
            <div className="sticky top-0 z-10 -mx-2 mb-1 flex items-baseline gap-2 border-b border-line bg-base px-2 py-1.5">
              <button
                className="text-[13px] font-semibold text-tp hover:text-accent"
                onClick={() => { setAnchor(key); setView('day'); }}
              >
                {isToday ? '今天' : d.format('M月D日')} · {['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.day()]}
              </button>
              <span className="text-[11px] text-tt">{d.format('YYYY年')}</span>
            </div>

            {/* 任务/待办置顶 */}
            {dayTasks.map((t) => {
              const deferred = t.task.status === 'deferred';
              const tone = deferred ? 'var(--status-deferred)' : 'var(--accent)';
              const done = isDone(t.task.status);
              return (
                <button
                  key={t.task.id}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[var(--hover-overlay)]"
                  style={{ color: done ? 'var(--cal-sage-bar)' : tone }}
                  onClick={() => void toggleTask(t.task.id)}
                >
                  <span className="h-3 w-3 shrink-0 rounded-[3px] border-2 border-current" />
                  <span className={`font-semibold ${done ? 'line-through opacity-70' : ''}`}>{t.task.title}</span>
                  <span className="text-[11px] opacity-70">
                    {t.task.startDate && t.task.startDate !== t.task.dueDate
                      ? `任务 ${dayjs(t.task.startDate).format('M月D日')} ~ ${dayjs(t.task.dueDate).format('M月D日')}`
                      : `待办 · 截止 ${d.format('M月D日')}`}
                    {deferred ? ' · 已延期' : key < todayKey ? ' · 已逾期' : ''}
                    {done ? ' · 已完成' : ' · 点击切换状态'}
                  </span>
                </button>
              );
            })}

            {dayEvents.map(({ key: k, ev, start }) => {
              const c = calColorVars(calById.get(ev.calendarId)?.color ?? 'graphite');
              const time = ev.isAllDay
                ? '全天'
                : `${dayjs(start).format(use24h ? 'HH:mm' : 'h:mm A')} – ${dayjs(start + (ev.end - ev.start)).format(use24h ? 'HH:mm' : 'h:mm A')}`;
              return (
                <button
                  key={k}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[var(--hover-overlay)]"
                  onClick={() => openDrawer(ev.id)}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.bar }} />
                  <span className="w-32 shrink-0 text-[12px] tabular-nums text-ts">
                    {ev.rrule ? '♻ ' : ''}{time}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-tp">{ev.title}</span>
                  {ev.rrule && <span className="hidden shrink-0 text-[11px] text-tt md:block">{ruleToText(ev.rrule)}</span>}
                  {ev.location && <span className="hidden shrink-0 truncate text-[12px] text-tt md:block">📍 {ev.location}</span>}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
